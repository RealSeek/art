# Xinyue AI

Xinyue AI is a private commercial AI workspace containing a user application,
an administration console, and a NestJS API service.

## Stack

- User application: Vue 3, TypeScript, Vite, Pinia
- Administration: Art Design Pro, Vue 3, Element Plus
- API: NestJS, Fastify, Prisma, PostgreSQL, Redis, BullMQ

## Requirements

- Node.js 20.19 or newer
- npm
- pnpm 8.8 or newer
- Docker Desktop or local PostgreSQL 17 and Redis 7 services

## Local setup

1. Install dependencies:

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
```

2. Start PostgreSQL and Redis:

```powershell
docker compose up -d
```

3. Create the backend environment file:

```powershell
Copy-Item server/.env.example server/.env
```

Replace `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and
`ADMIN_PASSWORD` before sharing or deploying an environment.

4. Prepare the database:

```powershell
npm --prefix server run prisma:generate
npm --prefix server run prisma:deploy
npm --prefix server run admin:seed
```

5. Start the three applications in separate terminals:

```powershell
npm run dev
npm run server:dev
npm run admin:dev
```

Local addresses:

- User application: `http://localhost:5173`
- Administration: `http://localhost:5174/admin/`
- API: `http://localhost:3100/v1`

## Build

```powershell
npm run build
npm run server:build
npm run admin:build
```

## Collaboration

Do not commit directly to `main`. Create a feature branch and open a pull
request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the expected workflow.

Runtime `.env` files, generated output, logs, databases, and user uploads are
excluded from source control. Never add credentials to commits or pull request
descriptions.

## Third-party software

Third-party notices and retained licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
