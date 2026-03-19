import { expect, test } from "bun:test"
import { Pty } from "../../src/pty"

test("ptyEnv - prepares qwen terminal env", () => {
  expect(
    Pty.ptyEnv({
      command: "qwen",
      base: {
        NO_COLOR: "1",
        PATH: "/usr/bin",
      },
    }),
  ).toEqual({
    FORCE_COLOR: "1",
    NODE_NO_WARNINGS: "1",
    PATH: "/usr/bin",
    TERM: "xterm-256color",
    OPENCODE_TERMINAL: "1",
  })
})

test("ptyEnv - removes NO_COLOR for shell terminals", () => {
  expect(
    Pty.ptyEnv({
      command: "zsh",
      base: {
        NO_COLOR: "1",
        PATH: "/usr/bin",
      },
    }),
  ).toEqual({
    PATH: "/usr/bin",
    TERM: "xterm-256color",
    OPENCODE_TERMINAL: "1",
  })
})
