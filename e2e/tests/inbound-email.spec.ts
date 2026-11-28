import {
  INBOUND_EMAIL,
  INBOUND_EMAIL_SECRET,
  SECRET_HEADER,
  expect,
  expectTicket,
  test,
  uniqueEmail,
} from './helpers/inbound-email.ts'
import { admin, cookieHeader, sessionCookie, signInViaApi } from './helpers/auth.ts'

// POST /api/inbound/email is called by the email provider, not a browser, and
// there is no ticket UI or read API yet, so these tests check the HTTP contract
// of the running server. DB-level details are in server/src/inbound-email.test.ts.

test.describe('creating tickets', () => {
  test('creates an OPEN ticket and returns only its id and status', async ({ deliver }) => {
    const response = await deliver(uniqueEmail())
    await expectTicket(response, 201)
    expect(response.headers()['content-type']).toContain('application/json')
  })

  test('each new email gets its own ticket', async ({ deliver }) => {
    const first = await expectTicket(await deliver(uniqueEmail()), 201)
    const second = await expectTicket(await deliver(uniqueEmail()), 201)
    expect(second).not.toBe(first)
  })

  test('accepts an email without subject or Message-ID', async ({ deliver }) => {
    const { from, fromName, text } = uniqueEmail()
    await expectTicket(await deliver({ from, fromName, text }), 201)
    await expectTicket(await deliver({ from, fromName, text, subject: '   ' }), 201)
  })

  test('accepts a sender address with surrounding spaces and capitals', async ({ deliver }) => {
    const id = crypto.randomUUID()
    const response = await deliver(uniqueEmail({ from: `  Customer-${id}@Example.COM ` }))
    await expectTicket(response, 201)
  })

  // Larger than the global 100 KB JSON limit; multi-byte characters so the byte
  // size (~120 KB) is well above the character count (60,000).
  test('accepts a ~120 KB UTF-8 body', async ({ deliver }) => {
    const text = 'é'.repeat(30_000) + '日本'.repeat(10_000) // 60 KB + 60 KB
    expect(Buffer.byteLength(text)).toBeGreaterThan(110_000)
    await expectTicket(await deliver(uniqueEmail({ text })), 201)
  })
})

test.describe('duplicate deliveries', () => {
  test('a repeated Message-ID returns the existing ticket with 200', async ({ deliver }) => {
    const email = uniqueEmail()
    const id = await expectTicket(await deliver(email), 201)

    // Webhook retries may differ in content; the Message-ID decides.
    const retry = await deliver({ ...email, subject: 'Re-sent', text: 'Different body' })
    expect(await expectTicket(retry, 200)).toBe(id)
    expect(await expectTicket(await deliver(email), 200)).toBe(id)
  })

  test('concurrent deliveries of the same email create one ticket', async ({ deliver }) => {
    const email = uniqueEmail()
    const responses = await Promise.all([deliver(email), deliver(email), deliver(email)])

    const statuses = responses.map((response) => response.status()).sort()
    expect(statuses).toEqual([200, 200, 201])
    const ids = await Promise.all(responses.map(async (response) => (await response.json()).ticket.id))
    expect(new Set(ids).size).toBe(1)
  })

  test('emails without a Message-ID are never deduplicated', async ({ deliver }) => {
    const { from, fromName, subject, text } = uniqueEmail()
    const email = { from, fromName, subject, text }
    const first = await expectTicket(await deliver(email), 201)
    const second = await expectTicket(await deliver(email), 201)
    expect(second).not.toBe(first)
  })
})

test.describe('authentication', () => {
  for (const { name, headers } of [
    { name: 'no secret', headers: {} },
    { name: 'an empty secret', headers: { [SECRET_HEADER]: '' } },
    { name: 'a wrong secret', headers: { [SECRET_HEADER]: 'wrong-secret' } },
    { name: 'a secret with different case', headers: { [SECRET_HEADER]: INBOUND_EMAIL_SECRET.toUpperCase() } },
    { name: 'a prefix of the secret', headers: { [SECRET_HEADER]: INBOUND_EMAIL_SECRET.slice(0, -1) } },
    { name: 'the secret as a bearer token', headers: { authorization: `Bearer ${INBOUND_EMAIL_SECRET}` } },
  ]) {
    test(`rejects ${name} with 401`, async ({ inbound }) => {
      const response = await inbound.post(INBOUND_EMAIL, { headers, data: uniqueEmail() })
      expect(response.status()).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    })
  }

  test('a rejected request does not create a ticket', async ({ inbound, deliver }) => {
    const email = uniqueEmail()
    const rejected = await inbound.post(INBOUND_EMAIL, {
      headers: { [SECRET_HEADER]: 'wrong-secret' },
      data: email,
    })
    expect(rejected.status()).toBe(401)

    // If the rejected request had stored the ticket, this would be a 200 duplicate.
    await expectTicket(await deliver(email), 201)
  })

  // The secret is checked before the body is parsed.
  test('checks the secret before parsing the body', async ({ inbound }) => {
    const malformed = await inbound.post(INBOUND_EMAIL, {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from('{"from":'),
    })
    expect(malformed.status()).toBe(401)

    const oversized = await inbound.post(INBOUND_EMAIL, {
      data: uniqueEmail({ text: 'a'.repeat(1_100_000) }),
    })
    expect(oversized.status()).toBe(401)
  })

  test('a signed-in session is not accepted instead of the secret', async ({ request, baseURL, inbound }) => {
    await signInViaApi(request, admin, baseURL ?? '')
    const { value } = await sessionCookie(request)

    const response = await inbound.post(INBOUND_EMAIL, { headers: cookieHeader(value), data: uniqueEmail() })
    expect(response.status()).toBe(401)
  })
})

test.describe('validation', () => {
  for (const { name, change, error } of [
    { name: 'a malformed sender address', change: { from: 'not-an-email' }, error: 'Enter a valid sender email address' },
    { name: 'a missing sender address', change: { from: undefined }, error: 'Enter a valid sender email address' },
    { name: 'a blank sender name', change: { fromName: '   ' }, error: 'Sender name is required' },
    { name: 'a missing sender name', change: { fromName: undefined }, error: 'Sender name is required' },
    { name: 'a missing body', change: { text: undefined }, error: 'Email body is required' },
    { name: 'a whitespace-only body', change: { text: ' \n\t ' }, error: 'Email body is required' },
    { name: 'a non-string body', change: { text: { html: '<p>hi</p>' } }, error: 'Email body is required' },
    {
      name: 'a body over 100,000 characters',
      change: { text: 'a'.repeat(100_001) },
      error: 'Email body must be at most 100000 characters',
    },
  ]) {
    test(`rejects ${name} with 400 and creates no ticket`, async ({ deliver }) => {
      const email = uniqueEmail()
      const response = await deliver({ ...email, ...change })
      expect(response.status()).toBe(400)
      expect(await response.json()).toEqual({ error })

      // The Message-ID was not used up by the rejected request.
      await expectTicket(await deliver(email), 201)
    })
  }

  test('rejects malformed JSON with 400', async ({ inbound }) => {
    const response = await inbound.post(INBOUND_EMAIL, {
      headers: { [SECRET_HEADER]: INBOUND_EMAIL_SECRET, 'content-type': 'application/json' },
      data: Buffer.from('{"from":'),
    })
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(Object.keys(body)).toEqual(['error'])
  })

  test('rejects bodies over 1 MB with 413', async ({ deliver }) => {
    const response = await deliver(uniqueEmail({ text: 'a'.repeat(1_100_000) }))
    expect(response.status()).toBe(413)
  })

  test('is not available as GET', async ({ inbound }) => {
    const response = await inbound.get(INBOUND_EMAIL, {
      headers: { [SECRET_HEADER]: INBOUND_EMAIL_SECRET },
    })
    expect(response.status()).toBe(404)
  })
})
