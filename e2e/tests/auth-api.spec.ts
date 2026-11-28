import {
  INVALID_CREDENTIALS,
  admin,
  agent,
  cookieHeader,
  expect,
  sessionCookie,
  signInViaApi,
  tamper,
  test,
  tokenOf,
} from './helpers/auth.ts'
import { CLIENT_URL } from './helpers/servers.ts'

const SIGN_IN = '/api/auth/sign-in/email'
const UNTRUSTED = 'https://evil.example'

test.describe('GET /api/me', () => {
  test('returns 401 without a cookie, and no user data', async ({ request }) => {
    const response = await request.get('/api/me')
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  for (const { name, change } of [
    { name: 'a tampered signature', change: tamper },
    { name: 'an unsigned token', change: tokenOf },
    { name: 'garbage', change: () => 'garbage' },
    { name: 'malformed URL encoding', change: () => '%E0%A4%A.%%%' },
  ]) {
    test(`returns 401 for a cookie with ${name}`, async ({ newApi, origin }) => {
      const signedIn = await newApi()
      await signInViaApi(signedIn, agent, origin)
      const value = change((await sessionCookie(signedIn)).value)

      const api = await newApi()
      expect((await api.get('/api/me', { headers: cookieHeader(value) })).status()).toBe(401)
      expect((await signedIn.get('/api/me')).status()).toBe(200)
    })
  }

  test('does not accept the session token as a bearer token', async ({ newApi, origin }) => {
    const signedIn = await newApi()
    await signInViaApi(signedIn, agent, origin)
    const { value } = await sessionCookie(signedIn)

    const api = await newApi()
    for (const token of [value, tokenOf(value)]) {
      const response = await api.get('/api/me', { headers: { authorization: `Bearer ${token}` } })
      expect(response.status()).toBe(401)
    }
  })

  for (const user of [admin, agent]) {
    test(`returns the signed-in ${user.role} without secrets`, async ({ request, origin }) => {
      await signInViaApi(request, user, origin)
      const response = await request.get('/api/me')
      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(Object.keys(body)).toEqual(['user'])
      expect(body.user).toMatchObject({ email: user.email, name: user.name, role: user.role })

      const text = await response.text()
      expect(text).not.toMatch(/password|hash|token/i)
      expect(text).not.toContain(user.password)
    })
  }
})

test.describe('POST sign-in', () => {
  test('response contains the user but no password or hash', async ({ request, origin }) => {
    const response = await request.post(SIGN_IN, {
      headers: { origin },
      data: { email: agent.email, password: agent.password },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ user: { email: agent.email, role: 'AGENT' } })
    const text = await response.text()
    expect(text).not.toMatch(/password|hash/i)
    expect(text).not.toContain(agent.password)
  })

  test('answers a wrong password and an unknown email identically', async ({ request, origin }) => {
    const answers = []
    for (const email of [agent.email, `nobody-${crypto.randomUUID()}@example.com`]) {
      const response = await request.post(SIGN_IN, {
        headers: { origin },
        data: { email, password: 'wrong-password' },
      })
      expect(response.headers()['set-cookie']).toBeUndefined()
      answers.push({ status: response.status(), body: await response.json() })
    }
    expect(answers[0]).toMatchObject({ status: 401, body: { message: INVALID_CREDENTIALS } })
    expect(answers[1]).toEqual(answers[0])
  })

  for (const { name, data } of [
    { name: 'no fields', data: {} },
    { name: 'no password', data: { email: agent.email } },
    { name: 'no email', data: { password: agent.password } },
    { name: 'an empty email', data: { email: '', password: agent.password } },
    { name: 'a malformed email', data: { email: 'not-an-email', password: agent.password } },
    { name: 'null values', data: { email: null, password: null } },
    { name: 'objects instead of strings', data: { email: { contains: '@' }, password: { not: '' } } },
    { name: 'an array instead of an object', data: [agent.email, agent.password] },
  ]) {
    test(`rejects ${name} with 400 and no session`, async ({ request, origin }) => {
      const response = await request.post(SIGN_IN, { headers: { origin }, data })
      expect(response.status()).toBe(400)
      expect(response.headers()['set-cookie']).toBeUndefined()
    })
  }

  test('rejects an empty password', async ({ request, origin }) => {
    const response = await request.post(SIGN_IN, {
      headers: { origin },
      data: { email: agent.email, password: '' },
    })
    expect(response.status()).toBe(401)
    expect(response.headers()['set-cookie']).toBeUndefined()
  })

  test('rejects malformed JSON as a client error', async ({ request, origin }) => {
    const response = await request.post(SIGN_IN, {
      headers: { origin, 'content-type': 'application/json' },
      data: Buffer.from('{"email":'),
    })
    expect(response.status()).toBe(400)
  })

  test('is not available as GET', async ({ request, origin }) => {
    const response = await request.get(SIGN_IN, {
      headers: { origin },
      params: { email: agent.email, password: 'wrong-password' },
    })
    expect([404, 405]).toContain(response.status())
  })
})

// Better Auth turns its origin and CSRF checks off by default when NODE_ENV=test, which
// is how the E2E server runs. These tests rely on advanced.disableOriginCheck: false
// in server/src/lib/auth.ts.
test.describe('CSRF protection', () => {
  const credentials = { email: agent.email, password: agent.password }

  for (const { name, headers } of [
    { name: 'an untrusted Origin', headers: { origin: UNTRUSTED } },
    { name: 'a look-alike Origin', headers: { origin: `${CLIENT_URL}.evil.example` } },
    { name: 'a null Origin', headers: { origin: 'null' } },
    { name: 'an untrusted Referer and no Origin', headers: { referer: `${UNTRUSTED}/login` } },
  ]) {
    test(`sign-in with ${name} is rejected`, async ({ request }) => {
      const response = await request.post(SIGN_IN, { headers, data: credentials })
      expect(response.status()).toBe(403)
      expect(response.headers()['set-cookie']).toBeUndefined()
    })
  }

  test('sign-in by cross-site form navigation is rejected', async ({ request }) => {
    const response = await request.post(SIGN_IN, {
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
      },
      form: credentials,
    })
    expect(response.status()).toBe(403)
    expect(response.headers()['set-cookie']).toBeUndefined()
  })

  test('sign-in with Fetch Metadata but no Origin is rejected', async ({ request }) => {
    const response = await request.post(SIGN_IN, {
      headers: { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' },
      data: credentials,
    })
    expect(response.status()).toBe(403)
  })

  // Better Auth allows this on purpose: non-browser clients send neither an
  // Origin nor Fetch Metadata, and without cookies there is nothing to forge.
  test('sign-in from a non-browser client without Origin or cookies is allowed', async ({ request }) => {
    const response = await request.post(SIGN_IN, { data: credentials })
    expect(response.status()).toBe(200)
  })

  test('sign-in with cookies requires an Origin', async ({ request, origin }) => {
    await signInViaApi(request, agent, origin)
    const response = await request.post(SIGN_IN, { data: credentials })
    expect(response.status()).toBe(403)
  })

  test('sign-in with an untrusted callbackURL is rejected', async ({ request, origin }) => {
    const response = await request.post(SIGN_IN, {
      headers: { origin },
      data: { ...credentials, callbackURL: `${UNTRUSTED}/phish` },
    })
    expect(response.status()).toBe(403)
  })

  for (const { name, headers } of [
    { name: 'an untrusted', headers: { origin: UNTRUSTED } },
    { name: 'no', headers: {} },
  ]) {
    test(`sign-out with ${name} Origin is rejected and the session stays valid`, async ({ request, origin }) => {
      await signInViaApi(request, agent, origin)
      const signOut = await request.post('/api/auth/sign-out', { headers, data: {} })
      expect(signOut.status()).toBe(403)
      expect((await request.get('/api/me')).status()).toBe(200)
    })
  }
})

test.describe('account protection', () => {
  for (const { name, extra } of [
    { name: 'public sign-up', extra: {} },
    { name: 'public sign-up as admin', extra: { role: 'ADMIN' } },
  ]) {
    test(`${name} is rejected and creates no account`, async ({ request, origin }) => {
      const email = `signup-${crypto.randomUUID()}@example.com`
      const password = 'a-valid-password-123'
      const signUp = await request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Sign Up', ...extra },
      })
      expect(signUp.status()).toBe(400)
      expect(signUp.headers()['set-cookie']).toBeUndefined()

      const signIn = await request.post(SIGN_IN, { headers: { origin }, data: { email, password } })
      expect(signIn.status()).toBe(401)
    })
  }

  // Sends the existing name, so the name would not change even if accepted.
  for (const data of [{ role: 'ADMIN' }, { name: agent.name, role: 'ADMIN' }]) {
    test(`an agent cannot become admin by updating ${Object.keys(data).join(' and ')}`, async ({ request, origin }) => {
      await signInViaApi(request, agent, origin)
      const response = await request.post('/api/auth/update-user', { headers: { origin }, data })
      expect(response.status()).toBe(400)

      const me = await request.get('/api/me')
      expect((await me.json()).user).toMatchObject({ name: agent.name, role: 'AGENT' })
    })
  }

  for (const { path, data } of [
    { path: 'update-user', data: { role: 'ADMIN' } },
    { path: 'revoke-session', data: { token: 'unknown' } },
    {
      path: 'change-password',
      data: { currentPassword: 'wrong-password', newPassword: 'wrong-password-2' },
    },
  ]) {
    test(`POST /api/auth/${path} requires a session`, async ({ request, origin }) => {
      const response = await request.post(`/api/auth/${path}`, { headers: { origin }, data })
      expect(response.status()).toBe(401)
    })
  }

  test("an agent cannot revoke another user's session", async ({ newApi, origin }) => {
    const adminApi = await newApi()
    await signInViaApi(adminApi, admin, origin)
    const agentApi = await newApi()
    await signInViaApi(agentApi, agent, origin)

    await agentApi.post('/api/auth/revoke-session', {
      headers: { origin },
      data: { token: tokenOf((await sessionCookie(adminApi)).value) },
    })
    expect((await adminApi.get('/api/me')).status()).toBe(200)
  })

  // Checks owners, not specific tokens: the list is capped at 100 sessions.
  test("list-sessions only contains the caller's sessions", async ({ request, origin }) => {
    await signInViaApi(request, agent, origin)
    const { user } = await (await request.get('/api/me')).json()

    const response = await request.get('/api/auth/list-sessions')
    expect(response.status()).toBe(200)
    const sessions: { userId: string }[] = await response.json()
    expect(new Set(sessions.map((session) => session.userId))).toEqual(new Set([user.id]))
  })
})

test.describe('other endpoints', () => {
  test('GET /api/auth/get-session returns null when signed out', async ({ request }) => {
    const response = await request.get('/api/auth/get-session')
    expect(response.status()).toBe(200)
    expect(await response.json()).toBeNull()
  })

  for (const path of ['/api/nope', '/api/me/nope', '/api/auth/nope']) {
    test(`${path} returns 404`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(404)
    })
  }

  test('POST /api/me returns 404', async ({ request, origin }) => {
    const response = await request.post('/api/me', { headers: { origin }, data: {} })
    expect(response.status()).toBe(404)
  })
})
