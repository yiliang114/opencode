import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { listQwenSessions } from "../../src/qwen/list"
import { tmpdir } from "../fixture/fixture"

describe("listQwenSessions", () => {
  test("returns an empty list when the workspace has no qwen chats", async () => {
    await using tmp = await tmpdir({})
    await expect(
      listQwenSessions({
        dir: path.join(tmp.path, "repo"),
        home: tmp.path,
      }),
    ).resolves.toEqual([])
  })

  test("reads workspace qwen chats and sorts them by last update", async () => {
    await using tmp = await tmpdir({})
    const dir = path.join(tmp.path, "repo")
    const chats = path.join(tmp.path, ".qwen", "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"), "chats")
    await mkdir(chats, { recursive: true })

    await Bun.write(
      path.join(chats, "11111111-1111-4111-8111-111111111111.jsonl"),
      [
        JSON.stringify({
          uuid: "u1",
          timestamp: "2026-03-20T00:00:00.000Z",
          type: "user",
          cwd: dir,
          message: { parts: [{ text: "first prompt" }] },
        }),
        JSON.stringify({
          uuid: "a1",
          timestamp: "2026-03-20T00:01:00.000Z",
          type: "assistant",
          cwd: dir,
          message: { parts: [{ text: "first reply" }] },
        }),
      ].join("\n") + "\n",
    )

    await Bun.write(
      path.join(chats, "22222222-2222-4222-8222-222222222222.jsonl"),
      [
        JSON.stringify({
          uuid: "u2",
          timestamp: "2026-03-20T00:02:00.000Z",
          type: "user",
          cwd: dir,
          message: { parts: [{ text: "second prompt" }] },
        }),
        JSON.stringify({
          uuid: "a2",
          timestamp: "2026-03-20T00:03:00.000Z",
          type: "assistant",
          cwd: dir,
          message: { parts: [{ text: "second reply" }] },
        }),
      ].join("\n") + "\n",
    )

    await expect(
      listQwenSessions({
        dir,
        home: tmp.path,
      }),
    ).resolves.toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        sessionID: undefined,
        title: "second prompt",
        cwd: dir,
        start: Date.parse("2026-03-20T00:02:00.000Z"),
        updated: Date.parse("2026-03-20T00:03:00.000Z"),
        messageCount: 2,
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        sessionID: undefined,
        title: "first prompt",
        cwd: dir,
        start: Date.parse("2026-03-20T00:00:00.000Z"),
        updated: Date.parse("2026-03-20T00:01:00.000Z"),
        messageCount: 2,
      },
    ])
  })
})
