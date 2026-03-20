import { createHash } from "crypto"
import os from "os"
import path from "path"

function norm(dir: string) {
  return process.platform === "win32" ? dir.toLowerCase() : dir
}

function hash(dir: string) {
  return createHash("sha256").update(norm(dir)).digest("hex")
}

export function qwenProject(dir: string) {
  return norm(dir).replace(/[^a-zA-Z0-9]/g, "-")
}

type Row = {
  cwd?: string
}

export function qwenHome(home?: string) {
  return home ?? process.env.OPENCODE_TEST_HOME ?? process.env.HOME ?? os.homedir()
}

export function qwenChatPath(input: {
  dir: string
  id: string
  home?: string
}) {
  return path.join(qwenHome(input.home), ".qwen", "projects", qwenProject(input.dir), "chats", `${input.id}.jsonl`)
}

export function qwenSessionID(id: string) {
  const buf = createHash("md5").update(id).digest()
  buf[6] = (buf[6] & 0x0f) | 0x40
  buf[8] = (buf[8] & 0x3f) | 0x80
  const hex = buf.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export async function qwenSessionArgs(input: {
  dir: string
  id?: string
  home?: string
}) {
  if (!input.id) return []
  const sid = qwenSessionID(input.id)
  const file = Bun.file(qwenChatPath({ dir: input.dir, id: sid, home: input.home }))
  if (!(await file.exists())) return ["--session-id", sid]

  const line = (await file.text()).split("\n", 1)[0]?.trim()
  if (!line) return ["--session-id", sid]

  let row: Row
  try {
    row = JSON.parse(line) as Row
  } catch {
    return ["--session-id", sid]
  }

  if (!row.cwd) return ["--session-id", sid]
  return hash(row.cwd) === hash(input.dir) ? ["--resume", sid] : ["--session-id", sid]
}
