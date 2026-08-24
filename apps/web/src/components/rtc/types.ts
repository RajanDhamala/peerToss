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
