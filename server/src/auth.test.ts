import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { auth } from "./lib/auth.ts";
import { prisma } from "./lib/prisma.ts";

const email = `test-${crypto.randomUUID()}@example.com`;
const password = "correct-horse-battery";
const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Test" }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email } });
});

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });

test("GET /api/me without a session returns 401", async () => {
  const res = await fetch(`${baseUrl}/api/me`);
  expect(res.status).toBe(401);
});

test("public sign-up is disabled", async () => {
  const res = await post("/api/auth/sign-up/email", {
    email: `nope-${crypto.randomUUID()}@example.com`,
    password,
    name: "Nope",
  });
  expect(res.ok).toBe(false);
});

test("wrong password is rejected", async () => {
  const res = await post("/api/auth/sign-in/email", { email, password: "wrong-password" });
  expect(res.status).toBe(401);
});

test("sign in → /api/me → sign out → session is gone", async () => {
  const signIn = await post("/api/auth/sign-in/email", { email, password });
  expect(signIn.status).toBe(200);
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");

  const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } });
  expect(me.status).toBe(200);
  const body = (await me.json()) as { user: { email: string } };
  expect(body.user.email).toBe(email);

  const signOut = await post("/api/auth/sign-out", {}, cookie);
  expect(signOut.status).toBe(200);

  // Session row was deleted from the DB, so the old cookie no longer works.
  const after = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } });
  expect(after.status).toBe(401);
});
