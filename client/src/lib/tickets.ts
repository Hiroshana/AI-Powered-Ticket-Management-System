// Mirrors the TicketStatus / TicketCategory enums in server/prisma/schema.prisma
// and the GET /api/tickets response. Keep them in sync.

export const ticketStatusLabels = {
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
} as const

export const ticketCategoryLabels = {
  GENERAL_QUESTION: 'General Question',
  TECHNICAL_QUESTION: 'Technical Question',
  REFUND_REQUEST: 'Refund Request',
} as const

export type TicketStatus = keyof typeof ticketStatusLabels
export type TicketCategory = keyof typeof ticketCategoryLabels

export const isTicketStatus = (value: unknown): value is TicketStatus =>
  typeof value === 'string' && Object.hasOwn(ticketStatusLabels, value)

export const isTicketCategory = (value: unknown): value is TicketCategory =>
  typeof value === 'string' && Object.hasOwn(ticketCategoryLabels, value)

export type TicketListItem = {
  id: number
  subject: string
  fromName: string
  fromEmail: string
  status: TicketStatus
  category: TicketCategory | null
  createdAt: string
  assignee: { id: string; name: string } | null
}

export type TicketListResponse = {
  tickets: TicketListItem[]
  total: number
  page: number
  pageSize: number
}
