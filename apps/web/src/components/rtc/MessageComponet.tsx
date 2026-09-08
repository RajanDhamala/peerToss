import { useEffect, useRef, useState, type FormEvent } from "react"
import { MessageCircle, Send, ShieldCheck, Video } from "lucide-react"

import { formatRelativeTime, type ChatItem } from "@/components/rtc/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CallStatus } from "@/global/rtc/rtcStore"
import { ChatExtrasPicker } from "./ChatExtrasPicker"
import { ChatMessageContent } from "./ChatMessageContent"
import { encodeChatReaction, STARTER_MESSAGES } from "./chatReactions"

type MessageComponentProps = {
  messages: ChatItem[]
  draft: string
  connected: boolean
  callStatus: CallStatus
  onDraftChange: (value: string) => void
  onSend: (message: string, options?: { preserveDraft?: boolean }) => boolean
  onStartVideoCall: () => void
  inputId?: string
  className?: string
}

function MessageComponent({
  messages,
  draft,
  connected,
  callStatus,
  onDraftChange,
  onSend,
  onStartVideoCall,
  inputId = "peer-message-draft",
  className = "",
}: MessageComponentProps) {
  const messageListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList) return
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    })
  }, [messages.length])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(interval)
  }, [])

  const focusInput = () => inputRef.current?.focus()
  const insertEmoji = (emoji: string) => {
    const start = inputRef.current?.selectionStart ?? draft.length
    const end = inputRef.current?.selectionEnd ?? start
    onDraftChange(draft.slice(0, start) + emoji + draft.slice(end))
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(
        start + emoji.length,
        start + emoji.length
      )
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (connected && draft.trim()) onSend(draft)
  }

  return (
    <section
      className={cn(
        "flex h-[min(70dvh,560px)] min-h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#dedfe3] bg-card font-sans text-card-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-border",
        className
      )}
      aria-label="Peer messages"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <MessageCircle className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Messages</h2>
            <Button
              type="button"
              variant="outline"
              onClick={onStartVideoCall}
              disabled={!connected || callStatus !== "idle"}
              aria-label={
                callStatus === "outgoing"
                  ? "Calling peer"
                  : callStatus === "active"
                    ? "Video call active"
                    : "Start video call"
              }
              title={connected ? "Start video call" : "Connect to call"}
              className={`h-9 gap-1.5 rounded-lg px-2.5 text-xs shadow-none focus-visible:ring-[#7CB88F] disabled:opacity-50 motion-reduce:transition-none ${
                callStatus === "outgoing"
                  ? "animate-pulse bg-muted motion-reduce:animate-none"
                  : callStatus === "active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Video className="size-4" strokeWidth={1.9} />
              {callStatus === "outgoing"
                ? "Calling…"
                : callStatus === "active"
                  ? "In call"
                  : "Call"}
            </Button>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            {connected ? "Connected to your peer" : "Waiting for peer"}
          </p>
        </div>
      </header>

      <div
        ref={messageListRef}
        className="rtc-message-scroll min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div
            role="status"
            className="flex min-h-full flex-col items-center justify-center px-3 py-8 text-center"
          >
            <h3 className="text-lg font-medium">
              {connected ? "No messages yet" : "Waiting for your peer"}
            </h3>
            <p className="mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
              {connected
                ? "Write a message below."
                : "Messages will appear here once you connect."}
            </p>
          </div>
        ) : (
          <div
            role="status"
            className="mb-5 rounded-xl bg-muted/50 px-3 py-3 text-center"
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Room notice
            </span>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {connected
                ? "You’re connected! Say hello or share something."
                : "Connect your other device to start the conversation."}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`mb-4 flex flex-col ${message.mine ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                message.mine
                  ? "rounded-br-md bg-[#EAF3EC] text-[#203A29] dark:bg-[#283B2F] dark:text-[#E3EEE6]"
                  : "rounded-bl-md border border-border bg-muted/30 text-card-foreground"
              }`}
            >
              <ChatMessageContent text={message.text} />
            </div>
            <span className="mt-1 px-1 text-[10px] text-muted-foreground">
              {message.mine ? "You" : "Peer"} ·{" "}
              {formatRelativeTime(message.ts, now)}
            </span>
          </article>
        ))}
      </div>

      <form
        className="relative shrink-0 border-t border-border bg-card p-3"
        onSubmit={handleSubmit}
      >
        {connected && messages.length === 0 && !draft.trim() && (
          <div className="mb-3 space-y-2">
            <p className="text-sm text-muted-foreground">Break the ice</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_MESSAGES.map((message) => (
                <button
                  key={message}
                  type="button"
                  onClick={() => {
                    onDraftChange(message)
                    focusInput()
                  }}
                  className="min-h-10 rounded-full border border-border bg-card px-3 py-2 text-sm hover:border-[#7CB88F] hover:bg-[#EEF6F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] dark:hover:bg-muted"
                >
                  {message}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={composerRef} className="flex gap-2">
          <label className="sr-only" htmlFor={inputId}>
            Message
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            disabled={!connected}
            type="text"
            placeholder={
              connected ? "Write a message…" : "Connect to send a message"
            }
            className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] disabled:cursor-not-allowed disabled:bg-muted/50 md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!connected || !draft.trim()}
            aria-label="Send message"
            className="size-10 shrink-0 rounded-xl bg-[#14171F] text-white shadow-none hover:bg-[#262B3A] focus-visible:ring-[#7CB88F] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
          >
            <Send className="size-4" strokeWidth={1.9} />
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-0.5">
          <ChatExtrasPicker
            kind="emoji"
            anchorRef={composerRef}
            disabled={!connected}
            onSelect={insertEmoji}
            onReturnFocus={focusInput}
          />
          <ChatExtrasPicker
            kind="gif"
            anchorRef={composerRef}
            disabled={!connected}
            onSelect={(reaction) =>
              connected &&
              onSend(encodeChatReaction(reaction), { preserveDraft: true })
            }
            onReturnFocus={focusInput}
          />
          <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
            Enter to send
          </span>
        </div>
      </form>
    </section>
  )
}

export default MessageComponent
