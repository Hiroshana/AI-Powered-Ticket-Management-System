import type { Page } from '@playwright/test'
import {
  INVALID_CREDENTIALS,
  SIGN_IN_URL,
  admin,
  agent,
  alertWith,
  emailInput,
  expect,
  expectLoginPage,
  expectSignedIn,
  gate,
  passwordInput,
  signInViaUi,
  submitButton,
  submitLogin,
  test,
  usersLink,
} from './helpers/auth.ts'

function trackSignInRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/sign-in/')) urls.push(request.url())
  })
  return urls
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(submitButton(page)).toBeVisible()
})

test.describe('login form', () => {
  test('renders empty labelled fields with a masked password and no errors', async ({ page }) => {
    await expect(page.getByText('AI - Powered Ticket Management System')).toBeVisible()
    await expect(emailInput(page)).toHaveValue('')
    await expect(emailInput(page)).toHaveAttribute('autocomplete', 'email')
    await expect(passwordInput(page)).toHaveValue('')
    await expect(passwordInput(page)).toHaveAttribute('type', 'password')
    await expect(passwordInput(page)).toHaveAttribute('autocomplete', 'current-password')
    await expect(submitButton(page)).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('offers no public sign-up', async ({ page }) => {
    await expect(page.getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('button')).toHaveCount(1)
  })

  test('can be completed with the keyboard only', async ({ page }) => {
    await emailInput(page).focus()
    await page.keyboard.type(agent.email)
    await page.keyboard.press('Tab')
    await expect(passwordInput(page)).toBeFocused()
    await page.keyboard.type(agent.password)
    await page.keyboard.press('Tab')
    await expect(submitButton(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expectSignedIn(page, agent)
  })

  test('Enter in the password field submits', async ({ page }) => {
    await emailInput(page).fill(agent.email)
    await passwordInput(page).fill(agent.password)
    await passwordInput(page).press('Enter')
    await expectSignedIn(page, agent)
  })

  test('is disabled and shows progress while signing in, and submits only once', async ({ page }) => {
    const requests = trackSignInRequests(page)
    const hold = gate()
    await page.route(SIGN_IN_URL, async (route) => {
      await hold.opened
      await route.continue()
    })

    await emailInput(page).fill(agent.email)
    await passwordInput(page).fill(agent.password)
    await submitButton(page).dblclick()

    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled()
    await passwordInput(page).press('Enter')
    await emailInput(page).press('Enter')

    hold.release()
    await expectSignedIn(page, agent)
    expect(requests).toHaveLength(1)
  })
})

test.describe('client-side validation', () => {
  test('requires both fields and focuses the first invalid one', async ({ page }) => {
    const requests = trackSignInRequests(page)
    await submitButton(page).click()

    await expect(alertWith(page, 'Email is required')).toBeVisible()
    await expect(alertWith(page, 'Password is required')).toBeVisible()
    await expect(emailInput(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(passwordInput(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(emailInput(page)).toBeFocused()
    await expect(page).toHaveURL('/login')
    expect(requests).toHaveLength(0)
  })

  test('requires the email when only the password is filled', async ({ page }) => {
    const requests = trackSignInRequests(page)
    await passwordInput(page).fill(agent.password)
    await submitButton(page).click()

    await expect(alertWith(page, 'Email is required')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)
    expect(requests).toHaveLength(0)
  })

  test('requires the password when only the email is filled', async ({ page }) => {
    const requests = trackSignInRequests(page)
    await emailInput(page).fill(agent.email)
    await submitButton(page).click()

    await expect(alertWith(page, 'Password is required')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(passwordInput(page)).toBeFocused()
    expect(requests).toHaveLength(0)
  })

  test('treats a whitespace-only email as empty', async ({ page }) => {
    const requests = trackSignInRequests(page)
    await submitLogin(page, '   ', agent.password)

    await expect(alertWith(page, 'Email is required')).toBeVisible()
    expect(requests).toHaveLength(0)
  })

  for (const email of [
    'plainaddress',
    '@no-local-part.com',
    'no-domain@',
    'no-tld@localhost',
    'two@@example.com',
    'has space@example.com',
    'dots..dots@example.com',
  ]) {
    test(`rejects the malformed email "${email}"`, async ({ page }) => {
      const requests = trackSignInRequests(page)
      await submitLogin(page, email, agent.password)

      await expect(alertWith(page, 'Enter a valid email address')).toBeVisible()
      await expect(emailInput(page)).toHaveValue(email)
      await expect(page).toHaveURL('/login')
      expect(requests).toHaveLength(0)
    })
  }

  test('updates and clears each error as its field is corrected', async ({ page }) => {
    await submitButton(page).click()
    await expect(alertWith(page, 'Email is required')).toBeVisible()

    await emailInput(page).fill('not-an-email')
    await expect(alertWith(page, 'Enter a valid email address')).toBeVisible()
    await expect(alertWith(page, 'Email is required')).toHaveCount(0)

    await emailInput(page).fill(agent.email)
    await expect(alertWith(page, 'Enter a valid email address')).toHaveCount(0)
    await expect(emailInput(page)).toHaveAttribute('aria-invalid', 'false')
    await expect(alertWith(page, 'Password is required')).toBeVisible()

    await passwordInput(page).fill(agent.password)
    await expect(page.getByRole('alert')).toHaveCount(0)

    await submitButton(page).click()
    await expectSignedIn(page, agent)
  })
})

test.describe('email and password matching', () => {
  test('ignores whitespace around the email', async ({ page }) => {
    await submitLogin(page, `  ${agent.email}  `, agent.password)
    await expectSignedIn(page, agent)
  })

  test('ignores the case of the email', async ({ page }) => {
    await submitLogin(page, agent.email.toUpperCase(), agent.password)
    await expectSignedIn(page, agent)
  })

  for (const { name, change } of [
    { name: 'a different case', change: (p: string) => p.toUpperCase() },
    { name: 'leading whitespace', change: (p: string) => ` ${p}` },
    { name: 'trailing whitespace', change: (p: string) => `${p} ` },
    { name: 'a missing last character', change: (p: string) => p.slice(0, -1) },
  ]) {
    test(`rejects the right password with ${name}`, async ({ page }) => {
      await submitLogin(page, agent.email, change(agent.password))
      await expect(alertWith(page, INVALID_CREDENTIALS)).toBeVisible()
      await expectLoginPage(page)
    })
  }

  test('rejects a whitespace-only password', async ({ page }) => {
    await submitLogin(page, agent.email, '     ')
    await expect(page.getByRole('alert')).toBeVisible()
    await expectLoginPage(page)
  })

  test("rejects another user's password", async ({ page }) => {
    await submitLogin(page, admin.email, agent.password)
    await expect(alertWith(page, INVALID_CREDENTIALS)).toBeVisible()
    await expectLoginPage(page)
  })
})

test.describe('failed sign-in', () => {
  test('shows the same message for a wrong password and an unknown email', async ({ page }) => {
    await submitLogin(page, agent.email, 'wrong-password')
    await expect(page.getByRole('alert')).toHaveText(INVALID_CREDENTIALS)

    await page.reload()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await submitLogin(page, `nobody-${crypto.randomUUID()}@example.com`, 'wrong-password')
    await expect(page.getByRole('alert')).toHaveText(INVALID_CREDENTIALS)
    await expectLoginPage(page)
  })

  test('sets no session: protected pages still redirect', async ({ page, context }) => {
    await submitLogin(page, agent.email, 'wrong-password')
    await expect(alertWith(page, INVALID_CREDENTIALS)).toBeVisible()
    expect(await context.cookies()).toEqual([])

    await page.goto('/')
    await expectLoginPage(page)
  })

  test('keeps the email, clears the old error on retry and then signs in', async ({ page }) => {
    await submitLogin(page, agent.email, 'wrong-password')
    await expect(alertWith(page, INVALID_CREDENTIALS)).toBeVisible()
    await expect(emailInput(page)).toHaveValue(agent.email)
    await expect(submitButton(page)).toBeEnabled()

    const hold = gate()
    await page.route(SIGN_IN_URL, async (route) => {
      await hold.opened
      await route.continue()
    })
    await passwordInput(page).fill(agent.password)
    await submitButton(page).click()
    await expect(submitButton(page)).toHaveText('Signing in…')
    await expect(page.getByRole('alert')).toHaveCount(0)

    hold.release()
    await expectSignedIn(page, agent)
  })

  test('works after several failed attempts in a row', async ({ page }) => {
    for (const attempt of [1, 2, 3]) {
      const response = page.waitForResponse(SIGN_IN_URL)
      await submitLogin(page, agent.email, `wrong-password-${attempt}`)
      expect((await response).status()).toBe(401)
      await expect(page.getByRole('alert')).toHaveText(INVALID_CREDENTIALS)
    }
    await submitLogin(page, agent.email, agent.password)
    await expectSignedIn(page, agent)
  })

  test('shows a server error message as plain text', async ({ page }) => {
    const message = '<b>Service</b> down'
    await page.route(SIGN_IN_URL, (route) => route.fulfill({ status: 503, json: { message } }))
    await submitLogin(page, agent.email, agent.password)
    await expect(page.getByRole('alert')).toHaveText(message)
  })

  for (const { name, body } of [
    { name: 'a JSON 500', body: JSON.stringify({ error: 'Internal Server Error' }) },
    { name: 'an empty 500', body: '' },
  ]) {
    test(`shows an error for ${name} and can be retried`, async ({ page }) => {
      await page.route(SIGN_IN_URL, (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body }),
      )
      await submitLogin(page, agent.email, agent.password)
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(submitButton(page)).toBeEnabled()
      await expect(emailInput(page)).toHaveValue(agent.email)

      await page.unroute(SIGN_IN_URL)
      await submitButton(page).click()
      await expectSignedIn(page, agent)
    })
  }

  test('does not blame the credentials when the server fails', async ({ page }) => {
    await page.route(SIGN_IN_URL, (route) =>
      route.fulfill({ status: 500, json: { error: 'Internal Server Error' } }),
    )
    await submitLogin(page, agent.email, agent.password)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).not.toContainText(INVALID_CREDENTIALS)
  })

  test('shows an error when the network is down', async ({ page }) => {
    await page.route(SIGN_IN_URL, (route) => route.abort('connectionfailed'))
    await submitLogin(page, agent.email, agent.password)
    await expect(page.getByRole('alert')).toBeVisible()
    await expectLoginPage(page)
  })

  test('can be retried after a network failure', async ({ page }) => {
    await page.route(SIGN_IN_URL, (route) => route.abort('connectionfailed'))
    const failed = page.waitForEvent('requestfailed')
    await submitLogin(page, agent.email, agent.password)
    await failed
    await expect(submitButton(page)).toHaveText('Sign in')
    await expect(submitButton(page)).toBeEnabled()

    await page.unroute(SIGN_IN_URL)
    await submitButton(page).click()
    await expectSignedIn(page, agent)
  })
})

test.describe('hostile input', () => {
  for (const { name, email, password } of [
    { name: 'SQL injection in the password', email: admin.email, password: "' OR '1'='1' --" },
    { name: 'SQL injection in the email', email: "admin'or'1'--@test.local", password: 'x' },
    { name: 'SQL wildcards in the email', email: '%@test.local', password: 'x' },
    { name: 'a script in the password', email: admin.email, password: '<script>alert(1)</script>' },
    { name: 'a null byte in the password', email: admin.email, password: 'pass\u0000word' },
    { name: 'unicode in the password', email: admin.email, password: 'пароль-密码-🔑' },
    { name: 'a very long password', email: admin.email, password: 'a'.repeat(10_000) },
    { name: 'a very long email', email: `${'a'.repeat(5_000)}@example.com`, password: 'x' },
  ]) {
    test(`${name} is rejected and the form stays usable`, async ({ page }) => {
      const serverErrors: number[] = []
      page.on('response', (response) => {
        if (response.status() >= 500) serverErrors.push(response.status())
      })

      await submitLogin(page, email, password)
      await expect(page.getByRole('alert')).toBeVisible()
      await expectLoginPage(page)
      expect(serverErrors).toEqual([])

      await submitLogin(page, agent.email, agent.password)
      await expectSignedIn(page, agent)
    })
  }
})

test.describe('successful sign-in', () => {
  test('admin lands on the home page with the admin navigation', async ({ page }) => {
    await signInViaUi(page, admin)
    await expect(usersLink(page)).toBeVisible()
  })

  test('agent lands on the home page without the admin navigation', async ({ page }) => {
    await signInViaUi(page, agent)
    await expect(usersLink(page)).toHaveCount(0)
  })

  test('Back does not return to the login page', async ({ page }) => {
    const before = `/before-${crypto.randomUUID()}`
    await page.goto(before)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await signInViaUi(page, agent)

    await page.goBack()
    await expect(page).toHaveURL(before)
    await page.goForward()
    await expectSignedIn(page, agent)
  })
})
