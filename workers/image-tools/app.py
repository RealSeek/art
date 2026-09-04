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

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove

MAX_INPUT_BYTES = int(os.getenv("MAX_INPUT_BYTES", str(50 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(64 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
RESULT_TTL_SECONDS = max(3600, int(os.getenv("RESULT_TTL_SECONDS", str(7 * 86400))))
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net").strip() or "u2net"
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
if not WORKER_TOKEN:
    raise RuntimeError("WORKER_TOKEN must be configured for production workers")
DATA_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve()
RESULT_DIR = DATA_DIR / "results"
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

task_locks: dict[str, asyncio.Lock] = {}
active_tasks: set[str] = set()
cancelled_tasks: set[str] = set()
registry_lock = asyncio.Lock()
inference_slots = asyncio.Semaphore(MAX_CONCURRENCY)
session = None
session_lock = Lock()


def result_path(task_id: str) -> Path:
    return RESULT_DIR / f"{task_id}.png"


def validate_task_id(task_id: str) -> str:
    if not TASK_ID_PATTERN.fullmatch(task_id):
        raise HTTPException(status_code=400, detail="invalid task_id")
    return task_id


def authorize(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {WORKER_TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def cleanup_results() -> None:
    cutoff = time.time() - RESULT_TTL_SECONDS
    for path in RESULT_DIR.glob("*.png"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue


def load_session():
    global session
    if session is None:
        with session_lock:
            if session is None:
                session = new_session(MODEL_NAME)
    return session


def remove_background(source: bytes) -> bytes:
    return remove(source, session=load_session(), force_return_bytes=True)


def validate_image(source: bytes) -> None:
    try:
        with Image.open(io.BytesIO(source)) as image:
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="input is not a valid image") from error
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="input image dimensions are not allowed")


async def task_lock(task_id: str) -> asyncio.Lock:
    async with registry_lock:
        return task_locks.setdefault(task_id, asyncio.Lock())


@asynccontextmanager
async def lifespan(_: FastAPI):
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    cleanup_results()
    yield


app = FastAPI(title="OnlyArt Image Tools Worker", version="1.0.1", lifespan=lifespan)


@app.get("/v1/health")
async def health():
    return {
        "ok": True,
        "version": app.version,
        "device": os.getenv("DEVICE", "cpu"),
        "queueDepth": len(active_tasks),
        "maxConcurrency": MAX_CONCURRENCY,
    }


@app.get("/v1/models", dependencies=[Depends(authorize)])
async def models():
    return {"data": [{"id": "rembg", "name": "智能抠图", "input": {"images": 1, "mask": False}}]}


@app.post("/v1/process", dependencies=[Depends(authorize)])
async def process(
    model: str = Form(...),
    prompt: str = Form(default=""),
    task_id: str = Form(...),
    options: str = Form(default="{}"),
    input: list[UploadFile] = File(default=[]),
    mask: UploadFile | None = File(default=None),
):
    del prompt
    task_id = validate_task_id(task_id)
    if model != "rembg":
        raise HTTPException(status_code=400, detail="unsupported model")
    if len(input) != 1 or mask is not None:
        raise HTTPException(status_code=400, detail="rembg requires exactly one input image and no mask")
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
        if not source or len(source) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="input file is empty or too large")
        validate_image(source)
        async with registry_lock:
            active_tasks.add(task_id)
            cancelled_tasks.discard(task_id)
        temporary = RESULT_DIR / f".{task_id}.{os.getpid()}.tmp"
        try:
            async with inference_slots:
                async with registry_lock:
                    if task_id in cancelled_tasks:
                        raise HTTPException(status_code=409, detail="task cancelled")
                output = await asyncio.to_thread(remove_background, source)
            async with registry_lock:
                cancelled = task_id in cancelled_tasks
            if cancelled:
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
