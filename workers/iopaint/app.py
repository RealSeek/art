from __future__ import annotations

import asyncio
import hmac
import io
import json
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from iopaint.model_manager import ModelManager
from iopaint.schema import InpaintRequest
from PIL import Image, UnidentifiedImageError

MAX_INPUT_BYTES = int(os.getenv("MAX_INPUT_BYTES", str(50 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(64 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
RESULT_TTL_SECONDS = max(3600, int(os.getenv("RESULT_TTL_SECONDS", str(7 * 86400))))
MODEL_NAME = os.getenv("IOPAINT_MODEL", "lama").strip() or "lama"
DEVICE = os.getenv("DEVICE", "cpu").strip() or "cpu"
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
if not WORKER_TOKEN:
    raise RuntimeError("WORKER_TOKEN must be configured for production workers")
RESULT_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve() / "results"
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

task_locks: dict[str, asyncio.Lock] = {}
active_tasks: set[str] = set()
cancelled_tasks: set[str] = set()
registry_lock = asyncio.Lock()
inference_slots = asyncio.Semaphore(MAX_CONCURRENCY)
model_manager = None
model_lock = Lock()


def result_path(task_id: str) -> Path:
    return RESULT_DIR / f"{task_id}.png"


def authorize(authorization: str | None = Header(default=None)) -> None:
    if WORKER_TOKEN and (not authorization or not hmac.compare_digest(authorization, f"Bearer {WORKER_TOKEN}")):
        raise HTTPException(status_code=401, detail="unauthorized")


def validate_task_id(task_id: str) -> str:
    if not TASK_ID_PATTERN.fullmatch(task_id):
        raise HTTPException(status_code=400, detail="invalid task_id")
    return task_id


def decode_image(source: bytes, mode: str) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(source)).convert(mode)
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="input is not a valid image") from error
    if image.width <= 0 or image.height <= 0 or image.width * image.height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="input image dimensions are not allowed")
    return image


def load_model():
    global model_manager
    if model_manager is None:
        with model_lock:
            if model_manager is None:
                model_manager = ModelManager(name=MODEL_NAME, device=DEVICE)
    return model_manager


def option_int(options: dict, key: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(options.get(key, default))))
    except (TypeError, ValueError):
        return default


def option_float(options: dict, key: str, default: float, minimum: float, maximum: float) -> float:
    try:
        return max(minimum, min(maximum, float(options.get(key, default))))
    except (TypeError, ValueError):
        return default


def prepare_outpaint(image: Image.Image, options: dict) -> tuple[Image.Image, Image.Image]:
    left = option_int(options, "outpaintLeft", 256, 0, 2048)
    right = option_int(options, "outpaintRight", 256, 0, 2048)
    top = option_int(options, "outpaintTop", 0, 0, 2048)
    bottom = option_int(options, "outpaintBottom", 0, 0, 2048)
    if left + right + top + bottom == 0:
        raise HTTPException(status_code=400, detail="outpaint requires at least one non-zero edge")
    width, height = image.width + left + right, image.height + top + bottom
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="outpaint dimensions are too large")
    raw_color = options.get("fillColor", [255, 255, 255])
    color = tuple(option_int({"value": value}, "value", 255, 0, 255) for value in raw_color[:3]) if isinstance(raw_color, list) and len(raw_color) >= 3 else (255, 255, 255)
    canvas = Image.new("RGB", (width, height), color)
    canvas.paste(image, (left, top))
    mask = Image.new("L", (width, height), 255)
    mask.paste(Image.new("L", image.size, 0), (left, top))
    return canvas, mask


def execute_inference(model: str, source: bytes, mask_source: bytes | None, prompt: str, options: dict) -> bytes:
    image = decode_image(source, "RGB")
    if model == "iopaint-outpaint":
        image, mask = prepare_outpaint(image, options)
    else:
        if mask_source is None:
            raise HTTPException(status_code=400, detail="iopaint-inpaint requires a mask")
        mask = decode_image(mask_source, "L")
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.NEAREST)

    request = InpaintRequest(
        prompt=prompt[:4000],
        negative_prompt=str(options.get("negativePrompt", ""))[:2000],
        hd_strategy=str(options.get("hdStrategy", "Crop")),
        hd_strategy_crop_margin=option_int(options, "cropMargin", 128, 16, 1024),
        hd_strategy_resize_limit=option_int(options, "resizeLimit", 1280, 256, 4096),
        sd_steps=option_int(options, "steps", 30, 1, 100),
        sd_seed=option_int(options, "seed", 42, -1, 2_147_483_647),
        sd_strength=option_float(options, "strength", 1.0, 0.0, 1.0),
    )
    rgb = np.array(image)
    mask_array = np.array(mask)
    mask_array = np.where(mask_array >= 127, 255, 0).astype(np.uint8)
    output = load_model()(rgb, mask_array, request)
    output = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
    buffer = io.BytesIO()
    Image.fromarray(output).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


async def task_lock(task_id: str) -> asyncio.Lock:
    async with registry_lock:
        return task_locks.setdefault(task_id, asyncio.Lock())


@asynccontextmanager
async def lifespan(_: FastAPI):
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - RESULT_TTL_SECONDS
    for path in RESULT_DIR.glob("*.png"):
        if path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)
    yield


app = FastAPI(title="OnlyArt IOPaint Worker", version="1.0.1", lifespan=lifespan)


@app.get("/v1/health")
async def health():
    return {"ok": True, "version": app.version, "device": DEVICE, "model": MODEL_NAME, "queueDepth": len(active_tasks), "maxConcurrency": MAX_CONCURRENCY}


@app.get("/v1/models", dependencies=[Depends(authorize)])
async def models():
    return {"data": [
        {"id": "iopaint-inpaint", "name": "局部擦除与修复", "input": {"images": 1, "mask": True}},
        {"id": "iopaint-outpaint", "name": "智能扩图", "input": {"images": 1, "mask": False}},
    ]}


@app.post("/v1/process", dependencies=[Depends(authorize)])
async def process(model: str = Form(...), prompt: str = Form(default=""), task_id: str = Form(...), options: str = Form(default="{}"), input: list[UploadFile] = File(default=[]), mask: UploadFile | None = File(default=None)):
    task_id = validate_task_id(task_id)
    if model not in {"iopaint-inpaint", "iopaint-outpaint"}:
        raise HTTPException(status_code=400, detail="unsupported model")
    if len(input) != 1 or (model == "iopaint-inpaint" and mask is None) or (model == "iopaint-outpaint" and mask is not None):
        raise HTTPException(status_code=400, detail="invalid input or mask count")
    try:
        parsed_options = json.loads(options)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="options must be valid JSON") from error
    if not isinstance(parsed_options, dict):
        raise HTTPException(status_code=400, detail="options must be a JSON object")
    cached = result_path(task_id)
    if cached.is_file():
        return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
    lock = await task_lock(task_id)
    async with lock:
        if cached.is_file():
            return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
        source = await input[0].read(MAX_INPUT_BYTES + 1)
        mask_source = await mask.read(MAX_INPUT_BYTES + 1) if mask else None
        if not source or len(source) > MAX_INPUT_BYTES or (mask_source is not None and (not mask_source or len(mask_source) > MAX_INPUT_BYTES)):
            raise HTTPException(status_code=413, detail="input file is empty or too large")
        temporary = RESULT_DIR / f".{task_id}.{os.getpid()}.tmp"
        async with registry_lock:
            active_tasks.add(task_id)
            cancelled_tasks.discard(task_id)
        try:
            async with inference_slots:
                async with registry_lock:
                    if task_id in cancelled_tasks:
                        raise HTTPException(status_code=409, detail="task cancelled")
                output = await asyncio.to_thread(execute_inference, model, source, mask_source, prompt, parsed_options)
            async with registry_lock:
                if task_id in cancelled_tasks:
                    raise HTTPException(status_code=409, detail="task cancelled")
            temporary.write_bytes(output)
            os.replace(temporary, cached)
            return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
        finally:
            temporary.unlink(missing_ok=True)
            async with registry_lock:
                active_tasks.discard(task_id)
                cancelled_tasks.discard(task_id)


@app.post("/v1/tasks/{task_id}/cancel", dependencies=[Depends(authorize)])
async def cancel(task_id: str):
    task_id = validate_task_id(task_id)
    if result_path(task_id).is_file():
        raise HTTPException(status_code=409, detail="task already completed")
    async with registry_lock:
        if task_id not in active_tasks:
            raise HTTPException(status_code=404, detail="task is not running")
        cancelled_tasks.add(task_id)
    return {"ok": True, "task_id": task_id, "status": "cancelling"}
