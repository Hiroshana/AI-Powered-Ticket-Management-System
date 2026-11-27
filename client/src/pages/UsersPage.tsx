import { AlertCircleIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import CreateUserDialog from '@/components/CreateUserDialog'
import DeleteUserDialog from '@/components/DeleteUserDialog'
import EditUserDialog from '@/components/EditUserDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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

// More breathing room than the shadcn default (px-2), with the outer columns
// lined up with the card's edge padding.
const tableSpacing =
  '[&_td]:px-4 [&_th]:px-4 [&_td]:py-3 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function UsersTableSkeleton() {
  return (
    <Card className="py-0" role="status" aria-busy="true">
      <span className="sr-only">Loading users…</span>
      <Table aria-hidden="true" className={tableSpacing}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export default function UsersPage() {
  const { data: session, refetch: refetchSession } = authClient.useSession()
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <CreateUserDialog />
      </div>
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
        <UsersTableSkeleton />
      ) : (
        <Card className="py-0">
          <Table aria-label="Users" className={tableSpacing}>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
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
                  <TableCell className="space-x-1 text-right">
                    <EditUserDialog
                      user={user}
                      isSelf={user.id === session?.user.id}
                      // Refresh the header's name when admins edit themselves.
                      onSaved={user.id === session?.user.id ? () => void refetchSession() : undefined}
                    />
                    {/* Admins can't be deleted (enforced on the server too). */}
                    {user.role === 'AGENT' && <DeleteUserDialog user={user} />}
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
