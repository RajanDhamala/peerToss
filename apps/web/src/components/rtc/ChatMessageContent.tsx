import { useState } from "react"
import { Pause, Play } from "lucide-react"

import {
  decodeChatReaction,
  reactionAsset,
  type ChatReaction,
} from "./chatReactions"

function LinkedText({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => {
    if (index % 2 === 0) return part

    let href = part.replace(/[.,!?;:]+$/, "")
    // Keep balanced brackets in URLs, but leave surrounding punctuation as text.
    for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (
        href.endsWith(closing) &&
        href.split(closing).length > href.split(opening).length
      ) {
        href = href.slice(0, -1).replace(/[.,!?;:]+$/, "")
      }
    }

    try {
      const url = new URL(href)
      if (url.protocol !== "http:" && url.protocol !== "https:") return part
    } catch {
      return part
    }

    return (
      <span key={index}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium text-blue-700 underline decoration-blue-700/50 underline-offset-2 hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:decoration-blue-400/50 dark:hover:text-blue-300"
        >
          {href}
        </a>
        {part.slice(href.length)}
      </span>
    )
  })
}

function GifReaction({ reaction }: { reaction: ChatReaction }) {
  const [playing, setPlaying] = useState(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  return (
    <button
      type="button"
      onClick={() => setPlaying((value) => !value)}
      aria-label={`${playing ? "Pause" : "Play"} ${reaction.label} GIF`}
      className="group relative block w-56 max-w-full overflow-hidden rounded-xl text-[#20382C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F]"
    >
      <img
        src={reactionAsset(reaction, playing)}
        alt={`${reaction.label} reaction`}
        width="384"
        height="240"
        className="h-auto w-full"
      />
      <span
        className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-white/90 shadow-sm"
        aria-hidden="true"
      >
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
      </span>
    </button>
  )
}

export function ChatMessageContent({ text = "" }: { text?: string }) {
  const decoded = decodeChatReaction(text)
  if (!decoded) return <LinkedText text={text} />

  return (
    <div className="space-y-2">
      <GifReaction reaction={decoded.reaction} />
      {decoded.caption && (
        <p className="whitespace-pre-wrap break-words">
          <LinkedText text={decoded.caption} />
        </p>
      )}
    </div>
  )
}
