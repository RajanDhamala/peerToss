import { useEffect, useRef, useState, type FormEvent } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Download,
  ExternalLink,
  FolderArchive,
  FolderOpen,
  FolderUp,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react"
import { toast } from "react-hot-toast"

import { FileTypeIcon } from "@/components/rtc/FileTypeIcon"
import { useFolderUploadPreference } from "@/components/rtc/FolderUploadPreferenceDialog"
import { formatBytes, formatTime, type ChatItem } from "@/components/rtc/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  canExtractFolderArchive,
  extractFolderArchive,
} from "@/Utils/folderArchive"

function asShareableUrl(value?: string) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function FileMessage({ message }: { message: ChatItem }) {
  const [extracting, setExtracting] = useState(false)
  const transferredBytes = message.transferredBytes ?? 0
  const size = message.size ?? 0
  const active =
    message.transferStatus === "sending" ||
    message.transferStatus === "receiving"
  const progress =
    message.transferStatus === "complete"
      ? 100
      : size
        ? Math.min(100, Math.round((transferredBytes / size) * 100))
        : 0
  const statusLabel =
    message.transferStatus === "sending"
      ? `Sending · ${progress}%`
      : message.transferStatus === "receiving"
        ? `Receiving · ${progress}%`
        : message.transferStatus === "failed"
          ? "Transfer failed"
          : message.mine
            ? "Sent"
            : "Received"

  return (
    <div
      className="mt-2 w-full max-w-80 overflow-hidden rounded-lg border border-[#3F4147] bg-[#2B2D31] text-[#F2F3F5]"
    >
      {message.kind === "image" &&
        message.url &&
        message.transferStatus === "complete" && (
          <img
            src={message.url}
            alt={message.name ?? "Shared image"}
            className="max-h-44 w-full object-cover"
          />
        )}

      <div className="flex items-center gap-3 p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1E1F22]">
          {message.folderArchive ? (
            <FolderArchive className="size-5 text-[#B5BAC1]" />
          ) : (
            <FileTypeIcon
              name={message.name}
              mime={message.mime}
              className="size-9"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {message.name ?? "Shared file"}
          </p>
          <p className="mt-0.5 text-[11px] text-[#B5BAC1]">
            {statusLabel} ·{" "}
            {active
              ? `${formatBytes(transferredBytes)} / ${formatBytes(size)}`
              : formatBytes(size)}
            {message.folderArchive && message.fileCount
              ? ` · ${message.fileCount} files`
              : ""}
          </p>

          {active && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1E1F22]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {message.transferStatus === "complete" && message.url && (
          <div className="flex shrink-0 items-center gap-1">
            {!message.mine && message.folderArchive && (
              <button
                type="button"
                disabled={extracting}
                onClick={() => {
                  if (!message.url) return
                  if (!canExtractFolderArchive()) {
                    toast.error(
                      "This browser cannot extract folders directly. Download the ZIP instead."
                    )
                    return
                  }

                  setExtracting(true)
                  void extractFolderArchive(message.url)
                    .then((count) => toast.success(`Extracted ${count} files`))
                    .catch((error: unknown) => {
                      if (error instanceof DOMException && error.name === "AbortError") {
                        return
                      }
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not extract the folder"
                      )
                    })
                    .finally(() => setExtracting(false))
                }}
                className="flex size-8 items-center justify-center rounded-lg text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] disabled:opacity-50"
                aria-label={`Extract ${message.name ?? "folder"}`}
                title="Extract folder"
              >
                {extracting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FolderOpen className="size-4" />
                )}
              </button>
            )}
            <a
              href={message.url}
              download={message.name}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#B5BAC1] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
              aria-label={`Download ${message.name ?? "file"}`}
              title={message.folderArchive ? "Download ZIP" : "Download file"}
            >
              <Download className="size-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function MessagePanel({
  open,
  onOpenChange,
  messages,
  draft,
  onDraftChange,
  onSend,
  onSendFile,
  onSendFolder,
  connected,
  fileConnected,
  sendingFile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatItem[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onSendFile: (file: File) => void
  onSendFolder: (
    files: File[],
    ignoredEntryCount: number,
    ignoreGenerated: boolean
  ) => void
  connected: boolean
  fileConnected: boolean
  sendingFile: boolean
}) {
  const messageListRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { requestFolderUpload, folderUploadPreferenceDialog } =
    useFolderUploadPreference()

  useEffect(() => {
    if (!open) return
    const messageList = messageListRef.current
    if (!messageList) return

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length, open])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (connected && draft.trim()) onSend()
  }

  return (
    <>
      {folderUploadPreferenceDialog}
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        {open && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/55 sm:hidden"
            onClick={() => onOpenChange(false)}
            aria-label="Close call chat"
          />
        )}
        <DialogPrimitive.Content className="fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111214] text-[#F2F3F5] shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-6 data-[state=open]:slide-in-from-right-6 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[380px] sm:rounded-none sm:border-y-0 sm:border-r-0">
          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#2B2D31]">
              <MessageSquare className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold">
                Call chat
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 flex items-center gap-1 text-xs text-[#949BA4]">
                <ShieldCheck className="size-3" />
                Direct messages and files
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close messages"
                className="text-[#B5BAC1] hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div
            ref={messageListRef}
            className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-2 py-4"
            aria-live="polite"
          >
            {messages.length > 0 ? (
              <div className="space-y-0.5">
                {messages.map((message) => {
                  const link =
                    message.kind === "text"
                      ? asShareableUrl(message.text?.trim())
                      : null

                  return (
                    <article
                      key={message.id}
                      className="flex items-start gap-3 rounded px-2 py-2 transition-colors hover:bg-white/[0.03]"
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${
                          message.mine ? "bg-[#5865F2]" : "bg-emerald-600"
                        }`}
                        aria-hidden="true"
                      >
                        {message.mine ? "Y" : "P"}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-[#F2F3F5]">
                            {message.mine ? "You" : "Peer"}
                          </span>
                          <span className="text-[10px] text-[#949BA4]">
                            {formatTime(message.ts)}
                          </span>
                        </div>

                        {message.kind === "text" ? (
                          link ? (
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-[#00A8FC] underline-offset-4 hover:underline"
                            >
                              <span className="min-w-0 truncate">{link.href}</span>
                              <ExternalLink className="size-3.5 shrink-0" />
                            </a>
                          ) : (
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#DBDEE1]">
                              {message.text}
                            </p>
                          )
                        ) : (
                          <FileMessage message={message} />
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#2B2D31]">
                  <MessageSquare className="size-5 text-[#B5BAC1]" />
                </span>
                <p className="text-sm font-medium text-[#F2F3F5]">
                  Welcome to the call chat
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#949BA4]">
                  Send a quick message or attach a file without leaving the call.
                </p>
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 bg-[#111214] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              disabled={!fileConnected || sendingFile}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onSendFile(file)
                event.target.value = ""
              }}
            />
            <input
              ref={(input) => {
                folderInputRef.current = input
                if (input) input.webkitdirectory = true
              }}
              type="file"
              multiple
              className="sr-only"
              disabled={!fileConnected || sendingFile}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                if (files.length) {
                  requestFolderUpload((ignoreGenerated) => {
                    onSendFolder(files, 0, ignoreGenerated)
                  })
                }
                event.target.value = ""
              }}
            />

            <form
              className="flex items-center gap-1 rounded-lg bg-[#383A40] p-1.5"
              onSubmit={handleSubmit}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={!fileConnected || sendingFile}
                aria-label={sendingFile ? "Sending file" : "Attach file"}
                title={fileConnected ? "Attach file" : "File channel is not ready"}
                className="size-9 shrink-0 rounded-md text-[#B5BAC1] hover:bg-white/10 hover:text-white"
              >
                {sendingFile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Paperclip className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => folderInputRef.current?.click()}
                disabled={!fileConnected || sendingFile}
                aria-label="Send folder"
                title={fileConnected ? "Send folder" : "File channel is not ready"}
                className="size-9 shrink-0 rounded-md text-[#B5BAC1] hover:bg-white/10 hover:text-white"
              >
                <FolderUp className="size-4" />
              </Button>
              <Input
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                disabled={!connected}
                placeholder={
                  connected ? "Type a message…" : "Message channel is not ready"
                }
                aria-label="Message"
                className="h-9 flex-1 border-0 bg-transparent text-[#DBDEE1] shadow-none placeholder:text-[#949BA4] focus-visible:ring-0"
              />
              <Button
                type="submit"
                disabled={!connected || !draft.trim()}
                size="icon"
                aria-label="Send message"
                className="size-9 shrink-0 rounded-md bg-[#5865F2] text-white hover:bg-[#4752C4]"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

export { MessagePanel }
