import type { ReactNode } from 'react'
import { AlertCircleIcon, ArrowLeftIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link, useLocation, useParams } from 'react-router'
import { api } from '@/lib/api'
import {
  isTicketCategory,
  isTicketStatus,
  listSearchFrom,
  ticketCategoryLabels,
  ticketStatusLabels,
  type TicketDetail,
} from '@/lib/tickets'
import TicketAssigneeSelect from '@/components/TicketAssigneeSelect'
import TicketFieldSelect, { type SelectOption } from '@/components/TicketFieldSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const statusOptions: SelectOption[] = Object.entries(ticketStatusLabels).map(([value, label]) => ({
  value,
  label,
}))
const categoryOptions: SelectOption[] = [
  { value: '', label: 'Uncategorized' },
  ...Object.entries(ticketCategoryLabels).map(([value, label]) => ({ value, label })),
]

// Main column plus a fixed-width side column for the editable fields.
const columns = 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function TicketDetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading ticket…</span>
      <Skeleton className="h-8 w-96 max-w-full" />
      <div className={columns}>
        <div className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="space-y-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function TicketDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const backTo = `/tickets${listSearchFrom(location.state)}`
  // Only digits are sent to the server; anything else is "not found".
  const validId = /^\d{1,10}$/.test(id) && Number(id) > 0

  const { data: ticket, error, isError, isFetching, refetch } = useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: async ({ signal }) => (await api.get<TicketDetail>(`/tickets/${id}`, { signal })).data,
    enabled: validId,
  })

  const status = isAxiosError(error) ? error.response?.status : undefined
  const notFound = !validId || status === 404 || status === 400

  return (
    <section className="space-y-4">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Back to tickets
      </Link>

      {notFound ? (
        <Card className="items-center px-6 py-10 text-center">
          <h1 className="text-xl font-semibold">Ticket not found</h1>
          <p className="text-muted-foreground">There is no ticket #{id}.</p>
        </Card>
      ) : isError && !isFetching ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>Could not load the ticket.</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !ticket ? (
        <TicketDetailSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold break-words">
              <span className="text-muted-foreground">#{ticket.id}</span> {ticket.subject}
            </h1>
            <Badge variant={ticket.status === 'OPEN' ? 'default' : 'secondary'}>
              {ticketStatusLabels[ticket.status]}
            </Badge>
          </div>

          {/* Two columns on large screens: the email on the left, the editable
              fields on the right. Stacked (email first) on smaller screens. */}
          <div className={columns}>
            <div className="min-w-0 space-y-4">
              <Card>
                <CardContent>
                  <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Detail label="From">
                      <div>{ticket.fromName}</div>
                      <a
                        href={`mailto:${ticket.fromEmail}`}
                        className="break-all text-muted-foreground hover:underline"
                      >
                        {ticket.fromEmail}
                      </a>
                    </Detail>
                    <Detail label="Received">{dateFormat.format(new Date(ticket.createdAt))}</Detail>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Message</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Plain text from the email; React escapes it. */}
                  <p className="text-sm break-words whitespace-pre-wrap">{ticket.body}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent>
                <dl className="space-y-5">
                  <TicketFieldSelect
                    ticketId={ticket.id}
                    id="ticket-status"
                    label="Status"
                    value={ticket.status}
                    options={statusOptions}
                    toUpdate={(value) => (isTicketStatus(value) ? { status: value } : {})}
                  />
                  <TicketFieldSelect
                    ticketId={ticket.id}
                    id="ticket-category"
                    label="Category"
                    value={ticket.category ?? ''}
                    options={categoryOptions}
                    toUpdate={(value) => ({ category: isTicketCategory(value) ? value : null })}
                  />
                  <TicketAssigneeSelect ticket={ticket} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  )
}
