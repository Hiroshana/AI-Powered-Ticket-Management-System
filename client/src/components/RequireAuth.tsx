import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'

// Layout route: renders child routes only for signed-in users.
export default function RequireAuth() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <p className="p-8 text-center text-gray-400">Loading…</p>
  }
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
