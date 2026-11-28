import { AlertCircleIcon } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import {
  isTicketCategory,
  isTicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
  type TicketListResponse,
} from '@/lib/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Must match the server's default page size.
const PAGE_SIZE = 20

// Same spacing as the users table.
const tableSpacing =
  '[&_td]:px-4 [&_th]:px-4 [&_td]:py-3 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const columns = ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received']

// Filters and page live in the URL, so they survive reloads and work with back/forward.
// Invalid values are ignored rather than sent to the server.
function useTicketFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status')
  const rawCategory = searchParams.get('category')
  const rawPage = Number(searchParams.get('page'))

  const status = isTicketStatus(rawStatus) ? rawStatus : undefined
  const category = isTicketCategory(rawCategory) ? rawCategory : undefined
  const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : 1

  function update(changes: Record<string, string | number | undefined>) {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '' || (key === 'page' && value === 1)) params.delete(key)
        else params.set(key, String(value))
      }
      return params
    })
  }

  return { status, category, page, update }
}

function TicketsTableSkeleton() {
  return (
    <Card className="py-0" role="status" aria-busy="true">
      <span className="sr-only">Loading tickets…</span>
      <Table aria-hidden="true" className={tableSpacing}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export default function TicketsPage() {
  const { status, category, page, update } = useTicketFilters()
  const filtered = status !== undefined || category !== undefined

  const { data, isError, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['tickets', { status, category, page }],
    queryFn: async ({ signal }) =>
      (
        await api.get<TicketListResponse>('/tickets', {
          params: { status, category, page, pageSize: PAGE_SIZE },
          signal,
        })
      ).data,
    // Keep the current page on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  })

  const tickets = data?.tickets
  const total = data?.total ?? 0
  const firstShown = (page - 1) * PAGE_SIZE + 1
  const lastShown = (page - 1) * PAGE_SIZE + (tickets?.length ?? 0)
  const hasNext = page * PAGE_SIZE < total

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-status">Status</Label>
          <NativeSelect
            id="ticket-status"
            value={status ?? ''}
            onChange={(e) => update({ status: e.target.value, page: undefined })}
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {Object.entries(ticketStatusLabels).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-category">Category</Label>
          <NativeSelect
            id="ticket-category"
            value={category ?? ''}
            onChange={(e) => update({ category: e.target.value, page: undefined })}
          >
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {Object.entries(ticketCategoryLabels).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {isError && !isFetching ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>Could not load tickets.</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !tickets ? (
        <TicketsTableSkeleton />
      ) : tickets.length === 0 ? (
        <Card className="items-center px-6 py-10 text-center">
          <p className="text-muted-foreground">
            {total > 0
              ? 'No tickets on this page.'
              : filtered
                ? 'No tickets match these filters.'
                : 'No tickets yet.'}
          </p>
          {total > 0 && (
            <Button variant="outline" onClick={() => update({ page: undefined })}>
              Go to first page
            </Button>
          )}
        </Card>
      ) : (
        <>
          <Card className="py-0">
            <Table
              aria-label="Tickets"
              aria-busy={isPlaceholderData}
              className={`${tableSpacing} ${isPlaceholderData ? 'opacity-60' : ''}`}
            >
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column} className={column === '#' ? 'w-16' : undefined}>
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="text-muted-foreground">{ticket.id}</TableCell>
                    <TableCell className="max-w-80 truncate font-medium">{ticket.subject}</TableCell>
                    <TableCell>
                      <div>{ticket.fromName}</div>
                      <div className="text-xs text-muted-foreground">{ticket.fromEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticket.status === 'OPEN' ? 'default' : 'secondary'}>
                        {ticketStatusLabels[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className={ticket.category ? undefined : 'text-muted-foreground'}>
                      {ticket.category ? ticketCategoryLabels[ticket.category] : 'Uncategorized'}
                    </TableCell>
                    <TableCell className={ticket.assignee ? undefined : 'text-muted-foreground'}>
                      {ticket.assignee?.name ?? 'Unassigned'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dateFormat.format(new Date(ticket.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Showing {firstShown}–{lastShown} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => update({ page: page - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!hasNext || isPlaceholderData}
                onClick={() => update({ page: page + 1 })}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}
    </section>
  )
}
