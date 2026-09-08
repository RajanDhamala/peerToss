import { useState, type RefObject } from "react"
import { Popover } from "radix-ui"
import { Smile, X } from "lucide-react"

import {
  CHAT_EMOJI,
  CHAT_REACTIONS,
  reactionAsset,
  type ChatReaction,
} from "./chatReactions"

type PickerProps = {
  anchorRef: RefObject<HTMLDivElement | null>
  disabled: boolean
  onReturnFocus: () => void
} & (
  | { kind: "emoji"; onSelect: (emoji: string) => void }
  | { kind: "gif"; onSelect: (reaction: ChatReaction) => boolean }
)

export function ChatExtrasPicker(props: PickerProps) {
  const [open, setOpen] = useState(false)
  const title = props.kind === "emoji" ? "Choose an emoji" : "Send a GIF"

  return (
    <Popover.Root open={open && !props.disabled} onOpenChange={setOpen}>
      <Popover.Anchor virtualRef={props.anchorRef} />
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={props.disabled}
          aria-label={title}
          title={title}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] disabled:opacity-40"
        >
          {props.kind === "emoji" ? (
            <Smile className="size-[18px]" />
          ) : (
            <span className="rounded border border-current px-1 text-[10px] font-bold leading-4">
              GIF
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={title}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            props.onReturnFocus()
          }}
          className="z-50 max-h-[min(340px,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-xl outline-none"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="px-1 text-sm font-semibold">{title}</p>
            <Popover.Close
              aria-label="Close picker"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F]"
            >
              <X className="size-4" />
            </Popover.Close>
          </div>
          {props.kind === "emoji" ? (
            <div className="grid grid-cols-6 gap-1">
              {CHAT_EMOJI.map(([emoji, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    props.onSelect(emoji)
                  }}
                  className="flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {CHAT_REACTIONS.map((reaction) => (
                <button
                  key={reaction.id}
                  type="button"
                  aria-label={`Send ${reaction.label} GIF`}
                  onClick={() => {
                    if (props.onSelect(reaction)) setOpen(false)
                  }}
                  className="overflow-hidden rounded-xl border border-border text-left hover:border-[#7CB88F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F]"
                >
                  <img
                    src={reactionAsset(reaction)}
                    alt=""
                    width="384"
                    height="240"
                    className="h-auto w-full"
                  />
                  <span className="block px-2 py-1.5 text-xs">
                    {reaction.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
