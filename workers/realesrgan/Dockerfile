FROM python:3.10-slim@sha256:38758a82a44d1acb9bae3dd5f7d2a55452fb44a5ceca7c4589f360f2c4aa3d0c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    MODEL_DIR=/models

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 worker
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
RUN mkdir -p /data /models && chown -R worker:worker /app /data /models
USER worker
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
