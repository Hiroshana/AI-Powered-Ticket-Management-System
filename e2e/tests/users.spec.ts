import {
  INVALID_CREDENTIALS,
  admin,
  adminState,
  agent,
  alertWith,
  expect,
  expectLoginPage,
  expectSignedIn,
  submitLogin,
} from './helpers/auth.ts'
import {
  createUserViaUi,
  openUsersPage,
  test,
  uniqueAgent,
  userRow,
  usersTable,
} from './helpers/users.ts'

// Happy paths for the admin user management page. Every test creates its own
// agents with unique emails and never changes the seeded users.
test.use({ storageState: adminState })

test.beforeEach(async ({ page }) => {
  await openUsersPage(page)
})

test.describe('read', () => {
  test('lists users with their name, email, role and created date', async ({ page }) => {
    const table = usersTable(page)
    for (const column of ['Name', 'Email', 'Role', 'Created', 'Actions']) {
      await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeAttached()
    }

    const adminRow = userRow(page, admin.email)
    await expect(adminRow.getByRole('cell', { name: admin.name, exact: true })).toBeVisible()
    await expect(adminRow.getByText('Admin', { exact: true })).toBeVisible()
    await expect(adminRow.getByRole('cell').nth(3)).toHaveText(/\d{4}/)
    await expect(adminRow.getByRole('button', { name: `Edit ${admin.name}` })).toBeVisible()
    await expect(adminRow.getByRole('button', { name: /^Delete/ })).toHaveCount(0)

    const agentRow = userRow(page, agent.email)
    await expect(agentRow.getByRole('cell', { name: agent.name, exact: true })).toBeVisible()
    await expect(agentRow.getByText('Agent', { exact: true })).toBeVisible()
    await expect(agentRow.getByRole('button', { name: `Edit ${agent.name}` })).toBeVisible()
    await expect(agentRow.getByRole('button', { name: `Delete ${agent.name}` })).toBeVisible()
  })
})

test.describe('create', () => {
  test('creates an agent who appears in the table and can sign in', async ({
    page,
    signedOutPage,
  }) => {
    const user = uniqueAgent()
    await createUserViaUi(page, user)

    const row = userRow(page, user.email)
    await expect(row.getByRole('cell', { name: user.name, exact: true })).toBeVisible()
    await expect(row.getByText('Agent', { exact: true })).toBeVisible()

    // Still there after a reload, so it was saved on the server.
    await page.reload()
    await expect(userRow(page, user.email)).toBeVisible()

    await signedOutPage.goto('/login')
    await submitLogin(signedOutPage, user.email, user.password)
    await expectSignedIn(signedOutPage, user)
  })
})

test.describe('update', () => {
  test("changes an agent's name, email and password", async ({ page, signedOutPage }) => {
    const original = uniqueAgent()
    await createUserViaUi(page, original)
    const updated = uniqueAgent()

    await userRow(page, original.email)
      .getByRole('button', { name: `Edit ${original.name}` })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Edit user' })
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(original.name)
    await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(original.email)
    await expect(dialog.getByLabel('Role', { exact: true })).toHaveValue('AGENT')
    await expect(dialog.getByLabel('New password', { exact: true })).toHaveValue('')

    await dialog.getByLabel('Name', { exact: true }).fill(updated.name)
    await dialog.getByLabel('Email', { exact: true }).fill(updated.email)
    await dialog.getByLabel('New password', { exact: true }).fill(updated.password)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()

    const row = userRow(page, updated.email)
    await expect(row.getByRole('cell', { name: updated.name, exact: true })).toBeVisible()
    await expect(row.getByText('Agent', { exact: true })).toBeVisible()
    await expect(userRow(page, original.email)).toHaveCount(0)

    // The agent signs in with the new email and password.
    await signedOutPage.goto('/login')
    await submitLogin(signedOutPage, updated.email, updated.password)
    await expectSignedIn(signedOutPage, updated)
  })

  test("promotes an agent to admin, keeping the password when it's left blank", async ({
    page,
    signedOutPage,
  }) => {
    const user = uniqueAgent()
    await createUserViaUi(page, user)

    await userRow(page, user.email).getByRole('button', { name: `Edit ${user.name}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit user' })
    await dialog.getByLabel('Role', { exact: true }).selectOption({ label: 'Admin' })
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toBeHidden()

    const row = userRow(page, user.email)
    await expect(row.getByText('Admin', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: `Delete ${user.name}` })).toHaveCount(0)

    await signedOutPage.goto('/login')
    await submitLogin(signedOutPage, user.email, user.password)
    await expectSignedIn(signedOutPage, user)
  })
})

test.describe('delete', () => {
  test('removes an agent, blocks their sign-in and frees their email', async ({
    page,
    signedOutPage,
  }) => {
    const user = uniqueAgent()
    await createUserViaUi(page, user)

    await userRow(page, user.email).getByRole('button', { name: `Delete ${user.name}` }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete user' })
    await expect(dialog).toContainText(`Delete ${user.name}?`)
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(userRow(page, user.email)).toHaveCount(0)

    // Still gone after a reload.
    await page.reload()
    await expect(usersTable(page)).toBeVisible()
    await expect(userRow(page, admin.email)).toBeVisible()
    await expect(userRow(page, user.email)).toHaveCount(0)

    await signedOutPage.goto('/login')
    await submitLogin(signedOutPage, user.email, user.password)
    await expect(alertWith(signedOutPage, INVALID_CREDENTIALS)).toBeVisible()
    await expectLoginPage(signedOutPage)

    // The email can be reused for a new user.
    await createUserViaUi(page, { ...uniqueAgent(), email: user.email })
  })
})
