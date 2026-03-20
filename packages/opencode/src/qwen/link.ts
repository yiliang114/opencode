import { Session } from "@/session"
import { SessionID } from "@/session/schema"
import { linkedSession, saveQwenLink } from "./map"
import { qwenInfo } from "./list"
import { QwenSync } from "./sync"

export async function linkQwen(input: {
  dir: string
  qwen: string
}) {
  const sessions = Array.from(Session.list({ directory: input.dir }), (session) => session.id)
  const id = await linkedSession({
    dir: input.dir,
    qwen: input.qwen,
    sessions,
  })
  if (id) return Session.get(SessionID.make(id))

  const info = await qwenInfo({
    dir: input.dir,
    id: input.qwen,
    sessions,
  })
  if (!info) throw new Error(`Qwen session not found: ${input.qwen}`)

  const session = await Session.createNext({
    directory: input.dir,
    title: info.title,
  })
  await QwenSync.run({
    sessionID: session.id,
    qwen: input.qwen,
  })
  await saveQwenLink({
    dir: input.dir,
    qwen: input.qwen,
    sessionID: session.id,
  })
  return session
}
