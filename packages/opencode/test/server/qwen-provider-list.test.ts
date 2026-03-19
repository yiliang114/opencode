import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("qwen provider endpoints", () => {
  test("reads project-local qwen models for provider and config routes", async () => {
    await using tmp = await tmpdir({})
    await mkdir(path.join(tmp.path, ".qwen"), { recursive: true })
    await Bun.write(
      path.join(tmp.path, ".qwen", "settings.json"),
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
    )

    await Instance.provide({
      directory: tmp.path,
      init: async () => {},
      fn: async () => {
        const app = Server.Default()
        const headers = {
          "x-opencode-directory": tmp.path,
        }

        const provider = await app.request("/provider", { headers })
        expect(provider.status).toBe(200)
        expect(await provider.json()).toMatchObject({
          all: [
            {
              id: "qwen",
              models: {
                "qwen3-coder-plus": {
                  id: "qwen3-coder-plus",
                  name: "Qwen 3 Coder Plus",
                },
                "qwen3.5-plus": {
                  id: "qwen3.5-plus",
                  name: "Qwen 3.5 Plus",
                },
              },
            },
          ],
          default: {
            qwen: "qwen3.5-plus",
          },
          connected: ["qwen"],
        })

        const config = await app.request("/config/providers", { headers })
        expect(config.status).toBe(200)
        expect(await config.json()).toMatchObject({
          providers: [
            {
              id: "qwen",
              models: {
                "qwen3-coder-plus": {
                  id: "qwen3-coder-plus",
                  name: "Qwen 3 Coder Plus",
                },
                "qwen3.5-plus": {
                  id: "qwen3.5-plus",
                  name: "Qwen 3.5 Plus",
                },
              },
            },
          ],
          default: {
            qwen: "qwen3.5-plus",
          },
        })
      },
    })
  })
})
