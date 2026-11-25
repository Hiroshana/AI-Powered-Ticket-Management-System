import { defineConfig, devices } from '@playwright/test'

// E2E runs use their own server (:3001) and client (:5174) against the
// ai_powered_ims_test database (server/.env.test), so they never touch dev data
// and can run alongside `bun run dev`.
const SERVER_URL = 'http://localhost:3001'
const CLIENT_URL = 'http://localhost:5174'

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
      command: 'bun run dev --port 5174 --strictPort',
      url: CLIENT_URL,
      env: { API_PROXY_TARGET: SERVER_URL },
      reuseExistingServer: false,
    },
  ],
})
