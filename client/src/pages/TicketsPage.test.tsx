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
  pageSize: 20,
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
    expect(config?.params).toEqual({ status: undefined, category: undefined, page: 1, pageSize: 20 })
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

    renderPage('/tickets?status=OPEN&category=REFUND_REQUEST&page=2')
    await screen.findByRole('table', { name: 'Tickets' })

    expect(lastParams()).toEqual({ status: 'OPEN', category: 'REFUND_REQUEST', page: 2, pageSize: 20 })
    expect(screen.getByLabelText('Status')).toHaveValue('OPEN')
    expect(screen.getByLabelText('Category')).toHaveValue('REFUND_REQUEST')
  })

  test('ignores invalid URL values', async () => {
    getSpy.mockReturnValue(ok(response()))

    renderPage('/tickets?status=PENDING&category=nope&page=-3')
    await screen.findByRole('table', { name: 'Tickets' })

    expect(lastParams()).toEqual({ status: undefined, category: undefined, page: 1, pageSize: 20 })
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

  test('Next and Previous move between pages and are disabled at the ends', async () => {
    const user = userEvent.setup()
    getSpy.mockImplementation(respondByPage((page) => response({ total: 45, page })))

    renderPage()
    await screen.findByRole('table', { name: 'Tickets' })
    const previous = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    await user.click(next)
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }))
    expect(currentUrl()).toBe('/tickets?page=2')
    expect(await screen.findByText('Showing 21–22 of 45')).toBeInTheDocument()

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
})
