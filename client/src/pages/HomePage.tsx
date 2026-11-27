import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

type Health = { status: string; database: string; timestamp: string }

export default function HomePage() {
  const { data: health, error } = useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => (await api.get<Health>('/health', { signal })).data,
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">API status</p>
        {error && <p className="text-red-600">Unreachable: {error.message}</p>}
        {!error && !health && (
          <div role="status" aria-busy="true" className="py-0.5">
            <span className="sr-only">Checking…</span>
            <Skeleton className="h-5 w-72" />
          </div>
        )}
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
