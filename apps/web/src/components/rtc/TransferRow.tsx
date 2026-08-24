import { CheckCircle2, Download, Pause, XCircle } from "lucide-react"

import { FileTypeIcon, getFileTypeInfo } from "./FileTypeIcon"
import { formatBytes, formatTime, type ChatItem } from "./types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "a moment left"
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} sec left`
  return `${Math.ceil(seconds / 60)} min left`
}

function TransferRow({
  item,
  estimatedMbps,
}: {
  item: ChatItem
  estimatedMbps: number | null
}) {
  const transferredBytes = item.transferredBytes ?? 0
  const progress =
    item.transferStatus === "complete"
      ? 100
      : item.size
        ? Math.min(100, Math.round((transferredBytes / item.size) * 100))
        : 0
  const progressLabel =
    transferredBytes > 0 && progress === 0 ? "<1%" : progress + "%"
  const isActive =
    item.transferStatus === "sending" || item.transferStatus === "receiving"
  const remainingBytes = Math.max((item.size ?? 0) - transferredBytes, 0)
  const eta = estimatedMbps
    ? formatEta((remainingBytes * 8) / (estimatedMbps * 1_000_000))
    : null
  const fileType = getFileTypeInfo(item.name, item.mime)

  const statusLabel =
    item.transferStatus === "sending"
      ? "Sending to peer"
      : item.transferStatus === "receiving"
        ? "Receiving from peer"
        : item.transferStatus === "failed"
          ? "Transfer failed"
          : item.mine
            ? "Sent"
            : "Received"

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        {item.kind === "image" && item.url && item.transferStatus === "complete" ? (
          <img
            src={item.url}
            alt=""
            className="size-10 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
            <FileTypeIcon name={item.name} mime={item.mime} className="size-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{item.name ?? "Shared file"}</p>
            <Badge variant="secondary">{fileType.label}</Badge>
            {!isActive && item.transferStatus !== "failed" && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {statusLabel}
              </Badge>
            )}
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span>{isActive ? statusLabel : formatBytes(item.size ?? 0)}</span>
            {!isActive && (
              <>
                <span aria-hidden="true">·</span>
                <span>{item.mine ? "You" : "Peer"}</span>
                <span aria-hidden="true">·</span>
                <span>{formatTime(item.ts)}</span>
              </>
            )}
            {isActive && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  {estimatedMbps
                    ? `${(estimatedMbps / 8).toFixed(1)} MB/s · ${eta}`
                    : `${formatBytes(transferredBytes)} of ${formatBytes(item.size ?? 0)}`}
                </span>
              </>
            )}
          </div>

          {isActive && <Progress value={progress} className="mt-2" />}
        </div>

        {isActive ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium tabular-nums">{progressLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled
              aria-label="Pause transfer"
              title="Pause synchronization will be added later"
            >
              <Pause />
            </Button>
          </div>
        ) : item.transferStatus === "failed" ? (
          <XCircle className="size-5 shrink-0 text-destructive" />
        ) : item.url ? (
          <Button variant="outline" size="icon" asChild>
            <a href={item.url} download={item.name} title="Download file">
              <Download />
              <span className="sr-only">Download {item.name}</span>
            </a>
          </Button>
        ) : (
          <CheckCircle2 className="size-5 shrink-0 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  )
}

export { TransferRow }
