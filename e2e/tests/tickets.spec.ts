import type { Page } from '@playwright/test'
import { admin, adminState, agent, agentState, expectLoginPage } from './helpers/auth.ts'
import type { TestUser } from './helpers/auth.ts'
import { expectTicket, uniqueEmail } from './helpers/inbound-email.ts'
import {
  TICKETS_API,
  categorySelect,
  expect,
  expectTicketsPage,
  isTicketsRequest,
  nextButton,
  pagination,
  previousButton,
  statusSelect,
  test,
  ticketRow,
  ticketsLink,
  ticketsTable,
} from './helpers/tickets.ts'

// Tickets are only created through the inbound webhook, so every ticket here is
// OPEN, uncategorized and unassigned. Other tests create tickets in parallel, so
// tests look up their own tickets by unique subject and never assert totals or
// absolute row positions. A freshly delivered ticket is always near the top of
// the newest-first list, so it is on page 1.

const NO_MATCHES = 'No tickets match these filters.'

type Email = { subject: string; from: string; fromName: string; text: string; messageId: string }

function newEmail(): Email {
  const id = crypto.randomUUID()
  const email = uniqueEmail()
  return {
    from: `customer-${id}@example.com`,
    fromName: `Customer ${id.slice(0, 8)}`,
    subject: `Ticket list ${id}`,
    text: String(email.text),
    messageId: `<${id}@mail.example.com>`,
  }
}

async function expectRowVisible(page: Page, email: Email) {
  await expect(ticketRow(page, email.subject)).toBeVisible()
}

test.describe('signed out', () => {
  test('/tickets redirects to /login', async ({ page }) => {
    await page.goto('/tickets?status=OPEN')
    await expectLoginPage(page)
    await expect(ticketsTable(page)).toHaveCount(0)
  })

  test('GET /api/tickets returns 401', async ({ newApi }) => {
    const api = await newApi()
    const response = await api.get(TICKETS_API)
    expect(response.status()).toBe(401)
    expect(await response.json()).not.toHaveProperty('tickets')
  })
})

const roles: [TestUser, string][] = [
  [agent, agentState],
  [admin, adminState],
]

for (const [user, state] of roles) {
  test.describe(`as ${user.role.toLowerCase()}`, () => {
    test.use({ storageState: state })

    test('the header link opens the ticket list', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('banner').getByText(user.name, { exact: true })).toBeVisible()
      await ticketsLink(page).click()
      await expect(page).toHaveURL('/tickets')
      await expectTicketsPage(page)
    })

    test('GET /api/tickets returns the list', async ({ page }) => {
      const response = await page.request.get(TICKETS_API)
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({ page: 1, pageSize: 20 })
      expect(Array.isArray(body.tickets)).toBe(true)
      expect(typeof body.total).toBe('number')
    })
  })
}

test.describe('list', () => {
  test.use({ storageState: agentState })

  test('GET /api/tickets rejects invalid query params with 400', async ({ page }) => {
    for (const query of ['status=PENDING', 'category=OTHER', 'page=0', 'pageSize=101']) {
      const response = await page.request.get(`${TICKETS_API}?${query}`)
      expect(response.status(), query).toBe(400)
      expect(typeof (await response.json()).error, query).toBe('string')
    }
  })

  test('shows a delivered ticket with its details', async ({ page, deliver }) => {
    const email = newEmail()
    const id = await expectTicket(await deliver(email), 201)

    await page.goto('/tickets')
    await expectTicketsPage(page)
    const table = ticketsTable(page)
    for (const column of ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeAttached()
    }

    const row = ticketRow(page, email.subject)
    const cells = row.getByRole('cell')
    await expect(cells).toHaveCount(7)
    await expect(cells.nth(0)).toHaveText(String(id))
    await expect(cells.nth(1)).toHaveText(email.subject)
    await expect(cells.nth(2).getByText(email.fromName, { exact: true })).toBeVisible()
    await expect(cells.nth(2).getByText(email.from, { exact: true })).toBeVisible()
    await expect(cells.nth(3)).toHaveText('Open')
    await expect(cells.nth(4)).toHaveText('Uncategorized')
    await expect(cells.nth(5)).toHaveText('Unassigned')
    await expect(cells.nth(6)).toHaveText(/\d{4}/)
  })

  test('lists the newest ticket first', async ({ page, deliver }) => {
    const first = newEmail()
    const second = newEmail()
    await expectTicket(await deliver(first), 201)
    await expectTicket(await deliver(second), 201)

    await page.goto('/tickets')
    await expectRowVisible(page, first)
    await expectRowVisible(page, second)

    const rows = await ticketsTable(page).getByRole('row').allInnerTexts()
    const firstIndex = rows.findIndex((text) => text.includes(first.subject))
    const secondIndex = rows.findIndex((text) => text.includes(second.subject))
    expect(secondIndex).toBeGreaterThan(0)
    expect(secondIndex).toBeLessThan(firstIndex)
  })
})

test.describe('filters', () => {
  test.use({ storageState: agentState })

  test('the status filter updates the URL and the request', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto('/tickets')
    await expectRowVisible(page, email)
    await expect(statusSelect(page)).toHaveValue('')

    let request = page.waitForRequest(isTicketsRequest({ status: 'OPEN', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Open' })
    await request
    await expect(page).toHaveURL('/tickets?status=OPEN')
    await expectRowVisible(page, email)

    request = page.waitForRequest(isTicketsRequest({ status: 'RESOLVED', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Resolved' })
    await request
    await expect(page).toHaveURL('/tickets?status=RESOLVED')
    // Inbound tickets are always OPEN and nothing can resolve them yet.
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)

    request = page.waitForRequest(isTicketsRequest({ status: undefined, page: '1' }))
    await statusSelect(page).selectOption({ label: 'All statuses' })
    await request
    await expect(page).toHaveURL('/tickets')
    await expectRowVisible(page, email)
  })

  test('the category filter shows no uncategorized tickets', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto('/tickets')
    await expectRowVisible(page, email)

    const request = page.waitForRequest(isTicketsRequest({ category: 'REFUND_REQUEST' }))
    await categorySelect(page).selectOption({ label: 'Refund Request' })
    await request
    await expect(page).toHaveURL('/tickets?category=REFUND_REQUEST')
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)
  })

  test('filters survive a reload and back navigation', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto('/tickets')
    await expectRowVisible(page, email)

    await statusSelect(page).selectOption({ label: 'Open' })
    await expect(page).toHaveURL('/tickets?status=OPEN')

    await page.reload()
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expectRowVisible(page, email)

    await statusSelect(page).selectOption({ label: 'Closed' })
    await expect(page).toHaveURL('/tickets?status=CLOSED')
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL('/tickets?status=OPEN')
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expectRowVisible(page, email)

    await page.goForward()
    await expect(page).toHaveURL('/tickets?status=CLOSED')
    await expect(statusSelect(page)).toHaveValue('CLOSED')
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
  })

  test('opening a filtered URL directly applies the filters', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)

    const request = page.waitForRequest(
      isTicketsRequest({ status: 'OPEN', category: undefined, page: '1' }),
    )
    await page.goto('/tickets?status=OPEN')
    await request
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expect(categorySelect(page)).toHaveValue('')
    await expectRowVisible(page, email)
  })

  test('changing a filter resets to page 1', async ({ page, deliver }) => {
    await expectTicket(await deliver(newEmail()), 201)
    await page.goto('/tickets?page=2')
    await expectTicketsPage(page)

    const request = page.waitForRequest(isTicketsRequest({ status: 'OPEN', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Open' })
    await request
    await expect(page).toHaveURL('/tickets?status=OPEN')
  })
})

test.describe('pagination', () => {
  test.use({ storageState: agentState })

  test('page 1 shows the first range with Previous disabled', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto('/tickets')
    await expectRowVisible(page, email)

    await expect(pagination(page).getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible()
    await expect(previousButton(page)).toBeDisabled()
    await expect(nextButton(page)).toBeVisible()
  })

  test('?page=2 requests page 2 and does not show the newest ticket', async ({
    page,
    deliver,
  }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)

    const request = page.waitForRequest(isTicketsRequest({ page: '2', pageSize: '20' }))
    await page.goto('/tickets?page=2')
    await request
    await expectTicketsPage(page)
    // Either the second page of tickets or the "no tickets on this page" state,
    // depending on how many tickets other tests have created so far.
    await expect(
      pagination(page)
        .getByText(/^Showing 21–\d+ of \d+$/)
        .or(page.getByText('No tickets on this page.', { exact: true })),
    ).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)
  })

  test('a page past the end offers a way back to the first page', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto('/tickets?page=1000')
    await expect(page.getByText('No tickets on this page.', { exact: true })).toBeVisible()
    await expect(ticketsTable(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Go to first page', exact: true }).click()
    await expect(page).toHaveURL('/tickets')
    await expectRowVisible(page, email)
    await expect(previousButton(page)).toBeDisabled()
  })
})
