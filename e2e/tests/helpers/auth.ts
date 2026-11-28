import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { required } from './env.ts'

export type TestUser = { name: string; email: string; password: string; role: 'ADMIN' | 'AGENT' }

// Names come from server/prisma/prepare-test-db.ts.
export const admin: TestUser = {
  name: 'Test Admin',
  email: required('E2E_ADMIN_EMAIL'),
  password: required('E2E_ADMIN_PASSWORD'),
  role: 'ADMIN',
}

export const agent: TestUser = {
  name: 'Test Agent',
  email: required('E2E_AGENT_EMAIL'),
  password: required('E2E_AGENT_PASSWORD'),
  role: 'AGENT',
}

const authDir = path.resolve(import.meta.dirname, '../../playwright/.auth')

// Shared sessions saved by auth.setup.ts. Never sign out or revoke these.
export const adminState = path.join(authDir, 'admin.json')
export const agentState = path.join(authDir, 'agent.json')

export const INVALID_CREDENTIALS = 'Invalid email or password'
export const SESSION_COOKIE = 'better-auth.session_token'
export const SIGN_IN_URL = '**/api/auth/sign-in/email'
export const GET_SESSION_URL = '**/api/auth/get-session*'

export const emailInput = (page: Page) => page.getByLabel('Email', { exact: true })
export const passwordInput = (page: Page) => page.getByLabel('Password', { exact: true })
export const submitButton = (page: Page) => page.getByRole('button', { name: /^Sign(ing)? in/ })
export const signOutButton = (page: Page) =>
  page.getByRole('button', { name: 'Sign out', exact: true })
export const usersLink = (page: Page) => page.getByRole('link', { name: 'Users', exact: true })
export const welcomeHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Welcome', exact: true })
export const usersHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Users', exact: true })
export const alertWith = (page: Page, text: string | RegExp) =>
  page.getByRole('alert').filter({ hasText: text })

export async function submitLogin(page: Page, email: string, password: string) {
  await emailInput(page).fill(email)
  await passwordInput(page).fill(password)
  await submitButton(page).click()
}

export async function expectSignedIn(page: Page, user: TestUser) {
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('banner').getByText(user.name, { exact: true })).toBeVisible()
  await expect(welcomeHeading(page)).toBeVisible()
}

// Waits for the login form, then checks that no signed-in content is left.
export async function expectLoginPage(page: Page) {
  await expect(page).toHaveURL('/login')
  await expect(submitButton(page)).toBeVisible()
  await expect(signOutButton(page)).toHaveCount(0)
  await expect(welcomeHeading(page)).toHaveCount(0)
  await expect(usersHeading(page)).toHaveCount(0)
}

export async function signInViaUi(page: Page, user: TestUser) {
  await page.goto('/login')
  await submitLogin(page, user.email, user.password)
  await expectSignedIn(page, user)
}

// Creates a new session through the API, stored in the given client's cookie jar.
export async function signInViaApi(api: APIRequestContext, user: TestUser, origin: string) {
  const response = await api.post('/api/auth/sign-in/email', {
    headers: { origin },
    data: { email: user.email, password: user.password },
  })
  expect(response.status()).toBe(200)
}

// Returns the session cookie, with its value exactly as sent on the wire.
export async function sessionCookie(jar: BrowserContext | APIRequestContext) {
  const { cookies } = await jar.storageState()
  const cookie = cookies.find((c) => c.name === SESSION_COOKIE)
  if (!cookie) throw new Error('No session cookie')
  return cookie
}

// The cookie value is `<token>.<signature>`, URL-encoded.
export function tokenOf(cookieValue: string): string {
  return decodeURIComponent(cookieValue).split('.')[0] ?? ''
}

export function cookieHeader(value: string) {
  return { cookie: `${SESSION_COOKIE}=${value}` }
}

// Changes one character of the signature, keeping its length and the token.
export function tamper(cookieValue: string): string {
  const [token, signature = ''] = decodeURIComponent(cookieValue).split('.')
  const changed = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1)
  return encodeURIComponent(`${token}.${changed}`)
}

// Lets a route handler hold a request until release() is called.
export function gate() {
  let release = () => {}
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

type Fixtures = {
  origin: string
  // Creates an API client with its own, empty cookie jar (a separate "device").
  newApi: () => Promise<APIRequestContext>
}

export const test = base.extend<Fixtures>({
  origin: async ({ baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL is not configured')
    await use(baseURL)
  },
  newApi: async ({ playwright, origin }, use) => {
    const contexts: APIRequestContext[] = []
    await use(async () => {
      const api = await playwright.request.newContext({ baseURL: origin })
      contexts.push(api)
      return api
    })
    for (const api of contexts) await api.dispose()
  },
})

export { expect }
