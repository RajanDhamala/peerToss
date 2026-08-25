import { useState, type ReactNode } from "react"
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Search,
  Upload,
} from "lucide-react"

import { FileTypeIcon } from "@/components/rtc/FileTypeIcon"
import { formatBytes, type ChatItem } from "@/components/rtc/types"

const SORT_LABELS = {
  recent: "Most recent",
  oldest: "Oldest first",
  largest: "Largest first",
  smallest: "Smallest first",
  name: "Name A–Z",
} as const

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

function Pill({
  tone = "ink",
  children,
}: {
  tone?: PillTone
  children: ReactNode
}) {
  const tones: Record<PillTone, string> = {
    ink: "bg-[#14171F] text-[#F5F4F0]",
    amber: "bg-[#FBEAD2] text-[#9A5E12]",
    teal: "bg-[#DFF3EE] text-[#0F6E5D]",
    coral: "bg-[#FBE3DF] text-[#B23B27]",
    line: "border border-[#E4E1DA] bg-white text-[#4B5160]",
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

function TrackDot({ progress, tone }: { progress: number; tone: PillTone }) {
  const toneColor =
    tone === "teal" ? "#16947F" : tone === "coral" ? "#E85C4A" : "#F2A33C"
  const safeProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#ECE9E1]">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${safeProgress}%`, backgroundColor: toneColor }}
      />
      <div
        className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-500 ease-out"
        style={{
          left: `calc(${safeProgress}% - 5px)`,
          backgroundColor: toneColor,
        }}
      />
    </div>
  )
}

function ManifestTransferRow({ item }: { item: ChatItem }) {
  const status = item.transferStatus ?? "complete"
  const meta = STATUS_META[status]
  const size = item.size ?? 0
  const transferredBytes =
    status === "complete" ? size : Math.min(item.transferredBytes ?? 0, size)
  const progress =
    status === "complete" ? 100 : size ? (transferredBytes / size) * 100 : 0
  const active = status === "sending" || status === "receiving"
  const statusLabel = status === "complete" && !item.mine ? "Received" : meta.label

  return (
    <article className="group flex items-center gap-3 rounded-xl border border-[#E4E1DA] bg-white px-3 py-3.5 transition-colors hover:border-[#D8D4C9] sm:gap-4 sm:px-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F5F4F0] text-[#4B5160]">
        <FileTypeIcon name={item.name} mime={item.mime} className="size-9" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-[#14171F]">
            {item.name ?? "Shared file"}
          </p>
          <span className="ptx-mono hidden shrink-0 text-[11px] text-[#8A8776] sm:inline">
            {formatAgo(item.ts)}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-16 flex-1">
            <TrackDot progress={progress} tone={meta.tone} />
          </div>
          <span className="ptx-mono hidden w-[108px] shrink-0 text-right text-[11px] text-[#8A8776] md:inline">
            {formatBytes(transferredBytes)} / {formatBytes(size)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Pill tone={meta.tone}>
          {active && <Loader2 className="size-3 animate-spin" />}
          {status === "complete" && <Check className="size-3" />}
          <span className="hidden sm:inline">{statusLabel}</span>
        </Pill>

        {status === "complete" && item.url && (
          <a
            href={item.url}
            download={item.name}
            className="flex size-8 items-center justify-center rounded-lg text-[#4B5160] transition-colors hover:bg-[#F5F4F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
            aria-label={`Download ${item.name ?? "file"}`}
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
  mobileAction,
}: {
  transfers: ChatItem[]
  activeCount: number
  mobileAction?: ReactNode
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortMode>("recent")
  const [sortOpen, setSortOpen] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleTransfers = [...transfers]
    .filter((item) =>
      (item.name ?? "").toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => {
      if (sort === "oldest") return a.ts - b.ts
      if (sort === "largest") return (b.size ?? 0) - (a.size ?? 0)
      if (sort === "smallest") return (a.size ?? 0) - (b.size ?? 0)
      if (sort === "name") return (a.name ?? "").localeCompare(b.name ?? "")
      return b.ts - a.ts
    })

  return (
    <section className="mt-8 rounded-2xl border border-[#E4E1DA] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="ptx-display text-sm font-semibold">Manifest</h2>
          <p className="text-xs text-[#8A8776]">
            Everything sent or received in this room.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mobileAction}
          <Pill tone="line">
            {activeCount > 0
              ? `${activeCount} in flight`
              : `${transfers.length} total`}
          </Pill>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A8776]" />
          <span className="sr-only">Search transfers</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by file name"
            className="w-full rounded-xl border border-[#E4E1DA] bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-[#8A8776] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
          />
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#E4E1DA] bg-white px-3.5 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] sm:w-44"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
          >
            {SORT_LABELS[sort]}
            <ChevronDown className="size-4 text-[#8A8776]" />
          </button>

          {sortOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1.5 w-full min-w-44 overflow-hidden rounded-xl border border-[#E4E1DA] bg-white py-1 shadow-lg"
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
                    className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-[#F5F4F0] ${
                      sort === key
                        ? "font-medium text-[#14171F]"
                        : "text-[#4B5160]"
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

      <div className="mt-4 max-h-105 space-y-2.5 overflow-y-auto pr-1">
        {visibleTransfers.length > 0 ? (
          visibleTransfers.map((transfer) => (
            <ManifestTransferRow key={transfer.id} item={transfer} />
          ))
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[#E4E1DA] px-5 text-center">
            {query ? (
              <Search className="mb-2 size-5 text-[#8A8776]" />
            ) : (
              <Upload className="mb-2 size-5 text-[#8A8776]" />
            )}
            <p className="text-sm font-medium">
              {query ? "No matching files" : "No transfers yet"}
            </p>
            <p className="mt-0.5 text-xs text-[#8A8776]">
              {query
                ? "Try a different search term."
                : "Your first sent or received file will appear here."}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export { ManifestPanel }
