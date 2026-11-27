import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { api } from '@/lib/api'
import EditUserDialog, { type EditableUser } from './EditUserDialog.tsx'

const patchSpy = spyOn(api, 'patch')

afterEach(() => {
  patchSpy.mockReset()
})

const alan: EditableUser = { id: 'u2', name: 'Alan Agent', email: 'alan@example.com', role: 'AGENT' }
const saved = { data: { user: {} } } as AxiosResponse

function renderDialog(props: { user?: EditableUser; isSelf?: boolean; onSaved?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = spyOn(queryClient, 'invalidateQueries')
  const result = render(
    <QueryClientProvider client={queryClient}>
      <EditUserDialog user={alan} {...props} />
    </QueryClientProvider>,
  )
  const rerender = (user: EditableUser) =>
    result.rerender(
      <QueryClientProvider client={queryClient}>
        <EditUserDialog {...props} user={user} />
      </QueryClientProvider>,
    )
  return { invalidateSpy, rerender }
}

async function open(user: ReturnType<typeof userEvent.setup>, name = alan.name) {
  await user.click(screen.getByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog', { name: 'Edit user' })
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save changes' }))

const httpError = (status: number, error: string) => {
  const response = {
    status,
    data: { error },
    headers: {},
    config: { headers: new AxiosHeaders() },
    statusText: '',
  } as AxiosResponse
  return new AxiosError('Request failed', String(status), undefined, undefined, response)
}

describe('EditUserDialog', () => {
  test('opens prefilled with the user, with an empty password', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open(user)

    expect(screen.getByLabelText('Name')).toHaveValue('Alan Agent')
    expect(screen.getByLabelText('Email')).toHaveValue('alan@example.com')
    expect(screen.getByLabelText('Role')).toHaveValue('AGENT')
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
  })

  test('saves name, email and role without a password when it is left blank', async () => {
    const user = userEvent.setup()
    patchSpy.mockResolvedValue(saved)
    const onSaved = mock()
    const { invalidateSpy } = renderDialog({ onSaved })

    await open(user)
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), '  Alan Turing ')
    await user.selectOptions(screen.getByLabelText('Role'), 'Admin')
    await submit(user)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchSpy).toHaveBeenCalledWith('/users/u2', {
      name: 'Alan Turing',
      email: 'alan@example.com',
      role: 'ADMIN',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  test('sends a new password when one is entered', async () => {
    const user = userEvent.setup()
    patchSpy.mockResolvedValue(saved)
    renderDialog()

    await open(user)
    await user.type(screen.getByLabelText('New password'), 'a-new-password')
    await submit(user)

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1))
    expect(patchSpy.mock.calls[0]![1]).toMatchObject({ password: 'a-new-password' })
  })

  test('validates input and does not submit', async () => {
    const user = userEvent.setup()
    renderDialog()

    await open(user)
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Al')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('New password'), 'short')
    await submit(user)

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    for (const label of ['Name', 'Email', 'New password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(patchSpy).not.toHaveBeenCalled()
  })

  test('disables the role and omits it from the request when editing yourself', async () => {
    const user = userEvent.setup()
    patchSpy.mockResolvedValue(saved)
    renderDialog({ isSelf: true })

    await open(user)
    expect(screen.getByLabelText('Role')).toBeDisabled()
    expect(screen.getByText("You can't change your own role.")).toBeInTheDocument()
    await submit(user)

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1))
    expect(patchSpy.mock.calls[0]![1]).not.toHaveProperty('role')
  })

  test('keeps the dialog open and shows the server error', async () => {
    const user = userEvent.setup()
    patchSpy.mockRejectedValue(httpError(409, 'A user with this email already exists'))
    renderDialog()

    await open(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('disables the buttons while saving and ignores Escape', async () => {
    const user = userEvent.setup()
    let resolve!: (value: AxiosResponse) => void
    patchSpy.mockReturnValue(new Promise((r) => (resolve = r)))
    renderDialog()

    await open(user)
    await submit(user)

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await act(async () => resolve(saved))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Cancel discards edits; reopening shows the latest saved values', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDialog()

    await open(user)
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Discarded')
    await user.type(screen.getByLabelText('New password'), 'discarded-password')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchSpy).not.toHaveBeenCalled()

    // The list refetched with new data for this user.
    rerender({ ...alan, name: 'Alan Updated' })
    await open(user, 'Alan Updated')

    expect(screen.getByLabelText('Name')).toHaveValue('Alan Updated')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })
})
