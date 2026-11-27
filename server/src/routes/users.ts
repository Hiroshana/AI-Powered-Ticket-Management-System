import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/prisma/enums.ts";
import { HttpError } from "../middleware/error.ts";
import { prisma } from "../lib/prisma.ts";
import { createCredentialUser } from "../lib/users.ts";
import { requireAdmin, requireAuth } from "../middleware/auth.ts";

export const usersRouter = Router();

// Every route in this router is admin-only.
usersRouter.use(requireAuth, requireAdmin);

// Explicit fields, so columns added later aren't exposed by accident.
const publicUserFields = { id: true, name: true, email: true, role: true, createdAt: true } as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: publicUserFields,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ users });
});

// Keep in sync with the client form in client/src/components/CreateUserDialog.tsx.
// 128 is Better Auth's default maxPasswordLength.
const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { name, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "A user with this email already exists");
  }

  // New users are always agents; roles are changed separately.
  const { id } = await createCredentialUser({ name, email, password, role: Role.AGENT });
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: publicUserFields });
  res.status(201).json({ user });
});
