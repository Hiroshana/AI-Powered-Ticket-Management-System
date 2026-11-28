import { mergeTests } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import { test as authTest, expect } from './auth.ts'
import { test as inboundTest } from './inbound-email.ts'

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

// Matches a GET /api/tickets request with exactly the given filter params.
export function isTicketsRequest(params: Record<string, string | undefined>) {
  return (request: Request) => {
    const url = new URL(request.url())
    if (request.method() !== 'GET' || url.pathname !== TICKETS_API) return false
    return Object.entries(params).every(([key, value]) => url.searchParams.get(key) === (value ?? null))
  }
}

export async function expectTicketsPage(page: Page) {
  await expect(ticketsHeading(page)).toBeVisible()
  await expect(statusSelect(page)).toBeVisible()
}

export { expect }
