/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, SVGProps } from "react"

import {
  CssSvg,
  CsvSvg,
  DocSvg,
  GenericFileSvg,
  GoSvg,
  HtmlSvg,
  IsoSvg,
  JavaScriptSvg,
  JpgSvg,
  Mp3Svg,
  PdfSvg,
  PngSvg,
  PptSvg,
  PythonSvg,
  TextSvg,
  TypeScriptSvg,
  XmlSvg,
  ZipSvg,
} from "@/Utils/Svgs"

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>

type FileTypeInfo = {
  Icon?: SvgIcon
  label: string
}

const EXTENSION_ICONS: Record<string, SvgIcon> = {
  css: CssSvg,
  csv: CsvSvg,
  doc: DocSvg,
  docx: DocSvg,
  go: GoSvg,
  htm: HtmlSvg,
  html: HtmlSvg,
  iso: IsoSvg,
  js: JavaScriptSvg,
  jsx: JavaScriptSvg,
  jpeg: JpgSvg,
  jpg: JpgSvg,
  mp3: Mp3Svg,
  pdf: PdfSvg,
  png: PngSvg,
  ppt: PptSvg,
  pptx: PptSvg,
  py: PythonSvg,
  text: TextSvg,
  ts: TypeScriptSvg,
  tsx: TypeScriptSvg,
  txt: TextSvg,
  xml: XmlSvg,
  zip: ZipSvg,
}

const MIME_ICONS: Record<string, { Icon: SvgIcon; label: string }> = {
  "application/javascript": { Icon: JavaScriptSvg, label: "JS" },
  "application/msword": { Icon: DocSvg, label: "DOC" },
  "application/pdf": { Icon: PdfSvg, label: "PDF" },
  "application/typescript": { Icon: TypeScriptSvg, label: "TS" },
  "application/vnd.ms-powerpoint": { Icon: PptSvg, label: "PPT" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    Icon: PptSvg,
    label: "PPTX",
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    Icon: DocSvg,
    label: "DOCX",
  },
  "application/x-zip-compressed": { Icon: ZipSvg, label: "ZIP" },
  "application/zip": { Icon: ZipSvg, label: "ZIP" },
  "audio/mpeg": { Icon: Mp3Svg, label: "MP3" },
  "image/jpeg": { Icon: JpgSvg, label: "JPG" },
  "image/png": { Icon: PngSvg, label: "PNG" },
  "text/css": { Icon: CssSvg, label: "CSS" },
  "text/csv": { Icon: CsvSvg, label: "CSV" },
  "text/html": { Icon: HtmlSvg, label: "HTML" },
  "text/javascript": { Icon: JavaScriptSvg, label: "JS" },
  "text/plain": { Icon: TextSvg, label: "TXT" },
  "text/typescript": { Icon: TypeScriptSvg, label: "TS" },
  "text/xml": { Icon: XmlSvg, label: "XML" },
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
  const normalizedMime = mime.toLocaleLowerCase().split(";")[0].trim()

  if (
    fileName === ".gitignore" ||
    fileName === ".gitattributes" ||
    fileName === ".gitmodules" ||
    fileName.startsWith(".git")
  ) {
    return { label: "GIT" }
  }
  if (["dockerfile", "makefile", "justfile"].includes(fileName)) {
    return { label: fileName.slice(0, 6).toUpperCase() }
  }

  const extensionIcon = EXTENSION_ICONS[extension]
  if (extensionIcon) {
    return { Icon: extensionIcon, label: extensionLabel(extension, "FILE") }
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "ZIP") }
  }
  if (SHELL_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "SHELL") }
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "CODE") }
  }
  if (extension === "json") {
    return { label: "JSON" }
  }
  if (CONFIG_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "CONFIG") }
  }
  if (SLIDE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "PPT") }
  }
  if (SHEET_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "XLS") }
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "DOC") }
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "TEXT") }
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "IMAGE") }
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "AUDIO") }
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "VIDEO") }
  }
  if (DATABASE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "DB") }
  }
  if (PACKAGE_EXTENSIONS.has(extension)) {
    return { label: extensionLabel(extension, "PKG") }
  }

  const mimeIcon = MIME_ICONS[normalizedMime]
  if (mimeIcon) {
    return mimeIcon
  }
  if (normalizedMime.startsWith("image/")) {
    return { label: extensionLabel(extension, "IMAGE") }
  }
  if (normalizedMime.startsWith("audio/")) {
    return { label: extensionLabel(extension, "AUDIO") }
  }
  if (normalizedMime.startsWith("video/")) {
    return { label: extensionLabel(extension, "VIDEO") }
  }

  return { label: extensionLabel(extension, "FILE") }
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
  const { Icon, label } = getFileTypeInfo(name, mime)

  if (!Icon) {
    return (
      <GenericFileSvg
        fileType={label}
        className={className}
        aria-hidden="true"
      />
    )
  }

  return <Icon className={className} aria-hidden="true" />
}

export { FileTypeIcon, getFileTypeInfo }
