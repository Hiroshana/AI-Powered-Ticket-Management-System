import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { AlertCircleIcon, ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table'
import { useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import {
  DEFAULT_ORDER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  isPageSize,
  isSortOrder,
  isTicketCategory,
  isTicketSortKey,
  isTicketStatus,
  pageSizeOptions,
  ticketCategoryLabels,
  ticketStatusLabels,
  type TicketListItem,
  type TicketListResponse,
} from '@/lib/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

// Roomier rows than the users table: taller header and more vertical cell padding.
const tableSpacing =
  '[&_td]:px-4 [&_th]:px-4 [&_th]:h-12 [&_td]:py-4 [&_tr>*:first-child]:pl-6 [&_tr>*:last-child]:pr-6'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Sorting state and APIs only: rows arrive already sorted by the server
// (manualSorting), so there's no client-side sorted row model.
const features = tableFeatures({ rowSortingFeature })
const columnHelper = createColumnHelper<typeof features, TicketListItem>()

// Column ids are the server's sort keys (TicketSortKey).
const columns = columnHelper.columns([
  columnHelper.accessor('id', {
    header: '#',
    sortDescFirst: true,
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor('subject', {
    header: 'Subject',
    // Long subjects are cut off (full text on hover) so the table fits the page.
    cell: (info) => (
      <span className="block max-w-[40ch] truncate font-medium" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('fromName', {
    header: 'From',
    cell: (info) => (
      <>
        <div>{info.getValue()}</div>
        <div className="max-w-[28ch] truncate text-xs text-muted-foreground" title={info.row.original.fromEmail}>
          {info.row.original.fromEmail}
        </div>
      </>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <Badge variant={info.getValue() === 'OPEN' ? 'default' : 'secondary'}>
        {ticketStatusLabels[info.getValue()]}
      </Badge>
    ),
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => {
      const category = info.getValue()
      return category ? (
        ticketCategoryLabels[category]
      ) : (
        <span className="text-muted-foreground">Uncategorized</span>
      )
    },
  }),
  columnHelper.accessor((ticket) => ticket.assignee?.name ?? null, {
    id: 'assignee',
    header: 'Assignee',
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">Unassigned</span>,
  }),
  columnHelper.accessor('createdAt', {
    header: 'Received',
    sortDescFirst: true,
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {dateFormat.format(new Date(info.getValue()))}
      </span>
    ),
  }),
])

const columnLabels = ['#', 'Subject', 'From', 'Status', 'Category', 'Assignee', 'Received']

const noTickets: TicketListItem[] = []

// Filters, sort and page live in the URL, so they survive reloads and work with
// back/forward. Invalid values are ignored rather than sent to the server, and
// defaults are left out of the URL.
function useTicketFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q')?.trim() || undefined
  const rawStatus = searchParams.get('status')
  const rawCategory = searchParams.get('category')
  const rawSort = searchParams.get('sort')
  const rawOrder = searchParams.get('order')
  const rawPage = Number(searchParams.get('page'))
  const rawPageSize = Number(searchParams.get('pageSize'))

  const status = isTicketStatus(rawStatus) ? rawStatus : undefined
  const category = isTicketCategory(rawCategory) ? rawCategory : undefined
  const sort = isTicketSortKey(rawSort) ? rawSort : DEFAULT_SORT
  const order = isSortOrder(rawOrder) ? rawOrder : DEFAULT_ORDER
  const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : 1
  const pageSize = isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE

  function update(changes: Record<string, string | number | undefined>) {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        const isDefault =
          (key === 'page' && value === 1) || (key === 'pageSize' && value === DEFAULT_PAGE_SIZE)
        if (value === undefined || value === '' || isDefault) params.delete(key)
        else params.set(key, String(value))
      }
      if (params.get('sort') === DEFAULT_SORT && params.get('order') === DEFAULT_ORDER) {
        params.delete('sort')
        params.delete('order')
      }
      return params
    })
  }

  return { q, status, category, sort, order, page, pageSize, update }
}

function TicketsTableSkeleton() {
  return (
    <Card className="py-0" role="status" aria-busy="true">
      <span className="sr-only">Loading tickets…</span>
      <Table aria-hidden="true" className={tableSpacing}>
        <TableHeader>
          <TableRow>
            {columnLabels.map((label) => (
              <TableHead key={label}>{label}</TableHead>
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

const ariaSort = { asc: 'ascending', desc: 'descending' } as const

const SEARCH_DELAY_MS = 300

// Search box for the `q` URL param. Typing updates the URL (and so the request)
// once the user pauses, not on every keystroke.
function TicketSearch({ value, onSearch }: { value: string; onSearch: (text: string) => void }) {
  const [text, setText] = useState(value)

  // Follow URL changes made elsewhere (back/forward). Skip ones that only trim
  // what's being typed, so a trailing space isn't wiped mid-word.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (value !== text.trim()) setText(value)
  }

  const search = useEffectEvent((next: string) => onSearch(next))
  useEffect(() => {
    const next = text.trim()
    if (next === value) return
    const timer = setTimeout(() => search(next), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <div className="space-y-1.5">
      <Label htmlFor="ticket-search">Search</Label>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="ticket-search"
          type="search"
          className="w-72 pl-8"
          placeholder="Subject, sender or ticket #"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Enter searches right away.
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch(text.trim())
          }}
        />
      </div>
    </div>
  )
}

export default function TicketsPage() {
  const { q, status, category, sort, order, page, pageSize, update } = useTicketFilters()
  const filtered = q !== undefined || status !== undefined || category !== undefined

  const { data, isError, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['tickets', { q, status, category, sort, order, page, pageSize }],
    queryFn: async ({ signal }) =>
      (
        await api.get<TicketListResponse>('/tickets', {
          params: { q, status, category, sort, order, page, pageSize },
          signal,
        })
      ).data,
    // Keep the current rows on screen while the next page, filter or sort loads.
    placeholderData: keepPreviousData,
  })

  // The URL is the source of truth for sorting; the table only reads it and
  // reports header clicks back.
  const sorting = useMemo<SortingState>(() => [{ id: sort, desc: order === 'desc' }], [sort, order])
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const [next] = functionalUpdate(updater, sorting)
    if (!next || !isTicketSortKey(next.id)) return
    update({ sort: next.id, order: next.desc ? 'desc' : 'asc', page: undefined })
  }

  const table = useTable({
    features,
    columns,
    data: data?.tickets ?? noTickets,
    manualSorting: true,
    // Always sorted by exactly one column: clicks toggle asc ↔ desc.
    enableSortingRemoval: false,
    enableMultiSort: false,
    // Text columns sort A→Z first; # and Received opt into newest/highest first.
    sortDescFirst: false,
    state: { sorting },
    onSortingChange,
  })

  const tickets = data?.tickets
  const total = data?.total ?? 0
  const firstShown = (page - 1) * pageSize + 1
  const lastShown = (page - 1) * pageSize + (tickets?.length ?? 0)
  const hasNext = page * pageSize < total

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets</h1>

      <div className="flex flex-wrap items-end gap-4">
        <TicketSearch value={q ?? ''} onSearch={(text) => update({ q: text, page: undefined })} />
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
                ? q !== undefined
                  ? 'No tickets match your search.'
                  : 'No tickets match these filters.'
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
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const SortIcon =
                        sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={sorted ? ariaSort[sorted] : 'none'}
                          className={header.column.id === 'id' ? 'w-16' : undefined}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2.5"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            <SortIcon
                              aria-hidden="true"
                              className={sorted ? undefined : 'text-muted-foreground opacity-50'}
                            />
                          </Button>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {firstShown}–{lastShown} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor="ticket-page-size" className="whitespace-nowrap font-normal text-muted-foreground">
                  Rows per page
                </Label>
                <NativeSelect
                  id="ticket-page-size"
                  size="sm"
                  value={pageSize}
                  // Changing the page size goes back to page 1.
                  onChange={(e) => update({ pageSize: Number(e.target.value), page: undefined })}
                >
                  {pageSizeOptions.map((size) => (
                    <NativeSelectOption key={size} value={size}>
                      {size}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
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
