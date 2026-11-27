import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { isAxiosError } from 'axios'
import { z } from 'zod'
import { api } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Keep in sync with the server schema in server/src/routes/users.ts.
const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
})

type CreateUserValues = z.infer<typeof createUserSchema>

const defaultValues: CreateUserValues = { name: '', email: '', password: '' }

function errorMessage(error: unknown) {
  if (isAxiosError<{ error?: string }>(error)) {
    if (!error.response) {
      return 'Could not reach the server. Check your connection and try again.'
    }
    if (error.response.status < 500 && error.response.data?.error) {
      return error.response.data.error
    }
  }
  return 'Something went wrong. Please try again.'
}

export default function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const { control, handleSubmit, setError, reset, formState } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues,
  })

  const createUser = useMutation({
    mutationFn: async (values: CreateUserValues) =>
      (await api.post('/users', values)).data,
    onSuccess: async () => {
      setOpen(false)
      reset()
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => setError('root', { message: errorMessage(error) }),
  })

  function handleOpenChange(next: boolean) {
    // Don't let the dialog be dismissed mid-request.
    if (!next && createUser.isPending) return
    setOpen(next)
    if (!next) reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New user
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={handleSubmit((values) => createUser.mutateAsync(values).catch(() => {}))}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>New users are created as agents.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {formState.errors.root?.message && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="new-user-name"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="new-user-email"
                    type="email"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="new-user-password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="new-user-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={createUser.isPending}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
