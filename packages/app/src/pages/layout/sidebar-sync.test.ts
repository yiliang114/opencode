import { describe, expect, mock, test } from "bun:test"
import { createStore, type SetStoreFunction } from "solid-js/store"
import type { Message, Part, Session, Todo } from "@opencode-ai/sdk/v2/client"
import type { State } from "@/context/global-sync/types"
import { refreshSession } from "./sidebar-refresh"

const session = (id: string) =>
  ({
    id,
    slug: id,
    projectID: "proj_123",
    directory: "/repo",
    title: id,
    version: "v2",
    parentID: undefined,
    messageCount: 0,
    permissions: { session: {}, share: {} },
    time: { created: 0, updated: 0, archived: undefined },
  }) as unknown as Session

const message = (id: string) =>
  ({
    id,
    role: "assistant",
  }) as Message

const part = (id: string, messageID: string) =>
  ({
    id,
    messageID,
    type: "text",
  }) as Part

const todo = (id: string) =>
  ({
    content: id,
    status: "pending",
    priority: "medium",
  }) as unknown as Todo

const state = () =>
  createStore<State>({
    status: "complete",
    agent: [],
    command: [],
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider: { all: [], connected: [], default: {} },
    config: {},
    path: { state: "", config: "", worktree: "", directory: "/repo", home: "" },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 5,
    message: {},
    part: {},
  })

describe("refreshSession", () => {
  test("reloads the current session into the global directory cache", async () => {
    const [store, setStore] = state()
    const child = mock(
      ((_: string, _opts?: { bootstrap?: boolean }) => [store, setStore]) as (
        directory: string,
        opts?: { bootstrap?: boolean },
      ) => readonly [State, SetStoreFunction<State>],
    )
    const get = mock(async () => ({ data: session("ses_123") }))
    const messages = mock(async () => ({
      data: [
        { info: message("msg_2"), parts: [part("part_2", "msg_2")] },
        { info: message("msg_1"), parts: [part("part_1", "msg_1")] },
      ],
    }))
    const list = [todo("todo_2"), todo("todo_1")]
    const todos = mock(async () => ({ data: list }))
    const createClient = mock(() => ({
      session: { get, messages, todo: todos },
    }))
    const set = mock(() => {})

    await refreshSession({
      directory: "/repo",
      sessionID: "ses_123",
      sdk: { createClient },
      sync: {
        child,
        todo: { set },
      },
    })

    expect(createClient).toHaveBeenCalledWith({
      directory: "/repo",
      throwOnError: true,
    })
    expect(get).toHaveBeenCalledWith({ sessionID: "ses_123" })
    expect(messages).toHaveBeenCalledWith({ sessionID: "ses_123", limit: 200 })
    expect(todos).toHaveBeenCalledWith({ sessionID: "ses_123" })
    expect(store.session.map((item) => item.id)).toEqual(["ses_123"])
    expect(store.message.ses_123?.map((item) => item.id)).toEqual(["msg_1", "msg_2"])
    expect(store.part.msg_1?.map((item) => item.id)).toEqual(["part_1"])
    expect(store.part.msg_2?.map((item) => item.id)).toEqual(["part_2"])
    expect(store.todo.ses_123?.map((item) => item.content)).toEqual(["todo_2", "todo_1"])
    expect(set).toHaveBeenCalledWith("ses_123", list)
  })

  test("drops stale message parts that disappeared from the refreshed session", async () => {
    const [store, setStore] = state()
    const child = mock(
      ((_: string, _opts?: { bootstrap?: boolean }) => [store, setStore]) as (
        directory: string,
        opts?: { bootstrap?: boolean },
      ) => readonly [State, SetStoreFunction<State>],
    )
    setStore("session", [session("ses_123")])
    setStore("message", "ses_123", [message("msg_old"), message("msg_keep")])
    setStore("part", "msg_old", [part("part_old", "msg_old")])
    setStore("part", "msg_keep", [part("part_keep", "msg_keep")])

    await refreshSession({
      directory: "/repo",
      sessionID: "ses_123",
      sdk: {
        createClient: mock(() => ({
          session: {
            get: async () => ({ data: session("ses_123") }),
            messages: async () => ({
              data: [{ info: message("msg_keep"), parts: [part("part_keep_2", "msg_keep")] }],
            }),
            todo: async () => ({ data: [] }),
          },
        })),
      },
      sync: {
        child,
        todo: { set: mock(() => {}) },
      },
    })

    expect(store.message.ses_123?.map((item) => item.id)).toEqual(["msg_keep"])
    expect(store.part.msg_old).toBeUndefined()
    expect(store.part.msg_keep?.map((item) => item.id)).toEqual(["part_keep_2"])
  })
})
