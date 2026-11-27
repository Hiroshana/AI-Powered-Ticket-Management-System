import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
