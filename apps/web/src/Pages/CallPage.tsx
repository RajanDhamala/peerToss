import { useNavigate } from "react-router"
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  UserRound,
  Video,
  VideoOff,
} from "lucide-react"

import { MessagePanel } from "@/components/rtc/MessagePanel"
import {
  ScreenShareSourceDialog,
  type ScreenShareSource,
} from "@/components/rtc/ScreenShareSourceDialog"
import useRtcStore from "@/global/rtc/rtcStore"
import { rtcSession } from "@/global/rtc/RtcSessionController"

type ScreenSharePickerOptions = DisplayMediaStreamOptions & {
  monitorTypeSurfaces?: "include" | "exclude"
  preferCurrentTab?: boolean
  selfBrowserSurface?: "include" | "exclude"
  surfaceSwitching?: "include" | "exclude"
}

function getScreenSharePickerOptions(
  source: ScreenShareSource
): ScreenSharePickerOptions {
  return {
    audio: false,
    video: { displaySurface: source },
    monitorTypeSurfaces: "include",
    preferCurrentTab: source === "browser",
    selfBrowserSurface: "include",
    surfaceSwitching: "include",
  }
}

const CallPage = () => {
  const navigate = useNavigate()
  const status = useRtcStore((state) => state.status)
  const chatReady = useRtcStore((state) => state.chatReady)
  const fileReady = useRtcStore((state) => state.fileReady)
  const messages = useRtcStore((state) => state.messages)
  const sendingFile = useRtcStore((state) => state.sendingFile)
  const speedTestRunning = useRtcStore((state) => state.speedTestRunning)

  const directConnectionOpen = chatReady && fileReady
  const incomingItemCount = messages.reduce(
    (count, message) => count + (message.mine ? 0 : 1),
    0
  )

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraActive, setCameraActive] = useState(
    () =>
      rtcSession.getLocalVideoSource() === "camera" &&
      (rtcSession
        .getLocalStream()
        ?.getVideoTracks()
        .some((track) => track.readyState === "live" && track.enabled) ?? false)
  )
  const [screenSharing, setScreenSharing] = useState(
    () =>
      rtcSession.getLocalVideoSource() === "screen" &&
      (rtcSession
        .getLocalStream()
        ?.getVideoTracks()
        .some((track) => track.readyState === "live" && track.enabled) ?? false)
  )
  const [microphoneActive, setMicrophoneActive] = useState(
    () =>
      rtcSession
        .getLocalStream()
        ?.getAudioTracks()
        .some((track) => track.readyState === "live" && track.enabled) ?? false
  )
  const [remoteActive, setRemoteActive] = useState(false)
  const [mediaPublished, setMediaPublished] = useState(() =>
    rtcSession.isLocalStreamPublished()
  )
  const [screenShareDialogOpen, setScreenShareDialogOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [lastReadIncomingCount, setLastReadIncomingCount] = useState(
    incomingItemCount
  )
  const [pendingAction, setPendingAction] = useState<
    "camera" | "screen" | "stop" | null
  >(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const unreadCount = conversationOpen
    ? 0
    : Math.max(0, incomingItemCount - lastReadIncomingCount)
  const microphoneAvailable =
    rtcSession
      .getLocalStream()
      ?.getAudioTracks()
      .some((track) => track.readyState === "live") ?? false
  const localVisualActive = cameraActive || screenSharing

  useEffect(() => {
    const localStream = rtcSession.getLocalStream()
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }

    const unsubscribe = rtcSession.subscribeRemoteStream((remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream
      }
      setRemoteActive(remoteStream !== null)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const sendCallMessage = () => {
    if (rtcSession.sendMessage(draft)) setDraft("")
  }

  const handleConversationOpenChange = (open: boolean) => {
    setLastReadIncomingCount(incomingItemCount)
    setConversationOpen(open)
  }

  const showLocalStream = (stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }

    const source = rtcSession.getLocalVideoSource()
    const videoActive = stream
      .getVideoTracks()
      .some((track) => track.readyState === "live" && track.enabled)
    setCameraActive(source === "camera" && videoActive)
    setScreenSharing(source === "screen" && videoActive)
    setMicrophoneActive(
      stream
        .getAudioTracks()
        .some((track) => track.readyState === "live" && track.enabled)
    )
    setMediaPublished(rtcSession.isLocalStreamPublished())
  }

  const startVideo = async () => {
    setMediaError(null)
    setPendingAction("camera")
    let capturedStream: MediaStream | null = null

    try {
      const existingStream = rtcSession.getLocalStream()
      const existingVideoTrack = existingStream
        ?.getVideoTracks()
        .find((track) => track.readyState === "live")

      if (
        rtcSession.getLocalVideoSource() === "camera" &&
        existingStream &&
        existingVideoTrack
      ) {
        existingVideoTrack.enabled = true
        showLocalStream(existingStream)
        if (!rtcSession.isLocalStreamPublished()) {
          await rtcSession.publishLocalStream()
          setMediaPublished(rtcSession.isLocalStreamPublished())
        }
        return
      }

      const existingAudioTracks =
        existingStream
          ?.getAudioTracks()
          .filter((track) => track.readyState === "live") ?? []
      capturedStream = await navigator.mediaDevices.getUserMedia({
        audio: existingAudioTracks.length === 0,
        video: true,
      })
      const cameraTrack = capturedStream.getVideoTracks()[0]
      if (!cameraTrack) throw new Error("No camera video track was returned")

      const audioTracks = existingAudioTracks.length > 0
        ? existingAudioTracks
        : capturedStream.getAudioTracks()
      const nextStream = new MediaStream([...audioTracks, cameraTrack])
      const wasPublished = existingStream
        ? await rtcSession.replaceLocalStream(nextStream, "camera")
        : false

      if (!existingStream) rtcSession.setLocalStream(nextStream, "camera")
      showLocalStream(rtcSession.getLocalStream() ?? nextStream)
      if (!wasPublished) {
        await rtcSession.publishLocalStream()
        setMediaPublished(rtcSession.isLocalStreamPublished())
      }
    } catch (error) {
      console.error("Could not start local media", error)
      const localStream = rtcSession.getLocalStream()
      const activeTracks = new Set(localStream?.getTracks() ?? [])
      capturedStream
        ?.getTracks()
        .filter((track) => !activeTracks.has(track))
        .forEach((track) => track.stop())

      if (localStream) showLocalStream(localStream)
      setMediaPublished(rtcSession.isLocalStreamPublished())
      setMediaError(
        localStream?.getVideoTracks().some((track) => track.readyState === "live")
          ? "Your camera is ready locally, but it could not be sent to the peer."
          : "Camera or microphone access was not available."
      )
    } finally {
      setPendingAction(null)
    }
  }

  const toggleCamera = async () => {
    if (rtcSession.getLocalVideoSource() === "screen") {
      await startVideo()
      return
    }

    const videoTrack = rtcSession
      .getLocalStream()
      ?.getVideoTracks()
      .find((track) => track.readyState === "live")

    if (!videoTrack) {
      await startVideo()
      return
    }

    videoTrack.enabled = !videoTrack.enabled
    setCameraActive(videoTrack.enabled)
  }

  const stopScreenShare = async (expectedTrack?: MediaStreamTrack) => {
    if (rtcSession.getLocalVideoSource() !== "screen") return

    const currentStream = rtcSession.getLocalStream()
    const screenTrack = currentStream?.getVideoTracks()[0]
    if (!currentStream || (expectedTrack && screenTrack !== expectedTrack)) {
      return
    }

    setMediaError(null)
    setPendingAction("screen")
    try {
      const remainingAudio = currentStream
        .getAudioTracks()
        .filter((track) => track.readyState === "live")
      const audioOnlyStream = new MediaStream(remainingAudio)
      await rtcSession.replaceLocalStream(audioOnlyStream, null)
      showLocalStream(rtcSession.getLocalStream() ?? audioOnlyStream)
    } catch (error) {
      console.error("Could not stop screen sharing", error)
      setMediaError("Screen sharing could not be stopped cleanly.")
    } finally {
      setPendingAction(null)
    }
  }

  const startScreenShare = async (source: ScreenShareSource) => {
    setMediaError(null)
    setPendingAction("screen")
    let capturedStream: MediaStream | null = null

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported in this browser")
      }

      capturedStream = await navigator.mediaDevices.getDisplayMedia(
        getScreenSharePickerOptions(source)
      )
      const screenTrack = capturedStream.getVideoTracks()[0]
      if (!screenTrack) throw new Error("No screen video track was returned")

      const existingStream = rtcSession.getLocalStream()
      const existingAudioTracks =
        existingStream
          ?.getAudioTracks()
          .filter((track) => track.readyState === "live") ?? []
      const nextStream = new MediaStream([...existingAudioTracks, screenTrack])
      const wasPublished = existingStream
        ? await rtcSession.replaceLocalStream(nextStream, "screen")
        : false

      if (!existingStream) rtcSession.setLocalStream(nextStream, "screen")

      screenTrack.addEventListener(
        "ended",
        () => {
          void stopScreenShare(screenTrack)
        },
        { once: true }
      )

      showLocalStream(rtcSession.getLocalStream() ?? nextStream)

      if (!wasPublished) {
        try {
          await rtcSession.publishLocalStream()
          setMediaPublished(rtcSession.isLocalStreamPublished())
        } catch (error) {
          console.error("Could not publish the selected screen", error)
          setMediaPublished(rtcSession.isLocalStreamPublished())
          setMediaError("Your screen was selected, but it could not be sent.")
        }
      }
    } catch (error) {
      console.error("Could not start screen sharing", error)
      const activeTracks = new Set(
        rtcSession.getLocalStream()?.getTracks() ?? []
      )
      capturedStream
        ?.getTracks()
        .filter((track) => !activeTracks.has(track))
        .forEach((track) => track.stop())
      setMediaError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Screen sharing was cancelled."
          : "Screen sharing is not available right now."
      )
    } finally {
      setPendingAction(null)
    }
  }

  const toggleScreenShare = async () => {
    if (rtcSession.getLocalVideoSource() === "screen") {
      await stopScreenShare()
    } else {
      setScreenShareDialogOpen(true)
    }
  }

  const handleScreenShareSource = (source: ScreenShareSource) => {
    setScreenShareDialogOpen(false)
    void startScreenShare(source)
  }

  const toggleMicrophone = () => {
    const audioTrack = rtcSession
      .getLocalStream()
      ?.getAudioTracks()
      .find((track) => track.readyState === "live")
    if (!audioTrack) return

    audioTrack.enabled = !audioTrack.enabled
    setMicrophoneActive(audioTrack.enabled)
  }

  const stopVideo = async () => {
    setMediaError(null)
    setPendingAction("stop")
    try {
      await rtcSession.endVideoCall()
    } catch (error) {
      console.error("Could not finish ending the video call", error)
    } finally {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }
      setCameraActive(false)
      setScreenSharing(false)
      setMicrophoneActive(false)
      setMediaPublished(false)
      setPendingAction(null)
      navigate("/rtc")
    }
  }

  const connectionLabel = directConnectionOpen
    ? "Peer connected"
    : status === "connected"
      ? "Connection ready"
      : status

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      <video
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
          remoteActive ? "opacity-100" : "opacity-0"
        }`}
        ref={remoteVideoRef}
        playsInline
        autoPlay
      />

      {!remoteActive && (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950 px-6 text-center">
          <div className="flex flex-col items-center">
            <div className="grid size-20 place-items-center rounded-full bg-white/10 sm:size-24">
              <UserRound className="size-9 text-white/60 sm:size-11" />
            </div>
            <h1 className="mt-5 text-lg font-medium sm:text-xl">
              Waiting for peer
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Their video will appear here
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/70 to-transparent" />

      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 p-3 sm:p-5">
        <button
          type="button"
          onClick={() => void stopVideo()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-black/45 px-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/65"
        >
          <ArrowLeft className="size-4" strokeWidth={1.9} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <p className="text-sm font-semibold sm:text-base">PeerToss Call</p>
          {mediaPublished && (
            <p className="mt-0.5 text-[11px] text-white/60">
              {screenSharing ? "You are sharing your screen" : "You are live"}
            </p>
          )}
        </div>

        <div className="inline-flex h-10 items-center gap-2 rounded-full bg-black/45 px-3 text-xs font-medium backdrop-blur-md sm:text-sm">
          <span
            className={`size-2 rounded-full ${
              directConnectionOpen ? "bg-emerald-400" : "bg-white/40"
            }`}
          />
          <span className="max-w-28 truncate capitalize sm:max-w-44">
            {connectionLabel}
          </span>
        </div>
      </header>

      <MessagePanel
        open={conversationOpen}
        onOpenChange={handleConversationOpenChange}
        messages={messages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={sendCallMessage}
        onSendFile={(file) => {
          void rtcSession.sendFile(file)
        }}
        onSendFolder={(files, ignoredEntryCount, ignoreGenerated) => {
          void rtcSession.sendFolder(
            files,
            ignoredEntryCount,
            ignoreGenerated
          )
        }}
        connected={chatReady}
        fileConnected={fileReady && !speedTestRunning}
        sendingFile={sendingFile}
      />

      <ScreenShareSourceDialog
        open={screenShareDialogOpen}
        onOpenChange={setScreenShareDialogOpen}
        onShare={handleScreenShareSource}
      />

      <div className="absolute bottom-28 right-3 z-20 aspect-video w-36 overflow-hidden rounded-xl border border-white/20 bg-zinc-900 shadow-2xl sm:bottom-5 sm:right-5 sm:w-64 lg:w-72">
        <video
          className={`size-full transition-opacity ${
            screenSharing ? "object-contain" : "-scale-x-100 object-cover"
          } ${
            localVisualActive ? "opacity-100" : "opacity-0"
          }`}
          ref={localVideoRef}
          playsInline
          autoPlay
          muted
        />

        {!localVisualActive && (
          <div className="absolute inset-0 grid place-items-center text-white/50">
            <VideoOff className="size-6 sm:size-8" strokeWidth={1.7} />
          </div>
        )}

        <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] font-medium backdrop-blur sm:text-xs">
          {screenSharing ? "Your screen" : "You"}
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="absolute inset-x-0 bottom-4 z-30 flex flex-col items-center px-3 sm:bottom-6">
        {mediaError && (
          <p
            className="mb-3 rounded-full bg-black/60 px-3 py-1.5 text-center text-xs text-red-300 backdrop-blur-md"
            aria-live="polite"
          >
            {mediaError}
          </p>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111214]/95 p-2 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={toggleMicrophone}
            disabled={!microphoneAvailable || pendingAction !== null}
            className={`grid size-11 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 sm:size-12 ${
              microphoneActive
                ? "bg-[#2B2D31] text-white hover:bg-[#35373C]"
                : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
            }`}
            aria-label={microphoneActive ? "Mute microphone" : "Unmute microphone"}
            title={microphoneActive ? "Mute" : "Unmute"}
          >
            {microphoneActive ? (
              <Mic className="size-5" strokeWidth={1.9} />
            ) : (
              <MicOff className="size-5" strokeWidth={1.9} />
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleCamera()}
            disabled={pendingAction !== null}
            className={`grid size-11 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 sm:size-12 ${
              cameraActive
                ? "bg-[#2B2D31] text-white hover:bg-[#35373C]"
                : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
            }`}
            aria-label={
              screenSharing
                ? "Switch from screen sharing to camera"
                : cameraActive
                  ? "Turn camera off"
                  : "Turn camera on"
            }
            title={
              screenSharing
                ? "Switch to camera"
                : cameraActive
                  ? "Turn camera off"
                  : "Turn camera on"
            }
          >
            {cameraActive ? (
              <Video className="size-5" strokeWidth={1.9} />
            ) : (
              <VideoOff className="size-5" strokeWidth={1.9} />
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            disabled={pendingAction !== null}
            className={`grid size-11 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 sm:size-12 ${
              screenSharing
                ? "bg-emerald-500 text-white hover:bg-emerald-400"
                : "bg-[#2B2D31] text-white hover:bg-[#35373C]"
            }`}
            aria-label={screenSharing ? "Stop sharing screen" : "Share screen"}
            title={screenSharing ? "Stop sharing screen" : "Share screen"}
          >
            {screenSharing ? (
              <ScreenShareOff
                className={`size-5 ${pendingAction === "screen" ? "animate-pulse" : ""}`}
                strokeWidth={1.9}
              />
            ) : (
              <ScreenShare
                className={`size-5 ${pendingAction === "screen" ? "animate-pulse" : ""}`}
                strokeWidth={1.9}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleConversationOpenChange(true)}
            className="relative grid size-11 place-items-center rounded-xl bg-[#2B2D31] text-white transition-colors hover:bg-[#35373C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:size-12"
            aria-label={
              unreadCount > 0
                ? `Open messages, ${unreadCount} unread`
                : "Open messages and files"
            }
            title="Messages and files"
          >
            <MessageSquare className="size-5" strokeWidth={1.9} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-[#111214]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden="true" />

          <button
            type="button"
            onClick={stopVideo}
            disabled={pendingAction !== null}
            className="grid size-11 place-items-center rounded-xl bg-red-500 text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 sm:size-12"
            aria-label="End video call"
            title="End call"
          >
            <PhoneOff className="size-5" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </main>
  )
}

export default CallPage
