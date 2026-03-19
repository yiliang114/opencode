import { expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { qwenHome, qwenSessionArgs, qwenSessionID } from "../../src/qwen/session"

const project = (dir: string) => dir.replace(/[^a-zA-Z0-9]/g, "-")

test("qwenSessionArgs - starts a new session when no saved chat exists", async () => {
  await using tmp = await tmpdir({})
  expect(
    await qwenSessionArgs({
      dir: path.join(tmp.path, "repo"),
      id: "ses_test",
      home: tmp.path,
    }),
  ).toEqual(["--session-id", qwenSessionID("ses_test")])
})

test("qwenSessionArgs - resumes a saved session in the same project", async () => {
  await using tmp = await tmpdir({})
  const dir = path.join(tmp.path, "repo")
  const id = qwenSessionID("ses_test")
  const file = path.join(tmp.path, ".qwen", "projects", project(dir), "chats", `${id}.jsonl`)
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, `${JSON.stringify({ cwd: dir })}\n`)

  expect(
    await qwenSessionArgs({
      dir,
      id: "ses_test",
      home: tmp.path,
    }),
  ).toEqual(["--resume", id])
})

test("qwenSessionArgs - starts a new session when saved chat belongs to another project", async () => {
  await using tmp = await tmpdir({})
  const dir = path.join(tmp.path, "repo")
  const id = qwenSessionID("ses_test")
  const file = path.join(tmp.path, ".qwen", "projects", project(dir), "chats", `${id}.jsonl`)
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, `${JSON.stringify({ cwd: path.join(tmp.path, "other") })}\n`)

  expect(
    await qwenSessionArgs({
      dir,
      id: "ses_test",
      home: tmp.path,
    }),
  ).toEqual(["--session-id", id])
})

test("qwenHome - prefers OPENCODE_TEST_HOME over HOME", () => {
  const test = process.env.OPENCODE_TEST_HOME
  const home = process.env.HOME
  process.env.OPENCODE_TEST_HOME = "/tmp/qwen-test-home"
  process.env.HOME = "/tmp/qwen-home"

  expect(qwenHome()).toBe("/tmp/qwen-test-home")

  if (test === undefined) delete process.env.OPENCODE_TEST_HOME
  else process.env.OPENCODE_TEST_HOME = test
  if (home === undefined) delete process.env.HOME
  else process.env.HOME = home
})
