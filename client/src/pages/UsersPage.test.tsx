import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { api } from '@/lib/api'
import UsersPage from './UsersPage.tsx'

const users = [
  {
    id: 'u1',
    name: 'Ada Admin',
    email: 'ada@example.com',
    role: 'ADMIN',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'u2',
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'AGENT',
    createdAt: '2026-03-02T10:00:00.000Z',
  },
]

const ok = (data: unknown) => Promise.resolve({ data } as AxiosResponse)
const fail = (status: number) =>
  Promise.reject(new AxiosError(`Request failed with status code ${status}`, String(status)))

const getSpy = spyOn(api, 'get')

afterEach(() => {
  getSpy.mockReset()
})

function renderPage() {
  // A fresh client per test so cached data never carries over, and no
  // retries so error states show immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  )
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))

describe('UsersPage', () => {
  test('shows a loading skeleton until the users arrive', async () => {
    let resolve!: (value: AxiosResponse) => void
    getSpy.mockReturnValue(new Promise((r) => (resolve = r)))

    renderPage()

    const loader = screen.getByRole('status')
    expect(loader).toHaveTextContent('Loading users…')
    expect(loader).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('table', { name: 'Users' })).not.toBeInTheDocument()

    resolve({ data: { users } } as AxiosResponse)

    expect(await screen.findByRole('table', { name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('requests GET /users and passes the abort signal', async () => {
    getSpy.mockReturnValue(ok({ users }))

    renderPage()
    await screen.findByRole('table', { name: 'Users' })

    expect(getSpy).toHaveBeenCalledTimes(1)
    const [url, config] = getSpy.mock.calls[0]!
    expect(url).toBe('/users')
    expect(config?.signal).toBeInstanceOf(AbortSignal)
  })

  test('renders a row per user with name, email, role and created date', async () => {
    getSpy.mockReturnValue(ok({ users }))

    renderPage()
    const table = await screen.findByRole('table', { name: 'Users' })

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual(['Name', 'Email', 'Role', 'Created'])

    const rows = within(table).getAllByRole('row').slice(1) // skip header row
    expect(rows).toHaveLength(2)

    const cells = rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    )
    expect(cells).toEqual([
      ['Ada Admin', 'ada@example.com', 'Admin', formatDate(users[0]!.createdAt)],
      ['Alan Agent', 'alan@example.com', 'Agent', formatDate(users[1]!.createdAt)],
    ])
  })

  test('renders an empty table when there are no users', async () => {
    getSpy.mockReturnValue(ok({ users: [] }))

    renderPage()
    const table = await screen.findByRole('table', { name: 'Users' })

    expect(within(table).getAllByRole('row')).toHaveLength(1) // header only
  })

  test.each([401, 403, 500])('shows an error with a retry button when the request fails (%i)', async (status) => {
    getSpy.mockReturnValue(fail(status))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('"Try again" refetches and shows the users when it succeeds', async () => {
    const user = userEvent.setup()
    getSpy.mockReturnValueOnce(fail(500))
    let resolve!: (value: AxiosResponse) => void
    getSpy.mockReturnValueOnce(new Promise((r) => (resolve = r)))

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    // While retrying, the error is replaced by the skeleton.
    expect(await screen.findByRole('status')).toHaveTextContent('Loading users…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    resolve({ data: { users } } as AxiosResponse)

    expect(await screen.findByRole('table', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  test('"Try again" shows the error again if the retry also fails', async () => {
    const user = userEvent.setup()
    getSpy.mockImplementation(() => fail(500))

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load users.')
    expect(getSpy).toHaveBeenCalledTimes(2)
  })
})
