import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { QwenSync, qwenAssistantState, qwenChatFile, qwenTail } from "../../src/qwen/sync"
import { tmpdir } from "../fixture/fixture"
import { Log } from "../../src/util/log"

Log.init({ print: false })

const provider = ProviderID.make("qwen")
const model = ModelID.make("coder-model")

async function seed(input: {
  sessionID: SessionID
  role: "user" | "assistant"
  text: string
  parentID?: MessageID
  time: number
}) {
  const id = MessageID.ascending()
  const msg =
    input.role === "assistant"
      ? ({
          id,
          sessionID: input.sessionID,
          parentID: input.parentID!,
          role: "assistant",
          time: {
            created: input.time,
            completed: input.time,
          },
          agent: "default",
          providerID: provider,
          modelID: model,
          mode: "default",
          path: {
            cwd: process.cwd(),
            root: process.cwd(),
          },
          cost: 0,
          tokens: {
            total: 0,
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
          finish: "stop",
        } satisfies MessageV2.Assistant)
      : ({
          id,
          sessionID: input.sessionID,
          role: "user",
          time: {
            created: input.time,
          },
          agent: "default",
          model: {
            providerID: provider,
            modelID: model,
          },
        } satisfies MessageV2.User)
  await Session.updateMessage(msg)
  await Session.updatePart({
    id: PartID.ascending(),
    sessionID: input.sessionID,
    messageID: id,
    type: "text",
    text: input.text,
  })
  return id
}

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

describe("QwenSync.run", () => {
  test("ignores missing and empty qwen chat files", async () => {
    await using tmp = await tmpdir({})
    const test = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      const dir = path.join(tmp.path, "repo")
      await mkdir(dir, { recursive: true })
      await Instance.provide({
        directory: dir,
        fn: async () => {
          const session = await Session.create({})
          await expect(QwenSync.run(session.id)).resolves.toEqual({
            imported: 0,
            total: 0,
          })

          const file = qwenChatFile({
            dir: session.directory,
            id: session.id,
            home: tmp.path,
          })
          await mkdir(path.dirname(file), { recursive: true })
          await Bun.write(file, "")

          await expect(QwenSync.run(session.id)).resolves.toEqual({
            imported: 0,
            total: 0,
          })
        },
      })
    } finally {
      if (test === undefined) delete process.env.OPENCODE_TEST_HOME
      else process.env.OPENCODE_TEST_HOME = test
    }
  })

  test("imports only the unsynced qwen tail into the current session", async () => {
    await using tmp = await tmpdir({})
    const test = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      const dir = path.join(tmp.path, "repo")
      await mkdir(dir, { recursive: true })
      await Instance.provide({
        directory: dir,
        fn: async () => {
          const session = await Session.create({})
          const user = await seed({
            sessionID: session.id,
            role: "user",
            text: "hi",
            time: Date.parse("2026-03-19T00:00:00.000Z"),
          })
          await seed({
            sessionID: session.id,
            role: "assistant",
            text: "hello",
            parentID: user,
            time: Date.parse("2026-03-19T00:00:01.000Z"),
          })

          const file = qwenChatFile({
            dir: session.directory,
            id: session.id,
            home: tmp.path,
          })
          await mkdir(path.dirname(file), { recursive: true })
          await Bun.write(
            file,
            [
              JSON.stringify({
                uuid: "u1",
                parentUuid: null,
                sessionId: "qwen",
                timestamp: "2026-03-19T00:00:00.000Z",
                type: "user",
                cwd: session.directory,
                message: {
                  role: "user",
                  parts: [{ text: "hi" }],
                },
              }),
              JSON.stringify({
                uuid: "a1",
                parentUuid: "u1",
                sessionId: "qwen",
                timestamp: "2026-03-19T00:00:01.000Z",
                type: "assistant",
                cwd: session.directory,
                model: "qwen3.5-plus",
                usageMetadata: { totalTokenCount: 3 },
                message: {
                  role: "assistant",
                  parts: [{ text: "hello" }],
                },
              }),
              JSON.stringify({
                uuid: "u2",
                parentUuid: "a1",
                sessionId: "qwen",
                timestamp: "2026-03-19T00:00:02.000Z",
                type: "user",
                cwd: session.directory,
                message: {
                  role: "user",
                  parts: [{ text: "pwd" }],
                },
              }),
              JSON.stringify({
                uuid: "a2",
                parentUuid: "u2",
                sessionId: "qwen",
                timestamp: "2026-03-19T00:00:03.000Z",
                type: "assistant",
                cwd: session.directory,
                model: "qwen3.5-plus",
                usageMetadata: {
                  totalTokenCount: 12,
                  promptTokenCount: 5,
                  candidatesTokenCount: 4,
                  thoughtsTokenCount: 3,
                },
                message: {
                  role: "assistant",
                  parts: [
                    { thought: true, text: "Need to inspect the repo." },
                    {
                      functionCall: {
                        id: "call-1",
                        name: "run_shell_command",
                        args: { command: "pwd" },
                      },
                    },
                    { text: "The command finished." },
                  ],
                },
              }),
              JSON.stringify({
                uuid: "t2",
                parentUuid: "a2",
                sessionId: "qwen",
                timestamp: "2026-03-19T00:00:03.100Z",
                type: "tool_result",
                cwd: session.directory,
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
              }),
            ].join("\n") + "\n",
          )

          await expect(QwenSync.run(session.id)).resolves.toEqual({
            imported: 2,
            total: 4,
          })

          const msgs = await Session.messages({
            sessionID: session.id,
          })
          expect(msgs.map((item) => item.info.role)).toEqual(["user", "assistant", "user", "assistant"])
          expect(msgs[2]?.parts).toMatchObject([
            {
              type: "text",
              text: "pwd",
            },
          ])
          expect(msgs[3]?.parts.map((part) => part.type)).toEqual([
            "step-start",
            "reasoning",
            "text",
            "tool",
            "step-finish",
          ])
          expect(msgs[3]?.parts.find((part) => part.type === "tool")).toMatchObject({
            tool: "run_shell_command",
            state: {
              status: "completed",
              output: "/repo",
            },
          })
        },
      })
    } finally {
      if (test === undefined) delete process.env.OPENCODE_TEST_HOME
      else process.env.OPENCODE_TEST_HOME = test
    }
  })
})
