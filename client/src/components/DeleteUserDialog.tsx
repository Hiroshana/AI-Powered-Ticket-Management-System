import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type Props = {
  user: { id: string; name: string }
}

// Confirms, then soft-deletes the user (DELETE /api/users/:id). Only rendered
// for agents; the server also refuses to delete admins.
export default function DeleteUserDialog({ user }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteUser = useMutation({
    mutationFn: async () => {
      await api.delete(`/users/${user.id}`)
    },
    onSuccess: async () => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  function handleOpenChange(next: boolean) {
    // Don't let the dialog be dismissed mid-request.
    if (!next && deleteUser.isPending) return
    // Clear any error from a previous attempt.
    if (next) deleteUser.reset()
    setOpen(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${user.name}`} />}
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {user.name}? They'll be signed out immediately and won't be able to sign in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteUser.isError && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{apiErrorMessage(deleteUser.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteUser.isPending}
            onClick={() => deleteUser.mutate()}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
