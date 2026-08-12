# Contributing

## Branch workflow

Always branch from the latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Use one of these prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, or
`chore/`.

## Before opening a pull request

Run the checks relevant to the changed area:

```bash
npm run build
npm run server:build
npm run admin:build
```

Do not commit `.env` files, credentials, logs, generated builds, databases, or
uploaded user content.

## Pull requests

- Keep each pull request focused on one behavior or maintenance task.
- Describe user-visible behavior and API or database changes.
- Include migration files when the Prisma schema changes.
- Call out new environment variables and update the matching example file.
- Request review before merging to `main`.

After approval, prefer squash merge and delete the source branch.
