import { admin, adminState, agent, agentState, signInViaUi, test as setup } from './helpers/auth.ts'

setup('sign in as admin', async ({ page }) => {
  await signInViaUi(page, admin)
  await page.context().storageState({ path: adminState })
})

setup('sign in as agent', async ({ page }) => {
  await signInViaUi(page, agent)
  await page.context().storageState({ path: agentState })
})
