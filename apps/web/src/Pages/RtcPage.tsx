import { useRef, useState } from "react"
import MessageComponent from "@/components/rtc/MessageComponet"

import { toast } from "react-hot-toast"
import { Link } from "react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  Gauge,
  Loader2,
  MessageCircle,
  Radio,
  Upload,
} from "lucide-react"

import useUserStore from "@/UserStore"
import { ManifestPanel } from "@/components/rtc/ManifestPanel"
import { SpeedMeter } from "@/components/rtc/SpeedMeter"
import { formatBytes } from "@/components/rtc/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  RTC_SPEED_TEST_SAMPLE_SIZE,
  rtcSession,
} from "@/global/rtc/RtcSessionController"
import useRtcStore from "@/global/rtc/rtcStore"

function RtcPage() {
  const ws = useUserStore((state) => state.ws)
  const status = useRtcStore((state) => state.status)
  const peerCreated = useRtcStore((state) => state.peerCreated)
  const chatChannelPresent = useRtcStore(
    (state) => state.chatChannelPresent
  )
  const fileChannelPresent = useRtcStore(
    (state) => state.fileChannelPresent
  )
  const chatReady = useRtcStore((state) => state.chatReady)
  const fileReady = useRtcStore((state) => state.fileReady)
  const messages = useRtcStore((state) => state.messages)
  const sendingFile = useRtcStore((state) => state.sendingFile)
  const uploadMbps = useRtcStore((state) => state.uploadMbps)
  const downloadMbps = useRtcStore((state) => state.downloadMbps)
  const speedTestRunning = useRtcStore(
    (state) => state.speedTestRunning
  )
  const speedTestDirection = useRtcStore(
    (state) => state.speedTestDirection
  )
  const speedTestWaiting = useRtcStore(
    (state) => state.speedTestWaiting
  )

  const [draft, setDraft] = useState("")
  const [draggingFile, setDraggingFile] = useState(false)
  const [mobileSpeedOpen, setMobileSpeedOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [isMouseOver, setIsMouseOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const channelOpen = chatReady
  const transferChannelOpen = fileReady
  const directConnectionOpen = channelOpen && transferChannelOpen
  const textMessages = messages.filter((item) => item.kind === "text")
  const transfers = messages.filter((item) => item.kind !== "text")
  const activeCount = transfers.filter(
    (item) =>
      item.transferStatus === "sending" ||
      item.transferStatus === "receiving"
  ).length

  const connectionLabel = directConnectionOpen
    ? "Direct link open"
    : !ws
      ? "No active room"
      : !peerCreated
        ? "Room ready"
        : chatChannelPresent || fileChannelPresent
          ? "Opening channels…"
          : "Connecting…"

  const canChooseFile =
    transferChannelOpen && !sendingFile && !speedTestRunning
  const speedTestDisabled =
    !transferChannelOpen ||
    sendingFile ||
    activeCount > 0 ||
    speedTestRunning

  const sendMessage = () => {
    if (rtcSession.sendMessage(draft)) setDraft("")
  }

  return (
    <main className="min-h-dvh bg-[#F5F4F0] text-[#14171F]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .ptx-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui; }
        .ptx-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .ptx-workspace, .ptx-workspace button, .ptx-workspace input { font-family: 'Inter', ui-sans-serif, system-ui; }
      `}</style>

      <div className="ptx-workspace">
        <header className="sticky top-0 z-30 border-b border-[#E4E1DA] bg-[#F5F4F0]/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Link
              to="/"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#4B5160] transition-colors hover:bg-[#EAE7DE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-[18px]" />
            </Link>

            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-[#14171F]">
                <Radio className="size-3.5 text-[#F2A33C]" strokeWidth={2} />
              </div>
              <span className="ptx-display text-[15px] font-semibold">PeerToss</span>
            </div>

            <span className="ptx-mono ml-2 hidden rounded-md border border-[#E4E1DA] bg-white px-2 py-1 text-[11px] text-[#8A8776] sm:inline">
              ROOM {ws ? "ACTIVE" : "OFFLINE"}
            </span>


            <div className="flex items-center gap-2 rounded-full border border-[#E4E1DA] bg-white py-1 pl-1 pr-2.5 sm:pr-3">
              <span className="relative flex size-2">
                {directConnectionOpen && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16947F] opacity-60" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${directConnectionOpen
                    ? "bg-[#16947F]"
                    : ws
                      ? "bg-[#F2A33C]"
                      : "bg-[#8A8776]"
                    }`}
                />
              </span>
              <span className="hidden text-[13px] font-medium md:inline">
                {connectionLabel}
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              {/* <div className="mb-8"> */}
              {/*   <p className="ptx-mono text-[11px] uppercase tracking-[0.14em] text-[#8A8776]"> */}
              {/*     Transfer workspace */}
              {/*   </p> */}
              {/*   <h1 className="ptx-display mt-1.5 text-[28px] font-semibold leading-tight sm:text-[32px]"> */}
              {/*     One link, straight to your peer. */}
              {/*   </h1> */}
              {/*   <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[#4B5160]"> */}
              {/*     Files move directly between these two devices. Nothing is stored */}
              {/*     in a permanent server library. */}
              {/*   </p> */}
              {/* </div> */}

              {ws && !directConnectionOpen && (
                <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-[#E4E1DA] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div>
                    <p className="ptx-display text-sm font-semibold">
                      Temporary handshake controls
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8A8776]">
                      {peerCreated
                        ? `Peer state: ${status}. Send the offer from one device.`
                        : "Start WebRTC on both devices, then send the offer from one device."}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void rtcSession.startPeer()}
                      disabled={peerCreated}
                      className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2.5 text-sm font-medium text-[#14171F] transition-colors hover:bg-[#F5F4F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-default disabled:bg-[#F5F4F0] disabled:text-[#8A8776]"
                    >
                      {peerCreated ? "WebRTC started" : "Start WebRTC"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void rtcSession.sendOffer()}
                      disabled={!peerCreated || chatChannelPresent || fileChannelPresent}
                      className="rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
                    >
                      Send Offer
                    </button>
                  </div>
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="grid gap-5 " >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    disabled={!canChooseFile}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void rtcSession.sendFile(file)
                      }
                      event.target.value = ""
                    }}
                  />

                  <div
                    role="button"
                    tabIndex={canChooseFile ? 0 : -1}
                    aria-disabled={!canChooseFile}
                    onClick={() => {
                      if (canChooseFile) fileInputRef.current?.click()
                    }}
                    onKeyDown={(event) => {
                      if (
                        canChooseFile &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    onMouseOver={() => setIsMouseOver(true)}
                    onMouseOut={() => setIsMouseOver(false)}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      if (canChooseFile) setDraggingFile(true)
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDraggingFile(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDraggingFile(false)

                      if (!canChooseFile) {
                        toast.error("Connect to a peer before selecting a file")
                        return
                      }

                      const files = Array.from(event.dataTransfer.files)
                      if (!files.length) return
                      if (files.length > 1) toast("Send one file at a time")
                      void rtcSession.sendFile(files[0])
                    }}
                    className={`relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F4F0] ${!canChooseFile
                      ? "cursor-not-allowed border-[#DEDAD1] bg-white/60"
                      : draggingFile
                        ? "cursor-copy border-[#F2A33C] bg-[#FBEAD2]/40"
                        : "cursor-pointer border-[#D8D4C9] bg-white"
                      } ${canChooseFile && isMouseOver && !draggingFile
                        ? "!border-[#7CB88F] !bg-[#EEF6F0] -translate-y-1 shadow-lg shadow-[#7CB88F]/20"
                        : ""
                      }`}
                  >

                    {[
                      "left-4 top-4 border-l-2 border-t-2",
                      "right-4 top-4 border-r-2 border-t-2",
                      "bottom-4 left-4 border-b-2 border-l-2",
                      "bottom-4 right-4 border-b-2 border-r-2",
                    ].map((position) => (
                      <span
                        key={position}
                        className={`pointer-events-none absolute size-4 rounded-[3px] border-[#D8D4C9] ${position}`}
                      />
                    ))}

                    <div
                      className={`flex size-14 items-center justify-center rounded-full transition-colors ${draggingFile
                        ? "bg-[#F2A33C] text-white"
                        : canChooseFile
                          ? "bg-[#F5F4F0] text-[#4B5160]"
                          : "bg-[#ECE9E1] text-[#AAA697]"
                        }`}
                    >
                      {sendingFile ? (
                        <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <Upload className="size-6" strokeWidth={1.75} />
                      )}
                    </div>

                    <p className="ptx-display mt-5 text-lg font-semibold">
                      {sendingFile
                        ? "Your file is on its way"
                        : draggingFile
                          ? "Release to add it"
                          : canChooseFile
                            ? "Drop a file to toss it over"
                            : "The launch pad is waiting"}
                    </p>
                    <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#8A8776]">
                      {canChooseFile
                        ? "One file at a time — it waits for confirmation before leaving this device."
                        : "Open the direct file channel, then choose or drop a file here."}
                    </p>

                    <button
                      type="button"
                      disabled={!canChooseFile}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (canChooseFile) fileInputRef.current?.click()
                      }}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
                    >
                      Browse files
                      <ArrowUpRight className="size-3.5" />
                    </button>
                  </div>
                </div>
                {/* signal section */}
                <aside className="hidden flex-col rounded-2xl border border-[#E4E1DA] bg-white p-5 md:flex">
                  <SpeedMeter
                    uploadMbps={uploadMbps}
                    downloadMbps={downloadMbps}
                    running={speedTestRunning}
                    activeDirection={speedTestDirection}
                    waitingForPeer={speedTestWaiting}
                    disabled={speedTestDisabled}
                    sampleSizeLabel={formatBytes(RTC_SPEED_TEST_SAMPLE_SIZE)}
                    onRun={() => {
                      void rtcSession.runSpeedTest()
                    }}
                  />
                </aside>
              </div>
              <ManifestPanel
                transfers={transfers}
                activeCount={activeCount}
                mobileAction={
                  <button
                    type="button"
                    onClick={() => setMobileSpeedOpen(true)}
                    className="flex size-8 items-center justify-center rounded-full border border-[#E4E1DA] bg-white text-[#4B5160] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] md:hidden"
                    aria-label="Open speed test"
                  >
                    <Gauge className="size-4" strokeWidth={1.75} />
                  </button>
                }
              />
            </div>

            <MessageComponent
              messages={textMessages}
              draft={draft}
              connected={channelOpen}
              onDraftChange={setDraft}
              inputId="peer-message-draft-desktop"
              onSend={() => {
                void sendMessage()
              }}
              className="hidden md:flex xl:sticky xl:top-24"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileChatOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#14171F] text-[#F2A33C] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 md:hidden"
          aria-label="Open messages"
        >
          <MessageCircle className="size-5" strokeWidth={1.9} />
        </button>

        <Dialog open={mobileSpeedOpen} onOpenChange={setMobileSpeedOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 md:hidden">
            <DialogTitle className="sr-only">Direct link speed</DialogTitle>
            <DialogDescription className="sr-only">
              Test throughput across the direct WebRTC connection.
            </DialogDescription>
            <aside className="flex flex-col bg-white p-5 pt-12">
              <SpeedMeter
                uploadMbps={uploadMbps}
                downloadMbps={downloadMbps}
                running={speedTestRunning}
                activeDirection={speedTestDirection}
                waitingForPeer={speedTestWaiting}
                disabled={speedTestDisabled}
                sampleSizeLabel={formatBytes(RTC_SPEED_TEST_SAMPLE_SIZE)}
                onRun={() => {
                  void rtcSession.runSpeedTest()
                }}
              />
            </aside>
          </DialogContent>
        </Dialog>

        <Dialog open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
          <DialogContent className="w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 md:hidden ">
            <DialogTitle className="sr-only">Messages</DialogTitle>
            <DialogDescription className="sr-only">
              Messages shared across the direct WebRTC connection.
            </DialogDescription>
            <MessageComponent
              messages={textMessages}
              draft={draft}
              connected={channelOpen}
              onDraftChange={setDraft}
              inputId="peer-message-draft-mobile"
              onSend={() => {
                void sendMessage()
              }}
              className="max-h-[calc(100dvh-2rem)] border-0"
            />
          </DialogContent>
        </Dialog>
      </div>

    </main>
  )
}

export default RtcPage
