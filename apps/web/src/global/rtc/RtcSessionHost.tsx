import { useEffect } from "react"

import useUserStore from "@/UserStore"
import { rtcSession } from "@/global/rtc/RtcSessionController"

function RtcSessionHost() {
  const ws = useUserStore((state) => state.ws)

  useEffect(() => {
    return () => {
      rtcSession.endSession()
    }
  }, [])

  useEffect(() => {
    rtcSession.attachSocket(ws)

    return () => {
      rtcSession.detachSocket(ws)
    }
  }, [ws])

  return null
}

export { RtcSessionHost }
