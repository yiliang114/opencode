import { ProviderID, ModelID } from "@/provider/schema"
import { PermissionNext } from "@/permission"
import { Env } from "@/env"
import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import type { Question } from "@/question"
import type { MessageV2 } from "@/session/message-v2"
import type { Todo } from "@/session/todo"
import { existsSync, readFileSync } from "fs"
import os from "os"
import path from "path"

export const QWEN_PROVIDER = "qwen"
export const QWEN_MODEL = "coder-model"
export const QWEN_MODES = ["plan", "default", "auto-edit", "yolo"] as const

type Paths = {
  dir?: string
  home?: string
}

type Settings = {
  modelProviders?: Record<
    string,
    Array<{
      id?: string
      name?: string
    }>
  >
  model?: {
    name?: string
  }
}

function load(file: string): Settings {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Settings
  } catch {
    return {}
  }
}

function settings(input?: Paths) {
  const env =
    input?.home ??
    (() => {
      try {
        return Env.get("HOME")
      } catch {
        return
      }
    })() ??
    process.env.HOME
  const home = env ?? os.homedir()
  const user = load(path.join(home, ".qwen", "settings.json"))
  if (!input?.dir) return user
  const project = load(path.join(input.dir, ".qwen", "settings.json"))
  return {
    ...user,
    ...project,
    modelProviders: {
      ...(user.modelProviders ?? {}),
      ...(project.modelProviders ?? {}),
    },
    model: {
      ...(user.model ?? {}),
      ...(project.model ?? {}),
    },
  }
}

function model(id: string, name: string): Provider.Info["models"][string] {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.make(QWEN_PROVIDER),
    family: id,
    api: {
      id: "qwen",
      url: "https://chat.qwen.ai",
      npm: "@qwen-code/qwen-code",
    },
    name,
    release_date: "",
    capabilities: {
      temperature: false,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: true,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: true,
    },
    limit: {
      context: 1_000_000,
      output: 65_536,
    },
    cost: {
      input: 0,
      output: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    status: "active",
    headers: {},
    options: {},
  }
}

function models(input?: Paths) {
  const cfg = settings(input)
  const list = Object.values(cfg.modelProviders ?? {}).flat()
  if (list.length === 0) {
    return {
      [QWEN_MODEL]: model(QWEN_MODEL, QWEN_MODEL),
    }
  }
  return Object.fromEntries(
    list.flatMap((item) => {
      if (!item.id) return []
      return [[item.id, model(item.id, item.name ?? item.id)]]
    }),
  )
}

function permission(name: (typeof QWEN_MODES)[number]) {
  const read = PermissionNext.fromConfig({
    read: "allow",
    grep: "allow",
    glob: "allow",
    list: "allow",
    webfetch: "allow",
    websearch: "allow",
    todoread: "allow",
    question: "allow",
  })
  if (name === "plan") {
    return PermissionNext.merge(
      PermissionNext.fromConfig({
        "*": "ask",
        bash: "deny",
        edit: "deny",
        write: "deny",
        apply_patch: "deny",
        multiedit: "deny",
      }),
      read,
    )
  }
  if (name === "default") {
    return PermissionNext.merge(
      PermissionNext.fromConfig({
        "*": "ask",
      }),
      read,
    )
  }
  if (name === "auto-edit") {
    return PermissionNext.merge(
      PermissionNext.fromConfig({
        "*": "ask",
        edit: "allow",
        write: "allow",
        apply_patch: "allow",
        multiedit: "allow",
      }),
      read,
    )
  }
  return PermissionNext.fromConfig({
    "*": "allow",
  })
}

export function qwenProvider(input?: Paths): Provider.Info {
  return {
    id: ProviderID.make(QWEN_PROVIDER),
    name: "Qwen Code",
    source: "custom",
    env: [],
    options: {},
    models: models(input),
  }
}

export function qwenDefaultModel(provider: Provider.Info, input?: Paths) {
  const name = settings(input).model?.name
  if (name && provider.models[name]) return provider.models[name].id
  return Object.values(provider.models)[0]?.id ?? ModelID.make(QWEN_MODEL)
}

export function qwenAgents(input?: Paths): Agent.Info[] {
  const provider = qwenProvider(input)
  const modelID = qwenDefaultModel(provider, input)
  return QWEN_MODES.map((name) => ({
    name,
    mode: "primary",
    native: true,
    description: `Qwen ${name} permission mode`,
    permission: permission(name),
    model: {
      providerID: ProviderID.make(QWEN_PROVIDER),
      modelID,
    },
    options: {},
  }))
}

export function parseQwenTodos(text: string | undefined): Todo.Info[] | undefined {
  if (!text) return
  let raw: {
    type?: string
    todos?: Array<{
      content?: string
      status?: string
    }>
  }
  try {
    raw = JSON.parse(text)
  } catch {
    return
  }
  if (raw.type !== "todo_list") return
  if (!Array.isArray(raw.todos)) return
  return raw.todos.flatMap((item) => {
    if (!item.content || !item.status) return []
    return [
      {
        content: item.content,
        status: item.status,
        priority: "medium",
      },
    ]
  })
}

export function withQwenAnswers(
  input: Record<string, unknown>,
  answers: string[][],
): Record<string, unknown> & { answers: Record<string, string> } {
  return {
    ...input,
    answers: Object.fromEntries(answers.map((item, i) => [i, item.join(", ")])),
  }
}

export function toQwenQuestions(input: unknown): Question.Info[] {
  if (!input || typeof input !== "object") return []
  const value = input as {
    questions?: Array<{
      question?: string
      header?: string
      options?: Array<{
        label?: string
        description?: string
      }>
      multiSelect?: boolean
    }>
  }
  return (value.questions ?? []).flatMap((item) => {
    if (!item.question || !item.header || !Array.isArray(item.options)) return []
    return [
      {
        question: item.question,
        header: item.header,
        multiple: item.multiSelect,
        options: item.options.flatMap((option) => {
          if (!option.label || !option.description) return []
          return [
            {
              label: option.label,
              description: option.description,
            },
          ]
        }),
      },
    ]
  })
}

export function qwenPrompt(parts: MessageV2.Part[]) {
  return parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text]
      if (part.type === "agent") return [`@${part.name}`]
      if (part.type === "file") {
        return [part.filename ? `Attached file: ${part.filename}` : `Attached file: ${part.url}`]
      }
      return []
    })
    .join("\n")
    .trim()
}
