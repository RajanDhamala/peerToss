import { AlertTriangle } from "lucide-react"

import { formatBytes } from "@/components/rtc/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useLargeTransferConfirmationStore, {
  resolveLargeTransferConfirmation,
} from "@/global/rtc/largeTransferConfirmation"

export function LargeTransferConfirmDialog() {
  const request = useLargeTransferConfirmationStore((state) => state.request)

  const transferDescription = request
    ? request.kind === "file"
      ? `${request.name} is ${formatBytes(request.size)}.`
      : `This folder contains ${request.fileCount.toLocaleString()} files (${formatBytes(request.size)}).`
    : ""

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) resolveLargeTransferConfirmation(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Large transfer warning</DialogTitle>
          <DialogDescription>{transferDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium">This may use a lot of device memory.</p>
            <p className="leading-relaxed text-muted-foreground">
              The transfer is peer-to-peer, but both browsers still prepare or
              receive it in memory. Either device may slow down, freeze, or close
              the tab.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => resolveLargeTransferConfirmation(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => resolveLargeTransferConfirmation(true)}
          >
            Continue anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
