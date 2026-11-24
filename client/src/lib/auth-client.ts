import { createAuthClient } from 'better-auth/react'

// No baseURL: defaults to the current origin + /api/auth, which Vite proxies
// to the server, so the session cookie stays same-origin.
export const authClient = createAuthClient()
