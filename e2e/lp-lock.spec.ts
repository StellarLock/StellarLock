import { test, expect } from "@playwright/test"
import { Address, nativeToScVal } from "@stellar/stellar-sdk"
import { CreateLockPage } from "./pages/create-lock.page"
import { mockSorobanRpc } from "./rpc-mock"
import { MOCK_WALLET_ADDRESS, mockConnectedWallet } from "./wallet-mock"

const POOL_SHARE_ADDRESS = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"
const TOKEN_A_ADDRESS = "CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4"
const TOKEN_B_ADDRESS = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
const BENEFICIARY_ADDRESS = "GD6ROJBYLKQMOW3E7N4M2YBPUHMZD7PL65VRHRMO24BOVSBV5H3BQRSL"

test("Submitting an LP lock sends the selected DEX and beneficiary", async ({ page }) => {
  const createLock = new CreateLockPage(page)
  await mockConnectedWallet(page)
  const invoked = await mockSorobanRpc(page, {
    results: { create_lock: nativeToScVal(43, { type: "u64" }) },
  })

  await createLock.goto()
  await createLock.switchToLpTab()
  await page.getByRole("radio", { name: /Soroswap/ }).click()
  await page.fill("#pool", POOL_SHARE_ADDRESS)
  await page.fill("#token-a", TOKEN_A_ADDRESS)
  await page.fill("#token-b", TOKEN_B_ADDRESS)
  await page.fill("#lp-amount", "250")
  await page.fill("#lp-beneficiary", BENEFICIARY_ADDRESS)
  await page.fill("#lp-unlock", new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10))
  await createLock.submitForm()
  await createLock.confirmLock()

  await expect(page).toHaveURL(/\/app\/lock\/lp\/43$/)
  expect(invoked).toContain("create_lock")
  const call = invoked.calls?.find((entry) => entry.fn === "create_lock")
  expect(call).toBeDefined()
  expect(call?.args[2].vec()?.[0].sym()?.toString()).toBe("Soroswap")
  expect(Address.fromScVal(call!.args[6]).toString()).toBe(BENEFICIARY_ADDRESS)
  expect(Address.fromScVal(call!.args[0]).toString()).toBe(MOCK_WALLET_ADDRESS)
})
