import { useEffect, useRef, useState, type FormEvent } from "react"
import { MessageCircle, Send, Video } from "lucide-react"

import { formatRelativeTime, type ChatItem } from "@/components/rtc/types"
import type { CallStatus } from "@/global/rtc/rtcStore"

type MessageComponentProps = {
  messages: ChatItem[]
  draft: string
  connected: boolean
  callStatus: CallStatus
  onDraftChange: (value: string) => void
  onSend: () => void
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
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList) return

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(interval)
  }, [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (connected && draft.trim()) onSend()
  }

  return (
    <section
      className={`flex md:h-[440px] h-[70vh] w-full flex-col overflow-hidden rounded-2xl border border-[#E4E1DA] bg-white ${className}`}
      aria-label="Peer messages"
    >
      <header className="flex items-center gap-3 border-b border-[#E4E1DA] px-4 py-3.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl "
          aria-hidden="true"
        >
          <MessageCircle className="size-4 text-[#F2A33C]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="ptx-display text-sm font-semibold text-[#14171F]">
              Messages
            </h2>
            <button
              type="button"
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
              className={`flex size-9 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-not-allowed ${
                callStatus === "outgoing"
                  ? "animate-pulse bg-[#FBEAD2] text-[#B86C0B]"
                  : callStatus === "active"
                    ? "bg-[#E7F5F1] text-[#16947F]"
                    : "bg-[#F5F4F0] text-[#4B5160] hover:scale-105 hover:bg-[#ECE9E1] disabled:text-[#AAA697]"
              }`}
            >
              <Video className="size-[18px]" strokeWidth={1.9} />
            </button>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#8A8776]">
            <span
              className={`size-1.5 rounded-full ${connected ? "bg-[#16947F]" : "bg-[#AAA697]"
                }`}
            />
            {connected ? "Direct channel open" : "Waiting for peer"}
          </p>
        </div>
      </header>

      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overscroll-contain overflow-y-auto bg-[#FBFBFA] px-3.5 py-4"
        aria-live="polite"
      >
        {messages.length > 0 ? (
          messages.map((message) => (
            <article
              key={message.id}
              className={`mb-3 flex flex-col ${message.mine ? "items-end" : "items-start"
                }`}
            >
              <p
                className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${message.mine
                  ? "rounded-br-md bg-[#14171F] text-white"
                  : "rounded-bl-md border border-[#E4E1DA] bg-white text-[#14171F]"
                  }`}
              >
                {message.text}
              </p>
              <span className="ptx-mono mt-1 px-1 text-[9px] text-[#8A8776]">
                {message.mine ? "You" : "Peer"} ·{" "}
                {formatRelativeTime(message.ts, now)}
              </span>
            </article>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-2xl border border-[#E4E1DA] bg-white text-[#8A8776]">
              <MessageCircle className="size-5" strokeWidth={1.6} />
            </span>
            <p className="ptx-display text-sm font-semibold text-[#14171F]">
              No messages yet
            </p>
            <p className="mt-1 max-w-48 text-xs leading-relaxed text-[#8A8776]">
              Quick notes will appear here once the direct channel opens.
            </p>
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-[#E4E1DA] bg-white p-3"
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor={inputId}>
          Message
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          disabled={!connected}
          type="text"
          placeholder={connected ? "Write a message…" : "Connect to send a message"}
          className="min-w-0 flex-1 rounded-xl border border-[#E4E1DA] bg-white px-3 py-2 text-sm text-[#14171F] placeholder:text-[#8A8776] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-not-allowed disabled:bg-[#F5F4F0]"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          aria-label="Send message"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#14171F] text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
        >
          <Send className="size-4" strokeWidth={1.9} />
        </button>
      </form>
    </section>
  )
}

export default MessageComponent
