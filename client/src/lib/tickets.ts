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

// Columns GET /api/tickets can sort by (server/src/routes/tickets.ts). Keep in sync.
export const ticketSortKeys = [
  'id',
  'subject',
  'fromName',
  'status',
  'category',
  'assignee',
  'createdAt',
] as const
export type TicketSortKey = (typeof ticketSortKeys)[number]
export type SortOrder = 'asc' | 'desc'

export const isTicketSortKey = (value: unknown): value is TicketSortKey =>
  typeof value === 'string' && (ticketSortKeys as readonly string[]).includes(value)

export const isSortOrder = (value: unknown): value is SortOrder => value === 'asc' || value === 'desc'

export const DEFAULT_SORT: TicketSortKey = 'createdAt'
export const DEFAULT_ORDER: SortOrder = 'desc'

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
  sort: TicketSortKey
  order: SortOrder
}
