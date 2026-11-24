import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

// Layout route: renders child routes only for admins. Nest it inside
// <RequireAuth>, which already handles the loading and signed-out states.
// This is UX only — admin API routes must still check the role on the server.
export default function RequireAdmin() {
  const { data: session } = authClient.useSession()

  if (session?.user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}
