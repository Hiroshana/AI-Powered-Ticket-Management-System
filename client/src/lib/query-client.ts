import { QueryClient } from '@tanstack/react-query'

// Shared cache for server data. Clear it on sign-out (see Layout.tsx) so the
// next user in this tab never sees the previous user's cached responses.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry instead of three, so a real failure surfaces quickly.
      retry: 1,
    },
  },
})
