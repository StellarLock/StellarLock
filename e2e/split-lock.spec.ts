import { test, expect } from "@playwright/test"
import { nativeToScVal } from "@stellar/stellar-sdk"
import { CreateLockPage } from "./pages/create-lock.page"
import { mockSorobanRpc } from "./rpc-mock"

const TOKEN_ADDRESS = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR"
const BENEFICIARIES = [
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
]

test("Creating a split lock validates shares and reaches confirmation", async ({ page }) => {
  const createLock = new CreateLockPage(page)
  await mockConnectedWallet(page)
  const invoked = await mockSorobanRpc(page, {
    results: { create_split_lock: nativeToScVal(44, { type: "u64" }) },
  })

  await createLock.goto()
  await page.fill('input[placeholder*="token"]', TOKEN_ADDRESS)
  await page.fill("#amount", "300")
  await page.getByText("Multiple beneficiaries").click()
  await page.getByRole("button", { name: "Add beneficiary" }).click()
  await expect(page.locator('[id^="mb-addr-"]')).toHaveCount(3)

  for (let i = 0; i < 3; i++) {
    await page.fill(`#mb-addr-${i}`, BENEFICIARIES[i])
  }
  await page.fill("#mb-share-0", "50")
  await page.fill("#mb-share-1", "25")
  await page.fill("#mb-share-2", "20")
  await expect(page.getByText("Shares must add up to 100%")).toBeVisible()
  await expect(createLock.submitButton()).toBeDisabled()
  await page.fill("#mb-share-2", "25")
  await page.fill('input[type="date"]', new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10))
  await expect(createLock.submitButton()).toBeEnabled()
  await createLock.submitForm()
  await expect(page.getByRole("dialog")).toBeVisible()
  await createLock.confirmLock()

  await expect(page).toHaveURL(/\/app\/locks$/)
  expect(invoked).toContain("create_split_lock")
})
