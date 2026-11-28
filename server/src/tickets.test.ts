import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { prisma } from "./lib/prisma.ts";
import { createCredentialUser } from "./lib/users.ts";

const id = crypto.randomUUID();
const password = "correct-horse-battery";
const admin = { email: `tickets-admin-${id}@example.com`, name: "Tickets Admin", role: "ADMIN" as const };
const agent = { email: `tickets-agent-${id}@example.com`, name: "Tickets Agent", role: "AGENT" as const };
const sender = `tickets-sender-${id}@example.com`;
const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Far-future timestamps, so this file's tickets always sort to the top of the
// shared test database, newest first.
const at = (minute: number) => new Date(Date.UTC(2999, 0, 1, 0, minute));

type Seed = {
  subject: string;
  status: "OPEN" | "RESOLVED" | "CLOSED";
  category: "GENERAL_QUESTION" | "TECHNICAL_QUESTION" | "REFUND_REQUEST" | null;
  createdAt: Date;
  fromName: string;
  assignee?: "admin" | "agent";
};

// In expected newest-first order. "tie-b" and "tie-a" share a timestamp; tie-b
// is created later, so it gets the higher id and comes first.
const seeds: Seed[] = [
  { subject: "newest", status: "OPEN", category: "REFUND_REQUEST", createdAt: at(50), fromName: "Eve", assignee: "agent" },
  { subject: "tie-b", status: "RESOLVED", category: null, createdAt: at(40), fromName: "Dan" },
  { subject: "tie-a", status: "OPEN", category: "TECHNICAL_QUESTION", createdAt: at(40), fromName: "Cat" },
  { subject: "middle", status: "CLOSED", category: "REFUND_REQUEST", createdAt: at(30), fromName: "Bob", assignee: "admin" },
  { subject: "oldest", status: "OPEN", category: "GENERAL_QUESTION", createdAt: at(20), fromName: "Amy" },
];
const creationOrder = ["oldest", "middle", "tie-a", "tie-b", "newest"];

let server: Server;
let baseUrl: string;
let agentCookie: string;
let adminCookie: string;
let agentId: string;
let adminId: string;

type ListResponse = {
  tickets: {
    id: number;
    subject: string;
    status: string;
    category: string | null;
    assignee: { id: string; name: string } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  order: string;
};

beforeAll(async () => {
  adminId = (await createCredentialUser({ ...admin, password })).id;
  agentId = (await createCredentialUser({ ...agent, password })).id;

  for (const subject of creationOrder) {
    const seed = seeds.find((s) => s.subject === subject)!;
    await prisma.ticket.create({
      data: {
        subject: `${seed.subject} ${id}`,
        body: "Body",
        fromEmail: sender,
        fromName: seed.fromName,
        status: seed.status,
        category: seed.category,
        createdAt: seed.createdAt,
        assigneeId: seed.assignee === "agent" ? agentId : seed.assignee === "admin" ? adminId : null,
      },
    });
  }

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
  agentCookie = await signIn(agent.email);
  adminCookie = await signIn(admin.email);
});

afterAll(async () => {
  server.close();
  await prisma.ticket.deleteMany({ where: { fromEmail: sender } });
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

// Pass `null` for no session.
const list = (query = "", cookie: string | null = agentCookie) =>
  fetch(`${baseUrl}/api/tickets${query}`, { headers: cookie ? { Cookie: cookie } : {} });

async function listOk(query = "", cookie: string = agentCookie) {
  const res = await list(query, cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as ListResponse;
}

// Every page of a listing, so non-date sorts can be checked even when the shared
// test DB holds more tickets than fit on one page.
async function listAll(query: string) {
  const all: ListResponse["tickets"] = [];
  for (let page = 1; ; page++) {
    const body = await listOk(`?pageSize=100&page=${page}&${query}`);
    all.push(...body.tickets);
    if (page * 100 >= body.total) return { ...body, tickets: all };
  }
}

// This file's tickets, by seed name, in response order.
const mine = (body: ListResponse) =>
  body.tickets.filter((t) => t.subject.endsWith(id)).map((t) => t.subject.replace(` ${id}`, ""));

test("GET /api/tickets without a session returns 401", async () => {
  const res = await list("", null);
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Unauthorized" });
});

test("agents and admins can both list tickets", async () => {
  await listOk("", agentCookie);
  await listOk("", adminCookie);
});

test("lists newest first, breaking timestamp ties by id", async () => {
  const body = await listOk();
  // Far-future tickets lead the list.
  expect(mine(body)).toEqual(seeds.map((s) => s.subject));
  expect(body.tickets.slice(0, seeds.length).every((t) => t.subject.endsWith(id))).toBe(true);
});

test("returns only list fields, with the assignee as { id, name } or null", async () => {
  const body = await listOk();
  expect(Object.keys(body).sort()).toEqual(["order", "page", "pageSize", "sort", "tickets", "total"]);
  expect(body).toMatchObject({ sort: "createdAt", order: "desc" });
  const [newest, tieB] = body.tickets;
  expect(Object.keys(newest!).sort()).toEqual(
    ["assignee", "category", "createdAt", "fromEmail", "fromName", "id", "status", "subject"].sort(),
  );
  expect(newest!.assignee).toEqual({ id: agentId, name: agent.name });
  expect(tieB!.assignee).toBeNull();
  expect(tieB!.category).toBeNull();
});

test("filters by status", async () => {
  const body = await listOk("?status=OPEN");
  expect(body.tickets.every((t) => t.status === "OPEN")).toBe(true);
  expect(mine(body)).toEqual(["newest", "tie-a", "oldest"]);
});

test("filters by category", async () => {
  const body = await listOk("?category=REFUND_REQUEST");
  expect(body.tickets.every((t) => t.category === "REFUND_REQUEST")).toBe(true);
  expect(mine(body)).toEqual(["newest", "middle"]);
});

test("combines status and category filters", async () => {
  const body = await listOk("?status=OPEN&category=REFUND_REQUEST");
  expect(body.tickets.every((t) => t.status === "OPEN" && t.category === "REFUND_REQUEST")).toBe(true);
  expect(mine(body)).toEqual(["newest"]);
  expect(body.total).toBe(await prisma.ticket.count({ where: { status: "OPEN", category: "REFUND_REQUEST" } }));
});

test("paginates with page and pageSize, defaulting to page 1 of 10", async () => {
  const defaults = await listOk();
  expect(defaults.page).toBe(1);
  expect(defaults.pageSize).toBe(10);
  expect(defaults.total).toBe(await prisma.ticket.count());

  const first = await listOk("?pageSize=2");
  const second = await listOk("?pageSize=2&page=2");
  const third = await listOk("?pageSize=2&page=3");
  expect([first, second, third].map(mine)).toEqual([["newest", "tie-b"], ["tie-a", "middle"], ["oldest"]]);
  expect(second).toMatchObject({ page: 2, pageSize: 2, total: defaults.total });
});

test("a page past the end is empty but still reports the total", async () => {
  const { total } = await listOk();
  const body = await listOk(`?pageSize=100&page=${Math.ceil(total / 100) + 1}`);
  expect(body.tickets).toEqual([]);
  expect(body.total).toBe(total);
});

// Expected order of this file's tickets. Seed ids ascend in creation order:
// oldest < middle < tie-a < tie-b < newest. Ties fall back to id in the same direction.
test.each([
  ["id", "asc", ["oldest", "middle", "tie-a", "tie-b", "newest"]],
  ["id", "desc", ["newest", "tie-b", "tie-a", "middle", "oldest"]],
  ["createdAt", "asc", ["oldest", "middle", "tie-a", "tie-b", "newest"]],
  ["createdAt", "desc", ["newest", "tie-b", "tie-a", "middle", "oldest"]],
  ["subject", "asc", ["middle", "newest", "oldest", "tie-a", "tie-b"]],
  ["subject", "desc", ["tie-b", "tie-a", "oldest", "newest", "middle"]],
  ["fromName", "asc", ["oldest", "middle", "tie-a", "tie-b", "newest"]],
  ["fromName", "desc", ["newest", "tie-b", "tie-a", "middle", "oldest"]],
  // Enum order: OPEN, RESOLVED, CLOSED.
  ["status", "asc", ["oldest", "tie-a", "newest", "tie-b", "middle"]],
  ["status", "desc", ["middle", "tie-b", "newest", "tie-a", "oldest"]],
  // Enum order: GENERAL, TECHNICAL, REFUND; uncategorized last both ways.
  ["category", "asc", ["oldest", "tie-a", "middle", "newest", "tie-b"]],
  ["category", "desc", ["newest", "middle", "tie-a", "oldest", "tie-b"]],
  // By assignee name ("Tickets Admin" < "Tickets Agent"); unassigned last asc, first desc.
  ["assignee", "asc", ["middle", "newest", "oldest", "tie-a", "tie-b"]],
  ["assignee", "desc", ["tie-b", "tie-a", "oldest", "newest", "middle"]],
])("sorts by %s %s", async (sort, order, expected) => {
  const body = await listAll(`sort=${sort}&order=${order}`);
  expect(body).toMatchObject({ sort, order });
  expect(mine(body)).toEqual(expected);
});

test("sorting combines with filters and pagination", async () => {
  const body = await listAll("status=OPEN&sort=subject&order=asc");
  expect(body.tickets.every((t) => t.status === "OPEN")).toBe(true);
  expect(mine(body)).toEqual(["newest", "oldest", "tie-a"]);

  // Far-future seeds lead createdAt desc, so the first pages are exactly ours.
  const pages = await Promise.all([1, 2, 3].map((p) => listOk(`?sort=createdAt&order=desc&pageSize=2&page=${p}`)));
  expect(pages.map(mine)).toEqual([["newest", "tie-b"], ["tie-a", "middle"], ["oldest"]]);
});

test.each([
  ["?sort=body", "Sort must be one of id, subject, fromName, status, category, assignee, createdAt"],
  ["?sort=", "Sort must be one of id, subject, fromName, status, category, assignee, createdAt"],
  ["?order=up", "Order must be asc or desc"],
  ["?status=PENDING", "Status must be OPEN, RESOLVED or CLOSED"],
  ["?status=", "Status must be OPEN, RESOLVED or CLOSED"],
  ["?category=BILLING", "Category must be GENERAL_QUESTION, TECHNICAL_QUESTION or REFUND_REQUEST"],
  ["?page=0", "Page must be a positive integer"],
  ["?page=1.5", "Page must be a positive integer"],
  ["?page=abc", "Page must be a positive integer"],
  ["?pageSize=0", "Page size must be between 1 and 100"],
  ["?pageSize=101", "Page size must be between 1 and 100"],
])("rejects %s with 400", async (query, error) => {
  const res = await list(query);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error });
});

test("q searches subject, sender name and sender email, case-insensitively", async () => {
  // Every seed's subject and email contain this run's id.
  const byId = await listAll(`q=${id}`);
  expect(mine(byId)).toEqual(seeds.map((s) => s.subject));
  expect(byId.total).toBe(seeds.length);

  expect(mine(await listAll(`q=${encodeURIComponent(`TIE-A ${id}`)}`))).toEqual(["tie-a"]);
  expect(mine(await listAll(`q=${encodeURIComponent(sender.toUpperCase())}`))).toEqual(seeds.map((s) => s.subject));
  // fromName only: "amy" isn't in any of this file's subjects or emails.
  expect(mine(await listAll("q=amy"))).toEqual(["oldest"]);
});

test("q matches a ticket number, with or without #", async () => {
  const oldest = await prisma.ticket.findFirstOrThrow({ where: { subject: `oldest ${id}` } });
  for (const q of [String(oldest.id), `%23${oldest.id}`]) {
    const body = await listOk(`?q=${q}`);
    expect(body.tickets.map((t) => t.id)).toContain(oldest.id);
  }
});

test("q combines with filters, sorting and pagination", async () => {
  const body = await listAll(`q=${id}&status=OPEN&sort=subject&order=asc`);
  expect(mine(body)).toEqual(["newest", "oldest", "tie-a"]);
  expect(body.total).toBe(3);

  const second = await listOk(`?q=${id}&pageSize=2&page=2`);
  expect(mine(second)).toEqual(["tie-a", "middle"]);
  expect(second.total).toBe(seeds.length);
});

test("q treats LIKE wildcards and backslashes literally", async () => {
  const subjects = ["50% off", "a_b", "back\\slash"].map((s) => `${s} ${id}`);
  await prisma.ticket.createMany({
    data: subjects.map((subject) => ({ subject, body: "Body", fromEmail: sender, fromName: "Wildcard" })),
  });
  const found = async (q: string) =>
    (await listAll(`q=${encodeURIComponent(q)}`)).tickets
      .filter((t) => t.subject.endsWith(id))
      .map((t) => t.subject.replace(` ${id}`, ""));
  try {
    expect(await found("%")).toEqual(["50% off"]);
    expect(await found("_")).toEqual(["a_b"]);
    expect(await found("\\")).toEqual(["back\\slash"]);
    expect(await found("a_")).toEqual(["a_b"]);
  } finally {
    await prisma.ticket.deleteMany({ where: { subject: { in: subjects } } });
  }
});

test("a blank q is ignored", async () => {
  const [all, blank] = await Promise.all([listOk(), listOk("?q=%20%20")]);
  expect(blank.total).toBe(all.total);
});

test("rejects a q longer than 200 characters", async () => {
  const res = await list(`?q=${"a".repeat(201)}`);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "Search must be at most 200 characters" });
});
