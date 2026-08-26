import { Link } from "react-router"

import useRtcStore from "@/global/rtc/rtcStore"

const CallPage = () => {
  const status = useRtcStore((state) => state.status)
  const chatReady = useRtcStore((state) => state.chatReady)
  const fileReady = useRtcStore((state) => state.fileReady)
  const directConnectionOpen = chatReady && fileReady

  return (
    <main className="min-h-dvh bg-[#F5F4F0] p-8 text-[#14171F]">
      <h1 className="text-2xl font-semibold">Welcome to the call page</h1>
      <p className="mt-2 text-sm text-[#4B5160]">
        {directConnectionOpen
          ? "The existing direct WebRTC connection is active."
          : `WebRTC status: ${status}.`}
      </p>
      <Link
        to="/rtc"
        className="mt-5 inline-flex rounded-lg bg-[#14171F] px-4 py-2 text-sm font-medium text-white"
      >
        Open transfer workspace
      </Link>
    </main>
  )
}


export default CallPage
