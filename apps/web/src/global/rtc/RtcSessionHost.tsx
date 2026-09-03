import { useEffect } from "react"

import useUserStore from "@/UserStore"
import { LargeTransferConfirmDialog } from "@/components/rtc/LargeTransferConfirmDialog"
import { PeerDisconnectedDialog } from "@/components/rtc/PeerDisconnectedDialog"
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

  return (
    <>
      <RtcCallOverlay />
      <LargeTransferConfirmDialog />
      <PeerDisconnectedDialog />
    </>
  )
}

export { RtcSessionHost }
