import { Page } from '@playwright/test'

export class ConnectWalletModal {
  constructor(public page: Page) {}

  async connectWithFreighter() {
    // Mock wallet connection by intercepting the freighter API
    await this.page.evaluate(() => {
      window.__STELLAR_FREIGHTER_API__ = {
        getPublicKey: async () => 'GBMXUQVSF5VVFV7THVNO6ZSPHVZXDXHEHC3CFLCV4BQXLRGLVKZAQWEF',
        isConnected: async () => true,
        signTransaction: async (tx: string) => ({
          result: 'success',
          signedEnvelope: tx,
        }),
      }
    })
    await this.page.click('text=Connect Wallet')
  }

  async isVisible() {
    return await this.page.locator('text=Connect Wallet').isVisible()
  }
}
