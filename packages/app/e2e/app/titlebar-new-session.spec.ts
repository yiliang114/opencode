import { test, expect } from "../fixtures"
import { sessionIDFromUrl, withSession } from "../actions"

test("titlebar new session opens a linked qwen session", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `titlebar new ${Date.now()}`, async (session) => {
    await gotoSession(session.id)

    const button = page.getByRole("banner").getByRole("button", { name: "New session" }).first()
    await expect(button).toBeVisible()
    await button.click()

    await expect.poll(() => sessionIDFromUrl(page.url()) ?? "", { timeout: 30_000 }).not.toBe(session.id)
    const next = sessionIDFromUrl(page.url())
    expect(next).toBeTruthy()
    expect(next).not.toBe(session.id)
    await expect(page).toHaveURL(new RegExp(`/session/${next}\\?qwen=[^&]+(?:&.*)?$`))

    if (next) {
      await sdk.session.delete({ sessionID: next }).catch(() => undefined)
    }
  })
})
