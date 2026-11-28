import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router'
import { api } from '@/lib/api'
import type { TicketDetail, TicketReply } from '@/lib/tickets'
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

const assignees = [
  { id: 'u2', name: 'Alan Agent' },
  { id: 'u3', name: 'Bea Agent' },
]

const replies: TicketReply[] = [
  {
    id: 1,
    body: 'Thanks, looking into it.\n<i>Alan</i>',
    createdAt: '2026-11-21T09:00:00.000Z',
    author: { id: 'u2', name: 'Alan Agent' },
  },
  { id: 2, body: 'Refund issued.', createdAt: '2026-11-22T09:00:00.000Z', author: null },
]

const getSpy = spyOn(api, 'get')
const patchSpy = spyOn(api, 'patch')
const postSpy = spyOn(api, 'post')

afterEach(() => {
  getSpy.mockReset()
  patchSpy.mockReset()
  postSpy.mockReset()
})

// GET /tickets/assignees returns `assignees`, GET /tickets/:id/replies returns
// `thread()` (no replies by default); any other GET returns `detail`.
const respond = (
  detail: () => Promise<AxiosResponse>,
  thread: () => Promise<AxiosResponse> = () => ok({ replies: [] }),
) =>
  ((url: string) =>
    url === '/tickets/assignees'
      ? ok({ users: assignees })
      : url.endsWith('/replies')
        ? thread()
        : detail()) as unknown as typeof api.get

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
    getSpy.mockImplementation(respond(() => ok(ticket)))

    renderPage()
    expect(screen.getByText('Loading ticket…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: '#42 Refund for course' })).toBeInTheDocument()
    const [url, config] = getSpy.mock.calls.find(([url]) => url === '/tickets/42')!
    expect(url).toBe('/tickets/42')
    expect(config?.signal).toBeInstanceOf(AbortSignal)
  })

  test('shows the ticket fields and the body as plain text', async () => {
    getSpy.mockImplementation(respond(() => ok(ticket)))

    renderPage()
    await screen.findByRole('heading', { name: '#42 Refund for course' })

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Open')
    expect(screen.getByText('Sam Student')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'sam@example.com' })).toHaveAttribute('href', 'mailto:sam@example.com')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Refund Request')
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alan Agent')
    // The HTML in the body is shown literally, not rendered.
    expect(screen.getByText(/I would like a refund\./).textContent).toBe(ticket.body)
  })

  test('shows placeholders for a missing category and assignee', async () => {
    getSpy.mockImplementation(respond(() => ok({ ...ticket, category: null, assignee: null })))

    renderPage()

    expect(await screen.findByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Uncategorized')
    expect(screen.getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Unassigned')
  })

  test('shows "not found" for a 404', async () => {
    getSpy.mockImplementation(respond(() => fail(404)))

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
  })

  test('shows "not found" for a non-numeric id without calling the server', async () => {
    renderPage('/tickets/abc')

    expect(screen.getByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('shows an error with a retry for other failures', async () => {
    let calls = 0
    getSpy.mockImplementation(respond(() => (calls++ === 0 ? fail(500) : ok(ticket))))
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('Could not load the ticket.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: '#42 Refund for course' })).toBeInTheDocument()
  })

  test('"Back to tickets" returns to the list URL it came from', async () => {
    getSpy.mockImplementation(respond(() => ok(ticket)))
    const user = userEvent.setup()

    renderPage({ pathname: '/tickets/42', state: { listSearch: '?status=OPEN&page=2' } })
    await user.click(screen.getByRole('link', { name: 'Back to tickets' }))

    expect(currentUrl()).toBe('/tickets?status=OPEN&page=2')
  })

  test('"Back to tickets" goes to the plain list when opened directly', async () => {
    getSpy.mockImplementation(respond(() => ok(ticket)))

    renderPage()

    expect(screen.getByRole('link', { name: 'Back to tickets' })).toHaveAttribute('href', '/tickets')
  })

  describe('assignee', () => {
    test('lists active users and assigns the ticket when one is picked', async () => {
      getSpy.mockImplementation(respond(() => ok({ ...ticket, assignee: null })))
      patchSpy.mockReturnValue(ok({ ...ticket, assignee: assignees[1] }))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Assignee' })
      await waitFor(() => expect(select).toBeEnabled())
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Unassigned',
        'Alan Agent',
        'Bea Agent',
      ])

      await user.selectOptions(select, 'Bea Agent')

      expect(patchSpy).toHaveBeenCalledWith('/tickets/42', { assigneeId: 'u3' })
      await waitFor(() => expect(select).toBeEnabled())
      expect(select).toHaveDisplayValue('Bea Agent')
    })

    test('picking "Unassigned" sends assigneeId: null', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      patchSpy.mockReturnValue(ok({ ...ticket, assignee: null }))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Assignee' })
      await waitFor(() => expect(select).toBeEnabled())
      await user.selectOptions(select, 'Unassigned')

      expect(patchSpy).toHaveBeenCalledWith('/tickets/42', { assigneeId: null })
      await waitFor(() => expect(select).toHaveDisplayValue('Unassigned'))
    })

    test('shows the server error and keeps the old assignee when saving fails', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      const response = {
        status: 400,
        data: { error: 'Assignee must be an active user' },
        headers: {},
        statusText: '',
        config: { headers: new AxiosHeaders() },
      }
      patchSpy.mockImplementation(() => Promise.reject(new AxiosError('Bad request', '400', undefined, undefined, response)))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Assignee' })
      await waitFor(() => expect(select).toBeEnabled())
      await user.selectOptions(select, 'Bea Agent')

      expect(await screen.findByText('Assignee must be an active user')).toBeInTheDocument()
      expect(select).toHaveDisplayValue('Alan Agent')
    })

    test('still shows a current assignee who is no longer active', async () => {
      getSpy.mockImplementation(respond(() => ok({ ...ticket, assignee: { id: 'gone', name: 'Old Agent' } })))

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Assignee' })
      await waitFor(() => expect(select).toBeEnabled())

      expect(select).toHaveDisplayValue('Old Agent')
    })
  })

  describe('status and category', () => {
    test('changing the status saves it and updates the badge', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      patchSpy.mockReturnValue(ok({ ...ticket, status: 'RESOLVED' }))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Status' })
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Open',
        'Resolved',
        'Closed',
      ])

      await user.selectOptions(select, 'Resolved')

      expect(patchSpy).toHaveBeenCalledWith('/tickets/42', { status: 'RESOLVED' })
      await waitFor(() => expect(select).toBeEnabled())
      expect(select).toHaveDisplayValue('Resolved')
      // The heading badge reflects the saved status.
      const heading = screen.getByRole('heading', { name: '#42 Refund for course' })
      expect(heading.parentElement).toHaveTextContent('Resolved')
    })

    test('changing the category saves it', async () => {
      getSpy.mockImplementation(respond(() => ok({ ...ticket, category: null })))
      patchSpy.mockReturnValue(ok({ ...ticket, category: 'TECHNICAL_QUESTION' }))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Category' })
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Uncategorized',
        'General Question',
        'Technical Question',
        'Refund Request',
      ])

      await user.selectOptions(select, 'Technical Question')

      expect(patchSpy).toHaveBeenCalledWith('/tickets/42', { category: 'TECHNICAL_QUESTION' })
      await waitFor(() => expect(select).toHaveDisplayValue('Technical Question'))
    })

    test('picking "Uncategorized" sends category: null', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      patchSpy.mockReturnValue(ok({ ...ticket, category: null }))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Category' })
      await user.selectOptions(select, 'Uncategorized')

      expect(patchSpy).toHaveBeenCalledWith('/tickets/42', { category: null })
      await waitFor(() => expect(select).toHaveDisplayValue('Uncategorized'))
    })

    test('a failed save shows the error only under that field and keeps the old value', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      patchSpy.mockImplementation(() => fail(500))
      const user = userEvent.setup()

      renderPage()
      const select = await screen.findByRole('combobox', { name: 'Status' })
      await user.selectOptions(select, 'Closed')

      expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(select).toHaveDisplayValue('Open')
    })
  })

  describe('replies', () => {
    test('shows the thread oldest first, as plain text, with authors', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket), () => ok({ replies })))

      renderPage()
      const list = await screen.findByRole('list', { name: 'Replies' })

      expect(getSpy.mock.calls.find(([url]) => url === '/tickets/42/replies')?.[1]?.signal).toBeInstanceOf(
        AbortSignal,
      )
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveTextContent('Alan Agent')
      // HTML in a reply is shown literally.
      expect(within(items[0]!).getByText(/Thanks, looking into it\./).textContent).toBe(replies[0]!.body)
      expect(items[1]).toHaveTextContent('Deleted user')
      expect(items[1]).toHaveTextContent('Refund issued.')
    })

    test('says when there are no replies yet', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))

      renderPage()

      expect(await screen.findByText('No replies yet.')).toBeInTheDocument()
    })

    test('shows an error with a retry when the thread fails to load', async () => {
      let calls = 0
      getSpy.mockImplementation(respond(() => ok(ticket), () => (calls++ === 0 ? fail(500) : ok({ replies }))))
      const user = userEvent.setup()

      renderPage()
      expect(await screen.findByText('Could not load the replies.')).toBeInTheDocument()
      // The ticket itself still shows.
      expect(screen.getByRole('heading', { name: '#42 Refund for course' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('list', { name: 'Replies' })).toBeInTheDocument()
    })

    test('sends a reply, adds it to the thread and clears the form', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      const created: TicketReply = {
        id: 3,
        body: 'We will get back to you.',
        createdAt: '2026-11-23T09:00:00.000Z',
        author: { id: 'u2', name: 'Alan Agent' },
      }
      postSpy.mockReturnValue(ok(created))
      const user = userEvent.setup()

      renderPage()
      await screen.findByText('No replies yet.')
      const textbox = screen.getByRole('textbox', { name: 'New reply' })
      await user.type(textbox, '  We will get back to you.  ')
      await user.click(screen.getByRole('button', { name: 'Send reply' }))

      expect(postSpy).toHaveBeenCalledWith('/tickets/42/replies', { body: 'We will get back to you.' })
      const list = await screen.findByRole('list', { name: 'Replies' })
      expect(within(list).getByText('We will get back to you.')).toBeInTheDocument()
      expect(textbox).toHaveValue('')
      expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument()
    })

    test('Ctrl+Enter sends the reply', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      postSpy.mockReturnValue(ok({ ...replies[0], id: 9, body: 'Quick one' }))
      const user = userEvent.setup()

      renderPage()
      const textbox = await screen.findByRole('textbox', { name: 'New reply' })
      await user.type(textbox, 'Quick one')
      await user.keyboard('{Control>}{Enter}{/Control}')

      expect(postSpy).toHaveBeenCalledWith('/tickets/42/replies', { body: 'Quick one' })
      await waitFor(() => expect(textbox).toHaveValue(''))
    })

    test('a blank reply shows a validation error without calling the server', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      const user = userEvent.setup()

      renderPage()
      const textbox = await screen.findByRole('textbox', { name: 'New reply' })
      await user.type(textbox, '   ')
      await user.click(screen.getByRole('button', { name: 'Send reply' }))

      expect(await screen.findByText('Reply is required')).toBeInTheDocument()
      expect(textbox).toHaveAttribute('aria-invalid', 'true')
      expect(postSpy).not.toHaveBeenCalled()
    })

    test('shows the server error and keeps the draft when sending fails', async () => {
      getSpy.mockImplementation(respond(() => ok(ticket)))
      const response = {
        status: 404,
        data: { error: 'Ticket not found' },
        headers: {},
        statusText: '',
        config: { headers: new AxiosHeaders() },
      }
      postSpy.mockImplementation(() => Promise.reject(new AxiosError('Not found', '404', undefined, undefined, response)))
      const user = userEvent.setup()

      renderPage()
      const textbox = await screen.findByRole('textbox', { name: 'New reply' })
      await user.type(textbox, 'Hello')
      await user.click(screen.getByRole('button', { name: 'Send reply' }))

      expect(await screen.findByText('Ticket not found')).toBeInTheDocument()
      expect(textbox).toHaveValue('Hello')
    })
  })
})
