import type { AsyncZippable } from "fflate"

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: "read" | "readwrite"
  }) => Promise<FileSystemDirectoryHandle>
}

export type FolderArchive = {
  file: File
  folderName: string
  fileCount: number
  ignoredCount: number
}

export type FolderSourceFile = {
  file: File
  relativePath: string
}

export type DroppedTransfer =
  | { kind: "file"; file: File }
  | { kind: "folder"; files: FolderSourceFile[]; ignoredCount: number }

const IGNORED_DIRECTORY_NAMES = new Set([
  ".cache",
  ".git",
  ".hg",
  ".next",
  ".nuxt",
  ".pnpm-store",
  ".svn",
  ".turbo",
  ".venv",
  ".vite",
  "__pycache__",
  "coverage",
  "node_modules",
  "venv",
])

const IGNORED_FILE_NAMES = new Set([".ds_store", "desktop.ini", "thumbs.db"])

function normalizedArchivePath(path: string) {
  const segments = path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== ".")

  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    throw new Error("The selected folder contains an invalid path")
  }

  return segments.join("/")
}

function shouldIgnorePath(path: string) {
  const segments = path
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
  const fileName = segments.at(-1) ?? ""

  return (
    segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment)) ||
    IGNORED_FILE_NAMES.has(fileName) ||
    fileName.endsWith(".pyc") ||
    fileName.endsWith(".pyo")
  )
}

function safeFileSystemSegment(segment: string) {
  const safe = Array.from(segment.replace(/[<>:"/\\|?*]/g, "_"), (character) =>
    character.charCodeAt(0) < 32 ? "_" : character
  )
    .join("")
    .trim()
  return safe && safe !== "." && safe !== ".." ? safe : "untitled"
}

function ownedArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function zipAsync(entries: AsyncZippable) {
  const { zip } = await import("fflate")

  return new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

async function unzipAsync(data: Uint8Array) {
  const { unzip } = await import("fflate")

  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, (error, files) => {
      if (error) reject(error)
      else resolve(files)
    })
  })
}

function readFileEntry(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject))
}

function readDirectoryEntries(entry: FileSystemDirectoryEntry) {
  const reader = entry.createReader()

  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const entries: FileSystemEntry[] = []

    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries)
          return
        }
        entries.push(...batch)
        readBatch()
      }, reject)
    }

    readBatch()
  })
}

async function collectFolderFiles(
  entry: FileSystemEntry,
  relativePath: string,
  ignoreGenerated: boolean
): Promise<{ files: FolderSourceFile[]; ignoredCount: number }> {
  if (ignoreGenerated && shouldIgnorePath(relativePath)) {
    return { files: [], ignoredCount: 1 }
  }

  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry)
    return { files: [{ file, relativePath }], ignoredCount: 0 }
  }

  if (!entry.isDirectory) return { files: [], ignoredCount: 0 }

  const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
  const nestedFiles = await Promise.all(
    children.map((child) =>
      collectFolderFiles(child, `${relativePath}/${child.name}`, ignoreGenerated)
    )
  )
  return {
    files: nestedFiles.flatMap((result) => result.files),
    ignoredCount: nestedFiles.reduce(
      (total, result) => total + result.ignoredCount,
      0
    ),
  }
}

export function getDroppedFileSystemEntry(dataTransfer: DataTransfer) {
  const fileItems = Array.from(dataTransfer.items).filter(
    (item) => item.kind === "file"
  )

  if (fileItems.length > 1) {
    throw new Error("Drop one file or one folder at a time")
  }

  return fileItems[0]?.webkitGetAsEntry() ?? null
}

export async function readDroppedDirectory(
  entry: FileSystemDirectoryEntry,
  ignoreGenerated: boolean
) {
  const result = await collectFolderFiles(entry, entry.name, ignoreGenerated)
  if (result.files.length === 0) {
    throw new Error("The dropped folder does not contain any shareable files")
  }
  return result
}

export async function readDroppedTransfer(
  dataTransfer: DataTransfer,
  ignoreGenerated = true
): Promise<DroppedTransfer> {
  const entry = getDroppedFileSystemEntry(dataTransfer)
  if (entry?.isDirectory) {
    const result = await readDroppedDirectory(
      entry as FileSystemDirectoryEntry,
      ignoreGenerated
    )
    return { kind: "folder", ...result }
  }

  if (entry?.isFile) {
    return { kind: "file", file: await readFileEntry(entry as FileSystemFileEntry) }
  }

  const fallbackFiles = Array.from(dataTransfer.files)
  if (fallbackFiles.length !== 1) {
    throw new Error(
      fallbackFiles.length > 1
        ? "Drop one file or one folder at a time"
        : "This browser could not read the dropped item. Use Browse folder instead."
    )
  }
  return { kind: "file", file: fallbackFiles[0] }
}

export async function createFolderArchive(
  files: Array<File | FolderSourceFile>,
  { ignoreGenerated = true }: { ignoreGenerated?: boolean } = {}
): Promise<FolderArchive> {
  if (files.length === 0) throw new Error("Choose a folder with at least one file")

  const sources = files.map((source) =>
    source instanceof File
      ? {
          file: source,
          relativePath: source.webkitRelativePath || source.name,
        }
      : source
  )
  const firstPath = sources[0].relativePath
  const folderName = safeFileSystemSegment(firstPath.split("/")[0] || "folder")
  const includedSources = ignoreGenerated
    ? sources.filter(({ relativePath }) => !shouldIgnorePath(relativePath))
    : sources
  const ignoredCount = sources.length - includedSources.length
  if (includedSources.length === 0) {
    throw new Error("The folder does not contain any shareable files")
  }
  const entries: AsyncZippable = {}

  await Promise.all(
    includedSources.map(async ({ file, relativePath }) => {
      const archivePath = normalizedArchivePath(
        relativePath.includes("/") ? relativePath : `${folderName}/${relativePath}`
      )
      entries[archivePath] = new Uint8Array(await file.arrayBuffer())
    })
  )

  const zipped = await zipAsync(entries)
  const archive = new File([ownedArrayBuffer(zipped)], `${folderName}.zip`, {
    type: "application/zip",
    lastModified: Date.now(),
  })

  return {
    file: archive,
    folderName,
    fileCount: includedSources.length,
    ignoredCount,
  }
}

export function canExtractFolderArchive() {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
}

export async function extractFolderArchive(url: string) {
  const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!showDirectoryPicker) {
    throw new Error(
      "This browser cannot extract folders directly. Download the ZIP instead."
    )
  }

  // Ask for the destination while the click still counts as a user gesture.
  const destination = await showDirectoryPicker({
    id: "peertoss-folder-extraction",
    mode: "readwrite",
  })
  const response = await fetch(url)
  if (!response.ok) throw new Error("Could not read the received folder archive")

  const files = await unzipAsync(new Uint8Array(await response.arrayBuffer()))
  let extractedFiles = 0

  for (const [archivePath, contents] of Object.entries(files)) {
    if (archivePath.endsWith("/")) continue

    const normalizedPath = normalizedArchivePath(archivePath)
    const pathSegments = normalizedPath.split("/").map(safeFileSystemSegment)
    const fileName = pathSegments.pop()
    if (!fileName) continue

    let directory = destination
    for (const segment of pathSegments) {
      directory = await directory.getDirectoryHandle(segment, { create: true })
    }

    const fileHandle = await directory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(ownedArrayBuffer(contents))
    } finally {
      await writable.close()
    }
    extractedFiles += 1
  }

  return extractedFiles
}
