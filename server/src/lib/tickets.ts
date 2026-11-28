import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";

/** A normalized inbound email. Provider-specific adapters map their payloads into this. */
export type InboundEmail = {
  from: string;
  fromName: string;
  subject?: string;
  text: string;
  messageId?: string;
};

const ticketAckFields = { id: true, status: true } as const;

/**
 * Creates a ticket from an inbound email. If a ticket with the same Message-ID
 * already exists (e.g. a webhook retry), it is returned with `created: false`.
 */
export async function createTicketFromEmail(email: InboundEmail) {
  const subject = email.subject?.trim() || "(no subject)";
  const messageId = email.messageId || undefined;

  if (messageId) {
    const existing = await prisma.ticket.findUnique({ where: { messageId }, select: ticketAckFields });
    if (existing) return { ticket: existing, created: false };
  }

  try {
    const ticket = await prisma.ticket.create({
      data: { subject, body: email.text, fromEmail: email.from, fromName: email.fromName, messageId },
      select: ticketAckFields,
    });
    return { ticket, created: true };
  } catch (err) {
    // A concurrent delivery of the same email won the race.
    if (messageId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.ticket.findUnique({ where: { messageId }, select: ticketAckFields });
      if (existing) return { ticket: existing, created: false };
    }
    throw err;
  }
}
