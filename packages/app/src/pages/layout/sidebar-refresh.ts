import type { Message, Part, Session, Todo } from "@opencode-ai/sdk/v2/client"
import { batch } from "solid-js"
import { type SetStoreFunction, type Store, produce } from "solid-js/store"
import type { State } from "@/context/global-sync/types"
import { cmp } from "@/context/global-sync/utils"

type Item = { info: Message; parts: Part[] }

type Client = {
  session: {
    get(input: { sessionID: string }): Promise<{ data?: Session }>
    messages(input: { sessionID: string; limit: number }): Promise<{ data?: Item[] }>
    todo(input: { sessionID: string }): Promise<{ data?: Todo[] }>
  }
}

type SDK = {
  createClient(opts: { directory: string; throwOnError: true }): Client
}

type Sync = {
  child(
    directory: string,
    opts?: { bootstrap?: boolean },
  ): readonly [Store<State>, SetStoreFunction<State>]
  todo: {
    set(sessionID: string, todos: Todo[] | undefined): void
  }
}

const sort = <T extends { id: string }>(all: readonly T[]) => [...all].sort((a, b) => cmp(a.id, b.id))

const merge = <T extends { id: string }>(all: readonly T[], item: T) => sort([...all.filter((x) => x.id !== item.id), item])

export async function refreshSession(input: {
  directory: string
  sessionID: string
  sdk: SDK
  sync: Sync
  limit?: number
}) {
  const client = input.sdk.createClient({
    directory: input.directory,
    throwOnError: true,
  })
  const [session, messages, todo] = await Promise.all([
    client.session.get({ sessionID: input.sessionID }),
    client.session.messages({ sessionID: input.sessionID, limit: input.limit ?? 200 }),
    client.session.todo({ sessionID: input.sessionID }),
  ])
  const data = session.data
  if (!data) return

  const items = (messages.data ?? []).flatMap((item) => (item?.info?.id ? [item as Item] : []))
  const todos = todo.data ?? []
  const [, setStore] = input.sync.child(input.directory, { bootstrap: false })

  batch(() => {
    setStore(
      produce((draft: State) => {
        const prev = new Set((draft.message[input.sessionID] ?? []).map((item) => item.id))
        const next = sort(items.map((item) => item.info))
        const keep = new Set(next.map((item) => item.id))

        draft.session = merge(draft.session, data)
        draft.message[input.sessionID] = next
        draft.todo[input.sessionID] = todos

        for (const id of prev) {
          if (keep.has(id)) continue
          delete draft.part[id]
        }

        for (const item of items) {
          draft.part[item.info.id] = sort(item.parts)
        }
      }),
    )
    input.sync.todo.set(input.sessionID, todos)
  })
}
