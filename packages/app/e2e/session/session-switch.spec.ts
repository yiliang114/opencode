import fs from "node:fs/promises"
import path from "node:path"
import { test, expect } from "../fixtures"
import { openSidebar, terminalConnects, waitTerminalReady, withSession } from "../actions"
import { sessionItemSelector, terminalSelector } from "../selectors"
import { qwenSessionID } from "../../../opencode/src/qwen/session"

async function seedMessage(sdk: Parameters<typeof withSession>[0], sessionID: string) {
  await sdk.session.promptAsync({
    sessionID,
    noReply: true,
    parts: [{ type: "text", text: "switch seed" }],
  })

  await expect
    .poll(
      async () => {
        const messages = await sdk.session.messages({ sessionID, limit: 1 }).then((r) => r.data ?? [])
        return messages.length
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0)
}

async function writeQwenChat(input: { directory: string; sessionID: string }) {
  const home = process.env.OPENCODE_TEST_HOME
  if (!home) throw new Error("OPENCODE_TEST_HOME is not set")
  const file = path.join(
    home,
    ".qwen",
    "projects",
    input.directory.replace(/[^a-zA-Z0-9]/g, "-"),
    "chats",
    `${qwenSessionID(input.sessionID)}.jsonl`,
  )
  const rows = [
    {
      uuid: "u1",
      parentUuid: null,
      sessionId: qwenSessionID(input.sessionID),
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "user",
      cwd: input.directory,
      version: "e2e",
      message: { role: "user", parts: [{ text: "switch seed" }] },
    },
    {
      uuid: "a1",
      parentUuid: "u1",
      sessionId: qwenSessionID(input.sessionID),
      timestamp: "2026-03-19T00:00:01.000Z",
      type: "assistant",
      cwd: input.directory,
      version: "e2e",
      model: "qwen3-coder-plus",
      message: { role: "model", parts: [{ text: "Imported from terminal" }] },
    },
  ]
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8")
}

test("session can switch between chat and terminal and sync qwen tail", async ({ page, sdk, gotoSession, directory }) => {
  await withSession(sdk, `e2e switch ${Date.now()}`, async (session) => {
    await seedMessage(sdk, session.id)
    await gotoSession(session.id)

    const switchTerminal = page.locator('[data-action="session-switch-terminal"]').first()
    await expect(switchTerminal).toBeVisible()
    await switchTerminal.click()

    await waitTerminalReady(page)
    const switchChat = page.locator('[data-action="session-switch-chat"]').first()
    await expect(switchChat).toBeVisible()

    await writeQwenChat({
      directory,
      sessionID: session.id,
    })

    await switchChat.click()
    await expect(switchTerminal).toBeVisible()

    await expect
      .poll(
        async () => {
          const messages = await sdk.session.messages({ sessionID: session.id, limit: 10 }).then((r) => r.data ?? [])
          return messages.some((item) => item.parts.some((part) => part.type === "text" && part.text.includes("Imported from terminal")))
        },
        { timeout: 30_000 },
      )
      .toBe(true)

    await expect(page.getByText("Imported from terminal")).toBeVisible()
  })
})

test("chat surface unmounts terminal clients when the drawer is closed", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `e2e unmount ${Date.now()}`, async (session) => {
    await seedMessage(sdk, session.id)
    await gotoSession(session.id)

    const switchTerminal = page.locator('[data-action="session-switch-terminal"]').first()
    await expect(switchTerminal).toBeVisible()
    await switchTerminal.click()
    await waitTerminalReady(page)

    const switchChat = page.locator('[data-action="session-switch-chat"]').first()
    await expect(switchChat).toBeVisible()
    await switchChat.click()

    await expect(page.locator(`${terminalSelector}:visible`)).toHaveCount(0)
  })
})

test("switching between terminal sessions keeps a single visible terminal client mounted", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `e2e terminal a ${Date.now()}`, async (a) => {
    await withSession(sdk, `e2e terminal b ${Date.now()}`, async (b) => {
      await seedMessage(sdk, a.id)
      await seedMessage(sdk, b.id)

      await gotoSession(a.id)
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)
      await expect(page.locator(`${terminalSelector}:visible`)).toHaveCount(1)

      await openSidebar(page)
      await page.locator(sessionItemSelector(b.id)).last().click()
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)
      await expect(page.locator(`${terminalSelector}:visible`)).toHaveCount(1)

      await openSidebar(page)
      await page.locator(sessionItemSelector(a.id)).last().click()
      await waitTerminalReady(page)
      await expect(page.locator(`${terminalSelector}:visible`)).toHaveCount(1)
    })
  })
})

test("switching between terminal sessions keeps a single terminal render layer in the document", async ({
  page,
  sdk,
  gotoSession,
}) => {
  await withSession(sdk, `e2e terminal layers a ${Date.now()}`, async (a) => {
    await withSession(sdk, `e2e terminal layers b ${Date.now()}`, async (b) => {
      await seedMessage(sdk, a.id)
      await seedMessage(sdk, b.id)

      await gotoSession(a.id)
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)

      await openSidebar(page)
      await page.locator(sessionItemSelector(b.id)).last().click()
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)

      await expect
        .poll(async () =>
          page.evaluate(() => ({
            terminals: Array.from(
              document.querySelectorAll('#terminal-panel[aria-hidden="false"] [data-component="terminal"]'),
            ).filter((item) => (item as HTMLElement).offsetParent !== null).length,
            wrappers: Array.from(document.querySelectorAll('#terminal-panel[aria-hidden="false"] [id^="terminal-wrapper-"]')).filter(
              (item) => !(item as HTMLElement).classList.contains('hidden'),
            ).length,
            canvases: Array.from(
              document.querySelectorAll('#terminal-panel[aria-hidden="false"] [data-component="terminal"] canvas'),
            ).filter((item) => (item as HTMLElement).offsetParent !== null).length,
            textareas: Array.from(
              document.querySelectorAll('#terminal-panel[aria-hidden="false"] [data-component="terminal"] textarea'),
            ).filter((item) => (item as HTMLElement).offsetParent !== null).length,
          })),
        )
        .toEqual({
          terminals: 1,
          wrappers: 1,
          canvases: 1,
          textareas: 1,
        })
    })
  })
})

test("switching back to an existing terminal session does not reconnect its client", async ({ page, sdk, gotoSession }) => {
  await withSession(sdk, `e2e terminal reconnect a ${Date.now()}`, async (a) => {
    await withSession(sdk, `e2e terminal reconnect b ${Date.now()}`, async (b) => {
      await seedMessage(sdk, a.id)
      await seedMessage(sdk, b.id)

      await gotoSession(a.id)
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)
      const aTerm = page.locator(`${terminalSelector}:visible`).first()
      await expect.poll(() => terminalConnects(page, { term: aTerm })).toBe(1)

      await openSidebar(page)
      await page.locator(sessionItemSelector(b.id)).last().click()
      await page.locator('[data-action="session-switch-terminal"]').first().click()
      await waitTerminalReady(page)
      const bTerm = page.locator(`${terminalSelector}:visible`).first()
      await expect.poll(() => terminalConnects(page, { term: bTerm })).toBe(1)

      await openSidebar(page)
      await page.locator(sessionItemSelector(a.id)).last().click()
      await waitTerminalReady(page)
      await expect.poll(() => terminalConnects(page, { term: page.locator(`${terminalSelector}:visible`).first() })).toBe(1)
    })
  })
})
