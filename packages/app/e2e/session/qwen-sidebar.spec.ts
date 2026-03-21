import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test, expect } from "../fixtures"
import { openSidebar } from "../actions"

function project(dir: string) {
  return dir.replace(/[^a-zA-Z0-9]/g, "-")
}

test("raw qwen sidebar sessions open in terminal mode", async ({ page, withProject }) => {
  await withProject(async ({ directory, gotoSession }) => {
    const id = `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`
    const prompt = `e2e raw qwen ${Date.now()}`
    const home = process.env.OPENCODE_TEST_HOME ?? os.homedir()
    const file = path.join(home, ".qwen", "projects", project(directory), "chats", `${id}.jsonl`)

    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      [
        JSON.stringify({
          uuid: "u1",
          parentUuid: null,
          sessionId: id,
          timestamp: "2026-03-20T00:00:00.000Z",
          type: "user",
          cwd: directory,
          version: "e2e",
          message: { role: "user", parts: [{ text: prompt }] },
        }),
        JSON.stringify({
          uuid: "a1",
          parentUuid: "u1",
          sessionId: id,
          timestamp: "2026-03-20T00:00:01.000Z",
          type: "assistant",
          cwd: directory,
          version: "e2e",
          model: "qwen3-coder-plus",
          message: { role: "model", parts: [{ text: "raw qwen sidebar seed" }] },
        }),
      ].join("\n") + "\n",
      "utf8",
    )

    try {
      await gotoSession()
      await openSidebar(page)

      const item = page.getByRole("button", { name: new RegExp(prompt) }).first()
      await expect(item).toBeVisible({ timeout: 15_000 })
      await item.click()

      await expect(page).toHaveURL(new RegExp(`/session/ses_[^?]+\\?qwen=${id}(?:&|$)`))
      await expect(page.getByText("raw qwen sidebar seed")).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-action="session-switch-terminal"]')).toBeVisible({ timeout: 15_000 })
    } finally {
      await fs.rm(file, { force: true })
    }
  })
})
