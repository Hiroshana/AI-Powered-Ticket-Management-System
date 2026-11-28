import { test as base, expect } from '@playwright/test'
import type { APIRequestContext, APIResponse } from '@playwright/test'
import { INBOUND_EMAIL_SECRET, SERVER_URL } from './servers.ts'

export const INBOUND_EMAIL = '/api/inbound/email'
export const SECRET_HEADER = 'x-inbound-email-secret'

export type InboundEmail = {
  from?: unknown
  fromName?: unknown
  subject?: unknown
  text?: unknown
  messageId?: unknown
}

// A unique email, so tests can run in parallel and with --repeat-each.
export function uniqueEmail(overrides: InboundEmail = {}): InboundEmail {
  const id = crypto.randomUUID()
  return {
    from: `customer-${id}@example.com`,
    fromName: `Customer ${id.slice(0, 8)}`,
    subject: `Help needed ${id.slice(0, 8)}`,
    text: `My order has not arrived yet. (${id})`,
    messageId: `<${id}@mail.example.com>`,
    ...overrides,
  }
}

type Fixtures = {
  // Talks to the API server directly, as the email provider does (not through the Vite proxy).
  inbound: APIRequestContext
  // POSTs an email with the correct secret.
  deliver: (email: InboundEmail) => Promise<APIResponse>
}

export const test = base.extend<Fixtures>({
  inbound: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ baseURL: SERVER_URL })
    await use(api)
    await api.dispose()
  },
  deliver: async ({ inbound }, use) => {
    await use((email) =>
      inbound.post(INBOUND_EMAIL, {
        headers: { [SECRET_HEADER]: INBOUND_EMAIL_SECRET },
        data: email,
      }),
    )
  },
})

// Asserts a ticket acknowledgement and returns the ticket id.
export async function expectTicket(response: APIResponse, status: 200 | 201): Promise<number> {
  expect(response.status()).toBe(status)
  const body = await response.json()
  expect(Object.keys(body)).toEqual(['ticket'])
  expect(Object.keys(body.ticket).sort()).toEqual(['id', 'status'])
  expect(body.ticket.status).toBe('OPEN')
  expect(Number.isInteger(body.ticket.id)).toBe(true)
  expect(body.ticket.id).toBeGreaterThan(0)
  return body.ticket.id
}

export { INBOUND_EMAIL_SECRET, expect }
