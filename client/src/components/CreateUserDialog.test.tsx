import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { api } from '@/lib/api'
import CreateUserDialog from './CreateUserDialog.tsx'

const postSpy = spyOn(api, 'post')

afterEach(() => {
  postSpy.mockReset()
})

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserDialog />
    </QueryClientProvider>,
  )
  return { invalidateSpy }
}

async function openAndFill(
  user: ReturnType<typeof userEvent.setup>,
  values: { name?: string; email?: string; password?: string } = {},
) {
  await user.click(screen.getByRole('button', { name: 'New user' }))
  const dialog = await screen.findByRole('dialog', { name: 'Create user' })
  const { name = 'New Agent', email = 'new@example.com', password = 'a-good-password' } = values
  if (name) await user.type(screen.getByLabelText('Name'), name)
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  return dialog
}

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

describe('CreateUserDialog', () => {
  test('opens a dialog with name, email and password fields', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New user' }))

    await screen.findByRole('dialog', { name: 'Create user' })
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  test('shows validation errors and does not submit invalid input', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { name: 'Al', email: 'not-an-email', password: 'short' })
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(postSpy).not.toHaveBeenCalled()
  })

  test('treats a name of spaces as too short', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { name: '     ' })
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  test('posts the user, closes the dialog and refreshes the user list', async () => {
    const user = userEvent.setup()
    postSpy.mockResolvedValue({ data: { user: {} } } as AxiosResponse)
    const { invalidateSpy } = renderDialog()

    await openAndFill(user, { name: '  New Agent ' })
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(postSpy).toHaveBeenCalledWith('/users', {
      name: 'New Agent',
      email: 'new@example.com',
      password: 'a-good-password',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })

    // Reopening shows an empty form.
    await user.click(screen.getByRole('button', { name: 'New user' }))
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  test('keeps the dialog open and shows the server error', async () => {
    const user = userEvent.setup()
    postSpy.mockRejectedValue(httpError(409, 'A user with this email already exists'))
    renderDialog()

    await openAndFill(user)
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A user with this email already exists',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com')
  })

  test('shows a generic message for server errors', async () => {
    const user = userEvent.setup()
    postSpy.mockRejectedValue(httpError(500, 'Internal Server Error'))
    renderDialog()

    await openAndFill(user)
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  test('Cancel closes the dialog without submitting', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(postSpy).not.toHaveBeenCalled()
  })
})

const created = { data: { user: {} } } as AxiosResponse
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Create user' }))

describe('CreateUserDialog form validation', () => {
  test('requires every field', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { name: '', email: '', password: '' })
    await submit(user)

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    for (const label of ['Name', 'Email', 'Password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(postSpy).not.toHaveBeenCalled()
  })

  test('accepts a name of exactly 3 characters and a password of exactly 8', async () => {
    const user = userEvent.setup()
    postSpy.mockResolvedValue(created)
    renderDialog()

    await openAndFill(user, { name: 'Ada', password: '12345678' })
    await submit(user)

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/users', {
        name: 'Ada',
        email: 'new@example.com',
        password: '12345678',
      }),
    )
  })

  test('rejects a password of 7 characters', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { password: '1234567' })
    await submit(user)

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.queryByText('Name must be at least 3 characters')).not.toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  test('rejects values longer than the server allows', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { name: '', password: '' })
    await user.click(screen.getByLabelText('Name'))
    await user.paste('a'.repeat(101))
    await user.click(screen.getByLabelText('Password'))
    await user.paste('p'.repeat(129))
    await submit(user)

    expect(await screen.findByText('Name must be at most 100 characters')).toBeInTheDocument()
    expect(screen.getByText('Password must be at most 128 characters')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  test('does not trim the password', async () => {
    // Spaces are valid password characters, so 8 spaces is a valid password.
    const user = userEvent.setup()
    postSpy.mockResolvedValue(created)
    renderDialog()

    await openAndFill(user, { password: '        ' })
    await submit(user)

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    expect(postSpy.mock.calls[0]![1]).toMatchObject({ password: '        ' })
  })

  test('trims the email before sending it', async () => {
    const user = userEvent.setup()
    postSpy.mockResolvedValue(created)
    renderDialog()

    await openAndFill(user, { email: '  new@example.com  ' })
    await submit(user)

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    expect(postSpy.mock.calls[0]![1]).toMatchObject({ email: 'new@example.com' })
  })

  test('clears a field error as soon as the value becomes valid', async () => {
    const user = userEvent.setup()
    renderDialog()

    await openAndFill(user, { name: 'Al' })
    await submit(user)
    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'a')

    await waitFor(() =>
      expect(screen.queryByText('Name must be at least 3 characters')).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('CreateUserDialog submission', () => {
  test('disables the buttons and keeps the dialog open while the request is pending', async () => {
    const user = userEvent.setup()
    let resolve!: (value: AxiosResponse) => void
    postSpy.mockReturnValue(new Promise((r) => (resolve = r)))
    renderDialog()

    await openAndFill(user)
    await submit(user)

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    // Escape must not dismiss the dialog mid-request.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(postSpy).toHaveBeenCalledTimes(1)

    // The request settles outside any user event, so wrap it in act() to let
    // React finish the resulting close before asserting.
    await act(async () => resolve({ data: { user: {} } } as AxiosResponse))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows a connection message when the server cannot be reached', async () => {
    const user = userEvent.setup()
    postSpy.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    renderDialog()

    await openAndFill(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.',
    )
    expect(screen.getByRole('button', { name: 'Create user' })).toBeEnabled()
  })

  test('can retry after a server error', async () => {
    const user = userEvent.setup()
    postSpy.mockRejectedValueOnce(httpError(409, 'A user with this email already exists'))
    postSpy.mockResolvedValueOnce(created)
    renderDialog()

    await openAndFill(user)
    await submit(user)
    await screen.findByRole('alert')

    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'other@example.com')
    await submit(user)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(postSpy).toHaveBeenCalledTimes(2)
    expect(postSpy.mock.calls[1]![1]).toMatchObject({ email: 'other@example.com' })
  })

  test('reopening after closing with errors shows a clean form', async () => {
    const user = userEvent.setup()
    postSpy.mockRejectedValue(httpError(409, 'A user with this email already exists'))
    renderDialog()

    await openAndFill(user)
    await submit(user)
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'New user' }))
    await screen.findByRole('dialog')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    for (const label of ['Name', 'Email', 'Password']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'false')
    }
  })
})
