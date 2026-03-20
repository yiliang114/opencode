import { Storage } from "@/storage/storage"
import { qwenProject, qwenSessionID } from "./session"

type Ref = {
  dir: string
  qwen: string
}

function qkey(input: {
  dir: string
  qwen: string
}) {
  return ["qwen_link", qwenProject(input.dir), input.qwen]
}

function skey(sessionID: string) {
  return ["qwen_session", sessionID]
}

export function findSessionID(input: {
  qwen: string
  sessions: string[]
}) {
  return input.sessions.find((session) => qwenSessionID(session) === input.qwen)
}

export async function linkedSession(input: {
  dir: string
  qwen: string
  sessions?: string[]
}) {
  const id = await Storage.read<string>(qkey(input)).catch(() => undefined)
  if (id) {
    if (!input.sessions || input.sessions.includes(id)) return id
    await Storage.remove(qkey(input)).catch(() => {})
  }
  if (!input.sessions) return
  return findSessionID({
    qwen: input.qwen,
    sessions: input.sessions,
  })
}

export async function linkedQwen(sessionID: string) {
  return Storage.read<Ref>(skey(sessionID)).catch(() => undefined)
}

export async function saveQwenLink(input: {
  dir: string
  qwen: string
  sessionID: string
}) {
  await Storage.write(qkey(input), input.sessionID)
  await Storage.write(skey(input.sessionID), {
    dir: input.dir,
    qwen: input.qwen,
  } satisfies Ref)
}
