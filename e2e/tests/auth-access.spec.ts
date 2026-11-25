import type { Page } from '@playwright/test'
import {
  GET_SESSION_URL,
  admin,
  adminState,
  agent,
  agentState,
  expect,
  expectLoginPage,
  expectSignedIn,
  gate,
  signOutButton,
  submitLogin,
  test,
  usersHeading,
  usersLink,
  welcomeHeading,
} from './helpers/auth.ts'

const notFoundHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Page not found', exact: true })
const loader = (page: Page) => page.getByText('Loading…', { exact: true })

async function holdSession(page: Page) {
  const hold = gate()
  await page.route(GET_SESSION_URL, async (route) => {
    await hold.opened
    await route.continue()
  })
  return hold
}

test.describe('signed out', () => {
  for (const path of ['/', '/users', '/users/', '/users?tab=1#top']) {
    test(`${path} redirects to /login without protected content`, async ({ page }) => {
      await page.goto(path)
      await expectLoginPage(page)
    })
  }

  test('protected content is not shown while the session is loading', async ({ page }) => {
    const hold = await holdSession(page)
    await page.goto('/users')
    await expect(loader(page)).toBeVisible()
    await expect(page).toHaveURL('/users')
    await expect(usersHeading(page)).toHaveCount(0)
    await expect(signOutButton(page)).toHaveCount(0)

    hold.release()
    await expectLoginPage(page)
  })

  test('Back from /login does not return to the protected page', async ({ page }) => {
    const before = `/before-${crypto.randomUUID()}`
    await page.goto(before)
    await expect(notFoundHeading(page)).toBeVisible()
    await page.goto('/users')
    await expectLoginPage(page)
    await page.goBack()
    await expect(page).toHaveURL(before)
  })

  test('an agent signing in after a redirect from /users gets no access to it', async ({ page }) => {
    await page.goto('/users')
    await expectLoginPage(page)
    await submitLogin(page, agent.email, agent.password)
    await expectSignedIn(page, agent)
  })

  for (const path of ['/nope', '/users/123', '/login/extra']) {
    test(`unknown route ${path} shows Not found`, async ({ page }) => {
      await page.goto(path)
      await expect(notFoundHeading(page)).toBeVisible()
      await expect(page).toHaveURL(path)
    })
  }

  test('Go home on the Not found page leads to /login', async ({ page }) => {
    await page.goto('/nope')
    await page.getByRole('link', { name: 'Go home' }).click()
    await expectLoginPage(page)
  })
})

for (const { user, state } of [
  { user: admin, state: adminState },
  { user: agent, state: agentState },
]) {
  test.describe(`signed in as ${user.role}`, () => {
    test.use({ storageState: state })

    test('/login redirects to the home page', async ({ page }) => {
      await page.goto('/login')
      await expectSignedIn(page, user)
    })

    test('unknown routes show Not found, and Go home leads to the home page', async ({ page }) => {
      await page.goto('/nope')
      await expect(notFoundHeading(page)).toBeVisible()
      await page.getByRole('link', { name: 'Go home' }).click()
      await expectSignedIn(page, user)
    })
  })
}

test.describe('admin role', () => {
  test.use({ storageState: adminState })

  test('opens /users from the navigation', async ({ page }) => {
    await page.goto('/')
    await usersLink(page).click()
    await expect(page).toHaveURL('/users')
    await expect(usersHeading(page)).toBeVisible()
  })

  test('opens /users directly and stays there after a reload', async ({ page }) => {
    await page.goto('/users')
    await expect(usersHeading(page)).toBeVisible()
    await page.reload()
    await expect(usersHeading(page)).toBeVisible()
    await expect(page).toHaveURL('/users')
  })

  test('sees a loader, not a redirect, until the session is known', async ({ page }) => {
    const hold = await holdSession(page)
    await page.goto('/users')
    await expect(loader(page)).toBeVisible()
    hold.release()
    await expect(usersHeading(page)).toBeVisible()
    await expect(page).toHaveURL('/users')
  })
})

test.describe('agent role', () => {
  test.use({ storageState: agentState })

  test('has no Users link, also after a reload', async ({ page }) => {
    await page.goto('/')
    await expectSignedIn(page, agent)
    await expect(usersLink(page)).toHaveCount(0)
    await page.reload()
    await expectSignedIn(page, agent)
    await expect(usersLink(page)).toHaveCount(0)
  })

  for (const path of ['/users', '/users/', '/USERS', '/users?tab=1']) {
    test(`${path} redirects to the home page`, async ({ page }) => {
      await page.goto(path)
      await expectSignedIn(page, agent)
      await expect(usersHeading(page)).toHaveCount(0)
    })
  }

  test('admin content is not shown while the session is loading', async ({ page }) => {
    const hold = await holdSession(page)
    await page.goto('/users')
    await expect(loader(page)).toBeVisible()
    await expect(usersHeading(page)).toHaveCount(0)
    await expect(welcomeHeading(page)).toHaveCount(0)
    hold.release()
    await expectSignedIn(page, agent)
  })

  test('a failing session check hides protected content, and recovers on reload', async ({ page }) => {
    await page.route(GET_SESSION_URL, (route) => route.fulfill({ status: 500, json: {} }))
    await page.goto('/')
    await expectLoginPage(page)

    await page.unroute(GET_SESSION_URL)
    await page.reload()
    await expectSignedIn(page, agent)
  })
})
