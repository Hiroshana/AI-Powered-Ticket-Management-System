import type { ReactNode } from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import type { TicketDetail, TicketUpdate } from '@/lib/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export type SelectOption = { value: string; label: string; disabled?: boolean }

type Props = {
  ticketId: number
  id: string
  label: string
  // The saved value ('' for none).
  value: string
  options: SelectOption[]
  // Turns the picked option's value into the PATCH body.
  toUpdate: (value: string) => TicketUpdate
  disabled?: boolean
  children?: ReactNode
}

// One editable ticket field, rendered as a <dt>/<dd> pair for the ticket
// details <dl>. Saves with PATCH /api/tickets/:id as soon as a new option is picked.
export default function TicketFieldSelect({
  ticketId,
  id,
  label,
  value,
  options,
  toUpdate,
  disabled,
  children,
}: Props) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async (next: string) =>
      (await api.patch<TicketDetail>(`/tickets/${ticketId}`, toUpdate(next))).data,
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tickets', 'detail', String(updated.id)], updated)
      // Ticket lists show (and filter by) these fields, so refresh them, but not
      // this ticket again or the assignee list.
      await queryClient.invalidateQueries({
        queryKey: ['tickets'],
        predicate: (query) => query.queryKey[1] !== 'detail' && query.queryKey[1] !== 'assignees',
      })
    },
  })

  // While saving, show the choice being saved rather than snapping back.
  const shown = save.isPending ? save.variables : value

  return (
    <div className="space-y-1">
      <dt>
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      </dt>
      <dd>
        <NativeSelect
          id={id}
          // Fill the side column instead of shrinking to the longest option.
          className="w-full"
          value={shown}
          disabled={disabled || save.isPending}
          aria-busy={save.isPending}
          onChange={(e) => save.mutate(e.target.value)}
        >
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {children}
        {save.isError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircleIcon />
            <AlertDescription>{apiErrorMessage(save.error)}</AlertDescription>
          </Alert>
        )}
      </dd>
    </div>
  )
}
