import { describe, expect, test } from "bun:test"
import { qwenAssistantState, qwenTail } from "../../src/qwen/sync"

describe("qwenTail", () => {
  test("skips the already mirrored user and assistant prefix", () => {
    expect(
      qwenTail({
        items: [
          { uuid: "u1", timestamp: "2026-03-19T00:00:00.000Z", type: "user" },
          { uuid: "a1", timestamp: "2026-03-19T00:00:01.000Z", type: "assistant" },
          { uuid: "u2", timestamp: "2026-03-19T00:00:02.000Z", type: "user" },
          { uuid: "a2", timestamp: "2026-03-19T00:00:03.000Z", type: "assistant" },
        ],
        existing: [{ role: "user" }, { role: "assistant" }],
      }).map((item) => item.uuid),
    ).toEqual(["u2", "a2"])
  })

  test("stops prefix matching at the first role mismatch", () => {
    expect(
      qwenTail({
        items: [
          { uuid: "u1", timestamp: "2026-03-19T00:00:00.000Z", type: "user" },
          { uuid: "a1", timestamp: "2026-03-19T00:00:01.000Z", type: "assistant" },
        ],
        existing: [{ role: "assistant" }],
      }).map((item) => item.uuid),
    ).toEqual(["u1", "a1"])
  })
})

describe("qwenAssistantState", () => {
  test("collects reasoning text, final text, and completed tool output", () => {
    expect(
      qwenAssistantState({
        item: {
          uuid: "a2",
          timestamp: "2026-03-19T00:00:03.000Z",
          type: "assistant",
          message: {
            parts: [
              { thought: true, text: "Need to inspect the repo." },
              { functionCall: { id: "call-1", name: "run_shell_command", args: { command: "pwd" } } },
              { text: "The command finished." },
            ],
          },
        },
        tools: [
          {
            uuid: "t1",
            timestamp: "2026-03-19T00:00:03.100Z",
            type: "tool_result",
            message: {
              parts: [
                {
                  functionResponse: {
                    id: "call-1",
                    name: "run_shell_command",
                    response: { output: "/repo" },
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual({
      text: ["The command finished."],
      reasoning: ["Need to inspect the repo."],
      tools: [
        {
          callID: "call-1",
          tool: "run_shell_command",
          input: { command: "pwd" },
          output: "/repo",
        },
      ],
    })
  })

  test("ignores unmatched tool results", () => {
    expect(
      qwenAssistantState({
        item: {
          uuid: "a2",
          timestamp: "2026-03-19T00:00:03.000Z",
          type: "assistant",
          message: {
            parts: [{ functionCall: { name: "read_file", args: { path: "README.md" } } }],
          },
        },
        tools: [
          {
            uuid: "t1",
            timestamp: "2026-03-19T00:00:03.100Z",
            type: "tool_result",
            message: {
              parts: [
                {
                  functionResponse: {
                    id: "other",
                    name: "run_shell_command",
                    response: { output: "/repo" },
                  },
                },
              ],
            },
          },
        ],
      }).tools,
    ).toEqual([])
  })
})
