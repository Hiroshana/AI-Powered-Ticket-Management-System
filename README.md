# Ticket Management System

Full-stack TypeScript monorepo run with [Bun](https://bun.sh) workspaces.

| Package   | Stack                                              | Dev URL               |
| --------- | -------------------------------------------------- | --------------------- |
| `client/` | React 19, Vite, Tailwind CSS v4, React Router      | http://localhost:5173 |
| `server/` | Express 5 on the Bun runtime, Prisma 7 + PostgreSQL | http://localhost:3000 |

In development, Vite proxies `/api/*` to the Express server, so the client calls it with relative URLs through the axios instance in `client/src/lib/api.ts`.

## Getting started

```sh
bun install          # installs all workspaces
cp server/.env.example server/.env   # then set DATABASE_URL (PostgreSQL, db: ai_powered_ims)
(cd server && bun run db:migrate)    # creates the database if missing and applies migrations
bun run dev          # starts client + server in parallel
```

## Scripts (root)

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `bun run dev`        | Run client and server in watch mode |
| `bun run dev:client` | Run only the client                 |
| `bun run dev:server` | Run only the server                 |
| `bun run build`      | Build both packages                 |
| `bun run typecheck`  | Type-check both packages            |
| `cd server && bun test` | Run server tests                 |
| `cd server && bun run db:migrate` | Create/apply Prisma migrations |
| `cd server && bun run db:studio` | Open Prisma Studio |

## Layout

```
client/src/
  components/   shared UI (Layout)
  pages/        route components
server/src/
  app.ts        Express app factory (used by index.ts and tests)
  routes/       API routers mounted under /api
  middleware/   404 + error handling (HttpError)
  lib/prisma.ts shared PrismaClient (pg driver adapter)
server/prisma/
  schema.prisma Prisma schema (URL is in server/prisma.config.ts)
```
