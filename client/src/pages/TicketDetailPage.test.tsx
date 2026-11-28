import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router'
import { api } from '@/lib/api'
import type { TicketDetail } from '@/lib/tickets'
import TicketDetailPage from './TicketDetailPage.tsx'

const ticket: TicketDetail = {
  id: 42,
  subject: 'Refund for course',
  body: 'Hi,\n\nI would like a refund.\n<b>Thanks</b>',
  fromName: 'Sam Student',
  fromEmail: 'sam@example.com',
  status: 'OPEN',
  category: 'REFUND_REQUEST',
  createdAt: '2026-11-20T15:30:00.000Z',
  updatedAt: '2026-11-20T15:30:00.000Z',
  assignee: { id: 'u2', name: 'Alan Agent' },
}

const ok = (data: unknown) => Promise.resolve({ data } as AxiosResponse)
const fail = (status: number) => {
  const response = { status, data: {}, headers: {}, statusText: '', config: { headers: new AxiosHeaders() } }
  return Promise.reject(new AxiosError(`Request failed with status code ${status}`, String(status), undefined, undefined, response))
}

const getSpy = spyOn(api, 'get')

afterEach(() => {
  getSpy.mockReset()
})

function LocationDisplay() {
  const location = useLocation()
  return <output aria-label="location">{location.pathname + location.search}</output>
}

function renderPage(entry: InitialEntry = '/tickets/42') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/tickets" element={<p>Ticket list</p>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const currentUrl = () => screen.getByRole('status', { name: 'location' }).textContent

describe('TicketDetailPage', () => {
  test('shows a loading skeleton, then requests GET /tickets/:id with the abort signal', async () => {
    getSpy.mockReturnValue(ok(ticket))

    renderPage()
    expect(screen.getByText('Loading ticket…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: '#42 Refund for course' })).toBeInTheDocument()
    const [url, config] = getSpy.mock.calls[0]!
    expect(url).toBe('/tickets/42')
    expect(config?.signal).toBeInstanceOf(AbortSignal)
  })

  test('shows the ticket fields and the body as plain text', async () => {
    getSpy.mockReturnValue(ok(ticket))

    renderPage()
    await screen.findByRole('heading', { name: '#42 Refund for course' })

    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Sam Student')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'sam@example.com' })).toHaveAttribute('href', 'mailto:sam@example.com')
    expect(screen.getByText('Refund Request')).toBeInTheDocument()
    expect(screen.getByText('Alan Agent')).toBeInTheDocument()
    // The HTML in the body is shown literally, not rendered.
    expect(screen.getByText(/I would like a refund\./).textContent).toBe(ticket.body)
  })

  test('shows placeholders for a missing category and assignee', async () => {
    getSpy.mockReturnValue(ok({ ...ticket, category: null, assignee: null }))

    renderPage()

    expect(await screen.findByText('Uncategorized')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  test('shows "not found" for a 404', async () => {
    getSpy.mockReturnValue(fail(404))

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
  })

  test('shows "not found" for a non-numeric id without calling the server', async () => {
    renderPage('/tickets/abc')

    expect(screen.getByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('shows an error with a retry for other failures', async () => {
    getSpy.mockReturnValueOnce(fail(500)).mockReturnValueOnce(ok(ticket))
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('Could not load the ticket.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: '#42 Refund for course' })).toBeInTheDocument()
  })

  test('"Back to tickets" returns to the list URL it came from', async () => {
    getSpy.mockReturnValue(ok(ticket))
    const user = userEvent.setup()

    renderPage({ pathname: '/tickets/42', state: { listSearch: '?status=OPEN&page=2' } })
    await user.click(screen.getByRole('link', { name: 'Back to tickets' }))

    expect(currentUrl()).toBe('/tickets?status=OPEN&page=2')
  })

  test('"Back to tickets" goes to the plain list when opened directly', async () => {
    getSpy.mockReturnValue(ok(ticket))

    renderPage()

    expect(screen.getByRole('link', { name: 'Back to tickets' })).toHaveAttribute('href', '/tickets')
  })
})
