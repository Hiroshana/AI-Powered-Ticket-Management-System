import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.ts";
import { errorHandler, notFound } from "./middleware/error.ts";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use("/api/health", healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
