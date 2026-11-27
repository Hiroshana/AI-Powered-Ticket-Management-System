import { AlertCircleIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
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
  const {
    data: users,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['users'],
    queryFn: async ({ signal }) =>
      (await api.get<{ users: User[] }>('/users', { signal })).data.users,
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      {isError && !isFetching ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>Could not load users.</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()}>
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
