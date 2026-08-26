import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { QRCodeSVG } from "qrcode.react"
import toast from "react-hot-toast"
import {
  ArrowRight,
  ChevronDown,
  Copy,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Laptop2,
  Link2,
  Loader2,
  Moon,
  Presentation,
  QrCode,
  ScanLine,
  Send,
  Smartphone,
  Sun,
} from "lucide-react"

import { useTheme } from "@/hooks/useTheme"
import useUserStore, { type AppWebSocket } from "@/UserStore"
import { rtcSession } from "@/global/rtc/RtcSessionController"
import QrScanner from "@/components/QrScanner"
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

const API_BASE = import.meta.env.VITE_API_URL || "/api"
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (window.location.protocol === "https:" ? "wss:" : "ws:") +
  "//" +
  window.location.host +
  "/api/ws"

type CreatedSession = {
  session_id: string
}

type WsMessage = {
  SocketId?: unknown
  event?: string
  data?: { user2?: string }
}

type SessionRole = "creator" | "participant"
type ShowcaseCard = "file" | "connection" | "link"

const SHOWCASE_ORDER: ShowcaseCard[] = ["connection", "file", "link"]

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
      "Send files of any type, archives, links, and quick text notes. PeerToss does not restrict normal file sharing to a specific extension.",
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

const FLOATING_ASSET_ZONES = [
  { left: [4, 15], top: [6, 16] },
  { left: [27, 40], top: [3, 13] },
  { left: [4, 16], top: [76, 87] },
  { left: [29, 42], top: [78, 89] },
  { left: [88, 94], top: [70, 84] },
] as const

const FLOATING_ASSET_TYPES = [
  {
    Icon: Folder,
    tone: "border-violet-300/50 bg-violet-100 text-violet-600 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
  },
  {
    Icon: FileText,
    tone: "border-rose-300/50 bg-rose-100 text-rose-600 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300",
  },
  {
    Icon: Presentation,
    tone: "border-orange-300/50 bg-orange-100 text-orange-600 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300",
  },
  {
    Icon: FileArchive,
    tone: "border-amber-300/50 bg-amber-100 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  },
  {
    Icon: FileImage,
    tone: "border-sky-300/50 bg-sky-100 text-sky-600 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
  },
  {
    Icon: FileSpreadsheet,
    tone: "border-emerald-300/50 bg-emerald-100 text-emerald-600 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
] as const

const floatingSeed = Math.random() * 10_000
const randomFromSeed = (index: number, salt: number) => {
  const value = Math.sin((floatingSeed + index * 31 + salt) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

const FLOATING_ASSETS = FLOATING_ASSET_ZONES.map((zone, index) => ({
  ...FLOATING_ASSET_TYPES[index % FLOATING_ASSET_TYPES.length],
  id: `floating-asset-${index}`,
  zoneIndex: index,
  left: `${zone.left[0] + randomFromSeed(index, 1) * (zone.left[1] - zone.left[0])}%`,
  top: `${zone.top[0] + randomFromSeed(index, 2) * (zone.top[1] - zone.top[0])}%`,
  opacity: (0.3 + randomFromSeed(index, 3) * 0.24).toFixed(2),
  scale: (0.88 + randomFromSeed(index, 4) * 0.18).toFixed(2),
  x: `${-14 + randomFromSeed(index, 5) * 28}px`,
  y: `${-12 + randomFromSeed(index, 6) * 24}px`,
  duration: `${3.5 + randomFromSeed(index, 7) * 3}s`,
  delay: `${-randomFromSeed(index, 8) * 6.5}s`,
}))

const LandingPage = () => {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const ws = useUserStore((state) => state.ws)
  const setWs = useUserStore((state) => state.setWs)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [closeSessionConfirmOpen, setCloseSessionConfirmOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState<CreatedSession | null>(null)

  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinMode, setJoinMode] = useState<"code" | "scan">("code")
  const [selectedShowcase, setSelectedShowcase] =
    useState<ShowcaseCard>("connection")
  const [hoveredShowcase, setHoveredShowcase] =
    useState<ShowcaseCard | null>(null)
  const [floatingAssets, setFloatingAssets] = useState(FLOATING_ASSETS)
  const [demoUploadProgress, setDemoUploadProgress] = useState(8)
  const mobileShowcaseRef = useRef<HTMLDivElement>(null)

  const visibleShowcase = hoveredShowcase ?? selectedShowcase

  const respawnFloatingAsset = useCallback((id: string) => {
    setFloatingAssets((currentAssets) =>
      currentAssets.map((asset) => {
        if (asset.id !== id) return asset

        const nextType = FLOATING_ASSET_TYPES[
          Math.floor(Math.random() * FLOATING_ASSET_TYPES.length)
        ]
        const zone = FLOATING_ASSET_ZONES[asset.zoneIndex]

        return {
          ...asset,
          ...nextType,
          left: `${zone.left[0] + Math.random() * (zone.left[1] - zone.left[0])}%`,
          top: `${zone.top[0] + Math.random() * (zone.top[1] - zone.top[0])}%`,
          opacity: (0.3 + Math.random() * 0.24).toFixed(2),
          scale: (0.88 + Math.random() * 0.18).toFixed(2),
          x: `${-14 + Math.random() * 28}px`,
          y: `${-12 + Math.random() * 24}px`,
        }
      })
    )
  }, [])

  useEffect(() => {
    let completedAt: number | null = null

    const interval = window.setInterval(() => {
      setDemoUploadProgress((currentProgress) => {
        if (currentProgress >= 100) {
          completedAt ??= Date.now()
          if (Date.now() - completedAt < 1600) return 100

          completedAt = null
          return 6
        }

        const increment =
          currentProgress < 72
            ? 4 + Math.floor(Math.random() * 6)
            : 2 + Math.floor(Math.random() * 4)

        return Math.min(100, currentProgress + increment)
      })
    }, 480)

    return () => window.clearInterval(interval)
  }, [])

  const handleMobileShowcaseScroll = useCallback(() => {
    const container = mobileShowcaseRef.current
    if (!container) return

    const slides = (Array.from(container.children) as HTMLElement[]).sort(
      (first, second) => first.offsetLeft - second.offsetLeft
    )
    const firstOffset = slides[0]?.offsetLeft ?? 0
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    slides.forEach((slide, index) => {
      const distance = Math.abs(
        container.scrollLeft - (slide.offsetLeft - firstOffset)
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    setSelectedShowcase(SHOWCASE_ORDER[nearestIndex])
  }, [])

  const scrollToMobileShowcase = useCallback((card: ShowcaseCard) => {
    const container = mobileShowcaseRef.current
    if (!container) return

    const slides = (Array.from(container.children) as HTMLElement[]).sort(
      (first, second) => first.offsetLeft - second.offsetLeft
    )
    const index = SHOWCASE_ORDER.indexOf(card)
    const firstOffset = slides[0]?.offsetLeft ?? 0
    const target = slides[index]
    if (!target) return

    container.scrollTo({
      left: target.offsetLeft - firstOffset,
      behavior: "smooth",
    })
    setSelectedShowcase(card)
  }, [])

  const connectSessionSocket = useCallback(
    (role: SessionRole) => {
      const socket = new WebSocket(WS_URL) as AppWebSocket
      let identified = false
      let failureShown = false

      function cleanupBootstrapListeners() {
        socket.removeEventListener("message", handleBootstrapMessage)
        socket.removeEventListener("error", failBeforeReady)
        socket.removeEventListener("close", failBeforeReady)
      }

      function failBeforeReady() {
        if (identified || failureShown) {
          cleanupBootstrapListeners()
          return
        }
        failureShown = true
        cleanupBootstrapListeners()
        setJoining(false)
        setWs(null)
        if (role === "creator") setSession(null)
        toast.error("Could not establish the session connection")
      }

      function handleBootstrapMessage(event: MessageEvent) {
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
          navigate("/rtc", { replace: true })
        }
      }

      socket.addEventListener("message", handleBootstrapMessage)
      socket.addEventListener("error", failBeforeReady)
      socket.addEventListener("close", failBeforeReady)
      setWs(socket)

      return socket
    },
    [navigate, setWs]
  )

  const handleCreateSession = async () => {
    setCreating(true)
    try {
      const response = await fetch(API_BASE + "/createSession")
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.error || typeof body.session_id !== "string") {
        throw new Error(body.error || "Failed to create session")
      }

      setSession({ session_id: body.session_id })
      connectSessionSocket("creator")
      setConfirmOpen(false)
    } catch (error) {
      toast.error("Could not create a session. Is the server running?")
      console.error(error)
    } finally {
      setCreating(false)
    }
  }

  const handleCloseSession = () => {
    rtcSession.endSession({ closeSocket: false })
    ws?.close()
    setWs(null)
    setSession(null)
    setCloseSessionConfirmOpen(false)
  }

  const handleJoinSession = useCallback(
    async (rawCode?: string) => {
      const code = (rawCode ?? joinCode).trim()
      if (!code) {
        toast.error("Enter a session code first")
        return
      }

      setJoining(true)
      try {
        const response = await fetch(
          API_BASE + "/JoinSession/" + encodeURIComponent(code)
        )
        const body = await response.json().catch(() => ({}))
        if (!response.ok || body.error) {
          throw new Error(body.error || "Invalid or expired session")
        }

        connectSessionSocket("participant")
      } catch (error) {
        setJoining(false)
        toast.error(
          error instanceof Error ? error.message : "Failed to join session"
        )
      }
    },
    [connectSessionSocket, joinCode]
  )

  const handleQrDetect = useCallback(
    (value: string) => {
      const code = value.trim()
      setJoinCode(code)
      void handleJoinSession(code)
    },
    [handleJoinSession]
  )

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label + " copied")
    } catch {
      toast.error("Could not copy")
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#fbfbfa] text-[#171717] dark:bg-[#0d0d0f] dark:text-[#f7f6f2]">
      <style>{`
        @keyframes peer-toss-floating-asset {
          0%, 6%, 100% {
            opacity: 0;
            transform: translate3d(0, 12px, 0) scale(0.88);
          }
          14%, 86% {
            opacity: var(--asset-opacity);
            transform: translate3d(var(--asset-x), var(--asset-y), 0) scale(var(--asset-scale));
          }
          94% {
            opacity: 0;
            transform: translate3d(8px, -12px, 0) scale(0.94);
          }
        }

        @keyframes peer-toss-gutter-float-up {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(5px, -6px, 0); }
        }

        @keyframes peer-toss-gutter-float-down {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(6px, 5px, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .peer-toss-floating-asset {
            animation: none !important;
            opacity: var(--asset-opacity) !important;
          }

          .peer-toss-gutter-detail {
            animation: none !important;
          }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[720px] top-[280px] size-[1000px] rounded-full border border-black/[0.07] dark:border-white/[0.08] sm:-right-[620px] sm:top-[240px] lg:-right-[450px] lg:top-[200px]"
      >
        <div className="absolute inset-[110px] rounded-full border border-black/[0.07] dark:border-white/[0.08]">
          <div className="absolute inset-[110px] rounded-full border border-black/[0.07] dark:border-white/[0.08]">
            <div className="absolute inset-[110px] rounded-full border border-black/[0.07] dark:border-white/[0.08]">
              <div className="absolute inset-[110px] rounded-full border border-black/[0.07] dark:border-white/[0.08]" />
            </div>
          </div>
        </div>
      </div>

      <nav className="relative z-20 mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-5 sm:px-8 lg:px-10">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2.5"
          aria-label="PeerToss home"
        >
          <span className="relative size-9 shrink-0" aria-hidden="true">
            <img
              src="/peertoss-logo.svg"
              alt=""
              className="size-9 dark:hidden"
            />
            <img
              src="/peertoss-logo-dark.svg"
              alt=""
              className="hidden size-9 dark:block"
            />
          </span>
          <span className="text-base font-semibold tracking-tight">PeerToss</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full"
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            className="hidden rounded-full sm:inline-flex"
            onClick={() => setJoinOpen(true)}
          >
            Join
          </Button>
          <Button
            className="rounded-full px-5"
            onClick={() => setConfirmOpen(true)}
          >
            Start sharing
          </Button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-8 sm:pt-16 lg:min-h-[660px] lg:grid-cols-[0.88fr_1.12fr] lg:gap-8 lg:px-10 lg:pb-16 lg:pt-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {floatingAssets.map((asset) => {
            const AssetIcon = asset.Icon
            return (
              <span
                key={asset.id}
                onAnimationIteration={() => respawnFloatingAsset(asset.id)}
                className={`peer-toss-floating-asset absolute flex size-11 items-center justify-center rounded-2xl border opacity-0 shadow-sm sm:size-12 ${asset.tone}`}
                style={
                  {
                    left: asset.left,
                    top: asset.top,
                    "--asset-opacity": asset.opacity,
                    "--asset-scale": asset.scale,
                    "--asset-x": asset.x,
                    "--asset-y": asset.y,
                    animation: `peer-toss-floating-asset ${asset.duration} ease-in-out ${asset.delay} infinite`,
                    animationFillMode: "both",
                    backfaceVisibility: "hidden",
                    willChange: "transform, opacity",
                  } as React.CSSProperties
                }
              >
                <AssetIcon className="size-5 sm:size-[22px]" strokeWidth={1.8} />
              </span>
            )
          })}
        </div>

        <span
          aria-hidden="true"
          className="peer-toss-gutter-detail pointer-events-none absolute top-10 z-30 hidden h-9 items-center gap-2 rounded-full border border-black/10 bg-white/85 px-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-black/60 opacity-55 shadow-sm lg:inline-flex dark:border-white/10 dark:bg-[#18181c]/90 dark:text-white/65"
          style={{
            left: "calc(50% - 50vw + 5rem)",
            animation: "peer-toss-gutter-float-up 7.5s ease-in-out infinite",
            willChange: "transform",
          }}
        >
          <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
          Peer to peer
        </span>

        <span
          aria-hidden="true"
          className="peer-toss-gutter-detail pointer-events-none absolute bottom-12 z-30 hidden h-10 items-center gap-2.5 rounded-full border border-black/10 bg-white/85 px-3.5 text-black/65 opacity-55 shadow-sm lg:inline-flex dark:border-white/10 dark:bg-[#18181c]/90 dark:text-white/70"
          style={{
            left: "calc(50% - 50vw + 5rem)",
            animation: "peer-toss-gutter-float-down 8.75s ease-in-out -2s infinite",
            willChange: "transform",
          }}
        >
          <Laptop2 className="size-4" strokeWidth={1.8} />
          <ArrowRight className="size-3.5 text-violet-600 dark:text-violet-300" />
          <Smartphone className="size-4" strokeWidth={1.8} />
        </span>

        <div className="relative z-20 mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <h1 className="mt-7 text-balance font-serif text-5xl leading-[0.96] tracking-[-0.05em] sm:text-6xl lg:text-[4.75rem]">
            Move anything.
            <br />
            Leave nothing behind.
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-balance text-base leading-relaxed text-black/58 dark:text-white/58 sm:text-lg lg:mx-0">
            Toss files, links, and quick notes directly to another device. No
            account, no cloud library, no permanent room.
          </p>

        </div>

        <div
          id="how-it-works"
          className="relative z-10 mx-auto h-[430px] w-full max-w-[720px] sm:h-[500px] lg:h-[560px]"
        >
          <div
            ref={mobileShowcaseRef}
            onScroll={handleMobileShowcaseScroll}
            className="absolute inset-x-0 top-0 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:contents"
          >
          <button
            type="button"
            aria-label="Preview direct file sharing"
            aria-pressed={selectedShowcase === "file"}
            onMouseEnter={() => setHoveredShowcase("file")}
            onMouseLeave={() => setHoveredShowcase(null)}
            onFocus={() => setHoveredShowcase("file")}
            onBlur={() => setHoveredShowcase(null)}
            onClick={() => setSelectedShowcase("file")}
            className={`order-2 relative flex h-[330px] w-[calc(100%-2rem)] shrink-0 snap-center flex-col justify-center rounded-[28px] border border-black/10 bg-white/95 p-5 text-left shadow-xl shadow-black/[0.05] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 dark:border-white/[0.12] dark:bg-[#18181c] dark:shadow-black/30 dark:focus-visible:ring-offset-[#0d0d0f] sm:absolute sm:left-0 sm:top-[150px] sm:order-none sm:block sm:h-auto sm:w-[300px] ${visibleShowcase === "file"
              ? "sm:z-30 sm:-translate-y-6 sm:scale-[1.045] sm:rotate-0 sm:shadow-2xl sm:opacity-100"
              : "sm:z-0 sm:-rotate-6 sm:scale-[0.98] sm:opacity-90"
              }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                <FileArchive className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">project-files.zip</p>
                <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">
                  28 files · 24.8 MB
                </p>
              </div>
            </div>
            <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-500 ease-out"
                style={{ width: `${demoUploadProgress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-black/45 dark:text-white/60">
              <span>
                {demoUploadProgress === 100
                  ? "Transfer complete"
                  : "Sending directly"}
              </span>
              <span className="font-medium tabular-nums">
                {demoUploadProgress}%
              </span>
            </div>
          </button>

          <button
            type="button"
            aria-label="Preview the direct device connection"
            aria-pressed={selectedShowcase === "connection"}
            onMouseEnter={() => setHoveredShowcase("connection")}
            onMouseLeave={() => setHoveredShowcase(null)}
            onFocus={() => setHoveredShowcase("connection")}
            onBlur={() => setHoveredShowcase(null)}
            onClick={() => setSelectedShowcase("connection")}
            className={`peer-connection-card order-1 relative flex h-[330px] w-[calc(100%-2rem)] max-w-none shrink-0 snap-center flex-col justify-center rounded-[30px] border border-violet-300/55 bg-gradient-to-b from-[#f5f1fb] to-white p-6 text-center shadow-2xl shadow-violet-950/10 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 dark:border-violet-400/20 dark:from-[#241b2c] dark:to-[#151419] dark:shadow-black/35 dark:focus-visible:ring-offset-[#0d0d0f] sm:absolute sm:inset-x-0 sm:top-20 sm:order-none sm:mx-auto sm:block sm:h-auto sm:w-[380px] sm:max-w-[380px] ${visibleShowcase === "connection"
              ? "sm:z-30 sm:-translate-y-2 sm:scale-[1.02] sm:opacity-100"
              : "sm:z-10 sm:scale-[0.98] sm:opacity-90"
              }`}
          >
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-violet-300/60 bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-700 dark:border-violet-400/20 dark:bg-white/5 dark:text-violet-200">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Direct connection
            </div>
            <div className="mt-7 flex items-center justify-center gap-3">
              <span className="peer-device peer-device-source relative flex size-16 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-sm transition-transform duration-300 dark:border-white/10 dark:bg-white/10">
                <Laptop2 className="size-7" />
                <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full border-2 border-white bg-emerald-400 dark:border-[#2a2130]">
                  <span className="size-1 rounded-full bg-white" />
                </span>
              </span>
              <span className="peer-route relative h-16 w-20 shrink-0" aria-hidden="true">
                <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-violet-300/80 dark:bg-violet-400/35" />
                <span className="peer-route-glow absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-violet-500" />

                <span className="peer-packet peer-packet-forward peer-packet-one absolute left-1/2 top-[18px] flex h-3.5 w-5 -translate-x-1/2 items-center justify-center rounded border border-violet-400/40 bg-white shadow-sm dark:border-violet-400/35 dark:bg-[#33243d]">
                  <span className="h-0.5 w-2 rounded-full bg-violet-500 dark:bg-violet-300" />
                </span>
                <span className="peer-packet peer-packet-forward peer-packet-two absolute left-1/2 top-[18px] flex h-3.5 w-4 -translate-x-1/2 items-center justify-center rounded border border-violet-400/35 bg-white shadow-sm dark:border-violet-400/30 dark:bg-[#33243d]">
                  <span className="size-1 rounded-full bg-violet-500 dark:bg-violet-300" />
                </span>
                <span className="peer-packet peer-packet-return absolute left-1/2 top-[37px] size-2.5 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-300 shadow-sm dark:bg-emerald-400" />

                <span className="peer-transfer-hub absolute left-1/2 top-1/2 z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300 bg-white text-violet-600 shadow-[0_0_0_4px_rgba(168,85,247,0.08)] dark:border-violet-500/40 dark:bg-[#1d172d] dark:text-violet-300 dark:shadow-[0_0_0_4px_rgba(168,85,247,0.08)]">
                  <Send className="size-3.5" />
                </span>
              </span>
              <span className="peer-device peer-device-target relative flex size-16 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-sm transition-transform duration-300 dark:border-white/10 dark:bg-white/10">
                <Smartphone className="size-7" />
                <span className="absolute -left-1 -top-1 flex size-3 items-center justify-center rounded-full border-2 border-white bg-emerald-400 dark:border-[#2a2130]">
                  <span className="size-1 rounded-full bg-white" />
                </span>
              </span>
            </div>
            <h2 className="mt-7 font-serif text-2xl tracking-tight">Scan. Pair. Toss.</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-black/50 dark:text-white/50">
              One QR code creates a short-lived path between two devices.
            </p>
            <div className="mt-5 flex justify-center gap-2 text-[11px] text-black/50 dark:text-white/50">
              <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Files</span>
              <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Archives</span>
              <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 dark:border-white/10 dark:bg-white/5">Links</span>
            </div>
          </button>

          <button
            type="button"
            aria-label="Preview direct link sharing"
            aria-pressed={selectedShowcase === "link"}
            onMouseEnter={() => setHoveredShowcase("link")}
            onMouseLeave={() => setHoveredShowcase(null)}
            onFocus={() => setHoveredShowcase("link")}
            onBlur={() => setHoveredShowcase(null)}
            onClick={() => setSelectedShowcase("link")}
            className={`order-3 relative flex h-[330px] w-[calc(100%-2rem)] shrink-0 snap-center flex-col justify-center rounded-[28px] border border-black/10 bg-white/95 p-5 text-left shadow-xl shadow-black/[0.05] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 dark:border-white/[0.12] dark:bg-[#18181c] dark:shadow-black/30 dark:focus-visible:ring-offset-[#0d0d0f] sm:absolute sm:right-0 sm:top-[150px] sm:order-none sm:block sm:h-auto sm:w-[300px] ${visibleShowcase === "link"
              ? "sm:z-30 sm:-translate-y-6 sm:scale-[1.045] sm:rotate-0 sm:shadow-2xl sm:opacity-100"
              : "sm:z-0 sm:rotate-6 sm:scale-[0.98] sm:opacity-90"
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                <Link2 className="size-5" />
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                Received
              </span>
            </div>
            <p className="mt-7 text-xs font-medium uppercase tracking-[0.14em] text-black/40 dark:text-white/55">
              Clipboard link
            </p>
            <p className="mt-2 truncate text-sm font-semibold">localhost:5173/project</p>
            <p className="mt-2 text-xs text-black/45 dark:text-white/60">
              Just now · from your laptop
            </p>
          </button>
          </div>

          <div
            className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-2 sm:hidden"
            aria-label="Showcase slides"
          >
            {SHOWCASE_ORDER.map((card) => (
              <button
                key={card}
                type="button"
                aria-label={`Show ${card} preview`}
                aria-current={selectedShowcase === card ? "true" : undefined}
                onClick={() => scrollToMobileShowcase(card)}
                className={`h-1.5 rounded-full transition-all duration-200 ${selectedShowcase === card
                  ? "w-6 bg-violet-600 dark:bg-violet-300"
                  : "w-1.5 bg-black/15 dark:bg-white/20"
                  }`}
              />
            ))}
          </div>

          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-black/40 dark:text-white/45 sm:bottom-10 lg:bottom-16">
            <span className="sm:hidden">Swipe to explore</span>
            <span className="hidden sm:inline">
              Hover, focus, or tap a card to bring it forward
            </span>
          </p>
        </div>
      </section>

      <section className="relative z-10 mx-auto flex w-full max-w-7xl justify-center px-4 pb-16 pt-1 sm:px-8 lg:px-10">
        <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button
            size="lg"
            onClick={() => setConfirmOpen(true)}
            className="group h-12 rounded-full bg-[#171717] px-6 text-sm font-medium text-white shadow-lg shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#252525] hover:shadow-xl dark:bg-white dark:text-black dark:shadow-black/25 dark:hover:bg-white/90"
          >
            Start a private room
            <ArrowRight className="ml-1 size-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="group h-12 rounded-full border-black/10 bg-white/80 px-6 text-sm font-medium text-black shadow-md shadow-black/[0.05] transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 hover:shadow-lg dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:shadow-black/20 dark:hover:border-violet-400/40 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
          >
            <QrCode className="size-4 text-violet-600 transition-transform duration-200 group-hover:scale-110 dark:text-violet-300" />
            Join with code or QR
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="faq-title"
        className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-4 pb-24 pt-4 text-left sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:px-10 lg:pb-32"
      >
        <div className="lg:sticky lg:top-10 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
            Questions, answered
          </p>
          <h2
            id="faq-title"
            className="mt-4 max-w-md font-serif text-4xl leading-tight tracking-[-0.035em] sm:text-5xl"
          >
            The useful details, without the fine print.
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-black/50 dark:text-white/50">
            PeerToss is intentionally temporary: pair two devices, move what you
            need, then close the room.
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white/65 px-5 shadow-xl shadow-violet-950/[0.04] backdrop-blur dark:border-white/10 dark:bg-white/[0.035] sm:px-7">
          {FAQ_ITEMS.map((item, index) => (
            <details
              key={item.question}
              className="group border-b border-black/10 last:border-b-0 dark:border-white/10"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-base font-medium outline-none transition-colors hover:text-violet-700 focus-visible:text-violet-700 dark:hover:text-violet-300 dark:focus-visible:text-violet-300 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/70 transition-transform duration-200 group-open:rotate-180 dark:border-white/10 dark:bg-white/5">
                  <ChevronDown className="size-4" />
                </span>
              </summary>
              <p className="max-w-xl pb-6 pr-12 text-sm leading-7 text-black/52 dark:text-white/52">
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
              <QRCodeSVG value={session?.session_id ?? ""} size={184} />
            </div>

            <button
              type="button"
              onClick={() => copy(session?.session_id ?? "", "Pairing code")}
              className="group flex items-center gap-2 rounded-xl border bg-muted px-4 py-2.5 font-mono text-sm font-medium tracking-[0.18em] transition hover:bg-accent"
            >
              {session?.session_id}
              <Copy className="size-3.5 opacity-50 transition group-hover:opacity-100" />
            </button>

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
            <QrScanner onDetect={handleQrDetect} />
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
