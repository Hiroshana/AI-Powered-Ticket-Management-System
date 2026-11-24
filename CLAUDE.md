# CLAUDE.md

AI-powered support ticket management system. See `project-scope.md` (features, statuses, categories, roles), `tech-stack.md`, and `implementation-plan.md` (phased checklist — tick items off as they are completed).

## Documentation lookup (Context7)

Always use the Context7 MCP server to fetch current docs before writing or changing code that depends on a library, framework, CLI or API — even well-known ones. Versions in this repo are newer than most training data (Express 5, React 19, React Router 8, Vite 8, Tailwind v4, TypeScript 7, Bun 1.3, Prisma 7).

1. `resolve-library-id` with the library name (skip if the `/org/project` ID is known).
2. `query-docs` with that ID, one concept per query; pass a version-specific ID when one matches the installed version in `package.json`.
3. Write code from the fetched docs, not from memory.

Known IDs: `/oven-sh/bun`, `/expressjs/express`, `/vitejs/vite`, `/remix-run/react-router`, `/tailwindlabs/tailwindcss.com`, `/expressjs/session`, `/websites/ui_shadcn`, `/prisma/web` (Prisma docs mix v7 and the v8 RC — use the v7 `PrismaClient` + adapter API).

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
  - shadcn/ui (`components.json`: `base-nova` style = `nova` preset on Base UI (`@base-ui/react`, not Radix), neutral base color, CSS variables, lucide icons). Theme tokens live in `src/index.css`; style pages with semantic tokens (`bg-muted`, `text-muted-foreground`, `text-destructive`), not raw palette colors like `gray-500`.
  - Add components with `cd client && bunx --bun shadcn@latest add <name>` (they land in `src/components/ui/`; don't hand-edit them beyond small tweaks). Use `cn()` from `@/lib/utils` (backed by shadcn's `cn` package, which replaces clsx + tailwind-merge). The oxlint `only-export-components` warning in generated `ui/*.tsx` files is expected.
  - The `@/*` alias maps to `client/src/*` (set in `tsconfig.json`, `tsconfig.app.json` and `vite.config.ts`). TypeScript 7 removed `baseUrl`, so `paths` is used alone; don't add `baseUrl` even though the shadcn docs show it.
  - Forms: react-hook-form + zod (`zodResolver`), rendered with shadcn `Field` / `FieldLabel` / `FieldError` via `Controller` (`data-invalid` on `Field`, `aria-invalid` on the input). Show server errors with `setError('root', …)` in a destructive `Alert`. `src/pages/LoginPage.tsx` is the reference example.

## Authentication

Better Auth (email/password only), configured in `server/src/lib/auth.ts`. Before changing it, load the `better-auth-best-practices` skill and fetch the Better Auth docs via Context7.

- **No public sign-up** (`disableSignUp: true`). Users are created server-side through Better Auth's internal adapter: `ctx.internalAdapter.createUser(...)` + `linkAccount({ providerId: "credential", password: await ctx.password.hash(...) })`, where `ctx = await auth.$context`. See `prisma/seed.ts` and `src/auth.test.ts`. Never write `user`/`account` rows or password hashes with Prisma directly.
- **First admin:** `cd server && bun run db:seed` (reads `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` from `.env`). Re-running it is safe: an existing user is just promoted to `ADMIN`.
- **Sessions** live in the Postgres `session` table (no cookie cache or secondary storage), so sign-out and revocation take effect immediately. The session is an HTTP-only cookie; the client never handles tokens.
- **Roles:** `Role` enum (`ADMIN`, `AGENT`) in `schema.prisma`, mirrored as the `role` additional field in `auth.ts` (default `AGENT`, `input: false`, so clients can never set it). If you add a role, update both places. Change roles server-side only.
- **Tables:** `user`, `session`, `account`, `verification` are Better Auth's models (`@@map` to lowercase names). If you change the auth config in a way that needs new fields, update `schema.prisma` by hand and run `db:migrate`.
- **Env:** `BETTER_AUTH_SECRET` (32+ chars), `BETTER_AUTH_URL` (the server origin, `http://localhost:3000`), `CLIENT_ORIGIN` (used for CORS and `trustedOrigins`).

**Server**
- The Better Auth handler is mounted at `app.all("/api/auth/*splat", toNodeHandler(auth))` **before** `express.json()`, because it reads the raw body. Keep that order.
- Protect a route with `requireAuth` from `src/middleware/auth.ts`. It calls `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`, sets `req.user` / `req.session` (typed via a global `Express.Request` augmentation), or throws `HttpError(401)`. `GET /api/me` is the example.
- For server-side calls to Better Auth endpoints, use `auth.api.*` with `fromNodeHeaders(req.headers)`.
- Requests to `/api/auth/*` from tests must send an `Origin` header that matches `CLIENT_ORIGIN`, or Better Auth rejects them (see `src/auth.test.ts`).

**Client**
- `src/lib/auth-client.ts` exports `authClient = createAuthClient()` from `better-auth/react` with no `baseURL`. It calls same-origin `/api/auth/*` through the Vite proxy, which keeps the cookie first-party. Don't add a `baseURL` pointing at `:3000`.
- Use `authClient.useSession()` for `{ data: session, isPending }`, `authClient.signIn.email({ email, password })` (returns `{ error }`, doesn't throw) and `authClient.signOut()`.
- Protected pages go inside the `<RequireAuth>` layout route in `src/App.tsx`. It shows a loader while `isPending` and redirects to `/login` when there's no session. `/login` sits outside it and redirects to `/` if a user is already signed in.
- Client-side checks are only UX. Every protected API route must still use `requireAuth` (and role checks once they exist) on the server.

## Conventions

- TypeScript strict; relative imports include the `.ts`/`.tsx` extension.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Planned but not yet set up: Ticket model, role-based authorization (roles exist, nothing enforces them yet), user management, Claude API, email provider. Fetch their docs via Context7 when implementing them.
