import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { prisma } from "./lib/prisma.ts";
import { createCredentialUser } from "./lib/users.ts";

const id = crypto.randomUUID();
const password = "correct-horse-battery";
const admin = { email: `admin-${id}@example.com`, name: "List Admin", role: "ADMIN" as const };
const agent = { email: `agent-${id}@example.com`, name: "List Agent", role: "AGENT" as const };
const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await createCredentialUser({ ...admin, password });
  await createCredentialUser({ ...agent, password });

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { in: [admin.email, agent.email] } } });
});

async function signIn(email: string) {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const listUsers = (cookie?: string) =>
  fetch(`${baseUrl}/api/users`, { headers: cookie ? { Cookie: cookie } : {} });

test("GET /api/users without a session returns 401", async () => {
  const res = await listUsers();
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Unauthorized" });
});

test("GET /api/users as an agent returns 403 and no users", async () => {
  const res = await listUsers(await signIn(agent.email));
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "Forbidden" });
});

test("GET /api/users as an admin lists users with only the public fields", async () => {
  const res = await listUsers(await signIn(admin.email));
  expect(res.status).toBe(200);
  const { users } = (await res.json()) as { users: Record<string, unknown>[] };

  for (const expected of [admin, agent]) {
    expect(users.find((u) => u.email === expected.email)).toMatchObject(expected);
  }
  for (const user of users) {
    expect(Object.keys(user).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
  }
});

test("an admin who is demoted loses access on the next request", async () => {
  const cookie = await signIn(admin.email);
  const setRole = (role: "ADMIN" | "AGENT") =>
    prisma.user.update({ where: { email: admin.email }, data: { role } });

  await setRole("AGENT");
  try {
    expect((await listUsers(cookie)).status).toBe(403);
  } finally {
    await setRole("ADMIN");
  }
});
