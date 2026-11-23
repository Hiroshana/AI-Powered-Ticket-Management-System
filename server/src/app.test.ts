import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "./app.ts";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

test("GET /api/health returns ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("ok");
});

test("unknown route returns 404 JSON", async () => {
  const res = await fetch(`${baseUrl}/api/nope`);
  expect(res.status).toBe(404);
});
