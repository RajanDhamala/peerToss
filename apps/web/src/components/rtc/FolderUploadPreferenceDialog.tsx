/* eslint-disable react-refresh/only-export-components */
import { useCallback, useRef, useState } from "react"
import { Check, PackageOpen, PackageX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type FolderUploadPreference = "ignore" | "include"

const FOLDER_UPLOAD_PREFERENCE_KEY = "peertoss:folder-upload-preference"

function getRememberedPreference(): FolderUploadPreference | null {
  try {
    const preference = window.localStorage.getItem(FOLDER_UPLOAD_PREFERENCE_KEY)
    return preference === "ignore" || preference === "include"
      ? preference
      : null
  } catch {
    return null
  }
}

function savePreference(preference: FolderUploadPreference) {
  try {
    window.localStorage.setItem(FOLDER_UPLOAD_PREFERENCE_KEY, preference)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function FolderUploadPreferenceDialog({
  open,
  preference,
  remember,
  onOpenChange,
  onPreferenceChange,
  onRememberChange,
  onContinue,
}: {
  open: boolean
  preference: FolderUploadPreference
  remember: boolean
  onOpenChange: (open: boolean) => void
  onPreferenceChange: (preference: FolderUploadPreference) => void
  onRememberChange: (remember: boolean) => void
  onContinue: () => void
}) {
  const options: Array<{
    value: FolderUploadPreference
    title: string
    description: string
    icon: typeof PackageX
  }> = [
    {
      value: "ignore",
      title: "Ignore generated files",
      description:
        "Recommended. Skip dependencies, caches, VCS metadata, bytecode, and OS junk.",
      icon: PackageX,
    },
    {
      value: "include",
      title: "Include everything",
      description:
        "Package every readable file, including node_modules and cache directories.",
      icon: PackageOpen,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl font-sans sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose folder contents</DialogTitle>
          <DialogDescription>
            Decide whether generated and cache files should be added to this ZIP.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="sr-only">Folder upload preference</legend>
          {options.map((option) => {
            const selected = preference === option.value
            const Icon = option.icon

            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-violet-500 motion-reduce:transition-none ${
                  selected
                    ? "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40"
                    : "border-border bg-card hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="folder-upload-preference"
                  value={option.value}
                  checked={selected}
                  onChange={() => onPreferenceChange(option.value)}
                  className="sr-only"
                />
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-sm">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {option.title}
                    {option.value === "ignore" && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <span
                  className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full border ${
                    selected
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-input text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  <Check className="size-3" strokeWidth={2.5} />
                </span>
              </label>
            )
          })}
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => onRememberChange(event.target.checked)}
            className="size-4 accent-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          />
          Don&apos;t ask again on this device
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 rounded-xl shadow-none focus-visible:ring-violet-400" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-11 rounded-xl bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-400" onClick={onContinue}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useFolderUploadPreference() {
  const pendingActionRef = useRef<((ignoreGenerated: boolean) => void) | null>(
    null
  )
  const [open, setOpen] = useState(false)
  const [preference, setPreference] =
    useState<FolderUploadPreference>("ignore")
  const [remember, setRemember] = useState(false)

  const requestFolderUpload = useCallback(
    (action: (ignoreGenerated: boolean) => void) => {
      const rememberedPreference = getRememberedPreference()
      if (rememberedPreference) {
        action(rememberedPreference === "ignore")
        return
      }

      pendingActionRef.current = action
      setPreference("ignore")
      setRemember(false)
      setOpen(true)
    },
    []
  )

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) pendingActionRef.current = null
  }

  const handleContinue = () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (remember) savePreference(preference)
    setOpen(false)
    action?.(preference === "ignore")
  }

  return {
    requestFolderUpload,
    folderUploadPreferenceDialog: (
      <FolderUploadPreferenceDialog
        open={open}
        preference={preference}
        remember={remember}
        onOpenChange={handleOpenChange}
        onPreferenceChange={setPreference}
        onRememberChange={setRemember}
        onContinue={handleContinue}
      />
    ),
  }
}
