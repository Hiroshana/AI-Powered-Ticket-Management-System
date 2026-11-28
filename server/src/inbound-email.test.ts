import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { createTicketFromEmail } from "./lib/tickets.ts";
import { prisma } from "./lib/prisma.ts";

const id = crypto.randomUUID();
const secret = `test-inbound-secret-${id}`;
const sender = `student-${id}@example.com`;
const originalSecret = process.env.INBOUND_EMAIL_SECRET;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.INBOUND_EMAIL_SECRET = secret;
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  server.close();
  process.env.INBOUND_EMAIL_SECRET = originalSecret;
  await prisma.ticket.deleteMany({ where: { fromEmail: sender } });
});

const validEmail = () => ({
  from: sender,
  fromName: "Sam Student",
  subject: "Can't log in",
  text: "I forgot my password.",
});

const postEmail = (body: unknown, headerSecret: string | null = secret) =>
  fetch(`${baseUrl}/api/inbound/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headerSecret === null ? {} : { "X-Inbound-Email-Secret": headerSecret }),
    },
    body: JSON.stringify(body),
  });

const countTickets = () => prisma.ticket.count({ where: { fromEmail: sender } });

test("rejects a missing or wrong secret with 401 and creates nothing", async () => {
  const before = await countTickets();
  for (const headerSecret of [null, "wrong", `${secret}x`]) {
    const res = await postEmail(validEmail(), headerSecret);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  }
  expect(await countTickets()).toBe(before);
});

test("rejects every request when INBOUND_EMAIL_SECRET is not configured", async () => {
  process.env.INBOUND_EMAIL_SECRET = "";
  try {
    const res = await postEmail(validEmail(), "");
    expect(res.status).toBe(401);
  } finally {
    process.env.INBOUND_EMAIL_SECRET = secret;
  }
});

test("creates an OPEN, unassigned, uncategorized ticket", async () => {
  const res = await postEmail({ ...validEmail(), from: `  ${sender.toUpperCase()} ` });
  expect(res.status).toBe(201);
  const { ticket } = (await res.json()) as { ticket: { id: number; status: string } };
  expect(Object.keys(ticket).sort()).toEqual(["id", "status"]);
  expect(typeof ticket.id).toBe("number");
  expect(ticket.status).toBe("OPEN");

  const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  expect(row).toMatchObject({
    subject: "Can't log in",
    body: "I forgot my password.",
    fromEmail: sender,
    fromName: "Sam Student",
    status: "OPEN",
    category: null,
    assigneeId: null,
    messageId: null,
  });
});

test("uses a placeholder subject when the subject is missing or blank", async () => {
  for (const subject of [undefined, "   "]) {
    const res = await postEmail({ ...validEmail(), subject });
    expect(res.status).toBe(201);
    const { ticket } = (await res.json()) as { ticket: { id: number } };
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.subject).toBe("(no subject)");
  }
});

test("a repeated Message-ID returns the existing ticket instead of a duplicate", async () => {
  const messageId = `<${id}-dup@mail.example.com>`;
  const first = await postEmail({ ...validEmail(), messageId });
  expect(first.status).toBe(201);
  const second = await postEmail({ ...validEmail(), messageId });
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual(await first.json());
  expect(await prisma.ticket.count({ where: { messageId } })).toBe(1);
});

test("concurrent deliveries of the same email create one ticket", async () => {
  const messageId = `<${id}-race@mail.example.com>`;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => createTicketFromEmail({ ...validEmail(), messageId })),
  );
  expect(results.filter((r) => r.created)).toHaveLength(1);
  expect(new Set(results.map((r) => r.ticket.id)).size).toBe(1);
});

test.each([
  [{ from: "not-an-email" }, "Enter a valid sender email address"],
  [{ from: undefined }, "Enter a valid sender email address"],
  [{ fromName: undefined }, "Sender name is required"],
  [{ fromName: "   " }, "Sender name is required"],
  [{ text: undefined }, "Email body is required"],
  [{ text: "  " }, "Email body is required"],
])("rejects invalid input %p with 400", async (override, error) => {
  const res = await postEmail({ ...validEmail(), ...override });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error });
});

test("accepts bodies larger than the global 100 KB JSON limit", async () => {
  const text = "é".repeat(60_000); // 60k chars (under the text limit), 120 KB as UTF-8
  const res = await postEmail({ ...validEmail(), text });
  expect(res.status).toBe(201);
});

test("rejects bodies over 1 MB with 413", async () => {
  const res = await postEmail({ ...validEmail(), text: "a".repeat(1_100_000) });
  expect(res.status).toBe(413);
});

test("rejects malformed JSON with 400", async () => {
  const res = await fetch(`${baseUrl}/api/inbound/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Inbound-Email-Secret": secret },
    body: "{not json",
  });
  expect(res.status).toBe(400);
});
