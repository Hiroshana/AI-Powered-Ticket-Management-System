import { AlertCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type User = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
  createdAt: string
}

const roleLabels = { ADMIN: 'Admin', AGENT: 'Agent' } as const

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch('/api/users', { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { users: User[] }
        setUsers(body.users)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }

    void load()
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setFailed(false)
    setAttempt((n) => n + 1)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      {failed ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>Could not load users.</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : !users ? (
        <p role="status" className="text-muted-foreground">
          Loading users…
        </p>
      ) : (
        <Card className="py-0">
          <Table aria-label="Users">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {roleLabels[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateFormat.format(new Date(user.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
