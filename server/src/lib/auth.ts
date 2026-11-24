import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.ts";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
// Sessions are stored in the database (no secondaryStorage, no cookieCache),
// so signing out or revoking a session takes effect immediately.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    additionalFields: {
      // Mirrors the `Role` enum in prisma/schema.prisma.
      // input: false — only the server (seed, admin routes) can set a role;
      // it can never be supplied through sign-up or update-user requests.
      role: {
        type: ["ADMIN", "AGENT"],
        required: false,
        defaultValue: "AGENT",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Users are created by an admin (or the seed script), never self-registered.
    disableSignUp: true,
  },
  trustedOrigins: [process.env.CLIENT_ORIGIN ?? "http://localhost:5173"],
  // On only in production (`bun run start` sets NODE_ENV=production); off in
  // dev and tests so repeated sign-ins don't get blocked. Uses Better Auth's
  // defaults: 100 requests / 10s per IP, and its built-in stricter rule of
  // 3 / 10s for sign-in, sign-up, change-password and change-email.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
  },
});

export type Session = typeof auth.$Infer.Session;
