import { mergeTests } from '@playwright/test'
import type { APIRequestContext, APIResponse, Page, Request } from '@playwright/test'
import { test as authTest, expect } from './auth.ts'
import { test as inboundTest, uniqueEmail } from './inbound-email.ts'
import type { InboundEmail } from './inbound-email.ts'

// Auth fixtures (origin, newApi) plus inbound email delivery (deliver).
export const test = mergeTests(authTest, inboundTest)

export const TICKETS_API = '/api/tickets'

export const ticketsLink = (page: Page) =>
  page.getByRole('banner').getByRole('link', { name: 'Tickets', exact: true })
export const ticketsHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Tickets', exact: true })
export const ticketsTable = (page: Page) =>
  page.getByRole('table', { name: 'Tickets', exact: true })
export const statusSelect = (page: Page) => page.getByLabel('Status', { exact: true })
export const categorySelect = (page: Page) => page.getByLabel('Category', { exact: true })
export const pagination = (page: Page) =>
  page.getByRole('navigation', { name: 'Pagination', exact: true })
export const previousButton = (page: Page) =>
  pagination(page).getByRole('button', { name: 'Previous', exact: true })
export const nextButton = (page: Page) =>
  pagination(page).getByRole('button', { name: 'Next', exact: true })

// The table row holding the given (unique) subject.
export const ticketRow = (page: Page, subject: string) =>
  ticketsTable(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: subject, exact: true }) })

export type TicketColumn = '#' | 'Subject' | 'From' | 'Status' | 'Category' | 'Assignee' | 'Received'

// The column header (it carries aria-sort) and the sort button inside it.
export const columnHeader = (page: Page, column: TicketColumn) =>
  ticketsTable(page).getByRole('columnheader', { name: column, exact: true })
export const sortButton = (page: Page, column: TicketColumn) =>
  columnHeader(page, column).getByRole('button', { name: column, exact: true })

// Checks aria-sort on every header: `sorted` has the given direction, the rest "none".
export async function expectSortedBy(
  page: Page,
  sorted: TicketColumn,
  direction: 'ascending' | 'descending',
) {
  const columns: TicketColumn[] = ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received']
  for (const column of columns) {
    await expect(columnHeader(page, column)).toHaveAttribute(
      'aria-sort',
      column === sorted ? direction : 'none',
    )
  }
}

// Table rows with data cells (the header row only has column headers).
export const bodyRows = (page: Page) =>
  ticketsTable(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })

// Waits until the table shows exactly these tickets, in this order. Each row's
// text starts with its id, followed by the subject (which never starts with a digit here).
export async function expectRowsInOrder(page: Page, ids: number[]) {
  await expect(bodyRows(page)).toHaveText(ids.map((id) => new RegExp(`^${id}\\D`)))
}

// Makes sure the list isn't empty, so the table (and its sort buttons) render.
// Creates a ticket only when there is none, since every new ticket pushes other
// tests' newest tickets down the default newest-first list.
export async function ensureATicket(
  request: APIRequestContext,
  deliver: (email: InboundEmail) => Promise<APIResponse>,
) {
  const response = await request.get(`${TICKETS_API}?pageSize=1`)
  expect(response.status()).toBe(200)
  if ((await response.json()).total > 0) return
  expect((await deliver(uniqueEmail())).status()).toBe(201)
}

type TicketSummary = { id: number; subject: string; fromName: string; createdAt: string }

// Pages through GET /api/tickets with the given sort and returns the tickets with
// the given ids, in the order the server lists them. Paging through the whole list
// keeps this independent of other tests' tickets and of the database collation.
// Tickets created meanwhile can only shift rows onto a later page (seen twice,
// so duplicates are dropped), never make one disappear.
export async function ticketsInServerOrder(
  request: APIRequestContext,
  query: { sort: string; order: string },
  ids: number[],
): Promise<TicketSummary[]> {
  const found = new Map<number, TicketSummary>()
  for (let page = 1; found.size < ids.length; page++) {
    const params = new URLSearchParams({ ...query, page: String(page), pageSize: '100' })
    const response = await request.get(`${TICKETS_API}?${params}`)
    expect(response.status()).toBe(200)
    const body: { tickets: TicketSummary[]; total: number } = await response.json()
    for (const ticket of body.tickets) {
      if (ids.includes(ticket.id) && !found.has(ticket.id)) found.set(ticket.id, ticket)
    }
    if (body.tickets.length === 0) break
  }
  return [...found.values()]
}

// Matches a GET /api/tickets request with exactly the given filter params.
export function isTicketsRequest(params: Record<string, string | undefined>) {
  return (request: Request) => {
    const url = new URL(request.url())
    if (request.method() !== 'GET' || url.pathname !== TICKETS_API) return false
    return Object.entries(params).every(([key, value]) => url.searchParams.get(key) === (value ?? null))
  }
}

// Resolves with the body of the next GET /api/tickets response for the given params.
export async function waitForTickets(
  page: Page,
  params: Record<string, string | undefined>,
): Promise<{ tickets: TicketSummary[]; total: number }> {
  const response = await page.waitForResponse((r) => isTicketsRequest(params)(r.request()))
  expect(response.status()).toBe(200)
  return response.json()
}

export async function expectTicketsPage(page: Page) {
  await expect(ticketsHeading(page)).toBeVisible()
  await expect(statusSelect(page)).toBeVisible()
}

export { expect }
