import { useEffect } from "react"

import useUserStore from "@/UserStore"
import { RtcCallOverlay } from "@/global/rtc/RtcCallOverlay"
import { rtcSession } from "@/global/rtc/RtcSessionController"

function RtcSessionHost() {
  const ws = useUserStore((state) => state.ws)

  useEffect(() => {
    const handlePageHide = () => {
      rtcSession.endSession()
    }

    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      rtcSession.endSession()
    }
  }, [])

  useEffect(() => {
    rtcSession.attachSocket(ws)

    return () => {
      rtcSession.detachSocket(ws)
    }
  }, [ws])

  return <RtcCallOverlay />
}

export { RtcSessionHost }
