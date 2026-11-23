import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Database health check failed:", err);
    database = "error";
  }

  res.status(database === "ok" ? 200 : 503).json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    timestamp: new Date().toISOString(),
  });
});
