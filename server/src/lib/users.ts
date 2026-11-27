import type { Role } from "../generated/prisma/enums.ts";
import { auth } from "./auth.ts";

type NewUser = {
  email: string;
  name: string;
  password: string;
  role: Role;
};

// Creates a user with an email/password account. Public sign-up is disabled,
// so this goes through Better Auth's internal adapter (same hashing and
// account rows as a normal sign-up). Never write user/account rows directly.
export async function createCredentialUser({ email, name, password, role }: NewUser) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email: email.toLowerCase(), name, role },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  return user;
}

type UserChanges = {
  email?: string;
  name?: string;
  password?: string;
  role?: Role;
};

// Updates a user's profile, role and/or password through Better Auth's
// internal adapter. A password change signs the user out everywhere except
// `keepSessionToken` (the caller's own session when they edit themselves).
export async function updateCredentialUser(
  userId: string,
  { email, name, password, role }: UserChanges,
  { keepSessionToken }: { keepSessionToken?: string } = {},
) {
  const ctx = await auth.$context;
  const data = {
    ...(email !== undefined && { email: email.toLowerCase() }),
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
  };
  if (Object.keys(data).length > 0) {
    await ctx.internalAdapter.updateUser(userId, data);
  }
  if (password !== undefined) {
    await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
    const sessions = await ctx.internalAdapter.listSessions(userId);
    const revoke = sessions.map((s) => s.token).filter((t) => t !== keepSessionToken);
    if (revoke.length > 0) await ctx.internalAdapter.deleteSessions(revoke);
  }
}
