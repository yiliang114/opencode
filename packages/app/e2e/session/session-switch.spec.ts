import fs from "node:fs/promises"
import path from "node:path"
import { test, expect } from "../fixtures"
import { waitTerminalReady, withSession } from "../actions"
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
