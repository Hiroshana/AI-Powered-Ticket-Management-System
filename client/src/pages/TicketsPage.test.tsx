import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { MemoryRouter, useLocation } from 'react-router'
import { api } from '@/lib/api'
import type { TicketListItem, TicketListResponse } from '@/lib/tickets'
import TicketsPage from './TicketsPage.tsx'

const tickets: TicketListItem[] = [
  {
    id: 42,
    subject: 'Refund for course',
    fromName: 'Sam Student',
    fromEmail: 'sam@example.com',
    status: 'OPEN',
    category: 'REFUND_REQUEST',
    createdAt: '2026-11-20T15:30:00.000Z',
    assignee: { id: 'u2', name: 'Alan Agent' },
  },
  {
    id: 41,
    subject: 'Video will not play',
    fromName: 'Kim Learner',
    fromEmail: 'kim@example.com',
    status: 'RESOLVED',
    category: null,
    createdAt: '2026-11-19T09:00:00.000Z',
    assignee: null,
  },
]

const response = (overrides: Partial<TicketListResponse> = {}): TicketListResponse => ({
  tickets,
  total: tickets.length,
  page: 1,
  pageSize: 10,
  sort: 'createdAt',
  order: 'desc',
  ...overrides,
})

const ok = (data: unknown) => Promise.resolve({ data } as AxiosResponse)
const fail = (status: number) =>
  Promise.reject(new AxiosError(`Request failed with status code ${status}`, String(status)))

const getSpy = spyOn(api, 'get')

afterEach(() => {
  getSpy.mockReset()
})

// Shows the current URL so tests can check what the filters wrote to it.
function LocationDisplay() {
  const location = useLocation()
  return <output aria-label="location">{location.pathname + location.search}</output>
}

function renderPage(url = '/tickets') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <TicketsPage />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const currentUrl = () => screen.getByRole('status', { name: 'location' }).textContent
const lastParams = () => getSpy.mock.calls.at(-1)?.[1]?.params
// Answers each request based on the page it asks for.
const respondByPage = (fn: (page: number) => TicketListResponse) =>
  ((_url: string, config: { params: { page: number } }) => ok(fn(config.params.page))) as unknown as typeof api.get
// aria-sort of the column header whose text is `label`.
const sortOf = (label: string) =>
  screen
    .getAllByRole('columnheader')
    .find((th) => th.textContent === label)
    ?.getAttribute('aria-sort')
const sortButton = (label: string) => screen.getByRole('button', { name: label })

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

describe('TicketsPage', () => {
  test('shows a loading skeleton until the tickets arrive', async () => {
    let resolve!: (value: AxiosResponse) => void
    getSpy.mockReturnValue(new Promise((r) => (resolve = r)))

    renderPage()

    const loader = screen.getByText('Loading tickets…').closest('[role="status"]')
    expect(loader).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('table', { name: 'Tickets' })).not.toBeInTheDocument()

    resolve({ data: response() } as AxiosResponse)

    expect(await screen.findByRole('table', { name: 'Tickets' })).toBeInTheDocument()
    expect(screen.queryByText('Loading tickets…')).not.toBeInTheDocument()
  })

  test('requests GET /tickets for page 1 with the abort signal', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })

    expect(getSpy).toHaveBeenCalledTimes(1)
    const [url, config] = getSpy.mock.calls[0]!
    expect(url).toBe('/tickets')
    expect(config?.params).toEqual({
      status: undefined,
      category: undefined,
      sort: 'createdAt',
      order: 'desc',
      page: 1,
      pageSize: 10,
    })
    expect(config?.signal).toBeInstanceOf(AbortSignal)
  })

  test('renders a row per ticket in the order the server returns', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    const table = await screen.findByRole('table', { name: 'Tickets' })

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual(['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received'])

    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((td) => td.textContent),
      )
    expect(cells).toEqual([
      [
        '42',
        'Refund for course',
        'Sam Studentsam@example.com',
        'Open',
        'Refund Request',
        'Alan Agent',
        formatDate(tickets[0]!.createdAt),
      ],
      [
        '41',
        'Video will not play',
        'Kim Learnerkim@example.com',
        'Resolved',
        'Uncategorized',
        'Unassigned',
        formatDate(tickets[1]!.createdAt),
      ],
    ])
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument()
  })

  test('sends filters and page from the URL', async () => {
    getSpy.mockReturnValue(ok(response({ total: 60, page: 2 })))

    renderPage('/tickets?status=OPEN&category=REFUND_REQUEST&sort=subject&order=asc&page=2')
    await screen.findByRole('table', { name: 'Tickets' })

    expect(lastParams()).toEqual({
      status: 'OPEN',
      category: 'REFUND_REQUEST',
      sort: 'subject',
      order: 'asc',
      page: 2,
      pageSize: 10,
    })
    expect(sortOf('Subject')).toBe('ascending')
    expect(screen.getByLabelText('Status')).toHaveValue('OPEN')
    expect(screen.getByLabelText('Category')).toHaveValue('REFUND_REQUEST')
  })

  test('ignores invalid URL values', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage('/tickets?status=PENDING&category=nope&sort=body&order=up&page=-3')
    await screen.findByRole('table', { name: 'Tickets' })

    expect(lastParams()).toEqual({
      status: undefined,
      category: undefined,
      sort: 'createdAt',
      order: 'desc',
      page: 1,
      pageSize: 10,
    })
    expect(screen.getByLabelText('Status')).toHaveValue('')
  })

  test('changing a filter refetches from page 1 and updates the URL', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response({ total: 60, page: 3 })))

    renderPage('/tickets?page=3')
    await screen.findByRole('table', { name: 'Tickets' })

    await user.selectOptions(screen.getByLabelText('Status'), 'CLOSED')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'CLOSED', page: 1 }))
    expect(currentUrl()).toBe('/tickets?status=CLOSED')

    await user.selectOptions(screen.getByLabelText('Category'), 'TECHNICAL_QUESTION')
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ status: 'CLOSED', category: 'TECHNICAL_QUESTION', page: 1 }),
    )
    expect(currentUrl()).toBe('/tickets?status=CLOSED&category=TECHNICAL_QUESTION')

    await user.selectOptions(screen.getByLabelText('Status'), '')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: undefined, category: 'TECHNICAL_QUESTION' }))
    expect(currentUrl()).toBe('/tickets?category=TECHNICAL_QUESTION')
  })

  test('searching waits for a pause, then requests page 1 and updates the URL', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response({ total: 60, page: 3 })))

    renderPage('/tickets?status=OPEN&page=3')
    await screen.findByRole('table', { name: 'Tickets' })

    await user.type(screen.getByLabelText('Search'), '  refund ')
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'refund', status: 'OPEN', page: 1 }))
    expect(currentUrl()).toBe('/tickets?status=OPEN&q=refund')
    // One request for the finished text, not one per keystroke.
    const searched = getSpy.mock.calls
      .map(([, config]) => (config?.params as { q?: string } | undefined)?.q)
      .filter(Boolean)
    expect(searched).toEqual(['refund'])
    // The box keeps what was typed (the URL holds the trimmed text).
    expect(screen.getByLabelText('Search')).toHaveValue('  refund ')

    await user.clear(screen.getByLabelText('Search'))
    await waitFor(() => expect(currentUrl()).toBe('/tickets?status=OPEN'))
    expect(lastParams()).toMatchObject({ q: undefined })
  })

  test('sends the search from the URL and shows it in the box', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage('/tickets?q=Kim')
    await screen.findByRole('table', { name: 'Tickets' })

    expect(lastParams()).toMatchObject({ q: 'Kim', page: 1 })
    expect(screen.getByLabelText('Search')).toHaveValue('Kim')
  })

  test('says no tickets match the search when it finds nothing', async () => {
    getSpy.mockReturnValue(ok(response({ tickets: [], total: 0 })))

    renderPage('/tickets?q=nothing')
    expect(await screen.findByText('No tickets match your search.')).toBeInTheDocument()
  })

  test('defaults to 10 rows per page and offers 10, 15, 20, 25, 50 and 100', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })

    const select = screen.getByLabelText('Rows per page')
    expect(select).toHaveValue('10')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '10',
      '15',
      '20',
      '25',
      '50',
      '100',
    ])
  })

  test('reads the page size from the URL and ignores values not in the list', async () => {
    getSpy.mockReturnValue(ok(response({ pageSize: 50 })))
    const first = renderPage('/tickets?pageSize=50')
    await screen.findByRole('table', { name: 'Tickets' })
    expect(lastParams()).toMatchObject({ pageSize: 50 })
    expect(screen.getByLabelText('Rows per page')).toHaveValue('50')
    first.unmount()

    renderPage('/tickets?pageSize=7')
    await screen.findByRole('table', { name: 'Tickets' })
    expect(lastParams()).toMatchObject({ pageSize: 10 })
  })

  test('changing the page size refetches from page 1 and updates the URL', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response({ total: 60, page: 3 })))

    renderPage('/tickets?status=OPEN&page=3')
    await screen.findByRole('table', { name: 'Tickets' })

    await user.selectOptions(screen.getByLabelText('Rows per page'), '25')
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'OPEN', pageSize: 25, page: 1 }))
    expect(currentUrl()).toBe('/tickets?status=OPEN&pageSize=25')

    // Back to the default drops it from the URL.
    await user.selectOptions(screen.getByLabelText('Rows per page'), '10')
    await waitFor(() => expect(lastParams()).toMatchObject({ pageSize: 10 }))
    expect(currentUrl()).toBe('/tickets?status=OPEN')
  })

  test('starts sorted newest first, shown on the Received header', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })

    expect(sortOf('Received')).toBe('descending')
    for (const label of ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee']) {
      expect(sortOf(label)).toBe('none')
    }
  })

  test('clicking a header sorts on the server, A→Z first then Z→A', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })

    await user.click(sortButton('Subject'))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'subject', order: 'asc', page: 1 }))
    expect(currentUrl()).toBe('/tickets?sort=subject&order=asc')
    expect(sortOf('Subject')).toBe('ascending')
    expect(sortOf('Received')).toBe('none')

    await user.click(sortButton('Subject'))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'subject', order: 'desc' }))
    expect(currentUrl()).toBe('/tickets?sort=subject&order=desc')
    expect(sortOf('Subject')).toBe('descending')

    // Never unsorted: a third click goes back to ascending.
    await user.click(sortButton('Subject'))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'subject', order: 'asc' }))
  })

  test.each([
    ['#', 'id', 'desc'],
    ['From', 'fromName', 'asc'],
    ['Status', 'status', 'asc'],
    ['Category', 'category', 'asc'],
    ['Assignee', 'assignee', 'asc'],
  ])('the %s header sorts by %s, %s first', async (label, sort, order) => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })
    await user.click(sortButton(label))

    await waitFor(() => expect(lastParams()).toMatchObject({ sort, order }))
  })

  test('Received toggles to oldest first, and back to the default clears the URL', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response()))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })

    await user.click(sortButton('Received'))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'createdAt', order: 'asc' }))
    expect(currentUrl()).toBe('/tickets?sort=createdAt&order=asc')

    await user.click(sortButton('Received'))
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'createdAt', order: 'desc' }))
    expect(currentUrl()).toBe('/tickets')
  })

  test('sorting keeps the filters and goes back to page 1', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok(response({ total: 60, page: 3 })))

    renderPage('/tickets?status=OPEN&page=3')
    await screen.findByRole('table', { name: 'Tickets' })
    await user.click(sortButton('Subject'))

    await waitFor(() =>
      expect(lastParams()).toMatchObject({ status: 'OPEN', sort: 'subject', order: 'asc', page: 1 }),
    )
    expect(currentUrl()).toBe('/tickets?status=OPEN&sort=subject&order=asc')
  })

  test('Next and Previous move between pages and are disabled at the ends', async () => {
    const user = userEvent.setup()
    getSpy.mockImplementation(respondByPage((page) => response({ total: 25, page })))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })
    const previous = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    await user.click(next)
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }))
    expect(currentUrl()).toBe('/tickets?page=2')
    expect(await screen.findByText('Showing 11–12 of 25')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 3 }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(currentUrl()).toBe('/tickets?page=2'))
  })

  test('says there are no tickets yet when nothing is filtered', async () => {
    getSpy.mockReturnValue(ok(response({ tickets: [], total: 0 })))

    renderPage()

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Tickets' })).not.toBeInTheDocument()
  })

  test('says no tickets match when filters are set', async () => {
    getSpy.mockReturnValue(ok(response({ tickets: [], total: 0 })))

    renderPage('/tickets?status=CLOSED')

    expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
  })

  test('offers the first page when the page is past the end', async () => {
    const user = userEvent.setup()
    getSpy.mockImplementation(
      respondByPage((page) => (page === 1 ? response() : response({ tickets: [], total: 2, page: 9 }))),
    )

    renderPage('/tickets?page=9')

    expect(await screen.findByText('No tickets on this page.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to first page' }))
    expect(await screen.findByRole('table', { name: 'Tickets' })).toBeInTheDocument()
    expect(currentUrl()).toBe('/tickets')
  })

  test.each([401, 403, 500])('shows an error with a retry button when the request fails (%i)', async (status) => {
    getSpy.mockReturnValue(fail(status))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tickets.')
    expect(screen.queryByRole('table', { name: 'Tickets' })).not.toBeInTheDocument()
  })

  test('"Try again" refetches and shows the tickets when it succeeds', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValueOnce(fail(500))
    getSpy.mockReturnValueOnce(ok(response()))

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('table', { name: 'Tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('the subject links to the ticket detail page', async () => {
    getSpy.mockReturnValue(ok(response()))
    const user = userEvent.setup()

    renderPage('/tickets?status=OPEN&page=2')
    const link = await screen.findByRole('link', { name: 'Refund for course' })
    expect(link).toHaveAttribute('href', '/tickets/42')

    await user.click(link)
    expect(currentUrl()).toBe('/tickets/42')
  })
})
