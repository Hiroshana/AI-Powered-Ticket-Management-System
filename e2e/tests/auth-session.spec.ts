import {
  SESSION_COOKIE,
  admin,
  agent,
  cookieHeader,
  expect,
  expectLoginPage,
  expectSignedIn,
  sessionCookie,
  signInViaApi,
  signInViaUi,
  signOutButton,
  submitLogin,
  tamper,
  test,
  tokenOf,
  usersHeading,
  usersLink,
} from './helpers/auth.ts'

// These tests sign out, revoke or tamper with sessions, so each one creates its
// own instead of using the shared storage state.

test.describe('session', () => {
  test('survives a reload and is shared with new tabs', async ({ page, context }) => {
    await signInViaUi(page, agent)
    await page.reload()
    await expectSignedIn(page, agent)

    const tab = await context.newPage()
    await tab.goto('/')
    await expectSignedIn(tab, agent)
  })

  test('is not shared with another browser context', async ({ page, browser }) => {
    await signInViaUi(page, agent)
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/')
    await expectLoginPage(otherPage)
    await other.close()
  })

  test('two users can be signed in at once in separate contexts', async ({ page, browser }) => {
    await signInViaUi(page, admin)
    const other = await browser.newContext()
    await signInViaUi(await other.newPage(), agent)

    await page.reload()
    await expectSignedIn(page, admin)
    await expect(usersLink(page)).toBeVisible()
    await other.close()
  })

  test('cookie is persistent, HttpOnly, SameSite=Lax and unreadable from scripts', async ({ page, context }) => {
    await signInViaUi(page, agent)
    const cookie = await sessionCookie(context)
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect(cookie.path).toBe('/')
    // Session cookies, which end with the browser, report -1.
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000)
    expect(await page.evaluate(() => document.cookie)).not.toContain('session')
  })

  test('token and password are not kept in web storage or the URL', async ({ page, context }) => {
    await signInViaUi(page, agent)
    const token = tokenOf((await sessionCookie(context)).value)
    expect(token).not.toBe('')

    const storage = await page.evaluate(() =>
      JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
    )
    for (const secret of [token, agent.password]) {
      expect(storage).not.toContain(secret)
      expect(page.url()).not.toContain(secret)
    }
  })

  test('each sign-in gets a new token, replacing a cookie planted beforehand', async ({ page, context, newApi, origin }) => {
    const earlier = await newApi()
    await signInViaApi(earlier, agent, origin)
    const planted = (await sessionCookie(earlier)).value
    await context.addCookies([
      { name: SESSION_COOKIE, value: tamper(planted), url: origin, httpOnly: true, sameSite: 'Lax' },
    ])

    await signInViaUi(page, agent)
    expect(tokenOf((await sessionCookie(context)).value)).not.toBe(tokenOf(planted))
  })

  test('deleting the cookie signs the user out on reload', async ({ page, context }) => {
    await signInViaUi(page, agent)
    await context.clearCookies({ name: SESSION_COOKIE })
    await page.reload()
    await expectLoginPage(page)
  })

  for (const { name, change } of [
    { name: 'a tampered signature', change: tamper },
    { name: 'a token without its signature', change: tokenOf },
    { name: 'garbage', change: () => 'garbage' },
    { name: 'an empty value', change: () => '' },
    { name: 'malformed URL encoding', change: () => '%E0%A4%A.%%%' },
  ]) {
    test(`a cookie with ${name} leads to /login, where signing in works again`, async ({ page, context, origin }) => {
      await signInViaUi(page, agent)
      const value = change((await sessionCookie(context)).value)
      await context.clearCookies()
      await context.addCookies([
        { name: SESSION_COOKIE, value, url: origin, httpOnly: true, sameSite: 'Lax' },
      ])

      await page.goto('/')
      await expectLoginPage(page)

      await submitLogin(page, agent.email, agent.password)
      await expectSignedIn(page, agent)
    })
  }

  test('revoking it on the server signs an open page out on reload', async ({ page, context, newApi, origin }) => {
    await signInViaUi(page, agent)
    const { value } = await sessionCookie(context)

    const otherDevice = await newApi()
    await signInViaApi(otherDevice, agent, origin)
    const revoke = await otherDevice.post('/api/auth/revoke-session', {
      headers: { origin },
      data: { token: tokenOf(value) },
    })
    expect(revoke.status()).toBe(200)

    await page.reload()
    await expectLoginPage(page)
    // Only that session was revoked.
    expect((await otherDevice.get('/api/me')).status()).toBe(200)
  })
})

test.describe('sign-out', () => {
  test('goes to /login and protected pages stay inaccessible', async ({ page }) => {
    await signInViaUi(page, admin)
    await signOutButton(page).click()
    await expectLoginPage(page)

    for (const path of ['/', '/users']) {
      await page.goto(path)
      await expectLoginPage(page)
    }
  })

  test('Back does not reveal protected pages after in-app navigation', async ({ page }) => {
    await signInViaUi(page, admin)
    await usersLink(page).click()
    await expect(usersHeading(page)).toBeVisible()
    await signOutButton(page).click()
    await expectLoginPage(page)

    await page.goBack()
    await expectLoginPage(page)
  })

  test('Back does not reveal protected pages after full page loads', async ({ page }) => {
    await signInViaUi(page, admin)
    await page.goto('/users')
    await signOutButton(page).click()
    await expectLoginPage(page)

    await page.goBack()
    await expectLoginPage(page)
  })

  test('invalidates the old cookie on the server and removes it', async ({ page, context, newApi }) => {
    await signInViaUi(page, agent)
    const { value } = await sessionCookie(context)
    const headers = cookieHeader(value)
    const thief = await newApi()
    expect((await thief.get('/api/me', { headers })).status()).toBe(200)

    await signOutButton(page).click()
    await expectLoginPage(page)

    expect((await thief.get('/api/me', { headers })).status()).toBe(401)
    expect((await context.cookies()).filter((c) => c.name === SESSION_COOKIE)).toEqual([])
  })

  test('signs out other open tabs', async ({ page, context }) => {
    await signInViaUi(page, agent)
    const tab = await context.newPage()
    await tab.goto('/')
    await expectSignedIn(tab, agent)

    await signOutButton(page).click()
    await expectLoginPage(page)

    // Better Auth notifies other tabs, so this happens even before a reload.
    await expectLoginPage(tab)
    await tab.goto('/')
    await expectLoginPage(tab)
  })

  test("leaves the user's other devices signed in", async ({ page, newApi, origin }) => {
    const otherDevice = await newApi()
    await signInViaApi(otherDevice, agent, origin)
    await signInViaUi(page, agent)
    await signOutButton(page).click()
    await expectLoginPage(page)

    expect((await otherDevice.get('/api/me')).status()).toBe(200)
  })

  test('signing in as a different user afterwards shows the new role, in every tab', async ({ page, context }) => {
    await signInViaUi(page, admin)
    await expect(usersLink(page)).toBeVisible()
    const otherTab = await context.newPage()
    await otherTab.goto('/users')
    await expect(usersHeading(otherTab)).toBeVisible()

    await signOutButton(page).click()
    await expectLoginPage(page)
    await submitLogin(page, agent.email, agent.password)
    await expectSignedIn(page, agent)
    await expect(usersLink(page)).toHaveCount(0)

    await otherTab.goto('/users')
    await expectSignedIn(otherTab, agent)
    await expect(usersHeading(otherTab)).toHaveCount(0)

    await signOutButton(page).click()
    await expectLoginPage(page)
    await submitLogin(page, admin.email, admin.password)
    await expectSignedIn(page, admin)
    await expect(usersLink(page)).toBeVisible()
  })

  test('with an already revoked session still ends on /login', async ({ page, context, newApi, origin }) => {
    await signInViaUi(page, agent)
    const { value } = await sessionCookie(context)
    const otherDevice = await newApi()
    const signOut = await otherDevice.post('/api/auth/sign-out', {
      headers: { origin, ...cookieHeader(value) },
      data: {},
    })
    expect(signOut.status()).toBe(200)

    await signOutButton(page).click()
    await expectLoginPage(page)
  })

  for (const { name, status } of [
    { name: 'a server error', status: 500 },
    { name: 'a network failure', status: 0 },
  ]) {
    test(`after ${name}, the user is still shown as signed in and can retry`, async ({ page }) => {
      const url = '**/api/auth/sign-out'
      await page.route(url, (route) =>
        status ? route.fulfill({ status, json: {} }) : route.abort('connectionfailed'),
      )
      await signInViaUi(page, agent)
      const attempt = page.waitForRequest(url)
      await signOutButton(page).click()
      await (await attempt).response()
      await expectSignedIn(page, agent)

      await page.unroute(url)
      await signOutButton(page).click()
      await expectLoginPage(page)
    })
  }
})
