// Shared by playwright.config.ts and the tests. Values come from server/.env.test.
import { required } from './env.ts'

// The E2E API server (see webServer in playwright.config.ts).
export const SERVER_URL = required('BETTER_AUTH_URL')

// The E2E client; also the server's trusted origin.
export const CLIENT_URL = required('CLIENT_ORIGIN')

// The E2E server reads the same value from .env.test.
export const INBOUND_EMAIL_SECRET = required('INBOUND_EMAIL_SECRET')
