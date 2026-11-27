import { isAxiosError } from 'axios'

// User-facing message for a failed API request: the server's `{ error }` for
// 4xx responses, a generic message otherwise.
export function apiErrorMessage(error: unknown) {
  if (isAxiosError<{ error?: string }>(error)) {
    if (!error.response) {
      return 'Could not reach the server. Check your connection and try again.'
    }
    if (error.response.status < 500 && error.response.data?.error) {
      return error.response.data.error
    }
  }
  return 'Something went wrong. Please try again.'
}
