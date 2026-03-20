import path from "path"
import { readdir } from "fs/promises"
import type { QwenItem } from "./sync"
import { linkedSession } from "./map"
import { qwenChatPath, qwenHome, qwenProject } from "./session"
import { Session } from "@/session"

export { findSessionID } from "./map"

export type QwenSession = {
  id: string
  sessionID?: string
  title: string
  cwd: string
  start: number
  updated: number
  messageCount: number
}

function chats(dir: string, home?: string) {
  return path.join(qwenHome(home), ".qwen", "projects", qwenProject(dir), "chats")
}

function rows(text: string) {
  return text
    .split("\n")
    .flatMap((line) => {
      const row = line.trim()
      if (!row) return []
      try {
        return [JSON.parse(row) as QwenItem]
      } catch {
        return []
      }
    })
    .filter((item) => item.type === "user" || item.type === "assistant")
}

function time(value: string | undefined) {
  const out = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(out) ? out : undefined
}

function title(items: QwenItem[]) {
  for (const item of items) {
    if (item.type !== "user") continue
    for (const part of item.message?.parts ?? []) {
      if (part.thought || !part.text) continue
      const text = part.text.trim()
      if (text) return text
    }
  }
  return "Untitled Session"
}

export async function qwenInfo(input: {
  dir: string
  id: string
  home?: string
  sessions?: string[]
}) {
  const sessions =
    input.sessions ??
    (() => {
      try {
        return Array.from(Session.list({ directory: input.dir }), (session) => session.id)
      } catch {
        return []
      }
    })()
  const file = qwenChatPath({
    dir: input.dir,
    id: input.id,
    home: input.home,
  })
  const chat = Bun.file(file)
  if (!(await chat.exists())) return
  const items = rows(await chat.text())
  if (items.length === 0) return
  const times = items.flatMap((item) => {
    const out = time(item.timestamp)
    return out === undefined ? [] : [out]
  })
  const start = times[0]
  const updated = times.at(-1)
  if (start === undefined || updated === undefined) return
  return {
    id: input.id,
    sessionID: await linkedSession({
      dir: input.dir,
      qwen: input.id,
      sessions,
    }),
    title: title(items),
    cwd: items.find((item) => item.cwd)?.cwd ?? input.dir,
    start,
    updated,
    messageCount: items.length,
  } satisfies QwenSession
}

export async function listQwenSessions(input: {
  dir: string
  home?: string
  sessions?: string[]
}) {
  const dir = chats(input.dir, input.home)
  const sessions =
    input.sessions ??
    (() => {
      try {
        return Array.from(Session.list({ directory: input.dir }), (session) => session.id)
      } catch {
        return []
      }
    })()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const list = await Promise.all(
    files
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) =>
        qwenInfo({
          dir: input.dir,
          id: file.slice(0, -".jsonl".length),
          home: input.home,
          sessions,
        }),
      ),
  )
  return list
    .flatMap((item) => (item ? [item] : []))
    .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
}
