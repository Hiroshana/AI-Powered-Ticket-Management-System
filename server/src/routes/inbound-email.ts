import { createHash, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { createTicketFromEmail } from "../lib/tickets.ts";

// Called by the email provider (not a browser), so it's authenticated with a
// shared secret instead of a session. Provider-specific adapters (SendGrid /
// Mailgun) should verify the provider's signature and map into createTicketFromEmail().
export const inboundEmailRouter = Router();

const sha256 = (value: string) => createHash("sha256").update(value).digest();

const requireInboundSecret: RequestHandler = (req, _res, next) => {
  const expected = process.env.INBOUND_EMAIL_SECRET;
  const provided = req.get("x-inbound-email-secret");
  // Fail closed when the secret isn't configured. Hashing gives equal-length
  // buffers so timingSafeEqual doesn't leak the secret's length.
  if (!expected || !provided || !timingSafeEqual(sha256(provided), sha256(expected))) {
    throw new HttpError(401, "Unauthorized");
  }
  next();
};

const inboundEmailSchema = z.object({
  from: z.string().trim().toLowerCase().pipe(z.email("Enter a valid sender email address")),
  fromName: z
    .string("Sender name is required")
    .trim()
    .min(1, "Sender name is required")
    .max(200, "Sender name must be at most 200 characters"),
  subject: z.string().trim().max(500, "Subject must be at most 500 characters").optional(),
  text: z
    .string("Email body is required")
    .trim()
    .min(1, "Email body is required")
    .max(100_000, "Email body must be at most 100000 characters"),
  messageId: z.string().trim().max(998, "Message-ID is too long").optional(),
});

// Auth runs before body parsing so unauthenticated requests never get a 1 MB body parsed.
// The route has its own parser because emails can exceed the global 100 KB limit.
inboundEmailRouter.post("/", requireInboundSecret, express.json({ limit: "1mb" }), async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { ticket, created } = await createTicketFromEmail(parsed.data);
  res.status(created ? 201 : 200).json({ ticket });
});
