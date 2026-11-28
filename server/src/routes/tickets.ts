import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { TicketCategory, TicketStatus } from "../generated/prisma/enums.ts";
import { HttpError } from "../middleware/error.ts";
import { prisma } from "../lib/prisma.ts";
import { requireAuth } from "../middleware/auth.ts";

export const ticketsRouter = Router();

// Every signed-in user (admin or agent) can work with tickets.
ticketsRouter.use(requireAuth);

// Explicit list fields: the email body and Message-ID stay out of the list.
const ticketListFields = {
  id: true,
  subject: true,
  fromName: true,
  fromEmail: true,
  status: true,
  category: true,
  createdAt: true,
  assignee: { select: { id: true, name: true } },
} as const;

// Keep in sync with TicketSortKey in client/src/lib/tickets.ts.
const sortKeys = ["id", "subject", "fromName", "status", "category", "assignee", "createdAt"] as const;
type SortKey = (typeof sortKeys)[number];
type SortOrder = "asc" | "desc";

// Status and category sort in enum declaration order (Open → Resolved → Closed),
// not alphabetically. Uncategorized tickets always go last. Unassigned tickets
// follow Postgres' default: last when ascending, first when descending.
function orderByFor(sort: SortKey, order: SortOrder): Prisma.TicketOrderByWithRelationInput[] {
  const primary: Prisma.TicketOrderByWithRelationInput =
    sort === "category"
      ? { category: { sort: order, nulls: "last" } }
      : sort === "assignee"
        ? { assignee: { name: order } }
        : { [sort]: order };
  // The id tiebreak keeps pages stable when sorted values are equal.
  return sort === "id" ? [primary] : [primary, { id: order }];
}

// Free-text search: case-insensitive substring match on subject, sender name and
// sender email, plus an exact ticket number when the text is a number (a leading
// "#" is allowed).
function searchWhere(q: string | undefined): Prisma.TicketWhereInput {
  if (!q) return {};
  // Prisma passes `contains` straight into ILIKE without escaping, so "%" and
  // "_" would be wildcards. Escape them (and the escape character itself).
  const pattern = q.replace(/[\\%_]/g, "\\$&");
  const text = { contains: pattern, mode: "insensitive" } as const;
  const number = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : undefined;
  return {
    OR: [
      { subject: text },
      { fromName: text },
      { fromEmail: text },
      ...(number !== undefined ? [{ id: number }] : []),
    ],
  };
}

const listQuerySchema = z.object({
  q: z
    .string("Search must be text")
    .trim()
    .max(200, "Search must be at most 200 characters")
    .optional(),
  status: z.enum(TicketStatus, "Status must be OPEN, RESOLVED or CLOSED").optional(),
  category: z
    .enum(TicketCategory, "Category must be GENERAL_QUESTION, TECHNICAL_QUESTION or REFUND_REQUEST")
    .optional(),
  page: z.coerce.number("Page must be a positive integer").int("Page must be a positive integer").min(1, "Page must be a positive integer").default(1),
  pageSize: z.coerce
    .number("Page size must be between 1 and 100")
    .int("Page size must be between 1 and 100")
    .min(1, "Page size must be between 1 and 100")
    .max(100, "Page size must be between 1 and 100")
    .default(10),
  sort: z.enum(sortKeys, `Sort must be one of ${sortKeys.join(", ")}`).default("createdAt"),
  order: z.enum(["asc", "desc"], "Order must be asc or desc").default("desc"),
});

ticketsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { q, status, category, page, pageSize, sort, order } = parsed.data;
  const where: Prisma.TicketWhereInput = { status, category, ...searchWhere(q) };

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      select: ticketListFields,
      // Defaults to newest first.
      orderBy: orderByFor(sort, order),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ tickets, total, page, pageSize, sort, order });
});

// Full ticket for the detail page: list fields plus the email body. The
// Message-ID stays internal.
const ticketDetailFields = {
  ...ticketListFields,
  body: true,
  updatedAt: true,
} as const;

const idParamSchema = z.coerce
  .number("Ticket id must be a positive integer")
  .int("Ticket id must be a positive integer")
  .min(1, "Ticket id must be a positive integer")
  // Postgres INT4 max; larger ids would make Prisma throw.
  .max(2_147_483_647, "Ticket id must be a positive integer");

// Digits only: z.coerce would otherwise accept "1e2", " 7" or "0x10".
function parseTicketId(raw: string): number {
  const parsed = /^\d+$/.test(raw) ? idParamSchema.safeParse(raw) : undefined;
  if (!parsed?.success) throw new HttpError(400, "Ticket id must be a positive integer");
  return parsed.data;
}

// Who a ticket can be assigned to: every active user (agents and admins), as
// { id, name } only. Readable by agents, unlike the admin-only GET /api/users.
// Declared before "/:id" so "assignees" isn't taken for a ticket id.
ticketsRouter.get("/assignees", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ users });
});

ticketsRouter.get("/:id", async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: parseTicketId(req.params.id) },
    select: ticketDetailFields,
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");

  res.json(ticket);
});

// Every field is optional, but at least one must be sent. `assigneeId: null`
// unassigns and `category: null` clears the category. Keep in sync with the
// client's TicketUpdate type.
const updateTicketSchema = z
  .object({
    assigneeId: z
      .string("Assignee must be a user id or null")
      .min(1, "Assignee must be a user id or null")
      .max(100)
      .nullable()
      .optional(),
    status: z.enum(TicketStatus, "Status must be OPEN, RESOLVED or CLOSED").optional(),
    category: z
      .enum(TicketCategory, "Category must be GENERAL_QUESTION, TECHNICAL_QUESTION, REFUND_REQUEST or null")
      .nullable()
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), "Nothing to update");

ticketsRouter.patch("/:id", async (req, res) => {
  const id = parseTicketId(req.params.id);
  const parsed = updateTicketSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { assigneeId, status, category } = parsed.data;

  const ticket = await prisma.$transaction(async (tx) => {
    // Only active (not soft-deleted) users can be assigned.
    if (assigneeId) {
      const assignee = await tx.user.findFirst({
        where: { id: assigneeId, deletedAt: null },
        select: { id: true },
      });
      if (!assignee) throw new HttpError(400, "Assignee must be an active user");
    }
    const existing = await tx.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Ticket not found");
    // Undefined fields are left unchanged by Prisma.
    return tx.ticket.update({
      where: { id },
      data: { assigneeId, status, category },
      select: ticketDetailFields,
    });
  });

  res.json(ticket);
});

// Replies in the ticket's thread. Keep in sync with the client's TicketReply type.
const replyFields = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} as const;

// Oldest first, so the thread reads top to bottom.
ticketsRouter.get("/:id/replies", async (req, res) => {
  const id = parseTicketId(req.params.id);
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      replies: { select: replyFields, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");

  res.json({ replies: ticket.replies });
});

const createReplySchema = z.object({
  body: z
    .string("Reply must be text")
    .trim()
    .min(1, "Reply is required")
    .max(10_000, "Reply must be at most 10,000 characters"),
});

// Adds a reply by the signed-in user. Outbound email isn't set up yet, so the
// reply is only stored on the ticket.
ticketsRouter.post("/:id/replies", async (req, res) => {
  const id = parseTicketId(req.params.id);
  const parsed = createReplySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }

  const reply = await prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Ticket not found");
    const created = await tx.ticketReply.create({
      data: { ticketId: id, body: parsed.data.body, authorId: req.user!.id },
      select: replyFields,
    });
    // A reply is activity on the ticket.
    await tx.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
    return created;
  });

  res.status(201).json(reply);
});
