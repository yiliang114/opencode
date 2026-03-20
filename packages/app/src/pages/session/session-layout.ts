import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { useLayout } from "@/context/layout"
import { sessionPageKey } from "./qwen-route"

export const useSessionKey = () => {
  const params = useParams()
  const location = useLocation()
  const qwen = createMemo(() => new URLSearchParams(location.search).get("qwen") ?? undefined)
  const sessionKey = createMemo(() => sessionPageKey({ dir: params.dir, id: params.id, qwen: qwen() }))
  return { params, qwen, sessionKey }
}

export const useSessionLayout = () => {
  const layout = useLayout()
  const { params, qwen, sessionKey } = useSessionKey()
  return {
    params,
    qwen,
    sessionKey,
    tabs: createMemo(() => layout.tabs(sessionKey)),
    view: createMemo(() => layout.view(sessionKey)),
  }
}
