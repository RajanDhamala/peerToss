import { useEffect, useRef, useState } from "react"
import MessageComponent from "@/components/rtc/MessageComponet"

import { toast } from "react-hot-toast"
import { Link } from "react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  FolderUp,
  Gauge,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Upload,
} from "lucide-react"

import useUserStore from "@/UserStore"
import { ManifestPanel } from "@/components/rtc/ManifestPanel"
import { SpeedMeter } from "@/components/rtc/SpeedMeter"
import { RoomBackdrop } from "@/components/rtc/RoomBackdrop"
import { useFolderUploadPreference } from "@/components/rtc/FolderUploadPreferenceDialog"
import { formatBytes } from "@/components/rtc/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  RTC_SPEED_TEST_SAMPLE_SIZE,
  rtcSession,
} from "@/global/rtc/RtcSessionController"
import useRtcStore from "@/global/rtc/rtcStore"
import {
  getDroppedFileSystemEntry,
  readDroppedDirectory,
  readDroppedTransfer,
} from "@/Utils/folderArchive"

const CHAT_MESSAGE_MAX_BYTES = 64 * 1024
const CHAT_MESSAGE_LIMIT_TOAST_ID = "chat-message-payload-limit"

function getMessagePayloadSize(message: string) {
  return new TextEncoder().encode(message).byteLength
}

function RtcPage() {
  const ws = useUserStore((state) => state.ws)
  const setWs = useUserStore((state) => state.setWs)
  const peerCreated = useRtcStore((state) => state.peerCreated)
  const chatChannelPresent = useRtcStore((state) => state.chatChannelPresent)
  const fileChannelPresent = useRtcStore((state) => state.fileChannelPresent)
  const chatReady = useRtcStore((state) => state.chatReady)
  const fileReady = useRtcStore((state) => state.fileReady)
  const messages = useRtcStore((state) => state.messages)
  const sendingFile = useRtcStore((state) => state.sendingFile)
  const uploadMbps = useRtcStore((state) => state.uploadMbps)
  const downloadMbps = useRtcStore((state) => state.downloadMbps)
  const speedTestRunning = useRtcStore((state) => state.speedTestRunning)
  const speedTestDirection = useRtcStore((state) => state.speedTestDirection)
  const speedTestWaiting = useRtcStore((state) => state.speedTestWaiting)
  const callStatus = useRtcStore((state) => state.callStatus)

  const [draft, setDraft] = useState("")
  const [draggingFile, setDraggingFile] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [lastReadTextMessageId, setLastReadTextMessageId] = useState<
    string | null
  >(null)
  const [desktopChat, setDesktopChat] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches
  )

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const handleChange = (event: MediaQueryListEvent) => {
      setDesktopChat(event.matches)
      setMobileChatOpen(false)
      const latest = useRtcStore
        .getState()
        .messages.filter((item) => item.kind === "text")
        .at(-1)
      setLastReadTextMessageId(latest?.id ?? null)
    }
    query.addEventListener("change", handleChange)
    return () => query.removeEventListener("change", handleChange)
  }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (folderInputRef.current) folderInputRef.current.webkitdirectory = true
  }, [])

  const { requestFolderUpload, folderUploadPreferenceDialog } =
    useFolderUploadPreference()

  const roomActive = ws?.readyState === WebSocket.OPEN
  const channelOpen = chatReady
  const transferChannelOpen = fileReady
  const directConnectionOpen = channelOpen && transferChannelOpen
  const textMessages = messages.filter((item) => item.kind === "text")
  const lastReadIndex = textMessages.findIndex(
    (item) => item.id === lastReadTextMessageId
  )
  const unreadMessageCount =
    mobileChatOpen || desktopChat
      ? 0
      : textMessages.slice(lastReadIndex + 1).filter((item) => !item.mine)
          .length
  const unreadMessageLabel = `${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}`

  const handleMobileChatOpenChange = (open: boolean) => {
    const latest = useRtcStore
      .getState()
      .messages.filter((item) => item.kind === "text")
      .at(-1)
    setLastReadTextMessageId(latest?.id ?? null)
    setMobileChatOpen(open)
  }
  const transfers = messages.filter((item) => item.kind !== "text")
  const activeCount = transfers.filter(
    (item) =>
      item.transferStatus === "sending" || item.transferStatus === "receiving"
  ).length

  const connectionLabel = directConnectionOpen
    ? "Direct link open"
    : !roomActive
      ? "No active room"
      : !peerCreated
        ? "Room ready"
        : chatChannelPresent || fileChannelPresent
          ? "Opening channels…"
          : "Connecting…"

  const canChooseFile = transferChannelOpen && !sendingFile && !speedTestRunning
  const speedTestDisabled =
    !transferChannelOpen || sendingFile || activeCount > 0 || speedTestRunning

  const updateDraft = (value: string) => {
    if (getMessagePayloadSize(value) > CHAT_MESSAGE_MAX_BYTES) {
      toast.error(
        `Messages cannot exceed ${formatBytes(CHAT_MESSAGE_MAX_BYTES)}.`,
        { id: CHAT_MESSAGE_LIMIT_TOAST_ID }
      )
      return
    }

    setDraft(value)
  }

  const sendMessage = (
    message: string,
    options?: { preserveDraft?: boolean }
  ) => {
    if (getMessagePayloadSize(message.trim()) > CHAT_MESSAGE_MAX_BYTES) {
      toast.error(
        `Messages cannot exceed ${formatBytes(CHAT_MESSAGE_MAX_BYTES)}.`,
        { id: CHAT_MESSAGE_LIMIT_TOAST_ID }
      )
      return false
    }

    if (!rtcSession.sendMessage(message)) return false
    if (!options?.preserveDraft) setDraft("")
    return true
  }

  const sendDroppedTransfer = async (dataTransfer: DataTransfer) => {
    try {
      const transfer = await readDroppedTransfer(dataTransfer)
      if (transfer.kind === "folder") {
        await rtcSession.sendFolder(transfer.files, transfer.ignoredCount)
        return
      }
      await rtcSession.sendFile(transfer.file)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not read the dropped item"
      )
    }
  }

  const sendDroppedDirectory = async (
    entry: FileSystemDirectoryEntry,
    ignoreGenerated: boolean
  ) => {
    try {
      const folder = await readDroppedDirectory(entry, ignoreGenerated)
      await rtcSession.sendFolder(
        folder.files,
        folder.ignoredCount,
        ignoreGenerated
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not read the dropped folder"
      )
    }
  }

  const handleDroppedItem = (dataTransfer: DataTransfer) => {
    try {
      const entry = getDroppedFileSystemEntry(dataTransfer)
      if (entry?.isDirectory) {
        requestFolderUpload((ignoreGenerated) => {
          void sendDroppedDirectory(
            entry as FileSystemDirectoryEntry,
            ignoreGenerated
          )
        })
        return
      }

      void sendDroppedTransfer(dataTransfer)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not read the dropped item"
      )
    }
  }

  const messagePanel = (
    <MessageComponent
      messages={textMessages}
      draft={draft}
      connected={channelOpen}
      callStatus={callStatus}
      onDraftChange={updateDraft}
      inputId="peer-message-draft"
      onSend={sendMessage}
      onStartVideoCall={() => {
        rtcSession.requestVideoCall()
      }}
      className={
        desktopChat
          ? "lg:h-[calc(100dvh-9rem)] lg:min-h-0"
          : "h-[min(80dvh,680px)] min-h-0 border-0 shadow-none"
      }
    />
  )

  return (
    <main className="relative isolate min-h-dvh bg-[#f2f3f5] font-sans text-foreground selection:bg-violet-100 selection:text-violet-950 dark:bg-[#111214] dark:selection:bg-violet-900 dark:selection:text-violet-100">
      <RoomBackdrop />
      {folderUploadPreferenceDialog}

      <div>
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-20 w-full max-w-[1360px] flex-wrap items-center gap-x-3 gap-y-3 px-5 py-4 sm:px-8 lg:px-12">
            <Link
              to="/"
              onClick={() => {
                rtcSession.endSession()
                setWs(null)
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-[18px]" />
            </Link>

            <img
              src="/peertoss-wordmark.svg?v=2"
              alt="PeerToss"
              width="112"
              height="29"
              className="h-auto w-24 shrink-0 sm:w-28 dark:invert"
            />

            <span className="ml-2 hidden border-l border-border pl-5 text-sm text-muted-foreground lg:inline">
              Private room
            </span>

            <div className="ml-auto flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
              <div
                role="status"
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2"
              >
                <span
                  className="relative flex size-2 shrink-0"
                  aria-hidden="true"
                >
                  {directConnectionOpen && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-40 motion-reduce:animate-none" />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${
                      directConnectionOpen
                        ? "bg-emerald-500"
                        : roomActive
                          ? "bg-amber-500"
                          : "bg-muted-foreground"
                    }`}
                  />
                </span>
                <span className="text-xs font-medium sm:text-[13px]">
                  {connectionLabel}
                </span>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2 rounded-xl bg-card px-3 text-xs shadow-sm"
                  >
                    {speedTestRunning ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Gauge className="size-3.5" aria-hidden="true" />
                    )}
                    {speedTestRunning ? "Testing…" : "Test speed"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-0 font-sans sm:max-w-sm md:max-w-lg lg:max-w-[560px]">
                  <DialogTitle className="sr-only">
                    Direct link speed
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Test throughput across the direct WebRTC connection.
                  </DialogDescription>
                  <aside className="flex flex-col rounded-2xl bg-card p-6 pt-12 md:px-8 md:pb-8 lg:px-10">
                    <SpeedMeter
                      className="md:min-h-[480px] lg:min-h-[520px]"
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
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1360px] px-5 pb-24 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pb-8">
          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.52fr)] lg:gap-6">
            <div className="min-w-0">
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
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                disabled={!canChooseFile}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  if (files.length) {
                    requestFolderUpload((ignoreGenerated) => {
                      void rtcSession.sendFolder(files, 0, ignoreGenerated)
                    })
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
                    toast.error(
                      "Connect to a peer before selecting a file or folder"
                    )
                    return
                  }

                  handleDroppedItem(event.dataTransfer)
                }}
                data-dragging={draggingFile || undefined}
                className={`rtc-upload-zone relative isolate flex min-h-[380px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-[background-color,border-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-reduce:transition-none sm:min-h-[420px] sm:px-8 lg:min-h-[460px] ${
                  !canChooseFile
                    ? "cursor-not-allowed border-[#D8D4C9] bg-card dark:border-border"
                    : draggingFile
                      ? "cursor-copy border-[#7CB88F] bg-[#EEF6F0] ring-2 ring-[#7CB88F]/15 dark:bg-[#243329]"
                      : "cursor-pointer border-[#D8D4C9] bg-card dark:border-border"
                } ${canChooseFile ? "rtc-upload-ready" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-4 text-muted-foreground/30"
                >
                  <span className="absolute left-0 top-0 size-3.5 rounded-tl border-l border-t" />
                  <span className="absolute right-0 top-0 size-3.5 rounded-tr border-r border-t" />
                  <span className="absolute bottom-0 left-0 size-3.5 rounded-bl border-b border-l" />
                  <span className="absolute bottom-0 right-0 size-3.5 rounded-br border-b border-r" />
                </span>
                <div className="flex flex-col items-center gap-6">
                  <div
                    className={`relative flex size-14 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${
                      draggingFile
                        ? "bg-[#7CB88F] text-[#14251A]"
                        : canChooseFile
                          ? "bg-[#F5F4F0] text-[#4B5160] dark:bg-muted dark:text-muted-foreground"
                          : "border-border bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {sendingFile ? (
                      <Loader2
                        className="size-6 animate-spin"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Upload
                        className={`rtc-upload-icon size-6 ${canChooseFile ? "text-[#357A4B] dark:text-[#8DCEA1]" : ""}`}
                        strokeWidth={1.75}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xl font-semibold tracking-[-0.025em]">
                      {sendingFile
                        ? "Your file is on its way"
                        : speedTestRunning
                          ? "Testing your connection"
                          : draggingFile
                            ? "Release to add it"
                            : canChooseFile
                              ? "Drop a file or folder"
                              : "Waiting to connect"}
                    </p>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                      {sendingFile
                        ? "Keep this room open while your file finishes sending."
                        : speedTestRunning
                          ? "You can send files when the speed test finishes."
                          : canChooseFile
                            ? "Drop anywhere here, or click to choose a file. Folders are packaged as a ZIP before sending."
                            : "File sharing will be ready as soon as your peer connects."}
                    </p>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    disabled={!canChooseFile}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (canChooseFile) fileInputRef.current?.click()
                    }}
                    className="h-11 rounded-xl bg-[#14171F] px-4 text-white shadow-sm hover:bg-[#262B3A] focus-visible:ring-[#7CB88F] dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none motion-reduce:transition-none"
                  >
                    Browse files
                    <ArrowUpRight className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canChooseFile}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (canChooseFile) {
                        folderInputRef.current?.click()
                      }
                    }}
                    className="h-11 rounded-xl border-input bg-card px-4 shadow-none hover:bg-muted focus-visible:ring-[#7CB88F] disabled:opacity-50 motion-reduce:transition-none"
                  >
                    Browse folder
                    <FolderUp className="size-3.5" />
                  </Button>
                </div>
                <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Device to device. No server storage.
                </p>
              </div>
              <ManifestPanel transfers={transfers} activeCount={activeCount} />
            </div>

            {desktopChat && (
              <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
                {messagePanel}
              </div>
            )}
          </div>
        </div>
        {!desktopChat && (
          <Dialog
            open={mobileChatOpen}
            onOpenChange={handleMobileChatOpenChange}
          >
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={
                  unreadMessageCount
                    ? `Open messages, ${unreadMessageLabel}`
                    : "Open messages"
                }
                className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[#14171F] px-5 text-sm font-medium text-white shadow-lg hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-2 dark:bg-foreground dark:text-background"
              >
                <MessageCircle className="size-5" aria-hidden="true" />
                Messages
                {unreadMessageCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B5D2BD] px-1.5 text-[11px] font-semibold tabular-nums text-[#203A29]"
                  >
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <span role="status" className="sr-only">
              {unreadMessageCount ? unreadMessageLabel : ""}
            </span>
            <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 font-sans [&>section>header]:pr-14 [&>[data-slot=dialog-close]]:right-3 [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:flex [&>[data-slot=dialog-close]]:size-8 [&>[data-slot=dialog-close]]:items-center [&>[data-slot=dialog-close]]:justify-center [&>[data-slot=dialog-close]]:rounded-lg [&>[data-slot=dialog-close]]:bg-muted [&>[data-slot=dialog-close]]:opacity-100">
              <DialogTitle className="sr-only">Messages</DialogTitle>
              <DialogDescription className="sr-only">
                Chat, send reactions, or start a call with your connected peer.
              </DialogDescription>
              {messagePanel}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </main>
  )
}

export default RtcPage
