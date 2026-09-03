import { useState } from "react"
import {
  AppWindow,
  ArrowRight,
  Check,
  Monitor,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react"

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
    description: "A single tab",
    icon: PanelsTopLeft,
  },
  {
    value: "window",
    title: "App window",
    description: "One open application",
    icon: AppWindow,
  },
  {
    value: "monitor",
    title: "Entire screen",
    description: "Everything on one display",
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto border-white/10 bg-[#111214] p-0 text-white shadow-2xl sm:max-w-md">
        <div className="p-5 sm:p-6">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-lg font-semibold">
              Share your screen
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-white/55">
              Choose what you want the browser picker to show first.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <legend className="sr-only">Screen sharing source</legend>
            {sourceOptions.map((option) => {
              const selected = selectedSource === option.value
              const Icon = option.icon

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedSource(option.value)}
                  className={`flex w-full items-center gap-3 border-b border-white/10 px-3.5 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${
                    selected
                      ? "bg-white/[0.09]"
                      : "hover:bg-white/[0.06]"
                  }`}
                  aria-pressed={selected}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                      selected
                        ? "bg-emerald-400 text-[#111214]"
                        : "bg-white/[0.08] text-white/65"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" strokeWidth={1.9} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {option.description}
                    </span>
                  </span>

                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                      selected
                        ? "border-emerald-400 bg-emerald-400 text-[#111214]"
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

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-white/45">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-white/55" />
            You&apos;ll confirm the exact source in your browser next.
          </p>
        </div>

        <DialogFooter className="border-t border-white/10 bg-white/[0.02] p-4 sm:justify-end">
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
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
