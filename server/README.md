# Xinyue AI Server

Commercial backend for Xinyue AI.

## Stack

- NestJS 11 with Fastify
- PostgreSQL 17 and Prisma
- Redis 7 and BullMQ
- Local file storage in development, with a replaceable storage service for OSS/COS/R2/S3
- HttpOnly cookie sessions
- Server-sent events for generation progress

## Local development

```powershell
docker compose up -d
cd server
npm install
npx prisma migrate dev
npm run admin:seed
npm run dev
```

The API listens on `http://localhost:3100/v1`. The frontend proxies `/v1` to it.

## Production checklist

1. Replace every development credential in `.env`.
2. Configure a transactional email provider in `AuthService.requestCode`.
3. Configure production PostgreSQL and Redis, then replace the local storage service with OSS/COS/R2/S3 for multi-instance deployment.
4. Set `AI_PROVIDER_API_KEY` and production model mappings.
5. Run `npm run prisma:deploy` during deployment.
6. Run API and BullMQ workers as separate processes when scaling.
7. Put the service behind TLS and an application firewall.
8. Configure database backups, Redis persistence and object lifecycle rules.
9. Forward audit and application logs to centralized storage.

## Implemented domains

- Email OTP authentication and revocable sessions
- User profiles and personalization settings
- Credit balances with serializable, idempotent ledger mutations
- Projects, conversations and message attachments
- Authenticated direct uploads and generated asset storage
- Chat, image and commerce generation jobs
- Retry, cancellation, failure refund and SSE job progress
- Notifications, invitations and redemption codes
- Admin console with password login, user suspension, user groups, bulk operations, credit ledger, redemption codes, targeted announcements, asset management, login records, job intervention and audit logs

## Admin console

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run `npm run admin:seed`. The management UI is available at `http://localhost:5173/admin/login`.

Uploaded files are stored below `server/uploads/` and are only served through authenticated API routes. The browser never needs direct access to the storage directory.

The public API product is intentionally not implemented; `/api` is only the reserved frontend portal requested for this phase.
