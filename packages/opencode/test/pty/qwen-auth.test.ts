import { beforeAll, describe, expect, mock, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { qwenAuthArgs } from "../../src/qwen/auth"

let Pty: typeof import("../../src/pty").Pty

mock.module("bun-pty", () => ({
  spawn: (_cmd: string, _args: string[], _opts: Record<string, unknown>) => ({
    pid: 123,
    onData: () => undefined,
    onExit: () => undefined,
    kill: () => undefined,
    resize: () => undefined,
    write: () => undefined,
  }),
}))

beforeAll(async () => {
  Pty = (await import("../../src/pty")).Pty
})

describe("pty", () => {
  test("infers qwen openai auth from global settings when no auth is selected", async () => {
    await using dir = await tmpdir({ git: true })
    const root = path.join(dir.path, ".qwen")
    await mkdir(root, { recursive: true })
    await Bun.write(
      path.join(root, "settings.json"),
      JSON.stringify({
        model: {
          name: "qwen3.5-plus",
        },
        security: {
          auth: {},
        },
        modelProviders: {
          openai: [
            {
              id: "qwen3.5-plus",
              envKey: "QWEN_BAILIAN_AUTH_TOKEN",
              baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
            },
          ],
        },
      }),
    )

    const prev = process.env.HOME
    process.env.HOME = dir.path

    try {
      expect(
        await qwenAuthArgs({
          home: dir.path,
          env: {},
        }),
      ).toEqual(["--auth-type", "openai"])

      await Instance.provide({
        directory: dir.path,
        fn: async () => {
          const info = await Pty.create({
            command: "qwen",
            cwd: dir.path,
            title: "Qwen 1",
          })

          expect(info.args).toEqual(["--auth-type", "openai"])
          await Pty.remove(info.id)
        },
      })
    } finally {
      if (prev) process.env.HOME = prev
      else delete process.env.HOME
    }
  })
})
