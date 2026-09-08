import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  Check,
  ChevronDown,
  Download,
  FolderArchive,
  FolderOpen,
  Loader2,
  Search,
  Upload,
} from "lucide-react"
import { toast } from "react-hot-toast"

import { FileTypeIcon } from "@/components/rtc/FileTypeIcon"
import { formatBytes, type ChatItem } from "@/components/rtc/types"
import {
  canExtractFolderArchive,
  extractFolderArchive,
} from "@/Utils/folderArchive"

const SORT_LABELS = {
  recent: "Most recent",
  oldest: "Oldest first",
  largest: "Largest first",
  smallest: "Smallest first",
  name: "Name A–Z",
} as const

const SHOW_TRANSFER_PROGRESS = false

type SortMode = keyof typeof SORT_LABELS
type PillTone = "ink" | "amber" | "teal" | "coral" | "line"
type TransferStatus = NonNullable<ChatItem["transferStatus"]>

const STATUS_META: Record<
  TransferStatus,
  { label: string; tone: Exclude<PillTone, "ink" | "line"> }
> = {
  sending: { label: "Sending", tone: "amber" },
  receiving: { label: "Receiving", tone: "amber" },
  complete: { label: "Delivered", tone: "teal" },
  failed: { label: "Failed", tone: "coral" },
}

function formatAgo(timestamp: number) {
  const seconds = Math.floor(Math.max(0, Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

function formatTimeLeft(secondsLeft: number | null) {
  if (secondsLeft === null || !Number.isFinite(secondsLeft)) {
    return "Estimating…"
  }
  if (secondsLeft < 60) return `${Math.max(1, secondsLeft)}s left`
  if (secondsLeft < 3600) return `${Math.ceil(secondsLeft / 60)}m left`

  return `${Math.ceil(secondsLeft / 3600)}h left`
}

function Pill({
  tone = "ink",
  children,
}: {
  tone?: PillTone
  children: ReactNode
}) {
  const tones: Record<PillTone, string> = {
    ink: "bg-primary text-primary-foreground",
    amber: "bg-[#EEF6F0] text-[#365A40] dark:bg-[#283B2F] dark:text-[#B5D2BD]",
    teal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    coral: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    line: "border border-border bg-card text-muted-foreground",
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

function TrackDot({ progress, tone }: { progress: number; tone: PillTone }) {
  const toneColor =
    tone === "teal" ? "#10b981" : tone === "coral" ? "#ef4444" : "#7CB88F"
  const safeProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${safeProgress}%`, backgroundColor: toneColor }}
      />
      <div
        className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-card transition-[left] duration-500 ease-out motion-reduce:transition-none"
        style={{
          left: `calc(${safeProgress}% - 5px)`,
          backgroundColor: toneColor,
        }}
      />
    </div>
  )
}

function ExtractFolderButton({ item }: { item: ChatItem }) {
  const [extracting, setExtracting] = useState(false)

  if (item.mine || !item.folderArchive || !item.url) return null

  return (
    <button
      type="button"
      disabled={extracting}
      onClick={() => {
        if (!item.url) return
        if (!canExtractFolderArchive()) {
          toast.error(
            "This browser cannot extract folders directly. Download the ZIP instead."
          )
          return
        }

        setExtracting(true)
        void extractFolderArchive(item.url)
          .then((count) => toast.success(`Extracted ${count} files`))
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not extract the folder"
            )
          })
          .finally(() => setExtracting(false))
      }}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] disabled:opacity-50"
      aria-label={`Extract ${item.name ?? "folder"}`}
      title="Extract folder"
    >
      {extracting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FolderOpen className="size-4" strokeWidth={1.75} />
      )}
    </button>
  )
}

function ManifestTransferRow({ item }: { item: ChatItem }) {
  const status = item.transferStatus ?? "complete"
  const meta = STATUS_META[status]
  const size = item.size ?? 0
  const liveTransferredBytes =
    status === "complete" ? size : Math.min(item.transferredBytes ?? 0, size)
  const liveProgress =
    status === "complete" ? 100 : size ? (liveTransferredBytes / size) * 100 : 0
  const active = status === "sending" || status === "receiving"
  const statusLabel = status === "complete" && !item.mine ? "Received" : meta.label
  const latestTransferredBytesRef = useRef(liveTransferredBytes)
  const speedSampleRef = useRef<{
    transferredBytes: number
    sampledAt: number
    smoothedBytesPerSecond: number | null
  } | null>(null)
  const [displayedStats, setDisplayedStats] = useState(() => ({
    transferredBytes: liveTransferredBytes,
    progressPercent: Math.round(liveProgress),
    timeLeft: "Estimating…",
  }))

  useEffect(() => {
    latestTransferredBytesRef.current = liveTransferredBytes
  }, [liveTransferredBytes])

  useEffect(() => {
    if (!active) {
      speedSampleRef.current = null
      return
    }

    speedSampleRef.current = {
      transferredBytes: latestTransferredBytesRef.current,
      sampledAt: Date.now(),
      smoothedBytesPerSecond: null,
    }

    const timer = window.setInterval(() => {
      const sampledAt = Date.now()
      const transferredBytes = latestTransferredBytesRef.current
      const previousSample = speedSampleRef.current
      let smoothedBytesPerSecond = previousSample?.smoothedBytesPerSecond ?? null

      if (previousSample) {
        const elapsedSeconds = (sampledAt - previousSample.sampledAt) / 1000
        const transferredSinceLastSample = Math.max(
          0,
          transferredBytes - previousSample.transferredBytes
        )

        if (elapsedSeconds > 0) {
          const currentBytesPerSecond =
            transferredSinceLastSample / elapsedSeconds
          smoothedBytesPerSecond =
            smoothedBytesPerSecond === null
              ? currentBytesPerSecond || null
              : smoothedBytesPerSecond * 0.75 + currentBytesPerSecond * 0.25
        }
      }

      const remainingBytes = Math.max(0, size - transferredBytes)
      const secondsLeft =
        smoothedBytesPerSecond && smoothedBytesPerSecond > 0
          ? Math.ceil(remainingBytes / smoothedBytesPerSecond)
          : null

      speedSampleRef.current = {
        transferredBytes,
        sampledAt,
        smoothedBytesPerSecond,
      }
      setDisplayedStats({
        transferredBytes,
        progressPercent: size
          ? Math.round((transferredBytes / size) * 100)
          : 0,
        timeLeft: formatTimeLeft(secondsLeft),
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [active, item.id, size])

  const transferredBytes = active
    ? displayedStats.transferredBytes
    : liveTransferredBytes
  const progressPercent = active
    ? displayedStats.progressPercent
    : Math.round(liveProgress)
  const progress = active ? progressPercent : liveProgress
  const sizeLabel =
    status === "complete"
      ? formatBytes(size)
      : `${formatBytes(transferredBytes)} / ${formatBytes(size)}`
  const timeLeft = active ? displayedStats.timeLeft : null

  return (
    <article className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-3.5 transition-colors hover:bg-muted/20 motion-reduce:transition-none sm:gap-4 sm:px-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
        {item.folderArchive ? (
          <FolderArchive className="size-5" strokeWidth={1.75} />
        ) : (
          <FileTypeIcon name={item.name} mime={item.mime} className="size-9" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="w-full min-w-0 truncate text-sm font-medium text-foreground sm:w-auto">
            {item.name ?? "Shared file"}
          </p>
          <Pill tone={meta.tone}>
            {active && <Loader2 className="size-3 animate-spin" />}
            {status === "complete" && <Check className="size-3" />}
            <span>{statusLabel}</span>
          </Pill>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 text-[11px] tabular-nums text-muted-foreground">
            {sizeLabel}
            {item.folderArchive && item.fileCount
              ? ` · ${item.fileCount} files`
              : ""}
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
            {status === "complete" ? formatAgo(item.ts) : timeLeft}
          </span>
          {timeLeft && (
            <div className="flex">
              <span className="font-mono tabular-nums shrink-0 text-[11px] text-muted-foreground md:flex">
                {progressPercent}%
              </span>
            </div>
          )}
          {SHOW_TRANSFER_PROGRESS && (
            <div className="min-w-16 flex-1">
              <TrackDot progress={progress} tone={meta.tone} />
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {status === "complete" && <ExtractFolderButton item={item} />}
        {status === "complete" && item.url && (
          <a
            href={item.url}
            download={item.name}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F]"
            aria-label={`Download ${item.name ?? "file"}`}
            title={item.folderArchive ? "Download ZIP" : "Download file"}
          >
            <Download className="size-4" strokeWidth={1.75} />
          </a>
        )}
      </div>
    </article>
  )
}

function ManifestPanel({
  transfers,
  activeCount,
}: {
  transfers: ChatItem[]
  activeCount: number
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortMode>("recent")
  const [sortOpen, setSortOpen] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleTransfers = [...transfers]
    .filter((item) => (item.name ?? "").toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      if (sort === "oldest") return a.ts - b.ts
      if (sort === "largest") return (b.size ?? 0) - (a.size ?? 0)
      if (sort === "smallest") return (a.size ?? 0) - (b.size ?? 0)
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "")
      return b.ts - a.ts
    })

  return (
    <section className="mt-5 rounded-2xl border border-[#dedfe3] bg-card p-5 text-card-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6 dark:border-border">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Shared files
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Everything sent or received in this room.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="line">
            {activeCount > 0
              ? `${activeCount} active`
              : `${transfers.length} total`}
          </Pill>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search transfers</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by file name"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] md:text-sm"
          />
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] sm:w-40"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
          >
            {SORT_LABELS[sort]}
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>

          {sortOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1.5 w-full min-w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
            >
              {(Object.entries(SORT_LABELS) as [SortMode, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSort(key)
                      setSortOpen(false)
                    }}
                    className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-muted/50 ${
                      sort === key
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                    {sort === key && <Check className="size-3.5" />}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 max-h-105 space-y-2.5 overscroll-contain overflow-y-auto pr-1">
        {visibleTransfers.length > 0 ? (
          visibleTransfers.map((transfer) => (
            <ManifestTransferRow key={transfer.id} item={transfer} />
          ))
        ) : (
          <div className="flex min-h-24 items-center justify-center gap-3 rounded-xl bg-muted/30 px-4 py-4 text-left">
            {query ? (
              <Search className="size-5 shrink-0 text-muted-foreground" />
            ) : (
              <Upload
                className="size-5 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
            )}
            <div>
              <p className="text-sm font-medium">
                {query ? "No matching files" : "No transfers yet"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {query
                  ? "Try a different search term."
                  : "Your first sent or received file will appear here."}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export { ManifestPanel }
