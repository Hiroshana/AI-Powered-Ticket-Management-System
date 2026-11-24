import { auth } from "./auth.ts";

type NewUser = {
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "AGENT";
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
