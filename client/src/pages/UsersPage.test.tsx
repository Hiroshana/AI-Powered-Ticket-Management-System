import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse } from 'axios'
import { api } from '@/lib/api'

// The real auth client needs a browser origin, so stub the session. It must be
// mocked before UsersPage is loaded, hence the dynamic import.
const refetchSession = mock(() => Promise.resolve())
mock.module('../lib/auth-client.ts', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1', role: 'ADMIN' } }, refetch: refetchSession }),
  },
}))
const { default: UsersPage } = await import('./UsersPage.tsx')

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
  refetchSession.mockClear()
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
    expect(headers).toEqual(['Name', 'Email', 'Role', 'Created', 'Actions'])

    const rows = within(table).getAllByRole('row').slice(1) // skip header row
    expect(rows).toHaveLength(2)

    const cells = rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    )
    expect(cells).toEqual([
      ['Ada Admin', 'ada@example.com', 'Admin', formatDate(users[0]!.createdAt), ''],
      ['Alan Agent', 'alan@example.com', 'Agent', formatDate(users[1]!.createdAt), ''],
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

describe('UsersPage create user dialog', () => {
  async function openDialog() {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok({ users }))
    renderPage()
    await screen.findByRole('table', { name: 'Users' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create user' })
    return { user, dialog }
  }

  test('clicking "New user" shows the dialog', async () => {
    const { dialog } = await openDialog()

    expect(dialog).toBeVisible()
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument()
  })

  test('pressing Escape hides the dialog', async () => {
    const { user } = await openDialog()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('clicking outside the dialog hides it', async () => {
    const { user, dialog } = await openDialog()

    // A click inside the dialog must not close it.
    await user.click(within(dialog).getByLabelText('Name'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(document.body)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('UsersPage edit user dialog', () => {
  const patchSpy = spyOn(api, 'patch')

  afterEach(() => {
    patchSpy.mockReset()
  })

  async function openEdit(name: string) {
    const user = userEvent.setup()
    getSpy.mockReturnValue(ok({ users }))
    renderPage()
    await screen.findByRole('table', { name: 'Users' })
    await user.click(screen.getByRole('button', { name: `Edit ${name}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit user' })
    return { user, dialog }
  }

  test('every row has an edit button', async () => {
    getSpy.mockReturnValue(ok({ users }))
    renderPage()
    await screen.findByRole('table', { name: 'Users' })

    expect(screen.getByRole('button', { name: 'Edit Ada Admin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Alan Agent' })).toBeInTheDocument()
  })

  test('only agents have a delete button', async () => {
    getSpy.mockReturnValue(ok({ users }))
    renderPage()
    await screen.findByRole('table', { name: 'Users' })

    expect(screen.getByRole('button', { name: 'Delete Alan Agent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Ada Admin' })).not.toBeInTheDocument()
  })

  test("another user's role can be changed", async () => {
    const { dialog } = await openEdit('Alan Agent')

    expect(within(dialog).getByLabelText('Name')).toHaveValue('Alan Agent')
    expect(within(dialog).getByLabelText('Role')).toBeEnabled()
  })

  test('the signed-in admin cannot change their own role, and saving refreshes the session', async () => {
    patchSpy.mockResolvedValue({ data: { user: {} } } as AxiosResponse)
    const { user, dialog } = await openEdit('Ada Admin')

    expect(within(dialog).getByLabelText('Role')).toBeDisabled()
    expect(within(dialog).getByText("You can't change your own role.")).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchSpy).toHaveBeenCalledWith('/users/u1', { name: 'Ada Admin', email: 'ada@example.com' })
    expect(refetchSession).toHaveBeenCalledTimes(1)
  })
})
