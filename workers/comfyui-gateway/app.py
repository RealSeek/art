from __future__ import annotations

import asyncio
import copy
import hmac
import io
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError

MAX_INPUT_BYTES = int(os.getenv("MAX_INPUT_BYTES", str(50 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(64 * 1024 * 1024)))
MAX_CONCURRENCY = max(1, int(os.getenv("MAX_CONCURRENCY", "1")))
RESULT_TTL_SECONDS = max(3600, int(os.getenv("RESULT_TTL_SECONDS", str(7 * 86400))))
COMFYUI_TIMEOUT_SECONDS = max(30, int(os.getenv("COMFYUI_TIMEOUT_SECONDS", "600")))
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://comfyui:8188").rstrip("/")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
RESULT_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve() / "results"
WORKFLOW_DIR = Path(os.getenv("WORKFLOW_DIR", "/workflows")).resolve()
TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
WORKFLOW_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,79}$")
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

task_locks: dict[str, asyncio.Lock] = {}
active_tasks: dict[str, str | None] = {}
cancelled_tasks: set[str] = set()
registry_lock = asyncio.Lock()
inference_slots = asyncio.Semaphore(MAX_CONCURRENCY)
workflows: dict[str, dict] = {}


def result_path(task_id: str) -> Path:
    return RESULT_DIR / f"{task_id}.png"


def authorize(authorization: str | None = Header(default=None)) -> None:
    if WORKER_TOKEN and (not authorization or not hmac.compare_digest(authorization, f"Bearer {WORKER_TOKEN}")):
        raise HTTPException(status_code=401, detail="unauthorized")


def validate_task_id(task_id: str) -> str:
    if not TASK_ID_PATTERN.fullmatch(task_id):
        raise HTTPException(status_code=400, detail="invalid task_id")
    return task_id


def validate_image(source: bytes) -> None:
    try:
        with Image.open(io.BytesIO(source)) as image:
            image.load()
            width, height = image.size
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="input is not a valid image") from error
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="input image dimensions are not allowed")


def normalize_png(source: bytes) -> bytes:
    validate_image(source)
    with Image.open(io.BytesIO(source)) as image:
        buffer = io.BytesIO()
        image.convert("RGBA" if image.mode in {"RGBA", "LA"} else "RGB").save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()


def load_workflows() -> dict[str, dict]:
    loaded: dict[str, dict] = {}
    for path in sorted(WORKFLOW_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        workflow_id = str(data.get("id", ""))
        workflow = data.get("workflow")
        bindings = data.get("bindings", {})
        if not WORKFLOW_ID_PATTERN.fullmatch(workflow_id) or not isinstance(workflow, dict) or not isinstance(bindings, dict):
            raise RuntimeError(f"invalid controlled workflow file: {path.name}")
        if workflow_id in loaded:
            raise RuntimeError(f"duplicate controlled workflow id: {workflow_id}")
        for binding in bindings.values():
            if not isinstance(binding, dict) or str(binding.get("node", "")) not in workflow or not isinstance(binding.get("field"), str):
                raise RuntimeError(f"invalid binding in workflow: {workflow_id}")
        loaded[workflow_id] = data
    return loaded


def bind(workflow: dict, binding: dict | None, value) -> None:
    if not binding:
        return
    node = workflow[str(binding["node"])]
    inputs = node.get("inputs")
    if not isinstance(inputs, dict) or binding["field"] not in inputs:
        raise HTTPException(status_code=503, detail="controlled workflow binding is invalid")
    inputs[binding["field"]] = value


def size_options(options: dict, limits: dict) -> tuple[int, int]:
    size = str(options.get("size", "1024x1024")).lower().split("x")
    try:
        width, height = int(size[0]), int(size[1])
    except (ValueError, IndexError):
        width, height = 1024, 1024
    minimum = max(64, int(limits.get("minDimension", 256)))
    maximum = min(4096, int(limits.get("maxDimension", 2048)))
    width, height = max(minimum, min(maximum, width)), max(minimum, min(maximum, height))
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail="requested dimensions are too large")
    return width, height


async def upload_image(client: httpx.AsyncClient, task_id: str, source: bytes, filename: str) -> str:
    response = await client.post(
        f"{COMFYUI_URL}/upload/image",
        files={"image": (f"xinyue-{task_id}-{Path(filename).name}", source, "application/octet-stream")},
        data={"type": "input", "overwrite": "true"},
    )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"ComfyUI upload failed: {response.text[:200]}")
    payload = response.json()
    name = payload.get("name")
    if not isinstance(name, str) or not name:
        raise HTTPException(status_code=502, detail="ComfyUI upload returned no filename")
    return name


async def execute_workflow(task_id: str, spec: dict, prompt: str, options: dict, source: tuple[bytes, str] | None) -> bytes:
    workflow = copy.deepcopy(spec["workflow"])
    bindings = spec.get("bindings", {})
    limits = spec.get("limits", {}) if isinstance(spec.get("limits"), dict) else {}
    width, height = size_options(options, limits)
    seed = options.get("seed")
    try:
        seed = int(seed) if seed is not None else int.from_bytes(os.urandom(4), "big")
    except (TypeError, ValueError):
        seed = int.from_bytes(os.urandom(4), "big")
    seed = max(0, min(2_147_483_647, seed))

    timeout = httpx.Timeout(COMFYUI_TIMEOUT_SECONDS, connect=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if source:
            image_name = await upload_image(client, task_id, source[0], source[1])
            bind(workflow, bindings.get("image"), image_name)
        bind(workflow, bindings.get("prompt"), prompt[:4000])
        bind(workflow, bindings.get("negativePrompt"), str(options.get("negativePrompt", ""))[:2000])
        bind(workflow, bindings.get("width"), width)
        bind(workflow, bindings.get("height"), height)
        bind(workflow, bindings.get("seed"), seed)
        prompt_id = str(uuid.uuid4())
        async with registry_lock:
            active_tasks[task_id] = prompt_id
        response = await client.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow, "client_id": f"xinyue-{task_id}", "prompt_id": prompt_id})
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"ComfyUI rejected workflow: {response.text[:300]}")

        deadline = time.monotonic() + COMFYUI_TIMEOUT_SECONDS
        history = None
        while time.monotonic() < deadline:
            async with registry_lock:
                if task_id in cancelled_tasks:
                    await client.post(f"{COMFYUI_URL}/queue", json={"delete": [prompt_id]})
                    raise HTTPException(status_code=409, detail="task cancelled")
            result = await client.get(f"{COMFYUI_URL}/history/{prompt_id}")
            if result.status_code < 400:
                payload = result.json()
                if isinstance(payload, dict) and prompt_id in payload:
                    history = payload[prompt_id]
                    break
            await asyncio.sleep(1)
        if history is None:
            raise HTTPException(status_code=504, detail="ComfyUI workflow timed out")
        status = history.get("status", {}) if isinstance(history, dict) else {}
        if status.get("status_str") == "error":
            raise HTTPException(status_code=502, detail="ComfyUI workflow execution failed")
        outputs = history.get("outputs", {}) if isinstance(history, dict) else {}
        allowed_nodes = {str(value) for value in spec.get("outputNodes", []) if isinstance(value, (str, int))}
        for node_id, output in outputs.items():
            if allowed_nodes and str(node_id) not in allowed_nodes:
                continue
            for image in output.get("images", []) if isinstance(output, dict) else []:
                params = {"filename": image.get("filename", ""), "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")}
                image_response = await client.get(f"{COMFYUI_URL}/view", params=params)
                if image_response.status_code < 400 and image_response.content:
                    return normalize_png(image_response.content)
        raise HTTPException(status_code=502, detail="ComfyUI workflow returned no allowed image output")


async def task_lock(task_id: str) -> asyncio.Lock:
    async with registry_lock:
        return task_locks.setdefault(task_id, asyncio.Lock())


@asynccontextmanager
async def lifespan(_: FastAPI):
    global workflows
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
    workflows = load_workflows()
    cutoff = time.time() - RESULT_TTL_SECONDS
    for path in RESULT_DIR.glob("*.png"):
        if path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)
    yield


app = FastAPI(title="Xinyue Controlled ComfyUI Gateway", version="1.0.0", lifespan=lifespan)


@app.get("/v1/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{COMFYUI_URL}/system_stats")
        upstream = response.status_code < 400
    except httpx.HTTPError:
        upstream = False
    payload = {"ok": upstream, "version": app.version, "upstream": upstream, "workflowCount": len(workflows), "queueDepth": len(active_tasks), "maxConcurrency": MAX_CONCURRENCY}
    return payload if upstream else JSONResponse(payload, status_code=503)


@app.get("/v1/models", dependencies=[Depends(authorize)])
async def models():
    return {"data": [{"id": f"comfyui:{workflow_id}", "name": str(spec.get("name", workflow_id)), "input": {"images": 1 if spec.get("bindings", {}).get("image") else 0, "mask": False}} for workflow_id, spec in workflows.items()]}


@app.post("/v1/process", dependencies=[Depends(authorize)])
async def process(model: str = Form(...), prompt: str = Form(default=""), task_id: str = Form(...), options: str = Form(default="{}"), input: list[UploadFile] = File(default=[]), mask: UploadFile | None = File(default=None)):
    task_id = validate_task_id(task_id)
    workflow_id = model.removeprefix("comfyui:")
    spec = workflows.get(workflow_id) if model.startswith("comfyui:") else None
    if not spec:
        raise HTTPException(status_code=400, detail="controlled workflow is not registered")
    requires_image = bool(spec.get("bindings", {}).get("image"))
    if mask is not None or len(input) > 1 or (requires_image and len(input) != 1) or (not requires_image and input):
        raise HTTPException(status_code=400, detail="invalid input or mask count")
    try:
        parsed_options = json.loads(options)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="options must be valid JSON") from error
    if not isinstance(parsed_options, dict):
        raise HTTPException(status_code=400, detail="options must be a JSON object")
    source = None
    if input:
        content = await input[0].read(MAX_INPUT_BYTES + 1)
        if not content or len(content) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="input file is empty or too large")
        validate_image(content)
        source = (content, input[0].filename or "input.png")
    cached = result_path(task_id)
    if cached.is_file():
        return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
    lock = await task_lock(task_id)
    async with lock:
        temporary = RESULT_DIR / f".{task_id}.{os.getpid()}.tmp"
        async with registry_lock:
            active_tasks[task_id] = None
            cancelled_tasks.discard(task_id)
        try:
            async with inference_slots:
                output = await execute_workflow(task_id, spec, prompt, parsed_options, source)
            async with registry_lock:
                if task_id in cancelled_tasks:
                    raise HTTPException(status_code=409, detail="task cancelled")
            temporary.write_bytes(output)
            os.replace(temporary, cached)
            return FileResponse(cached, media_type="image/png", filename=f"{task_id}.png")
        finally:
            temporary.unlink(missing_ok=True)
            async with registry_lock:
                active_tasks.pop(task_id, None)
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
