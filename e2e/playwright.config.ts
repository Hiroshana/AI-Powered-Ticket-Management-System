import { defineConfig, devices } from '@playwright/test'
import { CLIENT_URL, SERVER_URL } from './tests/helpers/servers.ts'

// E2E runs use their own server and client (ports from server/.env.test) against
// the ai_powered_ims_test database, so they never touch dev data and can run
// alongside `bun run dev`.
const CLIENT_PORT = new URL(CLIENT_URL).port

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Open the saved HTML report with `bun run report`.
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // Signs in once per role and saves the session to playwright/.auth/.
    { name: 'setup', testMatch: /[.]setup[.]ts$/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: [
    {
      name: 'server',
      cwd: '../server',
      // Reset + seed the test DB first, so it's ready before the health check passes.
      command: 'bun run db:test:prepare && bun run start:test',
      url: `${SERVER_URL}/api/health`,
      // Never reuse: an already-running server might be pointed at the dev database.
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      name: 'client',
      cwd: '../client',
      command: `bun run dev --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      env: { API_PROXY_TARGET: SERVER_URL },
      reuseExistingServer: false,
    },
  ],
})
