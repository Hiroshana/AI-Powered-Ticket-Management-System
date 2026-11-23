# CLAUDE.md

AI-powered support ticket management system. See `project-scope.md` (features, statuses, categories, roles), `tech-stack.md`, and `implementation-plan.md` (phased checklist — tick items off as they are completed).

## Documentation lookup (Context7)

Always use the Context7 MCP server to fetch current docs before writing or changing code that depends on a library, framework, CLI or API — even well-known ones. Versions in this repo are newer than most training data (Express 5, React 19, React Router 8, Vite 8, Tailwind v4, TypeScript 7, Bun 1.3, Prisma 7).

1. `resolve-library-id` with the library name (skip if the `/org/project` ID is known).
2. `query-docs` with that ID, one concept per query; pass a version-specific ID when one matches the installed version in `package.json`.
3. Write code from the fetched docs, not from memory.

Known IDs: `/oven-sh/bun`, `/expressjs/express`, `/vitejs/vite`, `/remix-run/react-router`, `/tailwindlabs/tailwindcss.com`, `/expressjs/session`, `/prisma/web` (Prisma docs mix v7 and the v8 RC — use the v7 `PrismaClient` + adapter API).

## Commands

Run from the repo root (Bun workspaces: `client`, `server`). Use `bun`, never npm/yarn/pnpm.

- `bun install` — install all workspaces
- `bun run dev` — client (http://localhost:5173) + server (http://localhost:3000) in watch mode
- `bun run dev:client` / `bun run dev:server` — one side only
- `bun run typecheck` — type-check both packages
- `bun run build` — build both packages
- `cd server && bun test` — server tests (`bun:test`; needs the database running)
- `cd server && bun run db:migrate -- --name <name>` — create + apply a migration after editing `prisma/schema.prisma`
- `cd server && bun run db:generate` — regenerate Prisma Client (also runs on `bun install`)
- `cd server && bun run db:studio` — browse data
- Add a dependency: `cd client && bun add <pkg>` (or `server`)

Before calling work done, run `bun run typecheck` and `cd server && bun test`.

## Architecture

- **server/** — Express 5 running directly on the Bun runtime (no compile step in dev).
  - `src/app.ts` exports `createApp()`; `src/index.ts` only calls `listen`. Tests import `createApp()` and listen on port 0.
  - Routers live in `src/routes/` and are mounted under `/api/...` in `app.ts`.
  - Throw `HttpError(status, message)` from `src/middleware/error.ts` for expected errors; the error handler returns `{ error }` JSON. Express 5 forwards rejected promises from async handlers automatically — no try/catch wrappers needed.
  - Config via env vars (`server/.env`, template in `.env.example`; Bun loads it automatically).
- **Database** — local PostgreSQL 18, database `ai_powered_ims`, via Prisma ORM 7 (pinned to 7.10.1; `prisma@latest` is an 8.0 RC with a different API — do not upgrade).
  - Schema: `server/prisma/schema.prisma`; CLI config (URL, migrations path): `server/prisma.config.ts`.
  - Client is generated to `server/src/generated/prisma/` (git-ignored). Import the shared instance from `src/lib/prisma.ts`; never construct another `PrismaClient`.
  - Prisma 7 requires a driver adapter (`@prisma/adapter-pg`) and does not load `.env` — always run the CLI via the `db:*` scripts (`bun --bun prisma ...`).
  - `GET /api/health` runs `SELECT 1` and returns 503 if the database is down.
- **client/** — React 19 + Vite + Tailwind CSS v4 + React Router (declarative mode).
  - Vite proxies `/api/*` to the server, so call `fetch('/api/...')` with relative URLs.
  - Routes are declared in `src/App.tsx` inside `<Layout>`; pages in `src/pages/`, shared UI in `src/components/`.
  - Import router APIs from `react-router` (not `react-router-dom`).
  - Tailwind v4 is configured via `@import "tailwindcss"` in `src/index.css` and the `@tailwindcss/vite` plugin — there is no `tailwind.config.js`.

## Conventions

- TypeScript strict; relative imports include the `.ts`/`.tsx` extension.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Auth: Better Auth (`server/src/lib/auth.ts`), email/password, sessions stored in Postgres, public sign-up disabled. Protect routes with `requireAuth` from `src/middleware/auth.ts` (sets `req.user` / `req.session`). First admin: `cd server && bun run db:seed` (reads `ADMIN_*` from `.env`).
- Planned but not yet set up: Ticket model, roles, Claude API, email provider. Fetch their docs via Context7 when implementing them.
