import { useEffect, useRef } from "react"

import { DocSvg, FolderSvg, JpgSvg, Mp3Svg, PdfSvg, PngSvg, TextSvg, ZipSvg } from "@/Utils/Svgs"

const FILE_ICONS = [PdfSvg, PngSvg, FolderSvg, ZipSvg, DocSvg, JpgSvg, Mp3Svg, TextSvg]
const ICON_SIZES = [26, 32, 34, 28, 24, 22, 28, 24]
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)
const randomTiming = () => randomBetween(4000, 6000)

export function RoomBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const backdrop = backdropRef.current
    if (!backdrop) return

    const media = window.matchMedia(
      "(min-width: 1440px) and (prefers-reduced-motion: no-preference)"
    )
    let stop = () => {}

    const syncAnimations = () => {
      stop()
      stop = () => {}
      if (!media.matches || document.hidden) return

      const cleanups = Array.from(backdrop.querySelectorAll<HTMLElement>("[data-floating-file]")).map((element) => {
        let timer: number | undefined
        let animation: Animation | undefined

        const appear = () => {
          // The content is capped at 1360px, with 48px of padding on each side.
          const gutter = Math.max(0, (backdrop.clientWidth - 1360) / 2) + 48
          const offset = randomBetween(12, Math.max(12, gutter - element.offsetWidth - 12))
          const onLeft = Math.random() < 0.5
          element.style.left = onLeft ? `${offset}px` : "auto"
          element.style.right = onLeft ? "auto" : `${offset}px`
          element.style.top = `${randomBetween(24, Math.max(24, backdrop.clientHeight - element.offsetHeight - 24))}px`

          const tilt = randomBetween(-22, 22)
          const driftX = randomBetween(-6, 6)
          const driftY = randomBetween(-12, 12)
          animation = element.animate(
            [
              { opacity: 0, transform: `translate3d(0, 0, 0) rotate(${tilt}deg) scale(0.9)` },
              { opacity: 0.85, offset: 0.2 },
              { opacity: 0.85, offset: 0.7 },
              { opacity: 0, transform: `translate3d(${driftX}px, ${driftY}px, 0) rotate(${tilt + randomBetween(-5, 5)}deg) scale(1)` },
            ],
            { duration: randomTiming(), easing: "ease-in-out" }
          )
          animation.onfinish = () => {
            animation = undefined
            timer = window.setTimeout(appear, randomTiming())
          }
        }

        timer = window.setTimeout(appear, randomTiming())
        return () => {
          window.clearTimeout(timer)
          if (animation) {
            animation.onfinish = null
            animation.cancel()
          }
        }
      })
      stop = () => cleanups.forEach((cleanup) => cleanup())
    }

    syncAnimations()
    media.addEventListener("change", syncAnimations)
    document.addEventListener("visibilitychange", syncAnimations)
    window.addEventListener("resize", syncAnimations)
    return () => {
      stop()
      media.removeEventListener("change", syncAnimations)
      document.removeEventListener("visibilitychange", syncAnimations)
      window.removeEventListener("resize", syncAnimations)
    }
  }, [])

  return (
    <div
      ref={backdropRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 top-24 -z-10 hidden select-none overflow-hidden opacity-30 min-[1440px]:block dark:opacity-25"
    >
      {FILE_ICONS.map((Icon, index) => (
        <span key={index} data-floating-file className="absolute opacity-0">
          <Icon style={{ width: ICON_SIZES[index], height: ICON_SIZES[index] }} />
        </span>
      ))}
    </div>
  )
}
