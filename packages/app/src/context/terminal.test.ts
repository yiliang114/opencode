import { beforeAll, describe, expect, mock, test } from "bun:test"

let getWorkspaceTerminalCacheKey: (dir: string) => string
let getLegacyTerminalStorageKeys: (dir: string, legacySessionID?: string) => string[]
let migrateTerminalState: (value: unknown) => unknown
let cloneTerminal: (input: {
  id: string
  title: string
  titleNumber: number
  session?: string
  qwen?: string
  buffer?: string
  cursor?: number
  scrollY?: number
  rows?: number
  cols?: number
}, next: { id: string; title?: string }) => {
  id: string
  title: string
  titleNumber: number
  session?: string
  qwen?: string
  buffer?: string
  cursor?: number
  scrollY?: number
  rows?: number
  cols?: number
}
let findSessionTerminal: (
  all: Array<{ id: string; session?: string }>,
  session?: string,
) => { id: string; session?: string } | undefined
let findQwenTerminal: (
  all: Array<{ id: string; qwen?: string }>,
  qwen?: string,
) => { id: string; qwen?: string } | undefined
let terminalInput: (input: {
  dir: string
  cwd?: string
  sessionDir?: string
  number: number
  session?: string
  link?: boolean
  qwen?: string
  size?: {
    cols: number
    rows: number
  }
}) => {
  title: string
  cwd: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  size?: {
    cols: number
    rows: number
  }
}
let shellInput: (
  dir: string,
  number: number,
  size?: {
    cols: number
    rows: number
  },
) => {
  title: string
  cwd: string
  size?: {
    cols: number
    rows: number
  }
}
let qwenInput: (input: {
  dir: string
  number: number
  session?: string
  qwen?: string
  size?: {
    cols: number
    rows: number
  }
}) => {
  title: string
  command: string
  cwd: string
  args?: string[]
  env?: Record<string, string>
  size?: {
    cols: number
    rows: number
  }
}
let ptySession: (session?: string, reuse?: boolean) => string | undefined

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
  cloneTerminal = mod.cloneTerminal
  findSessionTerminal = mod.findSessionTerminal
  findQwenTerminal = mod.findQwenTerminal
  terminalInput = mod.terminalInput
  shellInput = mod.shellInput
  qwenInput = mod.qwenInput
  ptySession = mod.ptySession
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

describe("cloneTerminal", () => {
  test("preserves session and qwen bindings while clearing transient buffer state", () => {
    expect(
      cloneTerminal(
        {
          id: "pty_old",
          title: "Qwen 2",
          titleNumber: 2,
          session: "ses_123",
          qwen: "qwen_123",
          buffer: "restored",
          cursor: 10,
          scrollY: 3,
          rows: 24,
          cols: 80,
        },
        {
          id: "pty_new",
          title: "Qwen 2",
        },
      ),
    ).toEqual({
      id: "pty_new",
      title: "Qwen 2",
      titleNumber: 2,
      session: "ses_123",
      qwen: "qwen_123",
      buffer: undefined,
      cursor: undefined,
      scrollY: undefined,
      rows: undefined,
      cols: undefined,
    })
  })
})

describe("shellInput", () => {
  test("creates a plain shell terminal payload", () => {
    expect(shellInput("/repo", 2)).toEqual({
      title: "Terminal 2",
      cwd: "/repo",
    })
  })

  test("includes an initial size when provided", () => {
    expect(
      shellInput("/repo", 2, {
        cols: 120,
        rows: 32,
      }),
    ).toEqual({
      title: "Terminal 2",
      cwd: "/repo",
      size: {
        cols: 120,
        rows: 32,
      },
    })
  })
})

describe("qwenInput", () => {
  test("creates a qwen terminal payload without session bridge by default", () => {
    expect(
      qwenInput({
        dir: "/repo",
        number: 2,
      }),
    ).toEqual({
      title: "Qwen 2",
      command: "qwen",
      cwd: "/repo",
    })
  })

  test("includes the current session id for qwen bridge", () => {
    expect(
      qwenInput({
        dir: "/repo",
        number: 3,
        session: "ses_123",
      }),
    ).toEqual({
      title: "Qwen 3",
      command: "qwen",
      cwd: "/repo",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
    })
  })

  test("resumes a raw qwen session id without the opencode bridge", () => {
    expect(
      qwenInput({
        dir: "/repo",
        number: 4,
        qwen: "qwen_123",
      }),
    ).toEqual({
      title: "Qwen 4",
      command: "qwen",
      cwd: "/repo",
      args: ["--resume", "qwen_123"],
    })
  })

  test("passes through an initial size when provided", () => {
    expect(
      qwenInput({
        dir: "/repo",
        number: 4,
        session: "ses_123",
        size: {
          cols: 96,
          rows: 28,
        },
      }),
    ).toEqual({
      title: "Qwen 4",
      command: "qwen",
      cwd: "/repo",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
      size: {
        cols: 96,
        rows: 28,
      },
    })
  })
})

describe("ptySession", () => {
  test("does not bind a session for fresh terminals", () => {
    expect(ptySession("ses_123")).toBeUndefined()
  })

  test("reuses the session only for explicit resume flows", () => {
    expect(ptySession("ses_123", true)).toBe("ses_123")
  })
})

describe("findSessionTerminal", () => {
  test("returns the matching terminal for the current session", () => {
    expect(
      findSessionTerminal(
        [
          { id: "pty_1", session: "ses_a" },
          { id: "pty_2", session: "ses_b" },
        ],
        "ses_b",
      ),
    ).toEqual({ id: "pty_2", session: "ses_b" })
  })

  test("returns undefined when no session-bound terminal exists", () => {
    expect(findSessionTerminal([{ id: "pty_1", session: "ses_a" }], "ses_c")).toBeUndefined()
  })
})

describe("findQwenTerminal", () => {
  test("returns the matching terminal for a qwen session id", () => {
    expect(
      findQwenTerminal(
        [
          { id: "pty_1", qwen: "qwen_a" },
          { id: "pty_2", qwen: "qwen_b" },
        ],
        "qwen_b",
      ),
    ).toEqual({ id: "pty_2", qwen: "qwen_b" })
  })

  test("returns undefined when no qwen-bound terminal exists", () => {
    expect(findQwenTerminal([{ id: "pty_1", qwen: "qwen_a" }], "qwen_c")).toBeUndefined()
  })
})

describe("terminalInput", () => {
  test("creates an independent terminal by default", () => {
    expect(
      terminalInput({
        dir: "L3JvdXRlLXNsdWc",
        cwd: "/repo",
        number: 4,
        session: "ses_123",
      }),
    ).toEqual({
      title: "Terminal 4",
      cwd: "/repo",
    })
  })

  test("prefers the session directory for resume flows", () => {
    expect(
      terminalInput({
        dir: "/repo",
        cwd: "/repo",
        sessionDir: "/repo/.worktrees/feature",
        number: 4,
        session: "ses_123",
        link: true,
      }),
    ).toEqual({
      title: "Qwen 4",
      command: "qwen",
      cwd: "/repo/.worktrees/feature",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
    })
  })

  test("resumes a raw qwen session when requested", () => {
    expect(
      terminalInput({
        dir: "/repo",
        cwd: "/repo",
        number: 5,
        qwen: "qwen_123",
      }),
    ).toEqual({
      title: "Qwen 5",
      command: "qwen",
      cwd: "/repo",
      args: ["--resume", "qwen_123"],
    })
  })

  test("links the current session when requested", () => {
    expect(
      terminalInput({
        dir: "/repo",
        cwd: "/repo",
        number: 3,
        session: "ses_123",
        link: true,
      }),
    ).toEqual({
      title: "Qwen 3",
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
      title: "Terminal 1",
      cwd: "/repo",
    })
  })

  test("passes an initial size through to linked qwen terminals", () => {
    expect(
      terminalInput({
        dir: "/repo",
        cwd: "/repo",
        number: 3,
        session: "ses_123",
        link: true,
        size: {
          cols: 110,
          rows: 30,
        },
      }),
    ).toEqual({
      title: "Qwen 3",
      command: "qwen",
      cwd: "/repo",
      env: {
        OPENCODE_SESSION_ID: "ses_123",
      },
      size: {
        cols: 110,
        rows: 30,
      },
    })
  })
})
