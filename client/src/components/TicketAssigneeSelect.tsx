import { AlertCircleIcon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import type { AssigneesResponse, TicketDetail, TicketUpdate } from '@/lib/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

// One <dt>/<dd> pair for the ticket details <dl>.
// Assigns the ticket as soon as a different user is picked ("Unassigned" clears it).
export default function TicketAssigneeSelect({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient()

  const assignees = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: async ({ signal }) => (await api.get<AssigneesResponse>('/tickets/assignees', { signal })).data.users,
  })

  const assign = useMutation({
    mutationFn: async (update: TicketUpdate) =>
      (await api.patch<TicketDetail>(`/tickets/${ticket.id}`, update)).data,
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tickets', 'detail', String(updated.id)], updated)
      // The list shows the assignee too; refresh it (but not this ticket again).
      await queryClient.invalidateQueries({
        queryKey: ['tickets'],
        predicate: (query) => query.queryKey[1] !== 'detail' && query.queryKey[1] !== 'assignees',
      })
    },
  })

  // While saving, show the choice being saved rather than snapping back.
  const value = assign.isPending ? (assign.variables.assigneeId ?? '') : (ticket.assignee?.id ?? '')
  const options = assignees.data ?? []
  // Keep a current assignee who is no longer active (deleted user) selectable as-is.
  const missingCurrent =
    ticket.assignee && !options.some((user) => user.id === ticket.assignee?.id) ? ticket.assignee : null

  return (
    <div className="space-y-1">
      <dt>
        <Label htmlFor="ticket-assignee" className="text-xs font-medium text-muted-foreground">
          Assignee
        </Label>
      </dt>
      <dd>
        <NativeSelect
          id="ticket-assignee"
          size="sm"
          value={value}
          disabled={assignees.isPending || assign.isPending}
          aria-busy={assign.isPending}
          onChange={(e) => assign.mutate({ assigneeId: e.target.value || null })}
        >
          <NativeSelectOption value="">Unassigned</NativeSelectOption>
          {missingCurrent && (
            <NativeSelectOption value={missingCurrent.id} disabled>
              {missingCurrent.name}
            </NativeSelectOption>
          )}
          {options.map((user) => (
            <NativeSelectOption key={user.id} value={user.id}>
              {user.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {assignees.isError && (
          <p className="text-xs text-destructive">Could not load the list of agents.</p>
        )}
        {assign.isError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircleIcon />
            <AlertDescription>{apiErrorMessage(assign.error)}</AlertDescription>
          </Alert>
        )}
      </dd>
    </div>
  )
}
