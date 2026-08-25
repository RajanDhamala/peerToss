import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { RefreshCw, Send, UploadCloud } from "lucide-react"
import { toast } from "react-hot-toast"

import { FileTypeIcon, getFileTypeInfo } from "@/components/rtc/FileTypeIcon"
import { formatBytes } from "@/components/rtc/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ShareMode = "file" | "image"

function FileShareDialog({
  open,
  mode,
  file,
  onOpenChange,
  onFileChange,
  onSend,
}: {
  open: boolean
  mode: ShareMode
  file: File | null
  onOpenChange: (open: boolean) => void
  onFileChange: (file: File | null) => void
  onSend: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const previewUrl = useMemo(
    () => file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    [file]
  )

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return
    if (mode === "image" && !nextFile.type.startsWith("image/")) {
      toast.error("Choose an image file")
      return
    }
    onFileChange(nextFile)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  const title = mode === "image" ? "Share a photo" : "Send a file"
  const fileType = getFileTypeInfo(file?.name, file?.type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose one file to send directly to the connected device.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={mode === "image" ? "image/*" : undefined}
          className="sr-only"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {file ? (
          <div className="overflow-hidden rounded-lg border">
            {previewUrl ? (
              <div className="flex h-52 items-center justify-center bg-muted p-3">
                <img
                  src={previewUrl}
                  alt="Selected file preview"
                  className="max-h-full max-w-full rounded-md object-contain"
                />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center bg-muted">
                <FileTypeIcon name={file.name} mime={file.type} className="size-10" />
              </div>
            )}

            <div className="flex items-center gap-3 border-t p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileTypeIcon name={file.name} mime={file.type} className="size-8" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <Badge variant="secondary">{fileType.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {file.type ? " · " + file.type : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <RefreshCw />
                Replace
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={
              "flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-6 text-center transition-colors " +
              (dragging ? "border-primary bg-primary/5" : "")
            }
          >
            <UploadCloud className="mb-4 size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drag and drop {mode === "image" ? "an image" : "a file"} here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or browse files on this device
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => inputRef.current?.click()}
            >
              Select {mode === "image" ? "image" : "file"}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!file}
            onClick={() => {
              if (file) onSend(file)
            }}
          >
            <Send />
            Send file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { FileShareDialog }
