import { create } from "zustand"

export type LargeTransferConfirmation =
  | {
      kind: "file"
      name: string
      size: number
    }
  | {
      kind: "folder"
      fileCount: number
      size: number
    }

type LargeTransferConfirmationState = {
  request: LargeTransferConfirmation | null
}

const useLargeTransferConfirmationStore =
  create<LargeTransferConfirmationState>(() => ({ request: null }))

let activeResolver: ((confirmed: boolean) => void) | null = null

export function requestLargeTransferConfirmation(
  request: LargeTransferConfirmation
) {
  if (activeResolver) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    activeResolver = resolve
    useLargeTransferConfirmationStore.setState({ request })
  })
}

export function resolveLargeTransferConfirmation(confirmed: boolean) {
  const resolve = activeResolver
  activeResolver = null
  useLargeTransferConfirmationStore.setState({ request: null })
  resolve?.(confirmed)
}

export function cancelLargeTransferConfirmation() {
  resolveLargeTransferConfirmation(false)
}

export default useLargeTransferConfirmationStore
