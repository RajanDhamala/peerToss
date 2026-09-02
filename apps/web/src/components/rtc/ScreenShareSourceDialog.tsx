import { useState } from "react"
import { AppWindow, Check, Monitor, PanelsTopLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ScreenShareSource = "browser" | "window" | "monitor"

const sourceOptions: Array<{
  value: ScreenShareSource
  title: string
  description: string
  icon: typeof PanelsTopLeft
}> = [
  {
    value: "browser",
    title: "Browser tab",
    description: "Share one browser tab without exposing the rest of your desktop.",
    icon: PanelsTopLeft,
  },
  {
    value: "window",
    title: "App window",
    description: "Share one application window while keeping other apps private.",
    icon: AppWindow,
  },
  {
    value: "monitor",
    title: "Entire screen",
    description: "Share everything visible on one of your displays.",
    icon: Monitor,
  },
]

export function ScreenShareSourceDialog({
  open,
  onOpenChange,
  onShare,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShare: (source: ScreenShareSource) => void
}) {
  const [selectedSource, setSelectedSource] =
    useState<ScreenShareSource>("browser")

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectedSource("browser")
    onOpenChange(nextOpen)
  }

  const handleShare = () => {
    const source = selectedSource
    setSelectedSource("browser")
    onShare(source)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-white/10 bg-[#111214] text-white shadow-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">What would you like to share?</DialogTitle>
          <DialogDescription className="text-white/55">
            Choose a source type. Your browser will still ask you to confirm the
            exact tab, window, or display.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Screen sharing source</legend>
          {sourceOptions.map((option) => {
            const selected = selectedSource === option.value
            const Icon = option.icon

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedSource(option.value)}
                className={`relative flex min-h-32 flex-col items-start rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-44 ${
                  selected
                    ? "border-emerald-400 bg-emerald-400/10"
                    : "border-white/10 bg-[#1B1D20] hover:border-white/25 hover:bg-[#222428]"
                }`}
                aria-pressed={selected}
              >
                <span
                  className={`grid size-11 place-items-center rounded-xl ${
                    selected
                      ? "bg-emerald-400 text-black"
                      : "bg-white/10 text-white/75"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                </span>

                <span className="mt-5 text-sm font-semibold">
                  {option.title}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-white/50">
                  {option.description}
                </span>

                <span
                  className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full border ${
                    selected
                      ? "border-emerald-400 bg-emerald-400 text-black"
                      : "border-white/20 text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  <Check className="size-3" strokeWidth={2.5} />
                </span>
              </button>
            )
          })}
        </fieldset>

        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/50">
          For your privacy, websites cannot bypass or style the browser&apos;s
          final sharing confirmation.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-400 text-black hover:bg-emerald-300"
            onClick={handleShare}
          >
            Start sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
