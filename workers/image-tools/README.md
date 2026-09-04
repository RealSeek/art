# OnlyArt Image Tools Worker

This container implements the OnlyArt Local Worker protocol for `rembg`. It is intentionally separate from the NestJS API so model caches and native inference dependencies do not enter the main application image.

Start it with:

```powershell
docker compose --profile image-tools --env-file .env.production -f docker-compose.prod.yml up -d --build image-worker
```

Then create a `LOCAL_WORKER` provider in the admin console:

```text
Base URL: http://image-worker:8080
Token: value of LOCAL_WORKER_TOKEN (required; the worker fails closed when it is missing)
```

Run provider detection, create an image model using discovered capability `rembg`, bind the route, set its price, and publish the corresponding image tool.

The worker keeps idempotent results in `/data/results` for seven days by default. Model downloads are stored in `/home/worker/.u2net`. Both directories are Docker volumes in the production Compose profile.
