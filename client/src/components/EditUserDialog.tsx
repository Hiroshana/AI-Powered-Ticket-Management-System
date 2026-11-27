import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export type EditableUser = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
}

// Keep in sync with the server schema in server/src/routes/users.ts.
const editUserSchema = z.object({
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
  role: z.enum(['ADMIN', 'AGENT']),
  // Empty means "keep the current password".
  password: z.union([
    z.literal(''),
    z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
  ]),
})

type EditUserValues = z.infer<typeof editUserSchema>

type Props = {
  user: EditableUser
  // The signed-in admin editing themselves: their role can't be changed.
  isSelf?: boolean
  onSaved?: () => void
}

export default function EditUserDialog({ user, isSelf = false, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const initialValues = (): EditUserValues => ({
    name: user.name,
    email: user.email,
    role: user.role,
    password: '',
  })
  const { control, handleSubmit, setError, reset, formState } = useForm({
    resolver: zodResolver(editUserSchema),
    defaultValues: initialValues(),
  })

  const updateUser = useMutation({
    mutationFn: async ({ password, role, ...values }: EditUserValues) =>
      (
        await api.patch(`/users/${user.id}`, {
          ...values,
          ...(!isSelf && { role }),
          ...(password && { password }),
        })
      ).data,
    onSuccess: async () => {
      setOpen(false)
      onSaved?.()
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => setError('root', { message: apiErrorMessage(error) }),
  })

  function handleOpenChange(next: boolean) {
    // Don't let the dialog be dismissed mid-request.
    if (!next && updateUser.isPending) return
    // Start from the latest saved values each time it opens.
    if (next) reset(initialValues())
    setOpen(next)
  }

  const fieldId = (name: string) => `edit-user-${user.id}-${name}`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`} />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={handleSubmit((values) => updateUser.mutateAsync(values).catch(() => {}))}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update the details for {user.name}.</DialogDescription>
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
                  <FieldLabel htmlFor={fieldId('name')}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={fieldId('name')}
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
                  <FieldLabel htmlFor={fieldId('email')}>Email</FieldLabel>
                  <Input
                    {...field}
                    id={fieldId('email')}
                    type="email"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={fieldId('role')}>Role</FieldLabel>
                  <NativeSelect
                    {...field}
                    id={fieldId('role')}
                    className="w-full"
                    disabled={isSelf}
                    aria-describedby={isSelf ? fieldId('role-help') : undefined}
                  >
                    <NativeSelectOption value="AGENT">Agent</NativeSelectOption>
                    <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
                  </NativeSelect>
                  {isSelf && (
                    <FieldDescription id={fieldId('role-help')}>
                      You can't change your own role.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={fieldId('password')}>New password</FieldLabel>
                  <Input
                    {...field}
                    id={fieldId('password')}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldId('password-help')}
                  />
                  <FieldDescription id={fieldId('password-help')}>
                    Leave blank to keep the current password. Changing it signs the user out.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={updateUser.isPending}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
