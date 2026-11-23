import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.ts";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
// Sessions are stored in the database (no secondaryStorage, no cookieCache),
// so signing out or revoking a session takes effect immediately.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Users are created by an admin (or the seed script), never self-registered.
    disableSignUp: true,
  },
  trustedOrigins: [process.env.CLIENT_ORIGIN ?? "http://localhost:5173"],
});

export type Session = typeof auth.$Infer.Session;
