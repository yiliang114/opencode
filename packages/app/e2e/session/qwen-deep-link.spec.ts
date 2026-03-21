import { test, expect } from "../fixtures"
import { sessionIDFromUrl } from "../actions"
import { promptSelector } from "../selectors"

test("new-session deep links with prompt create a linked qwen session", async ({ page, withProject }) => {
  await withProject(async ({ directory, trackSession }) => {
    const text = `deep link prompt ${Date.now()}`
    const url = `opencode://new-session?directory=${encodeURIComponent(directory)}&prompt=${encodeURIComponent(text)}`

    await page.evaluate((url) => {
      window.dispatchEvent(
        new CustomEvent("opencode:deep-link", {
          detail: {
            urls: [url],
          },
        }),
      )
    }, url)

    await expect.poll(() => sessionIDFromUrl(page.url()) ?? "", { timeout: 30_000 }).not.toBe("")
    const id = sessionIDFromUrl(page.url())
    if (id) trackSession(id)

    await expect(page).toHaveURL(/\/session\/ses_[^?]+\?qwen=[^&]+(?:&.*)?$/)
    await expect(page.locator(promptSelector)).toContainText(text)
  })
})
