FROM python:3.11-slim@sha256:1042b61448fef4ba92d16a8c7eb4996d027568ce64792a7877fd88511e0af7c6

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

WORKDIR /app

RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir --upgrade pip==26.2.1 setuptools==83.0.0 \
    && useradd --create-home --uid 10001 worker
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./

RUN mkdir -p /data /home/worker/.u2net && chown -R worker:worker /app /data /home/worker
USER worker

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
