import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircleIcon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import type { TicketRepliesResponse, TicketReply } from '@/lib/tickets'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

// Same limits as POST /api/tickets/:id/replies.
const REPLY_MAX_LENGTH = 10_000

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Reply is required')
    .max(REPLY_MAX_LENGTH, 'Reply must be at most 10,000 characters'),
})

type ReplyValues = z.infer<typeof replySchema>

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const repliesQueryKey = (ticketId: number) => ['tickets', 'detail', String(ticketId), 'replies']

function ReplyItem({ reply }: { reply: TicketReply }) {
  return (
    <li className="space-y-1 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{reply.author?.name ?? 'Deleted user'}</span>
        <time dateTime={reply.createdAt} className="text-xs text-muted-foreground">
          {dateFormat.format(new Date(reply.createdAt))}
        </time>
      </div>
      {/* Plain text; React escapes it. */}
      <p className="text-sm break-words whitespace-pre-wrap">{reply.body}</p>
    </li>
  )
}

// The reply thread under the ticket's message, oldest first, with a form to add a reply.
export default function TicketReplies({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient()
  const queryKey = repliesQueryKey(ticketId)

  const replies = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      (await api.get<TicketRepliesResponse>(`/tickets/${ticketId}/replies`, { signal })).data.replies,
  })

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(replySchema),
    defaultValues: { body: '' },
  })

  const send = useMutation({
    mutationFn: async (values: ReplyValues) =>
      (await api.post<TicketReply>(`/tickets/${ticketId}/replies`, values)).data,
    onSuccess: (reply) => {
      queryClient.setQueryData<TicketReply[]>(queryKey, (old) => [...(old ?? []), reply])
    },
  })

  async function onSubmit(values: ReplyValues) {
    try {
      await send.mutateAsync(values)
    } catch (error) {
      setError('root', { message: apiErrorMessage(error) })
      return
    }
    reset()
  }

  const submit = handleSubmit(onSubmit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Replies
          {replies.data && replies.data.length > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">({replies.data.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {replies.isPending ? (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">Loading replies…</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : replies.isError ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>Could not load the replies.</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void replies.refetch()}>
              Try again
            </Button>
          </div>
        ) : replies.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          <ol aria-label="Replies" className="divide-y">
            {replies.data.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} />
            ))}
          </ol>
        )}

        <form onSubmit={submit} noValidate>
          <FieldGroup>
            {errors.root?.message && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Controller
              name="body"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reply-body">New reply</FieldLabel>
                  <Textarea
                    {...field}
                    id="reply-body"
                    className="min-h-28"
                    placeholder="Write a reply…"
                    maxLength={REPLY_MAX_LENGTH}
                    aria-invalid={fieldState.invalid}
                    onKeyDown={(e) => {
                      // Ctrl/Cmd+Enter sends.
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        void submit()
                      }
                    }}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
