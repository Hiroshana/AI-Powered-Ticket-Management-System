import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

// server/.env.test is the single source of E2E settings (ports, users, secrets).
// Parsed rather than loaded into process.env, so the web servers Playwright
// starts can't inherit these values; the server loads .env.test itself.
const env = parseEnv(
  readFileSync(path.resolve(import.meta.dirname, '../../../server/.env.test'), 'utf8'),
)

export function required(name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} must be set in server/.env.test`)
  return value
}
