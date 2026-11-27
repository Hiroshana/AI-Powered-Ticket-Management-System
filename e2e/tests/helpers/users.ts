import type { Page } from '@playwright/test'
import { test as authTest, expect, usersHeading, usersLink } from './auth.ts'
import type { TestUser } from './auth.ts'

// A unique agent, so tests can run in parallel and with --repeat-each.
export function uniqueAgent(): TestUser {
  const id = crypto.randomUUID().slice(0, 8)
  return {
    name: `Agent ${id}`,
    email: `agent-${id}@example.com`,
    password: `pw-${crypto.randomUUID()}`,
    role: 'AGENT',
  }
}

export const usersTable = (page: Page) => page.getByRole('table', { name: 'Users', exact: true })

// The table row holding the given (unique) email.
export const userRow = (page: Page, email: string) =>
  usersTable(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: email, exact: true }) })

// Opens /users through the header link, as an admin would.
export async function openUsersPage(page: Page) {
  await page.goto('/')
  await usersLink(page).click()
  await expect(page).toHaveURL('/users')
  await expect(usersHeading(page)).toBeVisible()
  await expect(usersTable(page)).toBeVisible()
}

export async function createUserViaUi(page: Page, user: TestUser) {
  await page.getByRole('button', { name: 'New user', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create user' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill(user.name)
  await dialog.getByLabel('Email', { exact: true }).fill(user.email)
  await dialog.getByLabel('Password', { exact: true }).fill(user.password)
  await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(userRow(page, user.email)).toBeVisible()
}

export const test = authTest.extend<{ signedOutPage: Page }>({
  // A page in a separate browser context with no session, even when the test
  // uses a saved storageState (new contexts inherit it otherwise).
  signedOutPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await use(await context.newPage())
    await context.close()
  },
})
