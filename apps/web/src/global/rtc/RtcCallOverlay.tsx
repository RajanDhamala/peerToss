import { useEffect, useRef } from "react"
import { PhoneOff, Video } from "lucide-react"
import { useLocation, useNavigate } from "react-router"

import { rtcSession } from "@/global/rtc/RtcSessionController"
import useRtcStore, { type CallStatus } from "@/global/rtc/rtcStore"

function useCallTone(callStatus: CallStatus) {
  useEffect(() => {
    if (callStatus !== "incoming" && callStatus !== "outgoing") return

    const context = new AudioContext()
    const intervalMs = callStatus === "incoming" ? 1_800 : 2_400

    const playTone = () => {
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined)
      }

      const now = context.currentTime
      const notes = callStatus === "incoming" ? [660, 880] : [440]

      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const startsAt = now + index * 0.22
        const endsAt = startsAt + 0.18

        oscillator.type = "sine"
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, startsAt)
        gain.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, endsAt)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(startsAt)
        oscillator.stop(endsAt)
      })
    }

    playTone()
    const interval = window.setInterval(playTone, intervalMs)

    return () => {
      window.clearInterval(interval)
      void context.close().catch(() => undefined)
    }
  }, [callStatus])
}

function RtcCallOverlay() {
  const callStatus = useRtcStore((state) => state.callStatus)
  const location = useLocation()
  const navigate = useNavigate()
  const previousCallStatus = useRef(callStatus)

  useCallTone(callStatus)

  useEffect(() => {
    const previousTitle = document.title

    if (callStatus === "incoming") {
      document.title = "Incoming video call · PeerToss"
    } else if (callStatus === "outgoing") {
      document.title = "Calling peer · PeerToss"
    } else {
      return
    }

    return () => {
      document.title = previousTitle
    }
  }, [callStatus])

  useEffect(() => {
    if (
      callStatus !== "incoming" ||
      !document.hidden ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return
    }

    const notification = new Notification("Incoming PeerToss video call", {
      body: "Your peer is waiting for you to answer.",
      tag: "peertoss-video-call",
    })
    notification.onclick = () => window.focus()

    return () => notification.close()
  }, [callStatus])

  useEffect(() => {
    const previous = previousCallStatus.current

    if (callStatus === "active" && location.pathname !== "/call") {
      navigate("/call")
    } else if (
      previous === "active" &&
      callStatus === "idle" &&
      location.pathname === "/call"
    ) {
      navigate("/rtc", { replace: true })
    }

    previousCallStatus.current = callStatus
  }, [callStatus, location.pathname, navigate])

  useEffect(() => {
    if (callStatus !== "incoming" && callStatus !== "outgoing") return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (callStatus === "incoming") rtcSession.rejectVideoCall()
      else rtcSession.cancelVideoCall()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [callStatus])

  if (callStatus !== "incoming" && callStatus !== "outgoing") return null

  const incoming = callStatus === "incoming"

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#14171F]/55 px-4 backdrop-blur-sm">
      <section
        aria-describedby="video-call-description"
        aria-labelledby="video-call-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center text-[#14171F] shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="relative mx-auto grid size-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#F2A33C]/25" />
          <span className="relative grid size-16 place-items-center rounded-full bg-[#14171F] text-white shadow-lg">
            <Video className="size-7" strokeWidth={1.8} />
          </span>
        </div>

        <p className="ptx-mono mt-5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A8776]">
          {incoming ? "Incoming call" : "Calling"}
        </p>
        <h2
          className="ptx-display mt-1.5 text-xl font-semibold"
          id="video-call-title"
        >
          {incoming ? "Peer is calling you" : "Calling your peer…"}
        </h2>
        <p
          className="mx-auto mt-2 max-w-64 text-sm leading-relaxed text-[#6D6A60]"
          id="video-call-description"
        >
          {incoming
            ? "Accept to open the private video call, or decline to stay here."
            : "The request was sent through your direct WebRTC connection."}
        </p>

        {incoming ? (
          <div className="mt-7 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => rtcSession.rejectVideoCall()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#E4E1DA] bg-white text-sm font-semibold transition-colors hover:bg-[#F5F4F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
            >
              <PhoneOff className="size-4" strokeWidth={1.9} />
              Decline
            </button>
            <button
              type="button"
              onClick={() => rtcSession.acceptVideoCall()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16947F] text-sm font-semibold text-white transition-colors hover:bg-[#117B6A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
            >
              <Video className="size-4" strokeWidth={1.9} />
              Accept
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => rtcSession.cancelVideoCall()}
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
          >
            <PhoneOff className="size-4" strokeWidth={1.9} />
            Cancel call
          </button>
        )}
      </section>
    </div>
  )
}

export { RtcCallOverlay }
