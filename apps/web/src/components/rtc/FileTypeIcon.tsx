/* eslint-disable react-refresh/only-export-components */
import type { LucideIcon } from "lucide-react"
import {
  Braces,
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo2,
  GitBranch,
  Package,
  Presentation,
  Terminal,
} from "lucide-react"

type FileTypeInfo = {
  Icon: LucideIcon
  label: string
}

const ARCHIVE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "gz",
  "rar",
  "tar",
  "tgz",
  "xz",
  "zip",
])
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sql",
  "svelte",
  "swift",
  "ts",
  "tsx",
  "vue",
])
const CONFIG_EXTENSIONS = new Set([
  "conf",
  "config",
  "env",
  "ini",
  "lock",
  "toml",
  "xml",
  "yaml",
  "yml",
])
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"])
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"])
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"])
const SHEET_EXTENSIONS = new Set(["csv", "ods", "xls", "xlsx"])
const SLIDE_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"])
const SHELL_EXTENSIONS = new Set(["bat", "bash", "cmd", "fish", "ps1", "sh", "zsh"])
const DATABASE_EXTENSIONS = new Set(["db", "sqlite", "sqlite3"])
const PACKAGE_EXTENSIONS = new Set(["apk", "deb", "dmg", "iso", "jar", "pkg", "rpm"])
const TEXT_EXTENSIONS = new Set(["log", "md", "mdx", "text", "txt"])

function extensionLabel(extension: string, fallback: string) {
  return extension ? extension.slice(0, 6).toUpperCase() : fallback
}

function getFileTypeInfo(name = "", mime = ""): FileTypeInfo {
  const fileName = name.split(/[\\/]/).at(-1)?.toLocaleLowerCase() ?? ""
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) ?? "" : ""

  if (
    fileName === ".gitignore" ||
    fileName === ".gitattributes" ||
    fileName === ".gitmodules" ||
    fileName.startsWith(".git")
  ) {
    return { Icon: GitBranch, label: "GIT" }
  }
  if (["dockerfile", "makefile", "justfile"].includes(fileName)) {
    return { Icon: Terminal, label: "CODE" }
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { Icon: FileArchive, label: extensionLabel(extension, "ZIP") }
  }
  if (SHELL_EXTENSIONS.has(extension)) {
    return { Icon: Terminal, label: extensionLabel(extension, "SHELL") }
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return { Icon: FileCode2, label: extensionLabel(extension, "CODE") }
  }
  if (extension === "json") {
    return { Icon: FileJson2, label: "JSON" }
  }
  if (CONFIG_EXTENSIONS.has(extension)) {
    return { Icon: Braces, label: extensionLabel(extension, "CONFIG") }
  }
  if (extension === "pdf") {
    return { Icon: FileType2, label: "PDF" }
  }
  if (SLIDE_EXTENSIONS.has(extension)) {
    return { Icon: Presentation, label: extensionLabel(extension, "PPT") }
  }
  if (SHEET_EXTENSIONS.has(extension)) {
    return { Icon: FileSpreadsheet, label: extensionLabel(extension, "XLS") }
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return { Icon: FileText, label: extensionLabel(extension, "DOC") }
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return { Icon: FileText, label: extensionLabel(extension, "TEXT") }
  }
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/")) {
    return { Icon: FileImage, label: extensionLabel(extension, "IMAGE") }
  }
  if (AUDIO_EXTENSIONS.has(extension) || mime.startsWith("audio/")) {
    return { Icon: FileAudio, label: extensionLabel(extension, "AUDIO") }
  }
  if (VIDEO_EXTENSIONS.has(extension) || mime.startsWith("video/")) {
    return { Icon: FileVideo2, label: extensionLabel(extension, "VIDEO") }
  }
  if (DATABASE_EXTENSIONS.has(extension)) {
    return { Icon: Database, label: extensionLabel(extension, "DB") }
  }
  if (PACKAGE_EXTENSIONS.has(extension)) {
    return { Icon: Package, label: extensionLabel(extension, "PKG") }
  }

  return { Icon: File, label: extensionLabel(extension, "FILE") }
}

function FileTypeIcon({
  name,
  mime,
  className,
}: {
  name?: string
  mime?: string
  className?: string
}) {
  const { Icon } = getFileTypeInfo(name, mime)
  return <Icon className={className} aria-hidden="true" />
}

export { FileTypeIcon, getFileTypeInfo }
