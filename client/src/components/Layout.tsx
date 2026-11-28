import { Link, Outlet, useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.ts'
import { queryClient } from '../lib/query-client.ts'

export default function Layout() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()

  async function handleSignOut() {
    await authClient.signOut()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <nav className="flex items-center gap-6 px-6 py-3">
          <Link to="/" className="font-semibold">
            AI - Powered Ticket Management System
          </Link>
          {session && (
            <Link to="/tickets" className="text-sm hover:underline">
              Tickets
            </Link>
          )}
          {session?.user.role === 'ADMIN' && (
            <Link to="/users" className="text-sm hover:underline">
              Users
            </Link>
          )}
          {session && (
            <div className="ml-auto flex items-center gap-4">
              <span className="text-sm text-gray-700">{session.user.name}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </header>
      <main className="px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
