
import {
  lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode,
  type PointerEvent as ReactPointerEvent
} from "react"
import { useLocation, useNavigate } from "react-router"
import toast from "react-hot-toast"
import {
  ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, Copy, FileText, FolderUp, Laptop,
  Link2, Loader2, MessageSquare, Mic, MonitorUp, PhoneOff, QrCode, ScanLine, Share2, ShieldCheck, Smartphone, Upload, Video,
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TransferRow } from "@/components/rtc/TransferRow"
import { StatusPill } from "@/components/rtc/StatusPill"
import { FileTypeIcon } from "@/components/rtc/FileTypeIcon"
import type { ChatItem } from "@/components/rtc/types"

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

const HOW_IT_WORKS_STEPS = [
  {
    title: "Create a room",
    description: "Open a temporary room. Your QR code and pairing code are ready to share.",
  },
  {
    title: "Pair the other device",
    description: "Scan the QR code or enter the code on another phone, tablet, or laptop.",
  },
  {
    title: "Toss it over",
    description: "Send a file, drop a link, or start a call. You’re connected and ready to go.",
  },
] as const

function FeatureEyebrow({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#686868] sm:text-xs">
      {children}
    </p>
  )
}

function PreviewWindow({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[22px] border border-[#dedee0] bg-white shadow-[0_24px_70px_-20px_rgba(20,20,25,0.22)] sm:rounded-[26px]">
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[#e5e5e5] bg-[#fafafa] px-4 text-[11px] sm:px-5 sm:text-xs">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-medium text-[#333333]">{title}</span>
        <span className="justify-self-end text-[10px] text-[#777777]">Preview</span>
      </div>
      {children}
      <div className="flex min-h-10 items-center justify-center gap-2 border-t border-[#e8e8e8] bg-[#fafafa] px-4 py-2 text-[11px] text-[#777777]">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        {footer}
      </div>
    </div>
  )
}

// Shared by the showcase and the real invite dialog. Preview actions open
// room creation; sample codes are never copied or sent to the session API.
function RoomInviteContent({
  code,
  url,
  onCopy,
  onShare,
  preview = false,
}: {
  code: string
  url: string
  onCopy: () => void
  onShare: () => void
  preview?: boolean
}) {
  const qrSize = preview ? 160 : 184

  return (
    <div className={`flex flex-col items-center py-1 ${preview ? "gap-4" : "gap-5"}`}>
      <div className={`rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] ${preview ? "p-3" : "p-4"}`}>
        <Suspense
          fallback={
            <div className="grid place-items-center" style={{ width: qrSize, height: qrSize }} aria-label="Loading QR code">
              <Loader2 className="size-5 animate-spin text-slate-400 motion-reduce:animate-none" />
            </div>
          }
        >
          <LazyQrCode
            value={url}
            size={qrSize}
            title={preview ? "Example QR code linking to this preview" : "Scan to join this room"}
          />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          aria-label={preview ? "Create a room to get a pairing code" : "Copy pairing code"}
          className="group flex min-h-10 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-2.5 font-mono text-sm font-medium tracking-[0.18em] text-[#222222] transition hover:bg-[#f0f0f0] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 motion-reduce:transition-none"
        >
          {code}
          <Copy className="size-3.5 opacity-50 group-hover:opacity-100" aria-hidden="true" />
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={onShare}
          className="h-10 rounded-xl border-[#e5e5e5] bg-white px-3 text-[#222222] shadow-none hover:bg-[#fafafa]"
          aria-label={preview ? "Create a room to share an invite" : "Share invitation link"}
        >
          <Share2 className="size-4" />
          Share invite
        </Button>
      </div>
      <p className="flex items-center gap-2 text-xs text-[#777777]">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        Waiting for the other device…
      </p>
    </div>
  )
}

function HowItWorksTimeline({ onCreateRoom }: { onCreateRoom: () => void }) {
  return (
    <section id="how-it-works" aria-labelledby="how-timeline-title" className="scroll-mt-8 border-b border-[#e8e8e8] bg-[#fcfcfc]">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:gap-14 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12 lg:py-28">
        <div className="max-w-[460px]">
          <FeatureEyebrow>A little setup. A lot to share.</FeatureEyebrow>
          <h2 id="how-timeline-title" className="mt-5 text-[clamp(2.25rem,3.5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.05em]">
            Two devices.<br />Three simple steps.
          </h2>
          <ol className="mt-8 space-y-6 sm:mt-9 sm:space-y-7">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <li key={step.title} className="relative flex gap-4">
                {index < HOW_IT_WORKS_STEPS.length - 1 && (
                  <span aria-hidden="true" className="absolute bottom-[-28px] left-[14px] top-8 w-px bg-[#e1e1e4]" />
                )}
                <span aria-hidden="true" className="relative mt-0.5 grid size-[29px] shrink-0 place-items-center rounded-full border border-[#dedee2] bg-white font-mono text-[11px] text-[#777777]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-[1.8] text-[#646464]">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button onClick={onCreateRoom} className="mt-8 h-11 rounded-lg bg-[#111111] px-5 text-sm font-medium text-white shadow-none hover:bg-[#303030]">
            Create a free room
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
        <div className="mx-auto w-full max-w-[440px] min-w-0">
          <PreviewWindow title="Your private room" footer="No account. Just your two devices.">
            <div className="px-4 py-6 sm:px-6 sm:py-7">
              <h3 className="text-center text-lg font-semibold tracking-[-0.025em]">Invite your other device</h3>
              <p className="mx-auto mb-5 mt-2 max-w-[270px] text-center text-xs leading-5 text-[#777777]">
                One scan or one code. That’s all it takes to get connected.
              </p>
              <RoomInviteContent
                code="SC28ZV"
                url={`${window.location.origin}/#how-it-works`}
                onCopy={onCreateRoom}
                onShare={onCreateRoom}
                preview
              />
            </div>
          </PreviewWindow>
          <div className="mt-5 flex items-center justify-center gap-3 text-[11px] text-[#777777]" aria-hidden="true">
            <span className="flex items-center gap-2"><Laptop className="size-4" />Your laptop</span>
            <span className="w-10 border-t border-dashed border-[#cccccc]" />
            <span className="flex items-center gap-2"><Smartphone className="size-4" />Your phone</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Sample data stays in the showcase and never enters the RTC store.
const PREVIEW_TRANSFERS: ChatItem[] = [
  {
    id: "preview-photos",
    kind: "file",
    mine: true,
    ts: 0,
    name: "Weekend photos.zip",
    size: 25 * 1024 * 1024,
    transferredBytes: 18 * 1024 * 1024,
    transferStatus: "sending",
  },
  {
    id: "preview-notes",
    kind: "file",
    mine: true,
    ts: new Date(2026, 0, 1, 10, 42).getTime(),
    name: "Trip itinerary.pdf",
    size: 2.4 * 1024 * 1024,
    transferStatus: "complete",
  },
]

function FileSharingFeature({ onCreateRoom }: { onCreateRoom: () => void }) {
  return (
    <section aria-labelledby="sharing-title" className="border-b border-[#e8e8e8] bg-[#f8f8f8]">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:gap-14 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-12 lg:py-28 xl:gap-20">
        <div className="max-w-[460px] lg:col-start-2 lg:row-start-1">
          <FeatureEyebrow>Your files. A shorter journey.</FeatureEyebrow>
          <h2 id="sharing-title" className="mt-5 text-[clamp(2.25rem,3.5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.05em]">
            From this device.<br />To that one.
          </h2>
          <p className="mt-6 text-base leading-[1.85] text-[#606060] sm:text-[17px]">
            The whole folder. The original photo. That PDF you need on your phone.
            Send them straight to the other device, right from your browser.
          </p>
          <ul className="mt-7 space-y-4 text-sm">
            <li className="flex items-center gap-3"><FolderUp className="size-4 shrink-0 text-violet-500" />Files and entire folders, in one place</li>
            <li className="flex items-center gap-3"><Link2 className="size-4 shrink-0" />Links and quick notes in the same room</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4 shrink-0" />Files travel between your paired devices</li>
          </ul>
        </div>
        <div className="mx-auto w-full max-w-[620px] min-w-0 lg:col-start-1 lg:row-start-1">
          <PreviewWindow title="Files & messages" footer="Shared over your private connection">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ededed] px-4 py-3 sm:px-6">
              <span className="flex items-center gap-2 text-xs font-medium">
                <Laptop className="size-4 text-[#777777]" />You
                <ArrowRight className="size-3 text-[#bbbbbb]" />
                <Smartphone className="size-4 text-[#777777]" />Peer
              </span>
              <StatusPill label="Connected" state="on" />
            </div>
            <div className="p-4 sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={onCreateRoom}
                aria-label="Create a room to share files"
                className="group flex w-full flex-col items-center rounded-xl border border-dashed border-[#d5d5da] bg-[#fafafa] px-4 py-5 transition-colors hover:border-violet-400 hover:bg-violet-50/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 sm:py-6 motion-reduce:transition-none"
              >
                <span className="mb-3 flex items-end -space-x-1.5" aria-hidden="true">
                  <FileTypeIcon name="photo.png" className="size-10 -rotate-12" />
                  <FileTypeIcon name="folder.zip" className="relative z-10 size-12" />
                  <FileTypeIcon name="notes.pdf" className="size-10 rotate-12" />
                </span>
                <span className="text-sm font-medium">A little drop. A big handoff.</span>
                <span className="mt-1.5 text-xs text-[#777777]">Files, photos, and folders welcome.</span>
                <span className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#e1e1e1] bg-white px-3 py-2 text-xs shadow-xs">
                  <Upload className="size-3.5" />Share a file
                </span>
              </button>
              <div className="mb-3 mt-5 flex items-center justify-between text-[11px] text-[#777777]">
                <span className="font-medium">In this room</span><span>2 files</span>
              </div>
              <div className="space-y-2.5 [&_[data-slot=badge]]:hidden [&_button:disabled]:hidden sm:[&_[data-slot=badge]]:inline-flex sm:[&_button:disabled]:inline-flex">
                {PREVIEW_TRANSFERS.map((item) => <TransferRow key={item.id} item={item} estimatedMbps={null} />)}
              </div>
            </div>
          </PreviewWindow>
        </div>
      </div>
    </section>
  )
}

function CallFeature() {
  const [screenPreview, setScreenPreview] = useState(false)

  return (
    <section aria-labelledby="calling-title" className="border-b border-[#e8e8e8] bg-[#fcfcfc]">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:gap-14 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12 lg:py-28">
        <div className="max-w-[460px]">
          <FeatureEyebrow>More than a file handoff</FeatureEyebrow>
          <h2 id="calling-title" className="mt-5 text-[clamp(2.25rem,3.5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.05em]">
            Send it over.<br />Talk it through.
          </h2>
          <p className="mt-6 text-base leading-[1.85] text-[#606060] sm:text-[17px]">
            Sometimes a file needs a little context. Start a call, share your
            screen, and keep the conversation going in the room you already opened.
          </p>
          <ul className="mt-7 space-y-4 text-sm">
            <li className="flex items-center gap-3"><Video className="size-4 shrink-0 text-violet-500" />Video and audio calls, right in your browser</li>
            <li className="flex items-center gap-3"><MonitorUp className="size-4 shrink-0" />Share your screen to show what you mean</li>
            <li className="flex items-center gap-3"><MessageSquare className="size-4 shrink-0" />Keep sending files and messages during a call</li>
          </ul>
        </div>
        <div className="mx-auto w-full max-w-[580px] min-w-0">
          <PreviewWindow title="PeerToss Call" footer="One room for the whole conversation">
            <div className="relative h-[340px] overflow-hidden bg-[#202225] text-white sm:h-[380px]">
              {screenPreview ? (
                <div className="absolute inset-x-5 bottom-20 top-14 flex items-center justify-center sm:inset-x-8">
                  <div className="w-full max-w-[330px] overflow-hidden rounded-xl border border-white/10 bg-[#f8f8f8] text-[#222222] shadow-2xl">
                    <div className="flex items-center gap-2 border-b border-[#e5e5e5] px-4 py-2.5 text-[10px] text-[#777777]">
                      <FileText className="size-3" />Trip itinerary.pdf
                    </div>
                    <div className="p-5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#777777]">A weekend away</p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">A little plan.<br />A great escape.</p>
                      <div className="mt-4 space-y-2 text-[11px]">
                        <p className="flex items-center gap-2"><Check className="size-3 text-emerald-600" />Pick a place</p>
                        <p className="flex items-center gap-2"><Check className="size-3 text-emerald-600" />Share the itinerary</p>
                        <p className="flex items-center gap-2"><span className="size-3 rounded-sm border border-[#cccccc]" />Pack the essentials</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src="/call-preview/peer.webp"
                  alt="A smiling participant in the video call preview"
                  width={960}
                  height={720}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover object-[45%_38%]"
                />
              )}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-4 text-[11px] sm:px-5">
                <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 backdrop-blur-md">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {screenPreview ? "Sharing a screen" : "In a call"}
                </span>
                <span className="rounded-full bg-black/20 px-2.5 py-1.5 font-mono text-white/85 backdrop-blur-md">02:34</span>
              </div>
              {!screenPreview && (
                <span className="absolute bottom-24 left-4 inline-flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] backdrop-blur-md sm:left-5">
                  <Mic className="size-3" />Your peer
                </span>
              )}
              <div className="absolute bottom-23 right-3 aspect-[4/3] w-24 overflow-hidden rounded-xl border-2 border-white/70 bg-[#303237] shadow-[0_6px_24px_rgba(0,0,0,0.25)] sm:right-5 sm:w-32">
                <img
                  src="/call-preview/self.webp"
                  alt="The second participant shown in the self-view preview"
                  width={480}
                  height={360}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] backdrop-blur-sm">You</span>
              </div>
              <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">
                {/* Visual call controls; the preview selector below is interactive. */}
                <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-[#18191b]/80 p-2 shadow-lg backdrop-blur-xl sm:gap-2" aria-hidden="true">
                  <span className="grid size-8 place-items-center rounded-xl bg-white/15 sm:size-9"><Mic className="size-4" /></span>
                  <span className="grid size-8 place-items-center rounded-xl bg-white/15 sm:size-9"><Video className="size-4" /></span>
                  <span className={`grid size-8 place-items-center rounded-xl sm:size-9 ${screenPreview ? "bg-white text-[#111111]" : "bg-white/15"}`}><MonitorUp className="size-4" /></span>
                  <span className="grid size-8 place-items-center rounded-xl bg-white/15 sm:size-9"><MessageSquare className="size-4" /></span>
                  <span className="mx-0.5 h-5 w-px bg-white/20" />
                  <span className="grid h-8 w-10 place-items-center rounded-xl bg-[#e3454f] sm:h-9 sm:w-11"><PhoneOff className="size-4" /></span>
                </div>
              </div>
            </div>
          </PreviewWindow>
          <div className="mt-6 flex justify-center" role="group" aria-label="Choose a call preview">
            <div className="inline-flex rounded-full border border-[#e5e5e5] bg-[#f1f1f1] p-1">
              {[
                { label: "Video call", screen: false, icon: Video },
                { label: "Screen share", screen: true, icon: MonitorUp },
              ].map(({ label, screen, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={screenPreview === screen}
                  onClick={() => setScreenPreview(screen)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 motion-reduce:transition-none ${screenPreview === screen ? "bg-white text-[#222222] shadow-xs" : "text-[#777777] hover:text-[#222222]"}`}
                >
                  <Icon className="size-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

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
    webpSrc: "/hero/phonechat.webp",
    crop: { x: 401, y: 126, width: 466, height: 1064 },
    position: { x: 700, y: 22, width: 420 },
    mobilePosition: { x: 130, y: 8, width: 200 },
    motion: { x: 1.5, y: -4, duration: 10.5, delay: -0.8 },
  },
  {
    name: "folder",
    src: "/folderdownload.png",
    webpSrc: "/hero/folderdownload.webp",
    crop: { x: 92, y: 337, width: 1085, height: 685 },
    position: { x: 160, y: 152, width: 594 },
    mobilePosition: { x: 0, y: 116, width: 228 },
    motion: { x: 3, y: -12, duration: 8.2, delay: -2.6 },
  },
  {
    name: "call",
    src: "/videocall.png",
    webpSrc: "/hero/videocall.webp",
    crop: { x: 314, y: 224, width: 646, height: 881 },
    position: { x: 227, y: 449, width: 370 },
    mobilePosition: { x: 10, y: 296, width: 132 },
    motion: { x: -3, y: -10, duration: 9.4, delay: -4.8 },
  },
  {
    name: "connection",
    src: "/speedtransfer.png",
    webpSrc: "/hero/speedtransfer.webp",
    crop: { x: 488, y: 215, width: 438, height: 933 },
    position: { x: 1120, y: 337, width: 290 },
    mobilePosition: { x: 252, y: 268, width: 96 },
    motion: { x: 2, y: -11, duration: 10.8, delay: -6.2 },
  },
] as const

// Mobile shows the phone plus one section of companion cards at a time;
// swiping the illustration (or the dots under it) switches sections.
// Desktop keeps every layer visible.
const MOBILE_SECTIONS = [
  { label: "File transfer", layers: ["folder"] },
  { label: "Video call and transfer speed", layers: ["call", "connection"] },
]

function HeroIllustration() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null)
  const [pinnedLayer, setPinnedLayer] = useState<string | null>(null)
  const [mobileSectionIndex, setMobileSectionIndex] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState(1)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeConsumedRef = useRef(false)

  const showMobileSection = (index: number, direction: number) => {
    const count = MOBILE_SECTIONS.length
    setSwipeDirection(direction)
    setHoveredLayer(null)
    setPinnedLayer(null)
    setMobileSectionIndex(((index % count) + count) % count)
  }

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: event.clientX, y: event.clientY }
    swipeConsumedRef.current = false
  }

  const handleStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return

    const direction = deltaX < 0 ? 1 : -1
    swipeConsumedRef.current = true
    showMobileSection(mobileSectionIndex + direction, direction)
  }

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
      const { width, height } = element.getBoundingClientRect()
      if (!image?.complete || !image.naturalWidth || !canvas || !width || !height) return

      // Prepare a detailed crop only on load/resize. CSS moves the finished
      // layer continuously; there is no per-frame redraw or pixel snapping.
      try {
        const context = canvas.getContext("2d")
        if (!context) return
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
      } catch {
        // Keep the loaded image visible if the canvas cannot be painted.
        delete element.dataset.ready
      }
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

    const imageCleanups = layers.map((element, index) => {
      const image = element.querySelector("img")
      if (!image) return () => { }
      let triedPngFallback = false

      function showImage() {
        if (disposed || !image?.naturalWidth) return
        element.dataset.loaded = "true"
        paintLayer(element, index)
      }

      function loadPngFallback() {
        if (disposed || triedPngFallback || !image) return
        triedPngFallback = true
        // A failed WebP request does not automatically fall back in <picture>.
        element.querySelector("source")?.removeAttribute("srcset")
        image.src = HERO_ILLUSTRATION_LAYERS[index].src
      }

      image.addEventListener("load", showImage)
      image.addEventListener("error", loadPngFallback)
      void image.decode()
        .then(showImage)
        .catch(() => {
          if (image.complete && image.naturalWidth) showImage()
          else if (image.complete) loadPngFallback()
        })

      return () => {
        image.removeEventListener("load", showImage)
        image.removeEventListener("error", loadPngFallback)
      }
    })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      densityQuery.removeEventListener("change", handleDensityChange)
      document.removeEventListener("visibilitychange", updatePlayback)
      imageCleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  const activeMobileLayers = MOBILE_SECTIONS[mobileSectionIndex].layers

  return (
    <div className="mx-auto w-full min-w-0">
      <div
        ref={stageRef}
        role="img"
        aria-label="PeerToss messages and direct file sharing between connected devices."
        className="peertoss-hero-illustration relative isolate mx-auto"
        onPointerDown={handleStagePointerDown}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null
        }}
        onClickCapture={(event) => {
          // A completed swipe must not also register as a tap-to-pin.
          if (!swipeConsumedRef.current) return
          swipeConsumedRef.current = false
          event.stopPropagation()
        }}
        style={{
          "--hero-slide-from": swipeDirection >= 0 ? "26px" : "-26px",
        } as CSSProperties}
      >
        <style>{`
        .peertoss-hero-illustration {
          aspect-ratio: 350 / 480;
          max-width: 360px;
          touch-action: pan-y;
        }
        .peertoss-hero-layer {
          position: absolute;
          display: block;
          left: var(--hero-mobile-x);
          top: var(--hero-mobile-y);
          width: var(--hero-mobile-width);
          --hero-drift: var(--hero-mobile-drift);
          --hero-sway: var(--hero-mobile-sway);
          animation: peertoss-hero-drift var(--hero-duration) ease-in-out var(--hero-delay) infinite;
          animation-play-state: var(--hero-play-state, paused);
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.35s ease;
        }
        .peertoss-hero-layer[data-dimmed="true"] { opacity: 0.4; }
        .peertoss-hero-layer[data-lifted="true"],
        .peertoss-hero-layer:not([data-loaded="true"]) { animation-play-state: paused; }
        .peertoss-hero-frame {
          transition:
            transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
            filter 0.35s ease,
            opacity 0.35s ease;
        }
        .peertoss-hero-layer[data-lifted="true"] .peertoss-hero-frame {
          transform: scale(1.045);
          filter: drop-shadow(0 18px 30px rgba(17, 17, 17, 0.16));
        }
        .peertoss-hero-layer[data-lifted="true"]:active .peertoss-hero-frame {
          transform: scale(1.015);
          transition-duration: 0.12s;
        }
        @media (max-width: 639.98px) {
          .peertoss-hero-layer[data-mobile-hidden="true"] {
            pointer-events: none;
            animation-play-state: paused;
          }
          .peertoss-hero-layer[data-mobile-hidden="true"] .peertoss-hero-frame {
            opacity: 0;
            transform: translateX(var(--hero-slide-from, 26px)) scale(0.96);
          }
        }
        .peertoss-hero-placeholder {
          position: absolute;
          inset: 6%;
          overflow: hidden;
          border: 1px solid #ebebee;
          border-radius: 14px;
          background: #f8f8fa;
          transition: opacity 0.45s ease;
        }
        .peertoss-hero-placeholder::before,
        .peertoss-hero-placeholder::after {
          content: "";
          position: absolute;
          left: 12%;
          height: 6%;
          border-radius: 6px;
          background: #ededf1;
        }
        .peertoss-hero-placeholder::before { top: 18%; width: 58%; }
        .peertoss-hero-placeholder::after { top: 31%; width: 36%; }
        .peertoss-hero-artwork {
          opacity: 0;
          transition: opacity 0.45s ease;
        }
        .peertoss-hero-layer[data-loaded="true"] .peertoss-hero-artwork { opacity: 1; }
        .peertoss-hero-layer[data-loaded="true"] .peertoss-hero-placeholder { opacity: 0; }
        .peertoss-hero-layer canvas { visibility: hidden; }
        .peertoss-hero-layer[data-ready="true"] canvas { visibility: visible; }
        .peertoss-hero-layer[data-ready="true"] img { visibility: hidden; }
        @keyframes peertoss-hero-drift {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(var(--hero-sway), var(--hero-drift), 0); }
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
            --hero-sway: var(--hero-desktop-sway);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .peertoss-hero-layer { animation: none; transition: none; }
          .peertoss-hero-artwork,
          .peertoss-hero-placeholder { transition: none; }
          .peertoss-hero-frame { transition: filter 0.3s ease, opacity 0.3s ease; }
          .peertoss-hero-layer[data-lifted="true"] .peertoss-hero-frame {
            transform: none;
          }
          .peertoss-hero-layer[data-mobile-hidden="true"] .peertoss-hero-frame {
            transform: none;
          }
        }
      `}</style>

        {HERO_ILLUSTRATION_LAYERS.map(({ name, src, webpSrc, crop, position, mobilePosition, motion }) => {
          const isHovered = hoveredLayer === name
          const isPinned = pinnedLayer === name
          const isDimmed =
            (hoveredLayer !== null || pinnedLayer !== null) && !isHovered && !isPinned
          const isMobileHidden = name !== "phone" && !activeMobileLayers.includes(name)
          return (
            <div
              key={name}
              data-hero-layer={name}
              aria-hidden="true"
              className="peertoss-hero-layer"
              data-hovered={isHovered ? "true" : undefined}
              data-lifted={isHovered || isPinned ? "true" : undefined}
              data-dimmed={isDimmed ? "true" : undefined}
              data-mobile-hidden={isMobileHidden ? "true" : undefined}
              onPointerEnter={() => setHoveredLayer(name)}
              onPointerLeave={() =>
                setHoveredLayer((current) => (current === name ? null : current))
              }
              onClick={() =>
                setPinnedLayer((current) => (current === name ? null : name))
              }
              style={{
                zIndex: isPinned ? 30 : isHovered ? 20 : undefined,
                "--hero-x": `${((position.x - 110) / 1340) * 100}%`,
                "--hero-y": `${(position.y / 1030) * 100}%`,
                "--hero-width": `${(position.width / 1340) * 100}%`,
                "--hero-mobile-x": `${((mobilePosition?.x ?? 0) / 350) * 100}%`,
                "--hero-mobile-y": `${((mobilePosition?.y ?? 0) / 480) * 100}%`,
                "--hero-mobile-width": `${((mobilePosition?.width ?? 0) / 350) * 100}%`,
                "--hero-mobile-drift": `${motion.y * 0.6}px`,
                "--hero-desktop-drift": `${motion.y}px`,
                "--hero-mobile-sway": `${motion.x * 0.6}px`,
                "--hero-desktop-sway": `${motion.x}px`,
                "--hero-duration": `${motion.duration}s`,
                "--hero-delay": `${motion.delay}s`,
                aspectRatio: `${crop.width} / ${crop.height}`,
              } as CSSProperties}
            >
              <div className="peertoss-hero-frame relative size-full overflow-hidden">
                <div className="peertoss-hero-placeholder" />
                <div className="peertoss-hero-artwork absolute inset-0">
                  <picture>
                    <source srcSet={webpSrc} type="image/webp" />
                    <img
                      src={src}
                      alt=""
                      width={1254}
                      height={1254}
                      fetchPriority={name === "phone" ? "high" : "auto"}
                      loading="eager"
                      decoding="async"
                      draggable={false}
                      className="absolute block h-auto max-w-none select-none"
                      style={{
                        width: `${(1254 / crop.width) * 100}%`,
                        left: `${(-crop.x / crop.width) * 100}%`,
                        top: `${(-crop.y / crop.height) * 100}%`,
                      }}
                    />
                  </picture>
                  <canvas aria-hidden="true" className="absolute inset-0 block size-full" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="mt-2 flex justify-center gap-1 sm:hidden"
        role="group"
        aria-label="Illustration views"
      >
        {MOBILE_SECTIONS.map((section, index) => {
          const isActive = index === mobileSectionIndex
          return (
            <button
              key={section.label}
              type="button"
              aria-label={section.label}
              aria-pressed={isActive}
              onClick={() => showMobileSection(index, index >= mobileSectionIndex ? 1 : -1)}
              className="grid size-5 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              <span
                className={`size-1.5 rounded-full transition-colors ${isActive ? "bg-violet-500" : "bg-[#d4d4d4]"
                  }`}
              />
            </button>
          )
        })}
      </div>
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
    <main id="top" className="min-h-dvh bg-white font-sans text-[#111111] selection:bg-violet-100">
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
            <img
              src="/peertoss-wordmark.svg?v=2"
              alt="PeerToss"
              width="144"
              height="38"
              className="h-auto w-32 sm:w-36"
            />
          </button>



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
              className="text-[clamp(2.5rem,5vw,3.75rem)] font-semibold leading-[1.3] tracking-[-0.055em]"
            >
              Share anything.
              <br />
              Stay connected.
            </h1>
            <p className="mt-5 max-w-[400px] text-base leading-[1.75] text-[#494949] sm:text-[17px]">
              Send files, share your screen, or start a call between two devices.
              First, create a room on this device.
            </p>

            <div className="mt-7 max-w-[400px]">
              <p className="mb-2.5 text-xs font-semibold text-violet-700">
                Start here
              </p>
              <Button
                type="button"
                size="lg"
                aria-describedby="hero-create-hint"
                className="group h-14 w-full justify-between rounded-xl bg-violet-600 px-5 text-base font-semibold text-white shadow-[0_8px_22px_-10px_rgba(124,58,237,0.5)] transition-colors hover:bg-violet-700 focus-visible:ring-violet-400 focus-visible:ring-offset-2 has-[>svg]:px-5 motion-reduce:transition-none"
                onClick={() => setConfirmOpen(true)}
              >
                Create a free room
                <ArrowRight className="size-5" />
              </Button>
              <p id="hero-create-hint" className="mt-2.5 text-[13px] leading-5 text-[#606060]">
                Then scan the QR code on your other device to connect.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p id="hero-join-hint" className="text-[13px] text-[#606060]">
                  Already have a room code?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  aria-describedby="hero-join-hint"
                  className="h-11 rounded-xl border-[#cccccc] bg-white px-4 text-sm font-medium text-[#222222] shadow-none hover:border-violet-400 hover:bg-violet-50 focus-visible:ring-violet-400 focus-visible:ring-offset-2 motion-reduce:transition-none"
                  onClick={() => setJoinOpen(true)}
                >
                  <QrCode className="size-4" />
                  Join a room
                </Button>
              </div>
            </div>

            <p className="mt-5 flex items-center gap-2 text-xs leading-6 text-[#777777]">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              No sign-up. Nothing to install.
            </p>
          </div>

          <HeroIllustration />
        </div>
      </section>

      <CallFeature />
      <FileSharingFeature onCreateRoom={() => setConfirmOpen(true)} />
      <HowItWorksTimeline onCreateRoom={() => setConfirmOpen(true)} />

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

      <footer role="contentinfo" className="border-t border-[#e5e5e5] bg-[#fafafa]">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8 lg:px-12">
          <div>
            <img
              src="/peertoss-wordmark.svg?v=2"
              alt="PeerToss"
              width="112"
              height="29"
              className="h-auto w-28"
            />
            <p className="mt-2 text-xs leading-6 text-[#606060]">
              Direct sharing. Just your devices.
            </p>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="flex flex-wrap items-center gap-x-5 sm:justify-end">
              <button
                type="button"
                onClick={() => setJoinOpen(true)}
                className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
              >
                Join a room
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
              >
                Create a room
              </button>
              <a
                href="#top"
                className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
              >
                Back to top
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </a>
            </div>
            <p className="text-xs leading-6 text-[#777777]">
              © {new Date().getFullYear()} PeerToss
            </p>
          </div>
        </div>
      </footer>

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

          <RoomInviteContent
            code={session?.session_id ?? ""}
            url={sessionJoinUrl}
            onCopy={() => void copy(session?.session_id ?? "", "Pairing code")}
            onShare={() => void handleShareInvite()}
          />

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
              This closes the temporary session. You will
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
