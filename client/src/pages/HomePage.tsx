import { useEffect, useState } from 'react'

type Health = { status: string; database: string; timestamp: string }

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">API status</p>
        {error && <p className="text-red-600">Unreachable: {error}</p>}
        {!error && !health && <p className="text-gray-400">Checking…</p>}
        {health && (
          <p className="text-green-700">
            {health.status} (database: {health.database}) —{" "}
            {new Date(health.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </section>
  )
}
