import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

// No baseURL: defaults to the current origin + /api/auth, which Vite proxies
// to the server, so the session cookie stays same-origin.
export const authClient = createAuthClient({
  plugins: [
    // The server lives in a separate package, so its additional fields are
    // declared here by hand. Keep in sync with server/src/lib/auth.ts.
    inferAdditionalFields({
      user: {
        role: { type: ['ADMIN', 'AGENT'], required: false, input: false },
      },
    }),
  ],
})
