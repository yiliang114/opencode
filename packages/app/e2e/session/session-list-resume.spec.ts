import { test, expect } from "../fixtures"
import { openSidebar, waitTerminalReady, withSession } from "../actions"
import { sessionItemSelector, terminalSelector } from "../selectors"
import { terminalAttr } from "../../src/testing/terminal"

test("sidebar returns a linked session to its existing terminal surface", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `resume a ${Date.now()}`, async (a) => {
    await withSession(sdk, `resume b ${Date.now()}`, async (b) => {
      await gotoSession(a.id)

      const switchTerminal = page.locator('[data-action="session-switch-terminal"]').first()
      await expect(switchTerminal).toBeVisible()
      await switchTerminal.click()

      await waitTerminalReady(page)
      const first = await page.locator(`${terminalSelector}:visible`).first().getAttribute(terminalAttr)
      if (!first) throw new Error("Missing active terminal id")

      await openSidebar(page)
      await page.locator(sessionItemSelector(b.id)).last().click()
      await expect(page).toHaveURL(new RegExp(`/session/${b.id}(?:[?#]|$)`))
      await expect(page.locator('[data-action="session-switch-terminal"]').first()).toBeVisible()

      await page.locator(sessionItemSelector(a.id)).last().click()
      await expect(page).toHaveURL(new RegExp(`/session/${a.id}(?:[?#]|$)`))
      await expect(page.locator('[data-action="session-switch-chat"]').first()).toBeVisible()
      await waitTerminalReady(page)
      await expect(page.locator(`${terminalSelector}:visible`).first()).toHaveAttribute(terminalAttr, first)
    })
  })
})
