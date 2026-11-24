// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
// Safe to re-run: if the user already exists, it only ensures their role is ADMIN.
// Public sign-up is disabled, so this goes through Better Auth's internal
// adapter (same hashing + account rows as a normal sign-up).
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "Admin";

if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set (see .env.example)");
}

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(email);

if (existing) {
  // Make sure an admin created before roles existed gets the ADMIN role.
  await prisma.user.update({ where: { id: existing.user.id }, data: { role: "ADMIN" } });
  console.log(`Admin ${email} already exists, ensured role ADMIN.`);
} else {
  const user = await ctx.internalAdapter.createUser(
    { email, name, role: "ADMIN" },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created admin ${email}.`);
}

await prisma.$disconnect();
