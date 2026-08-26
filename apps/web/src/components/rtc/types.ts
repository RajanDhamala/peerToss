export type ChatItem = {
  id: string
  kind: "text" | "image" | "file"
  mine: boolean
  ts: number
  text?: string
  url?: string
  name?: string
  size?: number
  mime?: string
  transferredBytes?: number
  transferStatus?: "sending" | "receiving" | "complete" | "failed"
}

export type SpeedDirection = "download" | "upload"

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ""
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const seconds = Math.floor(Math.max(0, now - ts) / 1000)
  if (seconds < 5) return "just now"
  if (seconds < 15) return "a few sec ago"
  if (seconds < 60) return `${seconds} sec ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
