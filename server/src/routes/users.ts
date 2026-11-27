import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/prisma/enums.ts";
import { HttpError } from "../middleware/error.ts";
import { prisma } from "../lib/prisma.ts";
import { createCredentialUser, updateCredentialUser } from "../lib/users.ts";
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

// Keep in sync with the client forms in client/src/components/CreateUserDialog.tsx
// and EditUserDialog.tsx. 128 is Better Auth's default maxPasswordLength.
const nameSchema = z.string().trim().min(3, "Name must be at least 3 characters").max(100);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: z.enum(Role, "Role must be ADMIN or AGENT").optional(),
    password: passwordSchema.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), "Nothing to update");

async function assertEmailAvailable(email: string, exceptId?: string) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, "A user with this email already exists");
  }
}

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { name, email, password } = parsed.data;

  await assertEmailAvailable(email);

  // New users are always agents; roles are changed separately.
  const { id } = await createCredentialUser({ name, email, password, role: Role.AGENT });
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: publicUserFields });
  res.status(201).json({ user });
});

usersRouter.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const changes = parsed.data;
  const { id } = req.params;
  const isSelf = id === req.user!.id;

  const existing = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!existing) throw new HttpError(404, "User not found");

  // Admins can't change their own role. Since only admins change roles, this
  // also guarantees at least one admin always remains.
  if (isSelf && changes.role !== undefined && changes.role !== existing.role) {
    throw new HttpError(400, "You can't change your own role");
  }
  if (changes.email !== undefined) await assertEmailAvailable(changes.email, id);

  await updateCredentialUser(id, changes, {
    keepSessionToken: isSelf ? req.session!.token : undefined,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: publicUserFields });
  res.json({ user });
});
