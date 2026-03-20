import path from "path"
import { readdir } from "fs/promises"
import type { QwenItem } from "./sync"
import { qwenHome } from "./session"

export type QwenSession = {
  id: string
  title: string
  cwd: string
  start: number
  updated: number
  messageCount: number
}

function chats(dir: string, home?: string) {
  return path.join(qwenHome(home), ".qwen", "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"), "chats")
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

async function read(file: string, id: string, dir: string) {
  const items = rows(await Bun.file(file).text())
  if (items.length === 0) return
  const times = items.flatMap((item) => {
    const out = time(item.timestamp)
    return out === undefined ? [] : [out]
  })
  const start = times[0]
  const updated = times.at(-1)
  if (start === undefined || updated === undefined) return
  return {
    id,
    title: title(items),
    cwd: items.find((item) => item.cwd)?.cwd ?? dir,
    start,
    updated,
    messageCount: items.length,
  } satisfies QwenSession
}

export async function listQwenSessions(input: {
  dir: string
  home?: string
}) {
  const dir = chats(input.dir, input.home)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const list = await Promise.all(
    files
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => read(path.join(dir, file), file.slice(0, -".jsonl".length), input.dir)),
  )
  return list
    .flatMap((item) => (item ? [item] : []))
    .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
}
