import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AssigneesResponse, TicketDetail } from '@/lib/tickets'
import TicketFieldSelect, { type SelectOption } from '@/components/TicketFieldSelect'

// Assignee picker: "Unassigned" plus every active user.
export default function TicketAssigneeSelect({ ticket }: { ticket: TicketDetail }) {
  const assignees = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: async ({ signal }) =>
      (await api.get<AssigneesResponse>('/tickets/assignees', { signal })).data.users,
  })

  const users = assignees.data ?? []
  const current = ticket.assignee
  const options: SelectOption[] = [
    { value: '', label: 'Unassigned' },
    // Keep a current assignee who is no longer active (deleted user) visible, but not pickable.
    ...(current && !users.some((user) => user.id === current.id)
      ? [{ value: current.id, label: current.name, disabled: true }]
      : []),
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ]

  return (
    <TicketFieldSelect
      ticketId={ticket.id}
      id="ticket-assignee"
      label="Assignee"
      value={current?.id ?? ''}
      options={options}
      toUpdate={(value) => ({ assigneeId: value || null })}
      disabled={assignees.isPending}
    >
      {assignees.isError && (
        <p className="text-xs text-destructive">Could not load the list of agents.</p>
      )}
    </TicketFieldSelect>
  )
}
