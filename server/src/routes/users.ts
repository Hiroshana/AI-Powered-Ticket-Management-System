import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { requireAdmin, requireAuth } from "../middleware/auth.ts";

export const usersRouter = Router();

// Every route in this router is admin-only.
usersRouter.use(requireAuth, requireAdmin);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    // Explicit fields, so columns added later aren't exposed by accident.
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ users });
});
