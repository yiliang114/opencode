import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { sessionPageKey } from "@/pages/session/qwen-route"
import { decode64 } from "@/utils/base64"
import { refreshSession } from "./sidebar-refresh"

export function useSidebarSync() {
  const location = useLocation()
  const params = useParams()
  const layout = useLayout()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const qwen = createMemo(() => new URLSearchParams(location.search).get("qwen") ?? undefined)
  const key = createMemo(() => sessionPageKey({ dir: params.dir, id: params.id, qwen: qwen() }))
  const surface = createMemo(() => layout.view(key()).surface.current())
  const dir = createMemo(() => decode64(params.dir) ?? "")

  return {
    url: sdk.url,
    surface,
    reload(sessionID: string) {
      const root = dir()
      if (!root) return
      return refreshSession({
        directory: root,
        sessionID,
        sdk,
        sync,
      })
    },
  }
}
