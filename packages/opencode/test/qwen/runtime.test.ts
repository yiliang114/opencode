import { expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { qwenCommand, qwenRunArgs, qwenSessionID, qwenWait } from "../../src/qwen/runtime"

test("qwenSessionID - creates a stable RFC4122 uuid", () => {
  const id = qwenSessionID("ses_test")
  expect(id).toBe(qwenSessionID("ses_test"))
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test("qwenCommand - prefers global qwen when available", async () => {
  const cmd = qwenCommand("/tmp/bun", {
    which: () => "/tmp/qwen",
  })

  expect(cmd.command).toBe("/tmp/qwen")
  expect(cmd.args).toEqual([])
})

test("qwenCommand - falls back to built cli when global qwen is missing", async () => {
  await using tmp = await tmpdir({})
  const file = path.join(tmp.path, "dist", "cli.js")
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, "")
  const cmd = qwenCommand("/tmp/bun", {
    dist: file,
    which: () => null,
  })
  expect(cmd.command).toBe("node")
  expect(cmd.args).toEqual([file])
})

test("qwenRunArgs - resumes existing qwen sessions", async () => {
  await using tmp = await tmpdir({})
  const dir = path.join(tmp.path, "project")
  const sid = qwenSessionID("ses_test")
  const file = path.join(
    tmp.path,
    ".qwen",
    "projects",
    dir.replace(/[^a-zA-Z0-9]/g, "-"),
    "chats",
    `${sid}.jsonl`,
  )
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, JSON.stringify({ cwd: dir }) + "\n")

  expect(
    await qwenRunArgs({
      dir,
      id: "ses_test",
      model: "qwen3.5-plus",
      mode: "default",
      home: tmp.path,
    }),
  ).toEqual([
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--channel",
    "SDK",
    "--approval-mode",
    "default",
    "--resume",
    sid,
    "--model",
    "qwen3.5-plus",
  ])
})

test("qwenRunArgs - keeps the requested approval mode", async () => {
  expect(
    await qwenRunArgs({
      dir: "/repo",
      id: "ses_test",
      model: "qwen3.5-plus",
      mode: "plan",
    }),
  ).toEqual([
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--channel",
    "SDK",
    "--approval-mode",
    "plan",
    "--session-id",
    qwenSessionID("ses_test"),
    "--model",
    "qwen3.5-plus",
  ])
})

test("qwenWait - resolves when result arrives before process exit", async () => {
  let done = () => {}
  const wait = qwenWait({
    done: new Promise<void>((resolve) => {
      done = resolve
    }),
    exit: new Promise<void>(() => {}),
  })
  done()
  await expect(wait).resolves.toBeUndefined()
})

test("qwenWait - rejects when process exits before result", async () => {
  let fail = (_: Error) => {}
  const wait = qwenWait({
    done: new Promise<void>(() => {}),
    exit: new Promise<void>((_, reject) => {
      fail = reject
    }),
  })
  fail(new Error("exit"))
  await expect(wait).rejects.toThrow("exit")
})
