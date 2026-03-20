import fs from "node:fs/promises"
import path from "node:path"
import { test, expect } from "@playwright/test"
import { cleanupTestProject, createTestProject, seedProjects } from "../actions"
import { promptModelSelector, promptSelector } from "../selectors"
import { sessionPath } from "../utils"

test("project-local qwen models appear in the web model selector", async ({ page }) => {
  const dir = await createTestProject()
  await fs.mkdir(path.join(dir, ".qwen"), { recursive: true })
  await fs.writeFile(
    path.join(dir, ".qwen", "settings.json"),
    JSON.stringify({
      modelProviders: {
        openai: [
          { id: "qwen3-coder-plus", name: "Qwen 3 Coder Plus" },
          { id: "qwen3.5-plus", name: "Qwen 3.5 Plus" },
        ],
      },
      model: {
        name: "qwen3.5-plus",
      },
    }),
    "utf8",
  )

  try {
    await seedProjects(page, { directory: dir })
    await page.addInitScript(() => {
      const win = window as Window & {
        __opencode_e2e?: {
          model?: { enabled?: boolean }
          prompt?: { enabled?: boolean }
          terminal?: { enabled?: boolean; terminals?: Record<string, unknown> }
        }
      }
      win.__opencode_e2e = {
        ...win.__opencode_e2e,
        model: {
          enabled: true,
        },
        prompt: {
          enabled: true,
        },
        terminal: {
          enabled: true,
          terminals: {},
        },
      }
      localStorage.setItem(
        "opencode.global.dat:model",
        JSON.stringify({
          recent: [{ providerID: "opencode", modelID: "big-pickle" }],
          user: [],
          variant: {},
        }),
      )
    })

    await page.goto(sessionPath(dir))
    await expect(page.locator(promptSelector)).toBeVisible()
    await expect
      .poll(async () => ((await page.locator(`${promptModelSelector} [data-action="prompt-model"] span`).textContent()) ?? "").trim(), {
        timeout: 30_000,
      })
      .toBe("Qwen 3.5 Plus")

    await page.locator(`${promptModelSelector} [data-action="prompt-model"]`).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Qwen 3 Coder Plus")).toBeVisible()
    await expect(dialog.getByText("Qwen 3.5 Plus")).toBeVisible()
  } finally {
    await cleanupTestProject(dir)
  }
})
