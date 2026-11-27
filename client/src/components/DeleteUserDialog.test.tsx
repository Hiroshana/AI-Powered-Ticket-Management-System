import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { api } from '@/lib/api'
import DeleteUserDialog from './DeleteUserDialog.tsx'

const deleteSpy = spyOn(api, 'delete')

afterEach(() => {
  deleteSpy.mockReset()
})

const alan = { id: 'u2', name: 'Alan Agent' }
const deleted = { status: 204, data: '' } as AxiosResponse

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteUserDialog user={alan} />
    </QueryClientProvider>,
  )
  return { invalidateSpy }
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete Alan Agent' }))
  return screen.findByRole('alertdialog', { name: 'Delete user' })
}

const confirm = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Delete' }))

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

describe('DeleteUserDialog', () => {
  test('asks for confirmation naming the user', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const dialog = await open(user)

    expect(dialog).toHaveTextContent('Delete Alan Agent?')
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('Cancel closes without deleting', async () => {
    const user = userEvent.setup()
    renderDialog()

    await open(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('confirming deletes the user, closes and refreshes the list', async () => {
    const user = userEvent.setup()
    deleteSpy.mockResolvedValue(deleted)
    const { invalidateSpy } = renderDialog()

    await open(user)
    await confirm(user)

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy.mock.calls[0]![0]).toBe('/users/u2')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  test('shows the server error and stays open; reopening clears it', async () => {
    const user = userEvent.setup()
    deleteSpy.mockRejectedValue(httpError(403, "Admins can't be deleted"))
    renderDialog()

    await open(user)
    await confirm(user)

    expect(await screen.findByRole('alert')).toHaveTextContent("Admins can't be deleted")
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await open(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('disables the buttons while deleting and ignores Escape', async () => {
    const user = userEvent.setup()
    let resolve!: (value: AxiosResponse) => void
    deleteSpy.mockReturnValue(new Promise((r) => (resolve = r)))
    renderDialog()

    await open(user)
    await confirm(user)

    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => resolve(deleted))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
