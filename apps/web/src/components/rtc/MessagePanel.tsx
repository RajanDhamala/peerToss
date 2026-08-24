import { useEffect, useRef } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ExternalLink, MessageSquare, Send, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatTime, type ChatItem } from "./types"

function asShareableUrl(value?: string) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function MessagePanel({
  open,
  onOpenChange,
  messages,
  draft,
  onDraftChange,
  onSend,
  connected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatItem[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  connected: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, open])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-6 data-[state=open]:slide-in-from-right-6 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px] sm:rounded-none sm:border-y-0 sm:border-r-0">
          <header className="flex items-center gap-3 border-b px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <MessageSquare className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold">
                Messages
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3" />
                Shared over the direct connection
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close messages">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            {messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((message) => {
                  const link = asShareableUrl(message.text?.trim())

                  return (
                    <article
                      key={message.id}
                      className={cn(
                        "flex flex-col",
                        message.mine ? "items-end" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs",
                          message.mine
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border bg-card"
                        )}
                      >
                        {link ? (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-w-0 items-center gap-2 underline-offset-4 hover:underline"
                          >
                            <span className="min-w-0 truncate">{link.href}</span>
                            <ExternalLink className="size-3.5 shrink-0" />
                          </a>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{message.text}</p>
                        )}
                      </div>
                      <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                        {message.mine ? "You" : "Peer"} · {formatTime(message.ts)}
                      </span>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="mb-4 flex size-12 items-center justify-center rounded-2xl border bg-card shadow-xs">
                  <MessageSquare className="size-5 text-muted-foreground" />
                </span>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Use messages for quick notes while files stay in the transfer workspace.
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <footer className="border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5">
              <Input
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    onSend()
                  }
                }}
                disabled={!connected}
                placeholder={connected ? "Type a message…" : "Connect to a peer first"}
                aria-label="Message"
                className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                onClick={onSend}
                disabled={!connected || !draft.trim()}
                size="icon"
                aria-label="Send message"
                className="size-9 rounded-lg"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { MessagePanel }
