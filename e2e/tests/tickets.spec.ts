import type { APIResponse, Page } from '@playwright/test'
import { admin, adminState, agent, agentState, expectLoginPage } from './helpers/auth.ts'
import type { TestUser } from './helpers/auth.ts'
import { expectTicket, uniqueEmail } from './helpers/inbound-email.ts'
import type { InboundEmail } from './helpers/inbound-email.ts'
import {
  TICKETS_API,
  categorySelect,
  ensureATicket,
  expect,
  expectRowsInOrder,
  expectSortedBy,
  expectTicketsPage,
  isTicketsRequest,
  nextButton,
  pagination,
  previousButton,
  sortButton,
  statusSelect,
  test,
  ticketRow,
  ticketsInServerOrder,
  ticketsLink,
  ticketsTable,
  waitForTickets,
} from './helpers/tickets.ts'

// Tickets are only created through the inbound webhook, so every ticket here is
// OPEN, uncategorized and unassigned. Other tests create tickets in parallel, so
// tests look up their own tickets by unique subject and never assert totals or
// absolute row positions. A freshly delivered ticket is always near the top of
// the newest-first list, so it is on page 1 of LIST.

const NO_MATCHES = 'No tickets match these filters.'

// The list at its largest page size. Tests that look for a ticket they just
// delivered open this, so tickets other tests create in parallel can't push it
// off page 1 (the default is only 10 rows).
const LIST = '/tickets?pageSize=100'

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
      expect(body).toMatchObject({ page: 1, pageSize: 10 })
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

    await page.goto(LIST)
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

    await page.goto(LIST)
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
    await page.goto(LIST)
    await expectRowVisible(page, email)
    await expect(statusSelect(page)).toHaveValue('')

    let request = page.waitForRequest(isTicketsRequest({ status: 'OPEN', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Open' })
    await request
    await expect(page).toHaveURL(`${LIST}&status=OPEN`)
    await expectRowVisible(page, email)

    request = page.waitForRequest(isTicketsRequest({ status: 'RESOLVED', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Resolved' })
    await request
    await expect(page).toHaveURL(`${LIST}&status=RESOLVED`)
    // Inbound tickets are always OPEN and nothing can resolve them yet.
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)

    request = page.waitForRequest(isTicketsRequest({ status: undefined, page: '1' }))
    await statusSelect(page).selectOption({ label: 'All statuses' })
    await request
    await expect(page).toHaveURL(LIST)
    await expectRowVisible(page, email)
  })

  test('the category filter shows no uncategorized tickets', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto(LIST)
    await expectRowVisible(page, email)

    const request = page.waitForRequest(isTicketsRequest({ category: 'REFUND_REQUEST' }))
    await categorySelect(page).selectOption({ label: 'Refund Request' })
    await request
    await expect(page).toHaveURL(`${LIST}&category=REFUND_REQUEST`)
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)
  })

  test('filters survive a reload and back navigation', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto(LIST)
    await expectRowVisible(page, email)

    await statusSelect(page).selectOption({ label: 'Open' })
    await expect(page).toHaveURL(`${LIST}&status=OPEN`)

    await page.reload()
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expectRowVisible(page, email)

    await statusSelect(page).selectOption({ label: 'Closed' })
    await expect(page).toHaveURL(`${LIST}&status=CLOSED`)
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(`${LIST}&status=OPEN`)
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expectRowVisible(page, email)

    await page.goForward()
    await expect(page).toHaveURL(`${LIST}&status=CLOSED`)
    await expect(statusSelect(page)).toHaveValue('CLOSED')
    await expect(page.getByText(NO_MATCHES, { exact: true })).toBeVisible()
  })

  test('opening a filtered URL directly applies the filters', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)

    const request = page.waitForRequest(
      isTicketsRequest({ status: 'OPEN', category: undefined, page: '1' }),
    )
    await page.goto(`${LIST}&status=OPEN`)
    await request
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expect(categorySelect(page)).toHaveValue('')
    await expectRowVisible(page, email)
  })

  test('changing a filter resets to page 1', async ({ page, deliver }) => {
    await expectTicket(await deliver(newEmail()), 201)
    await page.goto(`${LIST}&page=2`)
    await expectTicketsPage(page)

    const request = page.waitForRequest(isTicketsRequest({ status: 'OPEN', page: '1' }))
    await statusSelect(page).selectOption({ label: 'Open' })
    await request
    await expect(page).toHaveURL(`${LIST}&status=OPEN`)
  })
})

test.describe('pagination', () => {
  test.use({ storageState: agentState })

  test('page 1 shows the first range with Previous disabled', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto(LIST)
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

    const request = page.waitForRequest(isTicketsRequest({ page: '2', pageSize: '10' }))
    await page.goto('/tickets?page=2')
    await request
    await expectTicketsPage(page)
    // Either the second page of tickets or the "no tickets on this page" state,
    // depending on how many tickets other tests have created so far.
    await expect(
      pagination(page)
        .getByText(/^Showing 11–\d+ of \d+$/)
        .or(page.getByText('No tickets on this page.', { exact: true })),
    ).toBeVisible()
    await expect(ticketRow(page, email.subject)).toHaveCount(0)
  })

  test('rows per page defaults to 10, changes the request and survives a reload', async ({
    page,
    deliver,
  }) => {
    await ensureATicket(page.request, deliver)
    await page.goto('/tickets')
    const select = pagination(page).getByLabel('Rows per page', { exact: true })
    await expect(select).toHaveValue('10')

    const request = page.waitForRequest(isTicketsRequest({ pageSize: '25' }))
    await select.selectOption('25')
    await request
    await expect(page).toHaveURL('/tickets?pageSize=25')

    await page.reload()
    await expect(pagination(page).getByLabel('Rows per page', { exact: true })).toHaveValue('25')
    await expect(pagination(page).getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible()
  })

  test('a page past the end offers a way back to the first page', async ({ page, deliver }) => {
    const email = newEmail()
    await expectTicket(await deliver(email), 201)
    await page.goto(`${LIST}&page=1000`)
    await expect(page.getByText('No tickets on this page.', { exact: true })).toBeVisible()
    await expect(ticketsTable(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Go to first page', exact: true }).click()
    await expect(page).toHaveURL(LIST)
    await expectRowVisible(page, email)
    await expect(previousButton(page)).toBeDisabled()
  })
})

// Sorting. Every ticket a test creates pushes other tests' newest tickets down
// the default newest-first list, so these tests create as few as possible: most
// only need some ticket (ensureATicket) and check that the table shows the
// server's rows in the server's order. The Subject and From tests create two
// tickets per group and check their relative order. For those to be on page 1
// whatever else is in the database, their values start with a prefix that sorts
// before (LOW) or after (HIGH) every other value the tests create, including
// "(no subject)": symbols come before digits and letters under the Windows and
// ICU collations, and digits still come first under glibc, which ignores
// punctuation. The API tests check server order by paging through the whole list.
const LOW = '!000'
const HIGH = 'zzzz'

const COLUMNS = ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received'] as const

const shortId = () => crypto.randomUUID().slice(0, 8)

// Delivers emails one at a time, so they are received in the given order.
async function deliverInOrder(
  deliver: (email: InboundEmail) => Promise<APIResponse>,
  emails: Email[],
) {
  const ids: number[] = []
  for (const email of emails) ids.push(await expectTicket(await deliver(email), 201))
  return ids
}

// Two emails whose `field` is `<prefix> <token> A|B`, delivered in the given order.
function lettered(field: 'subject' | 'fromName', prefix: string, order: ['A', 'B'] | ['B', 'A']) {
  const token = `${prefix} ${shortId()}`
  const values = { A: `${token} A`, B: `${token} B` }
  const emails = order.map((letter) => ({ ...newEmail(), [field]: values[letter] }))
  return { token, values, emails }
}

const isStrictlyDescending = (values: number[]) => values.every((v, i) => i === 0 || values[i - 1]! > v)
const isStrictlyAscending = (values: number[]) => values.every((v, i) => i === 0 || values[i - 1]! < v)
const isChronological = (dates: string[]) =>
  dates.every((d, i) => i === 0 || Date.parse(dates[i - 1]!) <= Date.parse(d))

test.describe('sorting', () => {
  test.use({ storageState: agentState })

  test('the default sort is newest first and is sent with the request', async ({
    page,
    deliver,
  }) => {
    await ensureATicket(page.request, deliver)

    const response = waitForTickets(page, { sort: 'createdAt', order: 'desc', page: '1' })
    await page.goto('/tickets')
    const { tickets } = await response
    expect(isChronological(tickets.map((t) => t.createdAt).reverse())).toBe(true)
    await expectRowsInOrder(page, tickets.map((t) => t.id))
    await expectSortedBy(page, 'Received', 'descending')
    for (const column of COLUMNS) await expect(sortButton(page, column)).toBeVisible()
  })

  test('clicking Subject sorts A→Z, and clicking again sorts Z→A', async ({ page, deliver }) => {
    // Delivered so that newest first (B, A then A, B) is the reverse of each expected order.
    const low = lettered('subject', LOW, ['A', 'B'])
    const high = lettered('subject', HIGH, ['B', 'A'])
    await deliverInOrder(deliver, [...low.emails, ...high.emails])

    await page.goto('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    const ascending = waitForTickets(page, { sort: 'subject', order: 'asc', page: '1' })
    await sortButton(page, 'Subject').click()
    const ascendingIds = (await ascending).tickets.map((t) => t.id)
    await expect(page).toHaveURL('/tickets?sort=subject&order=asc')
    await expectSortedBy(page, 'Subject', 'ascending')
    await expectRowsInOrder(page, ascendingIds)
    await expect(ticketsTable(page).getByText(low.token)).toHaveText([low.values.A, low.values.B])

    const descending = waitForTickets(page, { sort: 'subject', order: 'desc', page: '1' })
    await sortButton(page, 'Subject').click()
    const descendingIds = (await descending).tickets.map((t) => t.id)
    await expect(page).toHaveURL('/tickets?sort=subject&order=desc')
    await expectSortedBy(page, 'Subject', 'descending')
    await expectRowsInOrder(page, descendingIds)
    await expect(ticketsTable(page).getByText(high.token)).toHaveText([high.values.B, high.values.A])
  })

  test('clicking From sorts by sender name A→Z', async ({ page, deliver }) => {
    const { token, values, emails } = lettered('fromName', LOW, ['B', 'A'])
    await deliverInOrder(deliver, emails)

    await page.goto('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    const response = waitForTickets(page, { sort: 'fromName', order: 'asc', page: '1' })
    await sortButton(page, 'From').click()
    const { tickets } = await response
    await expect(page).toHaveURL('/tickets?sort=fromName&order=asc')
    await expectSortedBy(page, 'From', 'ascending')
    await expectRowsInOrder(page, tickets.map((t) => t.id))
    await expect(ticketsTable(page).getByText(token)).toHaveText([values.A, values.B])
  })

  test('# sorts highest first, then lowest first', async ({ page, deliver }) => {
    await ensureATicket(page.request, deliver)
    await page.goto('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    let response = waitForTickets(page, { sort: 'id', order: 'desc', page: '1' })
    await sortButton(page, '#').click()
    let ids = (await response).tickets.map((t) => t.id)
    await expect(page).toHaveURL('/tickets?sort=id&order=desc')
    await expectSortedBy(page, '#', 'descending')
    expect(isStrictlyDescending(ids)).toBe(true)
    await expectRowsInOrder(page, ids)

    response = waitForTickets(page, { sort: 'id', order: 'asc', page: '1' })
    await sortButton(page, '#').click()
    ids = (await response).tickets.map((t) => t.id)
    await expect(page).toHaveURL('/tickets?sort=id&order=asc')
    await expectSortedBy(page, '#', 'ascending')
    expect(isStrictlyAscending(ids)).toBe(true)
    await expectRowsInOrder(page, ids)
  })

  test('Received toggles to oldest first, and back to the default clears the URL', async ({
    page,
    deliver,
  }) => {
    await ensureATicket(page.request, deliver)
    await page.goto('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    const response = waitForTickets(page, { sort: 'createdAt', order: 'asc', page: '1' })
    await sortButton(page, 'Received').click()
    const { tickets } = await response
    await expect(page).toHaveURL('/tickets?sort=createdAt&order=asc')
    await expectSortedBy(page, 'Received', 'ascending')
    expect(isChronological(tickets.map((t) => t.createdAt))).toBe(true)
    await expectRowsInOrder(page, tickets.map((t) => t.id))

    await sortButton(page, 'Received').click()
    await expect(page).toHaveURL('/tickets')
    await expectSortedBy(page, 'Received', 'descending')
  })

  test('the sort survives a reload and back/forward navigation', async ({ page, deliver }) => {
    await ensureATicket(page.request, deliver)
    await page.goto('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    await sortButton(page, 'Subject').click()
    await expect(page).toHaveURL('/tickets?sort=subject&order=asc')
    await sortButton(page, 'Subject').click()
    await expect(page).toHaveURL('/tickets?sort=subject&order=desc')

    const request = page.waitForRequest(
      isTicketsRequest({ sort: 'subject', order: 'desc', page: '1' }),
    )
    await page.reload()
    await request
    await expectSortedBy(page, 'Subject', 'descending')

    await page.goBack()
    await expect(page).toHaveURL('/tickets?sort=subject&order=asc')
    await expectSortedBy(page, 'Subject', 'ascending')

    await page.goBack()
    await expect(page).toHaveURL('/tickets')
    await expectSortedBy(page, 'Received', 'descending')

    await page.goForward()
    await expect(page).toHaveURL('/tickets?sort=subject&order=asc')
    await expectSortedBy(page, 'Subject', 'ascending')
  })

  test('sorting keeps the filters and goes back to page 1', async ({ page, deliver }) => {
    await ensureATicket(page.request, deliver)
    // Page 2 needs rows (a table to click on), but creating 20+ tickets would push
    // other tests' new tickets off page 1. So the page 2 request is answered with
    // page 1's real rows; the page shown, and every later request, is unchanged.
    await page.route(
      (url) => url.pathname === TICKETS_API && url.searchParams.get('page') === '2',
      async (route) => {
        const url = new URL(route.request().url())
        url.searchParams.set('page', '1')
        await route.continue({ url: url.toString() })
      },
    )
    await page.goto('/tickets?status=OPEN&page=2')
    await expect(pagination(page).getByText(/^Showing 11–\d+ of \d+$/)).toBeVisible()

    const request = page.waitForRequest(
      isTicketsRequest({ status: 'OPEN', sort: 'subject', order: 'asc', page: '1' }),
    )
    await sortButton(page, 'Subject').click()
    await request
    await expect(page).toHaveURL('/tickets?status=OPEN&sort=subject&order=asc')
    await expect(statusSelect(page)).toHaveValue('OPEN')
    await expectSortedBy(page, 'Subject', 'ascending')
    await expect(pagination(page).getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible()
    await expect(previousButton(page)).toBeDisabled()
  })

  test('opening a sorted URL directly applies the sort', async ({ page, deliver }) => {
    await ensureATicket(page.request, deliver)
    const response = waitForTickets(page, { sort: 'fromName', order: 'desc', page: '1' })
    await page.goto('/tickets?sort=fromName&order=desc')
    const { tickets } = await response
    await expectSortedBy(page, 'From', 'descending')
    await expectRowsInOrder(page, tickets.map((t) => t.id))
  })
})

test.describe('sorting API', () => {
  test.use({ storageState: agentState })

  test('echoes the sort and order, defaulting to createdAt desc', async ({ page }) => {
    let response = await page.request.get(TICKETS_API)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ sort: 'createdAt', order: 'desc' })

    response = await page.request.get(`${TICKETS_API}?sort=subject&order=asc`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      sort: 'subject',
      order: 'asc',
      page: 1,
      pageSize: 10,
    })
  })

  test('rejects an invalid sort or order with 400', async ({ page }) => {
    const sortError =
      'Sort must be one of id, subject, fromName, status, category, assignee, createdAt'
    const orderError = 'Order must be asc or desc'
    const cases: [string, string][] = [
      ['sort=body', sortError],
      ['sort=SUBJECT', sortError],
      ['sort=', sortError],
      ['order=up', orderError],
      ['order=ASC', orderError],
      ['sort=subject&order=sideways', orderError],
    ]
    for (const [query, error] of cases) {
      const response = await page.request.get(`${TICKETS_API}?${query}`)
      expect(response.status(), query).toBe(400)
      expect(await response.json(), query).toEqual({ error })
    }
  })

  test('sorts every column in both directions, breaking ties by id', async ({ page, deliver }) => {
    const token = `Sort ${shortId()}`
    // Delivery order, subjects and sender names all differ, so each sort is
    // checked on its own.
    const emails = [
      { ...newEmail(), subject: `${token} B`, fromName: `${token} C` },
      { ...newEmail(), subject: `${token} C`, fromName: `${token} A` },
      { ...newEmail(), subject: `${token} A`, fromName: `${token} B` },
    ]
    const ids = await deliverInOrder(deliver, emails)
    const listed = (sort: string, order: 'asc' | 'desc') =>
      ticketsInServerOrder(page.request, { sort, order }, ids)
    const letters = async (sort: 'subject' | 'fromName', order: 'asc' | 'desc') =>
      (await listed(sort, order)).map((ticket) => ticket[sort].slice(token.length + 1))

    expect(await letters('subject', 'asc')).toEqual(['A', 'B', 'C'])
    expect(await letters('subject', 'desc')).toEqual(['C', 'B', 'A'])
    expect(await letters('fromName', 'asc')).toEqual(['A', 'B', 'C'])
    expect(await letters('fromName', 'desc')).toEqual(['C', 'B', 'A'])

    const ascending = [...ids].sort((a, b) => a - b)
    const descending = [...ascending].reverse()
    const order = async (sort: string, direction: 'asc' | 'desc') =>
      (await listed(sort, direction)).map((ticket) => ticket.id)

    expect(await order('id', 'asc')).toEqual(ascending)
    expect(await order('id', 'desc')).toEqual(descending)
    expect(await order('createdAt', 'asc')).toEqual(ascending)
    expect(await order('createdAt', 'desc')).toEqual(descending)
    // Inbound tickets are all OPEN, uncategorized and unassigned, so these are ties.
    expect(await order('status', 'asc')).toEqual(ascending)
    expect(await order('status', 'desc')).toEqual(descending)
    expect(await order('category', 'asc')).toEqual(ascending)
    expect(await order('category', 'desc')).toEqual(descending)
    expect(await order('assignee', 'asc')).toEqual(ascending)
    expect(await order('assignee', 'desc')).toEqual(descending)
  })
})
