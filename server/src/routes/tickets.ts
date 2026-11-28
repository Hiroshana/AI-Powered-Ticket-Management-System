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

const listQuerySchema = z.object({
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
  const { status, category, page, pageSize, sort, order } = parsed.data;
  const where = { status, category };

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
