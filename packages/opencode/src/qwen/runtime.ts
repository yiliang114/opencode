import fs from "fs"
import path from "path"
import { createInterface } from "readline"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import { fileURLToPath } from "url"
import { NamedError } from "@opencode-ai/util/error"
import { MessageV2 } from "@/session/message-v2"
import { Session } from "@/session"
import { SessionID, MessageID, PartID } from "@/session/schema"
import { Todo } from "@/session/todo"
import { PermissionNext } from "@/permission"
import { Question } from "@/question"
import { Log } from "@/util/log"
import { ProviderID } from "@/provider/schema"
import { parseQwenTodos, QWEN_PROVIDER, toQwenQuestions, withQwenAnswers } from "./meta"
import { qwenSessionArgs, qwenSessionID } from "./session"
import { which } from "@/util/which"

const log = Log.create({ service: "qwen.runtime" })
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../")
const vendor = path.join(root, "vendor/qwen-code")
const dist = path.join(vendor, "dist/cli.js")
const tsx = path.join(vendor, "node_modules/.bin/tsx")
const cli = path.join(vendor, "packages/cli/index.ts")

type QwenStreamEvent =
  | {
      type: "message_start"
    }
  | {
      type: "content_block_start"
      index: number
      content_block:
        | { type: "text"; text?: string }
        | { type: "thinking"; thinking?: string }
        | { type: "tool_use"; id: string; name: string; input?: unknown }
    }
  | {
      type: "content_block_delta"
      index: number
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string }
    }
  | {
      type: "content_block_stop"
      index: number
    }
  | {
      type: "message_stop"
    }

type QwenMessage =
  | {
      type: "stream_event"
      event: QwenStreamEvent
    }
  | {
      type: "assistant"
      message: {
        content: Array<
          | { type: "text"; text: string }
          | { type: "thinking"; thinking: string }
          | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        >
      }
    }
  | {
      type: "user"
      message: {
        content: Array<
          | { type: "tool_result"; tool_use_id: string; content?: string | Array<{ type: "text"; text: string }>; is_error?: boolean }
          | { type: "text"; text: string }
        >
      }
    }
  | {
      type: "result"
      subtype: "success" | "error_max_turns" | "error_during_execution"
      is_error: boolean
      result?: string
      error?: { message?: string }
      usage?: {
        input_tokens?: number
        output_tokens?: number
        total_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
  | {
      type: "control_request"
      request_id: string
      request:
        | {
            subtype: "can_use_tool"
            tool_name: string
            tool_use_id: string
            input: Record<string, unknown>
            blocked_path: string | null
          }
        | {
            subtype: string
          }
    }
  | {
      type: "control_response"
    }
  | {
      type: "system"
    }

type Block =
  | { kind: "text"; part: MessageV2.TextPart }
  | { kind: "reasoning"; part: MessageV2.ReasoningPart }
  | { kind: "tool"; part: MessageV2.ToolPart }

export function qwenCommand(
  exec = process.execPath,
  input?: {
    dist?: string
    tsx?: string
    cli?: string
    which?: (cmd: string) => string | null
    preferGlobal?: boolean
  },
) {
  const file = input?.dist ?? dist
  const run = input?.tsx ?? tsx
  const entry = input?.cli ?? cli
  const pick = input?.which ?? which
  const qwen = input?.preferGlobal === false ? null : pick("qwen")

  if (qwen) {
    return {
      command: qwen,
      args: [],
    }
  }

  if (fs.existsSync(file)) {
    return {
      command: exec.includes("bun") ? "node" : exec,
      args: [file],
    }
  }

  if (fs.existsSync(run) && fs.existsSync(entry)) {
    return {
      command: run,
      args: [entry],
    }
  }

  return {
    command: "qwen",
    args: [],
  }
}

export function qwenWait(input: { done: Promise<void>; exit: Promise<void> }) {
  return Promise.race([input.done, input.exit])
}

export async function qwenRunArgs(input: {
  dir: string
  id: string
  model: string
  mode: string
  home?: string
}) {
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--channel",
    "SDK",
    "--approval-mode",
    input.mode,
    ...(await qwenSessionArgs({
      dir: input.dir,
      id: input.id,
      home: input.home,
    })),
    "--model",
    input.model,
  ]
}

function join(content: string | Array<{ type: "text"; text: string }> | undefined) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.filter((item) => item.type === "text").map((item) => item.text).join("")
}

function usage(input: Extract<QwenMessage, { type: "result" }>["usage"]) {
  return {
    input: input?.input_tokens ?? 0,
    output: input?.output_tokens ?? 0,
    reasoning: 0,
    total: input?.total_tokens,
    cache: {
      read: input?.cache_read_input_tokens ?? 0,
      write: input?.cache_creation_input_tokens ?? 0,
    },
  }
}

export { qwenSessionID } from "./session"

async function ask(
  sessionID: SessionID,
  messageID: MessageID,
  tool: string,
  callID: string,
  input: Record<string, unknown>,
  blocked: string | null,
) {
  if (tool === "ask_user_question") {
    const questions = toQwenQuestions(input)
    if (!questions.length) {
      return {
        behavior: "deny",
        message: "Question payload was empty.",
      }
    }

    const answers = await Question.ask({
      sessionID,
      questions,
      tool: { messageID, callID },
    }).catch(() => undefined)

    if (!answers) {
      return {
        behavior: "deny",
        message: "User declined to answer the questions.",
      }
    }

    return {
      behavior: "allow",
      updatedInput: withQwenAnswers(input, answers),
    }
  }

  const patterns = blocked ? [blocked] : [tool]
  await PermissionNext.ask({
    sessionID,
    permission: tool,
    patterns,
    always: patterns,
    metadata: {
      tool,
      input,
    },
    tool: { messageID, callID },
    ruleset: [],
  }).catch((err) => {
    throw err
  })

  return {
    behavior: "allow",
    updatedInput: input,
  }
}

async function tool(
  assistant: MessageV2.Assistant,
  blocks: Map<number, Block>,
  calls: Map<string, MessageV2.ToolPart>,
  item: { index: number; id: string; name: string },
) {
  const part = (await Session.updatePart({
    id: calls.get(item.id)?.id ?? PartID.ascending(),
    messageID: assistant.id,
    sessionID: assistant.sessionID,
    type: "tool",
    callID: item.id,
    tool: item.name,
    state: {
      status: "pending",
      input: {},
      raw: "",
    },
  })) as MessageV2.ToolPart

  calls.set(item.id, part)
  blocks.set(item.index, { kind: "tool", part })
}

function updateTool(
  blocks: Map<number, Block>,
  callID: string,
  part: MessageV2.ToolPart,
) {
  for (const [index, block] of blocks.entries()) {
    if (block.kind !== "tool") continue
    if (block.part.callID !== callID) continue
    blocks.set(index, { kind: "tool", part })
    return
  }
}

export namespace QwenRuntime {
  export async function run(input: {
    session: Session.Info
    user: MessageV2.User
    prompt: string
    abort: AbortSignal
  }): Promise<MessageV2.WithParts> {
    const sessionID = qwenSessionID(input.session.id)
    const proc = qwenCommand()
    const child = spawn(proc.command, [
      ...proc.args,
      ...(await qwenRunArgs({
        dir: input.session.directory,
        id: input.session.id,
        model: input.user.model.modelID,
        mode: input.user.agent,
      })),
    ], {
      cwd: input.session.directory,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    })

    const assistant = (await Session.updateMessage({
      id: MessageID.ascending(),
      sessionID: input.session.id,
      parentID: input.user.id,
      role: "assistant",
      mode: input.user.agent,
      agent: input.user.agent,
      variant: input.user.variant,
      path: {
        cwd: input.session.directory,
        root: input.session.directory,
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: input.user.model.modelID,
      providerID: ProviderID.make(QWEN_PROVIDER),
      time: {
        created: Date.now(),
      },
    })) as MessageV2.Assistant

    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: assistant.sessionID,
      messageID: assistant.id,
      type: "step-start",
    })

    const rl = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })

    const blocks = new Map<number, Block>()
    const calls = new Map<string, MessageV2.ToolPart>()
    const done = {
      result: undefined as Extract<QwenMessage, { type: "result" }> | undefined,
      text: false,
      reasoning: false,
    }
    let finish = () => {}
    const ready = new Promise<void>((resolve) => {
      finish = resolve
    })
    let stderr = ""

    const kill = () => {
      if (child.killed) return
      child.kill("SIGTERM")
    }

    input.abort.addEventListener("abort", kill, { once: true })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    const send = (value: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(value) + "\n")
    }

    const finalize = async (idx: number) => {
      const match = blocks.get(idx)
      if (!match) return
      if (match.kind === "text") {
        match.part.text = match.part.text.trimEnd()
        if (!match.part.time) return
        match.part.time = {
          start: match.part.time.start,
          end: Date.now(),
        }
        await Session.updatePart(match.part)
        if (match.part.text) done.text = true
        return
      }

      if (match.kind === "reasoning") {
        match.part.text = match.part.text.trimEnd()
        if (!match.part.time) return
        match.part.time = {
          start: match.part.time.start,
          end: Date.now(),
        }
        await Session.updatePart(match.part)
        if (match.part.text) done.reasoning = true
        return
      }

      await Session.updatePart(match.part)
    }

    const route = async (line: string) => {
      const item = JSON.parse(line) as QwenMessage
      if (item.type === "stream_event") {
        if (item.event.type === "content_block_start") {
          const block = item.event.content_block
          if (block.type === "text") {
            const part = {
              id: PartID.ascending(),
              messageID: assistant.id,
              sessionID: assistant.sessionID,
              type: "text" as const,
              text: block.text ?? "",
              time: {
                start: Date.now(),
              },
            }
            await Session.updatePart(part)
            blocks.set(item.event.index, { kind: "text", part })
            return
          }

          if (block.type === "thinking") {
            if (done.reasoning) return
            const part = {
              id: PartID.ascending(),
              messageID: assistant.id,
              sessionID: assistant.sessionID,
              type: "reasoning" as const,
              text: block.thinking ?? "",
              time: {
                start: Date.now(),
              },
            }
            await Session.updatePart(part)
            blocks.set(item.event.index, { kind: "reasoning", part })
            return
          }

          if (block.type === "tool_use") {
            await tool(assistant, blocks, calls, {
              index: item.event.index,
              id: block.id,
              name: block.name,
            })
            return
          }

          return
        }

        if (item.event.type === "content_block_delta") {
          const block = blocks.get(item.event.index)
          if (!block) return
          if (item.event.delta.type === "text_delta" && block.kind === "text") {
            block.part.text += item.event.delta.text
            await Session.updatePartDelta({
              sessionID: block.part.sessionID,
              messageID: block.part.messageID,
              partID: block.part.id,
              field: "text",
              delta: item.event.delta.text,
            })
            return
          }

          if (item.event.delta.type === "thinking_delta" && block.kind === "reasoning") {
            block.part.text += item.event.delta.thinking
            await Session.updatePartDelta({
              sessionID: block.part.sessionID,
              messageID: block.part.messageID,
              partID: block.part.id,
              field: "text",
              delta: item.event.delta.thinking,
            })
            return
          }

          if (item.event.delta.type === "input_json_delta" && block.kind === "tool") {
            const raw = block.part.state.status === "pending" ? block.part.state.raw + item.event.delta.partial_json : ""
            block.part = {
              ...block.part,
              state: {
                status: "pending",
                input: block.part.state.input,
                raw,
              },
            }
            blocks.set(item.event.index, block)
            return
          }

          return
        }

        if (item.event.type === "content_block_stop") {
          await finalize(item.event.index)
        }

        return
      }

      if (item.type === "assistant") {
        for (const block of item.message.content) {
          if (block.type === "tool_use") {
            const part = calls.get(block.id)
            if (!part) continue
            const next = (await Session.updatePart({
              ...part,
              state: {
                status: "running",
                input: block.input,
                time: {
                  start: Date.now(),
                },
              },
            })) as MessageV2.ToolPart
            calls.set(block.id, next)
            updateTool(blocks, block.id, next)
            continue
          }

          if (block.type === "text" && !done.text) {
            const part = {
              id: PartID.ascending(),
              messageID: assistant.id,
              sessionID: assistant.sessionID,
              type: "text" as const,
              text: block.text.trimEnd(),
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            }
            await Session.updatePart(part)
            done.text = !!part.text
            continue
          }

          if (block.type === "thinking") {
            if (done.reasoning) continue
            const part = {
              id: PartID.ascending(),
              messageID: assistant.id,
              sessionID: assistant.sessionID,
              type: "reasoning" as const,
              text: block.thinking.trimEnd(),
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            }
            await Session.updatePart(part)
          }
        }
        return
      }

      if (item.type === "user") {
        for (const block of item.message.content) {
          if (block.type !== "tool_result") continue
          const part = calls.get(block.tool_use_id)
          const output = join(block.content)
          const todos = parseQwenTodos(output)
          if (todos) Todo.update({ sessionID: assistant.sessionID, todos })
          if (!part) continue
          const next = (await Session.updatePart({
            ...part,
            state: block.is_error
              ? {
                  status: "error",
                  input: part.state.input,
                  error: output || "Tool call failed.",
                  time: {
                    start: part.state.status === "running" ? part.state.time.start : Date.now(),
                    end: Date.now(),
                  },
                }
              : {
                  status: "completed",
                  input: part.state.input,
                  output,
                  title: part.tool,
                  metadata: {},
                  time: {
                    start: part.state.status === "running" ? part.state.time.start : Date.now(),
                    end: Date.now(),
                  },
                },
          } satisfies MessageV2.ToolPart)) as MessageV2.ToolPart
          calls.set(block.tool_use_id, next)
          updateTool(blocks, block.tool_use_id, next)
        }
        return
      }

      if (item.type === "control_request") {
        if (item.request.subtype !== "can_use_tool") {
          send({
            type: "control_response",
            response: {
              subtype: "error",
              request_id: item.request_id,
              error: `Unsupported control request: ${item.request.subtype}`,
            },
          })
          return
        }

        const request = item.request as Extract<QwenMessage, { type: "control_request" }>["request"] & {
          subtype: "can_use_tool"
          tool_name: string
          tool_use_id: string
          input: Record<string, unknown>
          blocked_path: string | null
        }
        const response = await ask(
          assistant.sessionID,
          assistant.id,
          request.tool_name,
          request.tool_use_id,
          request.input,
          request.blocked_path,
        ).catch((err) => ({
          behavior: "deny",
          message: err instanceof Error ? err.message : String(err),
        }))

        send({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: item.request_id,
            response,
          },
        })
        return
      }

      if (item.type === "result") {
        done.result = item
        finish()
        if (!child.stdin.destroyed) child.stdin.end()
      }
    }

    send({
      type: "control_request",
      request_id: randomUUID(),
      request: {
        subtype: "initialize",
        hooks: null,
      },
    })
    send({
      type: "user",
      session_id: sessionID,
      message: {
        role: "user",
        content: input.prompt,
      },
      parent_tool_use_id: null,
    })

    const stream = (async () => {
      for await (const raw of rl) {
        const line = raw.trim()
        if (!line) continue
        await route(line)
      }
    })()

    await qwenWait({
      done: ready,
      exit: Promise.all([
        stream,
        new Promise<void>((resolve, reject) => {
          child.on("error", reject)
          child.on("exit", (code) => {
            if (code === 0 || done.result) {
              resolve()
              return
            }
            reject(new Error(stderr || `Qwen exited with code ${code}`))
          })
        }),
      ]).then(() => {}),
    }).finally(() => {
      input.abort.removeEventListener("abort", kill)
      rl.close()
      if (done.result && child.exitCode === null && !child.killed) child.kill("SIGTERM")
    })

    if (done.result?.result && !done.text) {
      await Session.updatePart({
        id: PartID.ascending(),
        sessionID: assistant.sessionID,
        messageID: assistant.id,
        type: "text",
        text: done.result.result,
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })
    }

    assistant.providerID = ProviderID.make(QWEN_PROVIDER)
    assistant.modelID = input.user.model.modelID
    assistant.finish = done.result?.is_error ? "error" : "stop"
    assistant.tokens = usage(done.result?.usage)
    assistant.time.completed = Date.now()
    if (done.result?.is_error) {
      assistant.error = new NamedError.Unknown({
        message: done.result.error?.message || stderr || "Qwen run failed.",
      }).toObject()
    }
    await Session.updateMessage(assistant)
    await Session.updatePart({
      id: PartID.ascending(),
      sessionID: assistant.sessionID,
      messageID: assistant.id,
      type: "step-finish",
      reason: assistant.finish,
      cost: 0,
      tokens: assistant.tokens,
    })
    return MessageV2.get({
      sessionID: assistant.sessionID,
      messageID: assistant.id,
    })
  }
}
