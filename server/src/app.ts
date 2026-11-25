import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.ts";
import { healthRouter } from "./routes/health.ts";
import { meRouter } from "./routes/me.ts";
import { usersRouter } from "./routes/users.ts";
import { errorHandler, notFound } from "./middleware/error.ts";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    }),
  );

  // Better Auth must be mounted before express.json() — it reads the raw body.
  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/me", meRouter);
  app.use("/api/users", usersRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
