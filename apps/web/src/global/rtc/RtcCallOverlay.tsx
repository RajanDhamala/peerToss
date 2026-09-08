import { useEffect, useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
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

  if (callStatus !== "incoming" && callStatus !== "outgoing") return null

  const incoming = callStatus === "incoming"
  const dismissCall = () => {
    if (incoming) rtcSession.rejectVideoCall()
    else rtcSession.cancelVideoCall()
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) dismissCall()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/30" />
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[101] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-card font-sans text-card-foreground shadow-xl focus:outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
        >
          <div className="flex items-center gap-3.5 px-5 py-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground">
              <Video className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">
                {incoming ? "Incoming video call" : "Calling your peer…"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                {incoming ? "Your peer is waiting." : "Waiting for an answer."}
              </Dialog.Description>
            </div>
          </div>

          <div className={`grid gap-3 border-t border-border p-4 ${incoming ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={dismissCall}
              className="inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] motion-reduce:transition-none"
            >
              <PhoneOff className="size-4 text-red-600 dark:text-red-400" strokeWidth={1.9} aria-hidden="true" />
              {incoming ? "Decline" : "Cancel call"}
            </button>
            {incoming && (
              <button
                type="button"
                onClick={() => rtcSession.acceptVideoCall()}
                className="inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#357A4B] px-3 text-sm font-medium text-white transition-colors hover:bg-[#2C663E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
              >
                <Video className="size-4" strokeWidth={1.9} aria-hidden="true" />
                Answer
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { RtcCallOverlay }
