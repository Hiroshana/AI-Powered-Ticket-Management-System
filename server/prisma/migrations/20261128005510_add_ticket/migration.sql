-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('GENERAL_QUESTION', 'TECHNICAL_QUESTION', 'REFUND_REQUEST');

-- CreateTable
CREATE TABLE "ticket" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "category" "TicketCategory",
    "messageId" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_messageId_key" ON "ticket"("messageId");

-- CreateIndex
CREATE INDEX "ticket_status_idx" ON "ticket"("status");

-- CreateIndex
CREATE INDEX "ticket_createdAt_idx" ON "ticket"("createdAt");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
