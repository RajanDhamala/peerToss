import { cn } from "@/lib/utils"

type PillState = "on" | "wait" | "off"

const DOT_STYLES: Record<PillState, string> = {
  on: "bg-emerald-500",
  wait: "bg-amber-500",
  off: "bg-muted-foreground/40",
}

function StatusPill({
  label,
  state,
  className,
}: {
  label: string
  state: PillState
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT_STYLES[state])} />
      <span className="truncate">{label}</span>
    </span>
  )
}

export { StatusPill, type PillState }
