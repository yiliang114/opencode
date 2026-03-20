import { describe, expect, test } from "bun:test"
import { mkdir } from "fs/promises"
import path from "path"
import { Instance } from "../../src/project/instance"
import { listQwenSessions } from "../../src/qwen/list"
import { linkQwen } from "../../src/qwen/link"
import { QwenSync } from "../../src/qwen/sync"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

function chats(home: string, dir: string) {
  return path.join(home, ".qwen", "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"), "chats")
}

describe("linkQwen", () => {
  test("creates a linked opencode session for a raw qwen chat and reuses it for later sync", async () => {
    await using tmp = await tmpdir({})
    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      const dir = path.join(tmp.path, "repo")
      const id = "11111111-1111-4111-8111-111111111111"
      const file = path.join(chats(tmp.path, dir), `${id}.jsonl`)
      await mkdir(path.dirname(file), { recursive: true })
      await mkdir(dir, { recursive: true })
      await Bun.write(
        file,
        [
          JSON.stringify({
            uuid: "u1",
            parentUuid: null,
            sessionId: id,
            timestamp: "2026-03-20T00:00:00.000Z",
            type: "user",
            cwd: dir,
            message: { role: "user", parts: [{ text: "raw qwen prompt" }] },
          }),
          JSON.stringify({
            uuid: "a1",
            parentUuid: "u1",
            sessionId: id,
            timestamp: "2026-03-20T00:00:01.000Z",
            type: "assistant",
            cwd: dir,
            model: "qwen3-coder-plus",
            message: { role: "model", parts: [{ text: "raw qwen reply" }] },
          }),
        ].join("\n") + "\n",
      )

      await Instance.provide({
        directory: dir,
        fn: async () => {
          const session = await linkQwen({ dir, qwen: id })
          expect(session.id.startsWith("ses_")).toBe(true)
          expect(session.title).toBe("raw qwen prompt")

          const first = await Session.messages({ sessionID: session.id })
          expect(first.map((item) => item.info.role)).toEqual(["user", "assistant"])

          const list = await listQwenSessions({ dir, home: tmp.path })
          expect(list[0]?.sessionID).toBe(session.id)

          await expect(linkQwen({ dir, qwen: id })).resolves.toMatchObject({
            id: session.id,
          })

          await Bun.write(
            file,
            [
              await Bun.file(file).text(),
              JSON.stringify({
                uuid: "u2",
                parentUuid: "a1",
                sessionId: id,
                timestamp: "2026-03-20T00:00:02.000Z",
                type: "user",
                cwd: dir,
                message: { role: "user", parts: [{ text: "next raw qwen prompt" }] },
              }),
              JSON.stringify({
                uuid: "a2",
                parentUuid: "u2",
                sessionId: id,
                timestamp: "2026-03-20T00:00:03.000Z",
                type: "assistant",
                cwd: dir,
                model: "qwen3-coder-plus",
                message: { role: "model", parts: [{ text: "next raw qwen reply" }] },
              }),
            ].join("\n"),
          )

          await expect(QwenSync.run(session.id)).resolves.toEqual({
            imported: 2,
            total: 4,
          })
        },
      })
    } finally {
      if (home === undefined) delete process.env.OPENCODE_TEST_HOME
      else process.env.OPENCODE_TEST_HOME = home
    }
  })
})
