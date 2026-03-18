import { expect, test } from "bun:test"
import path from "path"
import { mkdir } from "fs/promises"
import { PermissionNext } from "../../src/permission"
import { tmpdir } from "../fixture/fixture"
import { qwenAgents, qwenDefaultModel, qwenProvider, parseQwenTodos, withQwenAnswers } from "../../src/qwen/meta"

test("qwenProvider - returns qwen models only", () => {
  const provider = qwenProvider()
  expect(String(provider.id)).toBe("qwen")
  expect(Object.keys(provider.models)).toEqual(["coder-model"])
  expect(provider.models["coder-model"]?.name).toBe("coder-model")
})

test("qwenAgents - returns qwen permission modes", () => {
  const agents = qwenAgents()
  expect(agents.map((item) => item.name)).toEqual(["plan", "default", "auto-edit", "yolo"])
  expect(agents.every((item) => item.mode === "primary")).toBe(true)
})

test("qwenAgents - maps permission mode semantics", () => {
  const agents = Object.fromEntries(qwenAgents().map((item) => [item.name, item]))
  expect(PermissionNext.evaluate("read", "README.md", agents.plan.permission).action).toBe("allow")
  expect(PermissionNext.evaluate("edit", "README.md", agents.plan.permission).action).toBe("deny")
  expect(PermissionNext.evaluate("edit", "README.md", agents.default.permission).action).toBe("ask")
  expect(PermissionNext.evaluate("edit", "README.md", agents["auto-edit"].permission).action).toBe("allow")
  expect(PermissionNext.evaluate("bash", "git status", agents["auto-edit"].permission).action).toBe("ask")
  expect(PermissionNext.evaluate("bash", "git status", agents.yolo.permission).action).toBe("allow")
})

test("qwenProvider - reads models from qwen settings", async () => {
  await using tmp = await tmpdir({})
  await mkdir(path.join(tmp.path, ".qwen"), { recursive: true })
  await Bun.write(
    path.join(tmp.path, ".qwen", "settings.json"),
    JSON.stringify({
      modelProviders: {
        openai: [
          {
            id: "qwen3-coder-plus",
            name: "Qwen 3 Coder Plus",
          },
          {
            id: "qwen3.5-plus",
          },
        ],
      },
      model: {
        name: "qwen3.5-plus",
      },
    }),
  )

  const provider = qwenProvider({
    dir: tmp.path,
    home: path.join(tmp.path, "missing-home"),
  })

  expect(Object.keys(provider.models)).toEqual(["qwen3-coder-plus", "qwen3.5-plus"])
  expect(provider.models["qwen3-coder-plus"]?.name).toBe("Qwen 3 Coder Plus")
  expect(provider.models["qwen3.5-plus"]?.name).toBe("qwen3.5-plus")
  expect(String(qwenDefaultModel(provider, { dir: tmp.path, home: path.join(tmp.path, "missing-home") }))).toBe(
    "qwen3.5-plus",
  )
})

test("qwenProvider - uses HOME env by default", async () => {
  await using tmp = await tmpdir({})
  const prev = process.env.HOME
  await mkdir(path.join(tmp.path, ".qwen"), { recursive: true })
  await Bun.write(
    path.join(tmp.path, ".qwen", "settings.json"),
    JSON.stringify({
      modelProviders: {
        openai: [{ id: "env-model" }],
      },
      model: {
        name: "env-model",
      },
    }),
  )

  process.env.HOME = tmp.path
  const provider = qwenProvider()

  expect(Object.keys(provider.models)).toEqual(["env-model"])
  expect(String(qwenDefaultModel(provider))).toBe("env-model")

  if (prev === undefined) delete process.env.HOME
  else process.env.HOME = prev
})

test("parseQwenTodos - parses todo_write result display", () => {
  expect(
    parseQwenTodos(
      JSON.stringify({
        type: "todo_list",
        todos: [
          { content: "wire qwen", status: "in_progress" },
          { content: "ship demo", status: "pending" },
        ],
      }),
    ),
  ).toEqual([
    { content: "wire qwen", status: "in_progress", priority: "medium" },
    { content: "ship demo", status: "pending", priority: "medium" },
  ])
})

test("parseQwenTodos - ignores plain tool output", () => {
  expect(parseQwenTodos("/Users/yiliang/projects/projj/github.com/yiliang114/opencode")).toBeUndefined()
})

test("withQwenAnswers - injects answers into ask_user_question input", () => {
  expect(
    withQwenAnswers(
      {
        questions: [
          {
            header: "Mode",
            question: "Which mode?",
            options: [],
            multiSelect: false,
          },
        ],
      },
      [["auto-edit"]],
    ),
  ).toEqual({
    questions: [
      {
        header: "Mode",
        question: "Which mode?",
        options: [],
        multiSelect: false,
      },
    ],
    answers: {
      0: "auto-edit",
    },
  })
})
