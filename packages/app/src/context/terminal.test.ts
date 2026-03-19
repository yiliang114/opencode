import { beforeAll, describe, expect, mock, test } from "bun:test"

let getWorkspaceTerminalCacheKey: (dir: string) => string
let getLegacyTerminalStorageKeys: (dir: string, legacySessionID?: string) => string[]
let migrateTerminalState: (value: unknown) => unknown
let terminalInput: (input: {
  dir: string
  cwd?: string
  number: number
  session?: string
}) => {
  title: string
  command: string
  cwd: string
  env?: Record<string, string>
}
let qwenInput: (dir: string, number: number, session?: string) => {
  title: string
  command: string
  cwd: string
  env?: Record<string, string>
}

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => ({}),
  }))
  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: () => ({
      use: () => undefined,
      provider: () => undefined,
    }),
  }))
  const mod = await import("./terminal")
  getWorkspaceTerminalCacheKey = mod.getWorkspaceTerminalCacheKey
  getLegacyTerminalStorageKeys = mod.getLegacyTerminalStorageKeys
  migrateTerminalState = mod.migrateTerminalState
  terminalInput = mod.terminalInput
  qwenInput = mod.qwenInput
})

describe("getWorkspaceTerminalCacheKey", () => {
  test("uses workspace-only directory cache key", () => {
    expect(getWorkspaceTerminalCacheKey("/repo")).toBe("/repo:__workspace__")
  })
})

describe("getLegacyTerminalStorageKeys", () => {
  test("keeps workspace storage path when no legacy session id", () => {
    expect(getLegacyTerminalStorageKeys("/repo")).toEqual(["/repo/terminal.v1"])
  })

  test("includes legacy session path before workspace path", () => {
    expect(getLegacyTerminalStorageKeys("/repo", "session-123")).toEqual([
      "/repo/terminal/session-123.v1",
      "/repo/terminal.v1",
    ])
  })
})

describe("migrateTerminalState", () => {
  test("drops invalid terminals and restores a valid active terminal", () => {
    expect(
      migrateTerminalState({
        active: "missing",
        all: [
          null,
          { id: "one", title: "Terminal 2" },
          { id: "one", title: "duplicate", titleNumber: 9 },
          { id: "two", title: "logs", titleNumber: 4, rows: 24, cols: 80 },
          { title: "no-id" },
        ],
      }),
    ).toEqual({
      active: "one",
      all: [
        { id: "one", title: "Terminal 2", titleNumber: 2 },
        { id: "two", title: "logs", titleNumber: 4, rows: 24, cols: 80 },
      ],
    })
  })

  test("keeps a valid active id", () => {
    expect(
      migrateTerminalState({
        active: "two",
        all: [
          { id: "one", title: "Terminal 1" },
          { id: "two", title: "shell", titleNumber: 7 },
        ],
      }),
    ).toEqual({
      active: "two",
      all: [
        { id: "one", title: "Terminal 1", titleNumber: 1 },
        { id: "two", title: "shell", titleNumber: 7 },
      ],
    })
  })
})

describe("qwenInput", () => {
  test("creates a qwen terminal payload without session bridge by default", () => {
    expect(qwenInput("/repo", 2)).toEqual({
      title: "Qwen 2",
      command: "qwen",
      cwd: "/repo",
    })
  })

  test("includes the current session id for qwen bridge", () => {
    expect(qwenInput("/repo", 3, "ses_123")).toEqual({
      title: "Qwen 3",
      command: "qwen",
      cwd: "/repo",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
    })
  })
})

describe("terminalInput", () => {
  test("prefers the resolved sdk directory over the route slug", () => {
    expect(
      terminalInput({
        dir: "L3JvdXRlLXNsdWc",
        cwd: "/repo",
        number: 4,
        session: "ses_123",
      }),
    ).toEqual({
      title: "Qwen 4",
      command: "qwen",
      cwd: "/repo",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
    })
  })

  test("falls back to the route directory when no resolved path is available", () => {
    expect(
      terminalInput({
        dir: "/repo",
        number: 1,
      }),
    ).toEqual({
      title: "Qwen 1",
      command: "qwen",
      cwd: "/repo",
    })
  })
})
