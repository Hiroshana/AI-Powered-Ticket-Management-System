// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
// Safe to re-run: if the user already exists, it only ensures their role is ADMIN.
import { auth } from "../src/lib/auth.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createCredentialUser } from "../src/lib/users.ts";

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
  await createCredentialUser({ email, name, password, role: "ADMIN" });
  console.log(`Created admin ${email}.`);
}

await prisma.$disconnect();
