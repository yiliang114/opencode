import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, createRoot, createSignal, on, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSDK } from "./sdk"
import type { Platform } from "./platform"
import { defaultTitle, titleNumber } from "./terminal-title"
import { Persist, persisted, removePersisted } from "@/utils/persist"

export type LocalPTY = {
  id: string
  title: string
  titleNumber: number
  session?: string
  qwen?: string
  rows?: number
  cols?: number
  buffer?: string
  scrollY?: number
  cursor?: number
}

type Size = {
  cols: number
  rows: number
}

const WORKSPACE_KEY = "__workspace__"
const MAX_TERMINAL_SESSIONS = 20

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function numberFromTitle(title: string) {
  return titleNumber(title, MAX_TERMINAL_SESSIONS)
}

export function findSessionTerminal<T extends { session?: string }>(all: T[], session?: string) {
  if (!session) return
  return all.find((pty) => pty.session === session)
}

export function findQwenTerminal<T extends { qwen?: string }>(all: T[], qwen?: string) {
  if (!qwen) return
  return all.find((pty) => pty.qwen === qwen)
}

function qwenTitle(number: number) {
  return `Qwen ${number}`
}

export function shellInput(dir: string, number: number, size?: Size) {
  return {
    title: defaultTitle(number),
    cwd: dir,
    ...(size ? { size } : {}),
  }
}

export function qwenInput(input: {
  dir: string
  number: number
  session?: string
  qwen?: string
  size?: Size
}) {
  return {
    title: qwenTitle(input.number),
    command: "qwen",
    cwd: input.dir,
    ...(input.size ? { size: input.size } : {}),
    ...(input.qwen
      ? {
          args: ["--resume", input.qwen],
        }
      : {}),
    ...(input.session
      ? {
          env: {
            OPENCODE_SESSION_ID: input.session,
          },
        }
      : {}),
  }
}

export function ptySession(session?: string, reuse?: boolean) {
  if (!reuse) return
  return session
}

export function terminalInput(input: {
  dir: string
  cwd?: string
  sessionDir?: string
  number: number
  session?: string
  link?: boolean
  qwen?: string
  size?: Size
}) {
  const dir = input.sessionDir || input.cwd || input.dir
  if (input.qwen) {
    return qwenInput({
      dir,
      number: input.number,
      qwen: input.qwen,
      size: input.size,
    })
  }
  if (input.link) {
    return qwenInput({
      dir,
      number: input.number,
      session: ptySession(input.session, input.link),
      size: input.size,
    })
  }
  return shellInput(dir, input.number, input.size)
}

function pty(value: unknown): LocalPTY | undefined {
  if (!record(value)) return

  const id = text(value.id)
  if (!id) return

  const title = text(value.title) ?? ""
  const number = num(value.titleNumber)
  const session = text(value.session)
  const qwen = text(value.qwen)
  const rows = num(value.rows)
  const cols = num(value.cols)
  const buffer = text(value.buffer)
  const scrollY = num(value.scrollY)
  const cursor = num(value.cursor)

  return {
    id,
    title,
    titleNumber: number && number > 0 ? number : (numberFromTitle(title) ?? 0),
    ...(session !== undefined ? { session } : {}),
    ...(qwen !== undefined ? { qwen } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(cols !== undefined ? { cols } : {}),
    ...(buffer !== undefined ? { buffer } : {}),
    ...(scrollY !== undefined ? { scrollY } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  }
}

export function migrateTerminalState(value: unknown) {
  if (!record(value)) return value

  const seen = new Set<string>()
  const all = (Array.isArray(value.all) ? value.all : []).flatMap((item) => {
    const next = pty(item)
    if (!next || seen.has(next.id)) return []
    seen.add(next.id)
    return [next]
  })

  const active = text(value.active)

  return {
    active: active && seen.has(active) ? active : all[0]?.id,
    all,
  }
}

export function getWorkspaceTerminalCacheKey(dir: string) {
  return `${dir}:${WORKSPACE_KEY}`
}

export function getLegacyTerminalStorageKeys(dir: string, legacySessionID?: string) {
  if (!legacySessionID) return [`${dir}/terminal.v1`]
  return [`${dir}/terminal/${legacySessionID}.v1`, `${dir}/terminal.v1`]
}

type TerminalSession = ReturnType<typeof createWorkspaceTerminalSession>

type TerminalCacheEntry = {
  value: TerminalSession
  dispose: VoidFunction
}

const caches = new Set<Map<string, TerminalCacheEntry>>()

const trimTerminal = (pty: LocalPTY) => {
  if (!pty.buffer && pty.cursor === undefined && pty.scrollY === undefined) return pty
  return {
    ...pty,
    buffer: undefined,
    cursor: undefined,
    scrollY: undefined,
  }
}

export function cloneTerminal(pty: LocalPTY, next: { id: string; title?: string }): LocalPTY {
  return {
    ...pty,
    id: next.id,
    title: next.title ?? pty.title,
    buffer: undefined,
    cursor: undefined,
    scrollY: undefined,
    rows: undefined,
    cols: undefined,
  }
}

export function shouldResetActiveTerminal(input: {
  active?: {
    session?: string
    qwen?: string
  }
  session?: string
  qwen?: string
}) {
  if (input.session) return input.active?.session !== input.session
  if (input.qwen) return input.active?.qwen !== input.qwen
  return false
}

export function clearWorkspaceTerminals(dir: string, sessionIDs?: string[], platform?: Platform) {
  const key = getWorkspaceTerminalCacheKey(dir)
  for (const cache of caches) {
    const entry = cache.get(key)
    entry?.value.clear()
  }

  removePersisted(Persist.workspace(dir, "terminal"), platform)

  const legacy = new Set(getLegacyTerminalStorageKeys(dir))
  for (const id of sessionIDs ?? []) {
    for (const key of getLegacyTerminalStorageKeys(dir, id)) {
      legacy.add(key)
    }
  }
  for (const key of legacy) {
    removePersisted({ key }, platform)
  }
}

function createWorkspaceTerminalSession(
  sdk: ReturnType<typeof useSDK>,
  dir: string,
  cwd: () => string,
  id: () => string | undefined,
  legacySessionID?: string,
) {
  const legacy = getLegacyTerminalStorageKeys(dir, legacySessionID)
  const [pending, setPending] = createSignal(0)

  const [store, setStore, _, ready] = persisted(
    {
      ...Persist.workspace(dir, "terminal", legacy),
      migrate: migrateTerminalState,
    },
    createStore<{
      active?: string
      all: LocalPTY[]
    }>({
      all: [],
    }),
  )

  const pickNextTerminalNumber = () => {
    const existingTitleNumbers = new Set(
      store.all.flatMap((pty) => {
        const direct = Number.isFinite(pty.titleNumber) && pty.titleNumber > 0 ? pty.titleNumber : undefined
        if (direct !== undefined) return [direct]
        const parsed = numberFromTitle(pty.title)
        if (parsed === undefined) return []
        return [parsed]
      }),
    )

    return (
      Array.from({ length: existingTitleNumbers.size + 1 }, (_, index) => index + 1).find(
        (number) => !existingTitleNumbers.has(number),
      ) ?? 1
    )
  }

  const removeExited = (id: string) => {
    const all = store.all
    const index = all.findIndex((x) => x.id === id)
    if (index === -1) return
    const active = store.active === id ? (index === 0 ? all[1]?.id : all[0]?.id) : store.active
    batch(() => {
      setStore("active", active)
      setStore(
        "all",
        produce((draft) => {
          draft.splice(index, 1)
        }),
      )
    })
  }

  const unsub = sdk.event.on("pty.exited", (event: { properties: { id: string } }) => {
    removeExited(event.properties.id)
  })
  onCleanup(unsub)

  return {
    ready,
    creating: createMemo(() => pending()),
    all: createMemo(() => store.all),
    active: createMemo(() => store.active),
    clear() {
      batch(() => {
        setStore("active", undefined)
        setStore("all", [])
      })
    },
    new(input?: { link?: boolean; session?: string; sessionDir?: string; qwen?: string; size?: Size }) {
      const nextNumber = pickNextTerminalNumber()
      const next = ptySession(input?.session ?? id(), input?.link)
      setPending((value) => value + 1)

      sdk.client.pty
        .create(
          terminalInput({
            dir,
            cwd: cwd(),
            sessionDir: input?.sessionDir,
            number: nextNumber,
            session: input?.session ?? id(),
            link: input?.link,
            qwen: input?.qwen,
            size: input?.size,
          }),
        )
        .then((pty: { data?: { id?: string; title?: string } }) => {
          const id = pty.data?.id
          if (!id) return
          const newTerminal = {
            id,
            title: pty.data?.title ?? (input?.link || input?.qwen ? qwenTitle(nextNumber) : defaultTitle(nextNumber)),
            titleNumber: nextNumber,
            ...(next ? { session: next } : {}),
            ...(input?.qwen ? { qwen: input.qwen } : {}),
          }
          setStore("all", store.all.length, newTerminal)
          setStore("active", id)
        })
        .catch((error: unknown) => {
          console.error("Failed to create terminal", error)
        })
        .finally(() => {
          setPending((value) => Math.max(0, value - 1))
        })
    },
    update(pty: Partial<LocalPTY> & { id: string }) {
      const index = store.all.findIndex((x) => x.id === pty.id)
      const previous = index >= 0 ? store.all[index] : undefined
      if (index >= 0) {
        setStore("all", index, (item) => ({ ...item, ...pty }))
      }
      sdk.client.pty
        .update({
          ptyID: pty.id,
          title: pty.title,
          size: pty.cols && pty.rows ? { rows: pty.rows, cols: pty.cols } : undefined,
        })
        .catch((error: unknown) => {
          if (previous) {
            const currentIndex = store.all.findIndex((item) => item.id === pty.id)
            if (currentIndex >= 0) setStore("all", currentIndex, previous)
          }
          console.error("Failed to update terminal", error)
        })
    },
    trim(id: string) {
      const index = store.all.findIndex((x) => x.id === id)
      if (index === -1) return
      setStore("all", index, (pty) => trimTerminal(pty))
    },
    trimAll() {
      setStore("all", (all) => {
        const next = all.map(trimTerminal)
        if (next.every((pty, index) => pty === all[index])) return all
        return next
      })
    },
    async clone(id: string) {
      const index = store.all.findIndex((x) => x.id === id)
      const pty = store.all[index]
      if (!pty) return
      const clone = await sdk.client.pty
        .create({
          title: pty.title,
        })
        .catch((error: unknown) => {
          console.error("Failed to clone terminal", error)
          return undefined
        })
      if (!clone?.data) return

      const active = store.active === pty.id

      batch(() => {
        setStore("all", index, cloneTerminal(pty, clone.data))
        if (active) {
          setStore("active", clone.data.id)
        }
      })
    },
    open(id: string) {
      setStore("active", id)
    },
    openSession(session = id(), sessionDir?: string, size?: Size) {
      const next = ptySession(session, true)
      const existing = findSessionTerminal(store.all, next)
      if (existing) {
        setStore("active", existing.id)
        return existing.id
      }
      const active = store.all.find((pty) => pty.id === store.active)
      if (shouldResetActiveTerminal({ active, session: next })) {
        setStore("active", undefined)
      }
      this.new({
        link: true,
        session,
        sessionDir,
        size,
      })
      return
    },
    openQwen(qwen: string, sessionDir?: string, size?: Size) {
      const existing = findQwenTerminal(store.all, qwen)
      if (existing) {
        setStore("active", existing.id)
        return existing.id
      }
      const active = store.all.find((pty) => pty.id === store.active)
      if (shouldResetActiveTerminal({ active, qwen })) {
        setStore("active", undefined)
      }
      this.new({
        qwen,
        sessionDir,
        size,
      })
      return
    },
    next() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const nextIndex = (index + 1) % store.all.length
      setStore("active", store.all[nextIndex]?.id)
    },
    previous() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const prevIndex = index === 0 ? store.all.length - 1 : index - 1
      setStore("active", store.all[prevIndex]?.id)
    },
    async close(id: string) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index !== -1) {
        batch(() => {
          if (store.active === id) {
            const next = index > 0 ? store.all[index - 1]?.id : store.all[1]?.id
            setStore("active", next)
          }
          setStore(
            "all",
            produce((all) => {
              all.splice(index, 1)
            }),
          )
        })
      }

      await sdk.client.pty.remove({ ptyID: id }).catch((error: unknown) => {
        console.error("Failed to close terminal", error)
      })
    },
    move(id: string, to: number) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index === -1) return
      setStore(
        "all",
        produce((all) => {
          all.splice(to, 0, all.splice(index, 1)[0])
        }),
      )
    },
  }
}

export const { use: useTerminal, provider: TerminalProvider } = createSimpleContext({
  name: "Terminal",
  gate: false,
  init: () => {
    const sdk = useSDK()
    const params = useParams()
    const cache = new Map<string, TerminalCacheEntry>()

    caches.add(cache)
    onCleanup(() => caches.delete(cache))

    const disposeAll = () => {
      for (const entry of cache.values()) {
        entry.dispose()
      }
      cache.clear()
    }

    onCleanup(disposeAll)

    const prune = () => {
      while (cache.size > MAX_TERMINAL_SESSIONS) {
        const first = cache.keys().next().value
        if (!first) return
        const entry = cache.get(first)
        entry?.dispose()
        cache.delete(first)
      }
    }

    const loadWorkspace = (dir: string, legacySessionID?: string) => {
      // Terminals are workspace-scoped so tabs persist while switching sessions in the same directory.
      const key = getWorkspaceTerminalCacheKey(dir)
      const existing = cache.get(key)
      if (existing) {
        cache.delete(key)
        cache.set(key, existing)
        return existing.value
      }

      const entry = createRoot((dispose) => ({
        value: createWorkspaceTerminalSession(sdk, dir, () => sdk.directory, () => params.id || undefined, legacySessionID),
        dispose,
      }))

      cache.set(key, entry)
      prune()
      return entry.value
    }

    const workspace = createMemo(() => loadWorkspace(sdk.directory, params.id))

    createEffect(
      on(
        () => ({ dir: sdk.directory, id: params.id }),
        (next, prev) => {
          if (!prev?.dir) return
          if (next.dir === prev.dir && next.id === prev.id) return
          if (next.dir === prev.dir && next.id) return
          loadWorkspace(prev.dir, prev.id).trimAll()
        },
        { defer: true },
      ),
    )

    return {
      ready: () => workspace().ready(),
      creating: () => workspace().creating(),
      all: () => workspace().all(),
      active: () => workspace().active(),
      new: (input?: { link?: boolean; session?: string; sessionDir?: string; qwen?: string; size?: Size }) =>
        workspace().new(input),
      update: (pty: Partial<LocalPTY> & { id: string }) => workspace().update(pty),
      trim: (id: string) => workspace().trim(id),
      trimAll: () => workspace().trimAll(),
      clone: (id: string) => workspace().clone(id),
      open: (id: string) => workspace().open(id),
      openSession: (session?: string, sessionDir?: string, size?: Size) =>
        workspace().openSession(session, sessionDir, size),
      openQwen: (qwen: string, sessionDir?: string, size?: Size) => workspace().openQwen(qwen, sessionDir, size),
      close: (id: string) => workspace().close(id),
      move: (id: string, to: number) => workspace().move(id, to),
      next: () => workspace().next(),
      previous: () => workspace().previous(),
    }
  },
})
