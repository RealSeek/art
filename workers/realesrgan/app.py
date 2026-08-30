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
from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.utils.download_util import load_file_from_url
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from realesrgan import RealESRGANer

MAX_INPUT_BYTES = int(os.getenv("MAX_INPUT_BYTES", str(50 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(64 * 1024 * 1024)))
MAX_OUTPUT_PIXELS = int(os.getenv("MAX_OUTPUT_PIXELS", str(96 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
RESULT_TTL_SECONDS = max(3600, int(os.getenv("RESULT_TTL_SECONDS", str(7 * 86400))))
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
if not WORKER_TOKEN:
    raise RuntimeError("WORKER_TOKEN must be configured for production workers")
DEVICE = os.getenv("DEVICE", "cpu").strip() or "cpu"
MODEL_DIR = Path(os.getenv("MODEL_DIR", "/models")).resolve()
RESULT_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve() / "results"
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

task_locks: dict[str, asyncio.Lock] = {}
active_tasks: set[str] = set()
cancelled_tasks: set[str] = set()
registry_lock = asyncio.Lock()
inference_slots = asyncio.Semaphore(MAX_CONCURRENCY)
upsamplers: dict[int, RealESRGANer] = {}
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


def validate_image(source: bytes) -> tuple[int, int]:
    try:
        with Image.open(io.BytesIO(source)) as image:
            image.load()
            width, height = image.size
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="input is not a valid image") from error
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="input image dimensions are not allowed")
    return width, height


def load_upsampler(scale: int) -> RealESRGANer:
    if scale in upsamplers:
        return upsamplers[scale]
    with model_lock:
        if scale in upsamplers:
            return upsamplers[scale]
        if scale == 2:
            name = "RealESRGAN_x2plus"
            url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
        else:
            name = "RealESRGAN_x4plus"
            url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=scale)
        model_path = MODEL_DIR / f"{name}.pth"
        if not model_path.is_file():
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            downloaded = load_file_from_url(url=url, model_dir=str(MODEL_DIR), progress=True, file_name=model_path.name)
            model_path = Path(downloaded)
        upsamplers[scale] = RealESRGANer(
            scale=scale,
            model_path=str(model_path),
            model=model,
            tile=max(0, int(os.getenv("REALESRGAN_TILE", "0"))),
            tile_pad=10,
            pre_pad=0,
            half=DEVICE == "cuda",
            gpu_id=0 if DEVICE == "cuda" else None,
        )
        return upsamplers[scale]


def upscale(source: bytes, scale: int) -> bytes:
    array = np.frombuffer(source, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise HTTPException(status_code=400, detail="input image could not be decoded")
    output, _ = load_upsampler(scale).enhance(image, outscale=scale)
    success, encoded = cv2.imencode(".png", output, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not success:
        raise RuntimeError("unable to encode output image")
    return encoded.tobytes()


async def task_lock(task_id: str) -> asyncio.Lock:
    async with registry_lock:
        return task_locks.setdefault(task_id, asyncio.Lock())


@asynccontextmanager
async def lifespan(_: FastAPI):
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - RESULT_TTL_SECONDS
    for path in RESULT_DIR.glob("*.png"):
        if path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)
    yield


app = FastAPI(title="Xinyue Real-ESRGAN Worker", version="1.0.1", lifespan=lifespan)


@app.get("/v1/health")
async def health():
    return {"ok": True, "version": app.version, "device": DEVICE, "queueDepth": len(active_tasks), "maxConcurrency": MAX_CONCURRENCY}


@app.get("/v1/models", dependencies=[Depends(authorize)])
async def models():
    return {"data": [
        {"id": "realesrgan-x2", "name": "2 倍清晰化", "input": {"images": 1, "mask": False}},
        {"id": "realesrgan-x4", "name": "4 倍清晰化", "input": {"images": 1, "mask": False}},
    ]}


@app.post("/v1/process", dependencies=[Depends(authorize)])
async def process(model: str = Form(...), prompt: str = Form(default=""), task_id: str = Form(...), options: str = Form(default="{}"), input: list[UploadFile] = File(default=[]), mask: UploadFile | None = File(default=None)):
    del prompt
    task_id = validate_task_id(task_id)
    if model not in {"realesrgan-x2", "realesrgan-x4"} or len(input) != 1 or mask is not None:
        raise HTTPException(status_code=400, detail="invalid model, input or mask")
    try:
        parsed_options = json.loads(options)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="options must be valid JSON") from error
    if not isinstance(parsed_options, dict):
        raise HTTPException(status_code=400, detail="options must be a JSON object")
    scale = 2 if model.endswith("x2") else 4
    cached = result_path(task_id)
    if cached.is_file():
        return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
    lock = await task_lock(task_id)
    async with lock:
        if cached.is_file():
            return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
        source = await input[0].read(MAX_INPUT_BYTES + 1)
        if not source or len(source) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="input file is empty or too large")
        width, height = validate_image(source)
        if width * height * scale * scale > MAX_OUTPUT_PIXELS:
            raise HTTPException(status_code=400, detail="upscaled image dimensions are too large")
        temporary = RESULT_DIR / f".{task_id}.{os.getpid()}.tmp"
        async with registry_lock:
            active_tasks.add(task_id)
            cancelled_tasks.discard(task_id)
        try:
            async with inference_slots:
                async with registry_lock:
                    if task_id in cancelled_tasks:
                        raise HTTPException(status_code=409, detail="task cancelled")
                output = await asyncio.to_thread(upscale, source, scale)
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
