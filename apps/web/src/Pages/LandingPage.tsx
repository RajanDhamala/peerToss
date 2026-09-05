import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useLocation, useNavigate } from "react-router"
import toast from "react-hot-toast"
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Loader2,
  QrCode,
  ScanLine,
  Share2,
} from "lucide-react"

import useUserStore, { type AppWebSocket } from "@/UserStore"
import { rtcSession } from "@/global/rtc/RtcSessionController"
import { getApiErrorMessage } from "@/Utils/apiError"
import {
  backendEndpoint,
  WEBSOCKET_URL,
} from "@/Config/Environment"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type CreatedSession = {
  session_id: string
}

type WsMessage = {
  SocketId?: unknown
  event?: string
  data?: { user2?: string }
}

type SessionRole = "creator" | "participant"
type LandingNavigationState = {
  roomAction?: "join" | "create"
}

type BootstrapSocket = {
  socket: AppWebSocket
  cleanup: () => void
}

const COPY_THROTTLE_MS = 1_500
const COPY_FEEDBACK_TOAST_ID = "landing-copy-feedback"

const LazyQrScanner = lazy(() => import("@/components/QrScanner"))
const LazyQrCode = lazy(() =>
  import("qrcode.react").then(({ QRCodeSVG }) => ({ default: QRCodeSVG }))
)

function getSessionTokenFromQr(value: string) {
  const scannedValue = value.trim()

  try {
    const url = new URL(scannedValue)
    const queryToken = url.searchParams.get("token")?.trim()
    if (queryToken) return queryToken

    const pathToken = url.pathname.match(/\/join\/([^/]+)\/?$/)?.[1]
    if (pathToken) return decodeURIComponent(pathToken).trim()
  } catch {
    // Existing QR codes contain only the raw session code.
  }

  return scannedValue
}

const FAQ_ITEMS = [
  {
    question: "How does a private room work?",
    answer:
      "Create a temporary room and share its QR code or pairing code. As soon as the second device joins, both devices move into the transfer room automatically.",
  },
  {
    question: "Are my files uploaded to PeerToss?",
    answer:
      "No. The server coordinates the temporary connection, while your files travel directly between the paired devices over WebRTC.",
  },
  {
    question: "What can I send?",
    answer:
      "Share entire folders, PDFs, presentations, images, videos, archives, and any other file type. You can also send links and text in the same room.",
  },
  {
    question: "Can I make calls and share my screen?",
    answer:
      "Yes. Once you have paired your devices, you can start a video or audio call and share your screen from the room. Your browser will ask for permission before using your camera, microphone, or screen.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No account or permanent room is required. Create a room, pair the other device, share what you need, and disconnect when you are done.",
  },
  {
    question: "What happens when the session ends?",
    answer:
      "The temporary connection closes and the room cannot be reused. Create a fresh room the next time you want to share.",
  },
] as const

// Visible artwork bounds, padded slightly to preserve the antialiased edges.
// Only the display is cropped; the supplied PNG files stay unchanged.
const HERO_ILLUSTRATION_LAYERS = [
  {
    name: "phone",
    src: "/phonechat.png",
    crop: { x: 401, y: 126, width: 466, height: 1064 },
    position: { x: 700, y: 22, width: 420 },
    mobilePosition: { x: 130, y: 8, width: 200 },
    motion: { y: 0, duration: 8.8, delay: -0.8 },
  },
  {
    name: "folder",
    src: "/folderdownload.png",
    crop: { x: 92, y: 337, width: 1085, height: 685 },
    position: { x: 160, y: 152, width: 594 },
    mobilePosition: { x: 0, y: 116, width: 228 },
    motion: { y: -8, duration: 7.4, delay: -2.6 },
  },
  {
    name: "call",
    src: "/videocall.png",
    crop: { x: 314, y: 224, width: 646, height: 881 },
    position: { x: 227, y: 449, width: 370 },
    mobilePosition: null,
    motion: { y: -6, duration: 8.2, delay: -4.8 },
  },
  {
    name: "connection",
    src: "/speedtransfer.png",
    crop: { x: 488, y: 215, width: 438, height: 933 },
    position: { x: 1120, y: 337, width: 290 },
    mobilePosition: null,
    motion: { y: -7, duration: 9.6, delay: -6.2 },
  },
] as const

function HeroIllustration() {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const layers = Array.from(stage.querySelectorAll<HTMLElement>("[data-hero-layer]"))
    let disposed = false
    let inView = false
    let densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)

    function paintLayer(element: HTMLElement, index: number) {
      if (disposed) return
      const image = element.querySelector("img")
      const canvas = element.querySelector("canvas")
      const context = canvas?.getContext("2d")
      const { width, height } = element.getBoundingClientRect()
      if (!image?.complete || !image.naturalWidth || !canvas || !context || !width || !height) return

      // Prepare a detailed crop only on load/resize. CSS moves the finished
      // layer continuously; there is no per-frame redraw or pixel snapping.
      const density = Math.max(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      const { crop } = HERO_ILLUSTRATION_LAYERS[index]
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = "high"
      context.drawImage(
        image,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, canvas.width, canvas.height
      )
      element.dataset.ready = "true"
    }

    function paintLayers() {
      layers.forEach(paintLayer)
    }

    function updatePlayback() {
      stage!.style.setProperty("--hero-play-state", inView && !document.hidden ? "running" : "paused")
    }

    function handleDensityChange() {
      densityQuery.removeEventListener("change", handleDensityChange)
      densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      densityQuery.addEventListener("change", handleDensityChange)
      paintLayers()
    }

    const resizeObserver = new ResizeObserver(paintLayers)
    layers.forEach((element) => resizeObserver.observe(element))
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      updatePlayback()
    })
    visibilityObserver.observe(stage)
    densityQuery.addEventListener("change", handleDensityChange)
    document.addEventListener("visibilitychange", updatePlayback)

    layers.forEach((element, index) => {
      const image = element.querySelector("img")
      void image?.decode()
        .then(() => paintLayer(element, index))
        .catch(() => {
          // The original PNG remains the fallback if decoding fails.
        })
    })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      densityQuery.removeEventListener("change", handleDensityChange)
      document.removeEventListener("visibilitychange", updatePlayback)
    }
  }, [])

  return (
    <div
      ref={stageRef}
      role="img"
      aria-label="PeerToss messages and direct file sharing between connected devices."
      className="peertoss-hero-illustration pointer-events-none relative isolate mx-auto w-full min-w-0"
    >
      <style>{`
        .peertoss-hero-illustration {
          aspect-ratio: 350 / 480;
          max-width: 360px;
        }
        .peertoss-hero-layer {
          position: absolute;
          display: var(--hero-mobile-display);
          left: var(--hero-mobile-x);
          top: var(--hero-mobile-y);
          width: var(--hero-mobile-width);
          --hero-drift: var(--hero-mobile-drift);
          animation: peertoss-hero-drift var(--hero-duration) ease-in-out var(--hero-delay) infinite;
          animation-play-state: var(--hero-play-state, paused);
        }
        .peertoss-hero-layer[data-hero-layer="phone"] { animation: none; }
        .peertoss-hero-layer canvas { visibility: hidden; }
        .peertoss-hero-layer[data-ready="true"] canvas { visibility: visible; }
        .peertoss-hero-layer[data-ready="true"] img { visibility: hidden; }
        @keyframes peertoss-hero-drift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(var(--hero-drift)); }
        }
        @media (min-width: 640px) {
          .peertoss-hero-illustration {
            aspect-ratio: 1340 / 1030;
            max-width: 780px;
          }
          .peertoss-hero-layer {
            display: block;
            left: var(--hero-x);
            top: var(--hero-y);
            width: var(--hero-width);
            --hero-drift: var(--hero-desktop-drift);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .peertoss-hero-layer { animation: none; }
        }
      `}</style>

      {HERO_ILLUSTRATION_LAYERS.map(({ name, src, crop, position, mobilePosition, motion }) => (
        <div
          key={name}
          data-hero-layer={name}
          aria-hidden="true"
          className="peertoss-hero-layer"
          style={{
            "--hero-x": `${((position.x - 110) / 1340) * 100}%`,
            "--hero-y": `${(position.y / 1030) * 100}%`,
            "--hero-width": `${(position.width / 1340) * 100}%`,
            "--hero-mobile-display": mobilePosition ? "block" : "none",
            "--hero-mobile-x": `${((mobilePosition?.x ?? 0) / 350) * 100}%`,
            "--hero-mobile-y": `${((mobilePosition?.y ?? 0) / 480) * 100}%`,
            "--hero-mobile-width": `${((mobilePosition?.width ?? 0) / 350) * 100}%`,
            "--hero-mobile-drift": `${motion.y * 0.6}px`,
            "--hero-desktop-drift": `${motion.y}px`,
            "--hero-duration": `${motion.duration}s`,
            "--hero-delay": `${motion.delay}s`,
            aspectRatio: `${crop.width} / ${crop.height}`,
          } as CSSProperties}
        >
          <div className="relative size-full overflow-hidden">
            <img
              src={src}
              alt=""
              width={1254}
              height={1254}
              fetchPriority={name === "phone" ? "high" : "auto"}
              decoding="async"
              draggable={false}
              className="absolute block h-auto max-w-none select-none"
              style={{
                width: `${(1254 / crop.width) * 100}%`,
                left: `${(-crop.x / crop.width) * 100}%`,
                top: `${(-crop.y / crop.height) * 100}%`,
              }}
            />
            <canvas aria-hidden="true" className="absolute inset-0 block size-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

const LandingPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const requestedRoomAction = (
    location.state as LandingNavigationState | null
  )?.roomAction
  const setWs = useUserStore((state) => state.setWs)

  const [confirmOpen, setConfirmOpen] = useState(
    requestedRoomAction === "create"
  )
  const [closeSessionConfirmOpen, setCloseSessionConfirmOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState<CreatedSession | null>(null)

  const [joinOpen, setJoinOpen] = useState(
    requestedRoomAction === "join"
  )
  const [joinCode, setJoinCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinMode, setJoinMode] = useState<"code" | "scan">("code")
  const bootstrapSocketRef = useRef<BootstrapSocket | null>(null)
  const sessionAttemptRef = useRef(0)
  const lastCopyAtRef = useRef(0)
  const sharePendingRef = useRef(false)

  const sessionJoinUrl = session
    ? `${window.location.origin}/join?token=${encodeURIComponent(session.session_id)}`
    : ""

  useEffect(() => {
    if (!requestedRoomAction) return
    navigate("/", { replace: true, state: null })
  }, [navigate, requestedRoomAction])

  // Keep the landing page and its portaled dialogs light during testing.
  // Restore the previous document theme when leaving this page.
  useLayoutEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains("dark")
    const previousColorScheme = root.style.colorScheme
    root.classList.remove("dark")
    root.style.colorScheme = "light"

    return () => {
      root.classList.toggle("dark", wasDark)
      root.style.colorScheme = previousColorScheme
    }
  }, [])

  const clearPreviousSession = useCallback(() => {
    const bootstrapSocket = bootstrapSocketRef.current
    const storedSocket = useUserStore.getState().ws

    bootstrapSocket?.cleanup()
    rtcSession.endSession()

    const sockets = new Set<AppWebSocket>()
    if (bootstrapSocket) sockets.add(bootstrapSocket.socket)
    if (storedSocket) sockets.add(storedSocket)

    for (const socket of sockets) {
      if (socket.readyState < WebSocket.CLOSING) socket.close()
    }

    setWs(null)
    setSession(null)
    setCloseSessionConfirmOpen(false)
    setCreating(false)
    setJoining(false)

    sessionAttemptRef.current += 1
    return sessionAttemptRef.current
  }, [setWs])

  const connectSessionSocket = useCallback(
    (role: SessionRole, attemptId: number) => {
      if (sessionAttemptRef.current !== attemptId) return

      rtcSession.setNegotiationRole(role)
      const socket = new WebSocket(WEBSOCKET_URL) as AppWebSocket
      let identified = false
      let failureShown = false

      function cleanupBootstrapListeners() {
        socket.removeEventListener("message", handleBootstrapMessage)
        socket.removeEventListener("error", failBeforeReady)
        socket.removeEventListener("close", failBeforeReady)
        if (bootstrapSocketRef.current?.socket === socket) {
          bootstrapSocketRef.current = null
        }
      }

      function failBeforeReady() {
        if (sessionAttemptRef.current !== attemptId) {
          cleanupBootstrapListeners()
          return
        }

        if (identified || failureShown) {
          cleanupBootstrapListeners()
          return
        }
        failureShown = true
        cleanupBootstrapListeners()
        setJoining(false)
        if (useUserStore.getState().ws === socket) setWs(null)
        if (role === "creator") setSession(null)
        toast.error("Could not establish the session connection")
      }

      function handleBootstrapMessage(event: MessageEvent) {
        if (sessionAttemptRef.current !== attemptId) {
          cleanupBootstrapListeners()
          if (socket.readyState < WebSocket.CLOSING) socket.close()
          return
        }

        if (typeof event.data !== "string") return

        let message: WsMessage
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }

        if (typeof message.SocketId === "string") {
          identified = true
          socket.id = message.SocketId
          rtcSession.attachSocket(socket)
          rtcSession.startPeer()
          setWs(socket)

          if (role === "participant") {
            cleanupBootstrapListeners()
            setJoining(false)
            setJoinOpen(false)
            toast.success("Connected to the sharing room")
            navigate("/rtc", { replace: true })
          }
          return
        }

        if (role === "creator" && message.event === "user-joined") {
          cleanupBootstrapListeners()
          toast.success("Your peer joined the room")
          rtcSession.scheduleInitialOffer(socket)
          navigate("/rtc", { replace: true })
        }
      }

      socket.addEventListener("message", handleBootstrapMessage)
      socket.addEventListener("error", failBeforeReady)
      socket.addEventListener("close", failBeforeReady)
      bootstrapSocketRef.current = {
        socket,
        cleanup: cleanupBootstrapListeners,
      }
      setWs(socket)

      return socket
    },
    [navigate, setWs]
  )

  const handleCreateSession = async () => {
    const attemptId = clearPreviousSession()
    setCreating(true)
    try {
      const response = await fetch(backendEndpoint("createSession"))
      const body = await response.json().catch(() => ({}))
      if (sessionAttemptRef.current !== attemptId) return
      if (!response.ok || body.error || typeof body.session_id !== "string") {
        throw new Error(
          getApiErrorMessage(response, body, "Failed to create session")
        )
      }

      setSession({ session_id: body.session_id })
      connectSessionSocket("creator", attemptId)
      setConfirmOpen(false)
    } catch (error) {
      if (sessionAttemptRef.current !== attemptId) return
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create a session. Is the server running?"
      )
      console.error(error)
    } finally {
      if (sessionAttemptRef.current === attemptId) setCreating(false)
    }
  }

  const handleCloseSession = () => {
    clearPreviousSession()
  }

  const handleJoinSession = useCallback(
    async (rawCode?: string) => {
      const code = (rawCode ?? joinCode).trim()
      if (!code) {
        toast.error("Enter a session code first")
        return
      }

      const attemptId = clearPreviousSession()
      setJoining(true)
      try {
        const response = await fetch(
          backendEndpoint("JoinSession/" + encodeURIComponent(code))
        )
        const body = await response.json().catch(() => ({}))
        if (sessionAttemptRef.current !== attemptId) return
        if (!response.ok || body.error) {
          throw new Error(
            getApiErrorMessage(response, body, "Invalid or expired session")
          )
        }

        connectSessionSocket("participant", attemptId)
      } catch (error) {
        if (sessionAttemptRef.current !== attemptId) return
        setJoining(false)
        toast.error(
          error instanceof Error ? error.message : "Failed to join session"
        )
      }
    },
    [clearPreviousSession, connectSessionSocket, joinCode]
  )

  const handleQrDetect = useCallback(
    async (value: string) => {
      const code = getSessionTokenFromQr(value)
      setJoinCode(code)
      await handleJoinSession(code)
    },
    [handleJoinSession]
  )

  const copy = async (text: string, label: string) => {
    const now = Date.now()
    if (!text || now - lastCopyAtRef.current < COPY_THROTTLE_MS) return
    lastCopyAtRef.current = now

    try {
      await navigator.clipboard.writeText(text)
      toast.success(label + " copied", { id: COPY_FEEDBACK_TOAST_ID })
    } catch {
      toast.error("Could not copy", { id: COPY_FEEDBACK_TOAST_ID })
    }
  }

  const handleShareInvite = async () => {
    if (!sessionJoinUrl || sharePendingRef.current) return
    sharePendingRef.current = true

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Join my PeerToss room",
          text: "Open this link to join my private PeerToss room.",
          url: sessionJoinUrl,
        })
        return
      }

      await copy(sessionJoinUrl, "Invite link")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      await copy(sessionJoinUrl, "Invite link")
    } finally {
      sharePendingRef.current = false
    }
  }

  return (
    <main className="min-h-dvh bg-white font-sans text-[#111111] selection:bg-violet-100">
      <header>
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-20 max-w-[1360px] items-center gap-8 px-5 sm:h-24 sm:px-8 lg:px-12"
        >
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
            aria-label="PeerToss home"
          >
            <img src="/peertoss-logo.svg" alt="" className="size-8" />
            <span className="text-lg font-semibold tracking-[-0.04em]">
              PeerToss
            </span>
          </button>

          <a
            href="#faq"
            className="hidden rounded-sm text-sm text-[#555555] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 sm:inline-block"
          >
            FAQs
          </a>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              className="hidden h-10 rounded-lg px-4 text-[13px] text-[#333333] hover:bg-[#f7f7f7] sm:inline-flex"
              onClick={() => setJoinOpen(true)}
            >
              Join a room
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-lg border-[#e8e8e8] bg-[#fafafa] px-4 text-[13px] text-black shadow-none hover:bg-[#f0f0f0]"
              onClick={() => setConfirmOpen(true)}
            >
              Create a room
            </Button>
          </div>
        </nav>
      </header>

      <section aria-labelledby="hero-title" className="border-b border-[#e5e5e5]">
        <div className="mx-auto grid max-w-[1360px] items-center gap-8 px-5 pb-12 pt-10 sm:gap-10 sm:px-8 sm:pb-16 sm:pt-12 lg:min-h-[640px] lg:grid-cols-[0.85fr_1.15fr] lg:gap-8 lg:px-12 lg:py-16 xl:min-h-[680px] xl:grid-cols-[0.8fr_1.2fr]">
          <div className="relative z-10 max-w-[480px]">
            <h1
              id="hero-title"
              className="text-[clamp(2.5rem,5vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.055em]"
            >
              Share anything.
              <br />
              Stay connected.
            </h1>
            <p className="mt-6 max-w-[400px] text-base leading-[1.75] text-[#494949] sm:text-[17px]">
              Send files and folders straight to another device. Make a call or
              share your screen, all in one private room.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
              <Button
                size="lg"
                className="h-11 rounded-lg bg-[#111111] px-5 text-sm font-medium text-white shadow-none hover:bg-[#303030]"
                onClick={() => setConfirmOpen(true)}
              >
                Create a room
                <ArrowRight className="ml-1 size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-lg border-[#dddddd] bg-white px-5 text-sm font-medium text-[#222222] shadow-none hover:border-[#c4b5fd] hover:bg-[#faf8ff]"
                onClick={() => setJoinOpen(true)}
              >
                <QrCode className="size-4" />
                Join a room
              </Button>
            </div>
          </div>

          <HeroIllustration />
        </div>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-title"
        className="mx-auto grid max-w-[1360px] scroll-mt-8 gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:px-12 lg:py-24"
      >
        <div>
          <h2
            id="faq-title"
            className="max-w-sm text-3xl font-semibold leading-[1.15] tracking-[-0.045em] sm:text-4xl"
          >
            Frequently asked
            <br />
            questions.
          </h2>
          <p className="mt-4 max-w-[300px] text-sm leading-7 text-[#606060] sm:text-base">
            A few things to know before you connect.
          </p>
        </div>

        <div className="border-t border-[#e5e5e5]">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group border-b border-[#e5e5e5]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm font-medium hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 sm:py-6 sm:text-[15px] [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  className="size-4 shrink-0 text-[#777777] transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-xl pb-6 pr-7 text-sm leading-7 text-[#606060]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !creating && setConfirmOpen(open)}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a private room?</DialogTitle>
            <DialogDescription>
              We will create a temporary session and show a QR code the other
              device can scan. You will move to the transfer page automatically
              when they join.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSession} disabled={creating}>
              {creating && <Loader2 className="animate-spin" />}
              {creating ? "Creating…" : "Create room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={session !== null}
        onOpenChange={(open) => !open && setCloseSessionConfirmOpen(true)}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite your other device</DialogTitle>
            <DialogDescription>
              Scan this QR code or enter the pairing code. This screen advances
              automatically as soon as the other device connects.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-1">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <Suspense
                fallback={
                  <div
                    className="flex size-[184px] items-center justify-center"
                    aria-label="Loading QR code"
                  >
                    <Loader2 className="size-5 animate-spin text-slate-400" />
                  </div>
                }
              >
                <LazyQrCode value={sessionJoinUrl} size={184} />
              </Suspense>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => copy(session?.session_id ?? "", "Pairing code")}
                className="group flex items-center gap-2 rounded-xl border bg-muted px-4 py-2.5 font-mono text-sm font-medium tracking-[0.18em] transition hover:bg-accent"
              >
                {session?.session_id}
                <Copy className="size-3.5 opacity-50 transition group-hover:opacity-100" />
              </button>

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleShareInvite()}
                className="h-10 rounded-xl px-3"
                aria-label="Share invitation link"
                title="Share invitation link"
              >
                <Share2 className="size-4" />
                Share invite
              </Button>
            </div>

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
              Waiting for the other device…
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseSessionConfirmOpen(true)}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeSessionConfirmOpen}
        onOpenChange={setCloseSessionConfirmOpen}
      >
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect this room?</DialogTitle>
            <DialogDescription>
              This closes the WebSocket and ends the temporary session. You will
              need to create a new room to reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCloseSessionConfirmOpen(false)}
            >
              Keep waiting
            </Button>
            <Button variant="destructive" onClick={handleCloseSession}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={joinOpen}
        onOpenChange={(open) => !joining && setJoinOpen(open)}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join a private room</DialogTitle>
            <DialogDescription>
              {joinMode === "code"
                ? "Enter the pairing code shown on the other device."
                : "Point your camera at the QR code shown on the other device."}
            </DialogDescription>
          </DialogHeader>

          {joinMode === "code" ? (
            <Input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleJoinSession()
              }}
              placeholder="Pairing code"
              className="h-11 text-center font-mono tracking-[0.16em]"
              autoFocus
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex aspect-square w-full items-center justify-center rounded-xl border bg-muted/30">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <LazyQrScanner onDetect={handleQrDetect} />
            </Suspense>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setJoinMode((mode) => (mode === "code" ? "scan" : "code"))
              }
              disabled={joining}
            >
              <ScanLine />
              {joinMode === "code" ? "Scan QR instead" : "Enter code instead"}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setJoinOpen(false)}
                disabled={joining}
              >
                Cancel
              </Button>
              {joinMode === "code" && (
                <Button
                  onClick={() => void handleJoinSession()}
                  disabled={joining}
                >
                  {joining && <Loader2 className="animate-spin" />}
                  {joining ? "Connecting…" : "Join room"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default LandingPage
