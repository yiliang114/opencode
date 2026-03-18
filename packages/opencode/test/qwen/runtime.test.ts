import { expect, test } from "bun:test"
import { qwenCommand, qwenSessionID, qwenWait } from "../../src/qwen/runtime"

test("qwenSessionID - creates a stable RFC4122 uuid", () => {
  const id = qwenSessionID("ses_test")
  expect(id).toBe(qwenSessionID("ses_test"))
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test("qwenCommand - prefers node when current runtime is bun", () => {
  const cmd = qwenCommand("/tmp/bun")
  expect(cmd.command).toBe("node")
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
