import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import toast from "react-hot-toast"
import { CameraOff, ScanLine } from "lucide-react"

import { Button } from "@/components/ui/button"

type QrScannerProps = {
  onDetect: (value: string) => void
}

type CameraState = "starting" | "live" | "denied" | "unsupported" | "stopped"

const QrScanner = ({ onDetect }: QrScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const detectedRef = useRef(false)

  const supported =
    typeof navigator.mediaDevices?.getUserMedia === "function"

  const [cameraState, setCameraState] = useState<CameraState>(() =>
    supported ? "starting" : "unsupported"
  )

  useEffect(() => {
    if (!supported) return

    let cancelled = false

    const scanLoop = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (detectedRef.current || !video || !canvas) return

      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop)
        return
      }

      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return

      ctx.drawImage(video, 0, 0)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      // attemptBoth (the default): webcam shots of a screen often come
      // through color-inverted and only decode with inversion.
      const code = jsQR(image.data, image.width, image.height)

      if (code?.data) {
        detectedRef.current = true
        toast.success("QR code detected", { icon: <ScanLine className="size-4" /> })
        onDetect(code.data)
        return
      }
      rafRef.current = requestAnimationFrame(scanLoop)
    }

    const startDetector = () => {
      if (cancelled) return
      setCameraState("live")
      rafRef.current = requestAnimationFrame(scanLoop)
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream

        // Only go "live" once the video is actually rendering frames;
        // the stream existing isn't enough.
        try {
          await video.play()
          if (video.readyState >= video.HAVE_CURRENT_DATA) {
            startDetector()
          } else {
            video.addEventListener("playing", startDetector, { once: true })
          }
        } catch (err) {
          console.error("video playback failed:", err)
          if (!cancelled) setCameraState("denied")
        }
      })
      .catch((err) => {
        console.error("camera error:", err)
        if (!cancelled) setCameraState("denied")
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [onDetect, supported])

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraState("stopped")
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-64 overflow-hidden rounded-xl border bg-muted">
        <video
          ref={videoRef}
          className="size-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {cameraState === "live" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-48 rounded-lg border-2 border-primary/70" />
          </div>
        )}

        {cameraState !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            {cameraState === "starting" && (
              <p className="text-sm text-muted-foreground">
                Starting camera...
              </p>
            )}
            {(cameraState === "denied" || cameraState === "stopped") && (
              <div className="flex flex-col items-center gap-2">
                <CameraOff className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {cameraState === "stopped"
                    ? "Camera stopped."
                    : "Camera access was blocked. Allow it in your browser settings, or enter the code manually instead."}
                </p>
              </div>
            )}
            {cameraState === "unsupported" && (
              <p className="text-sm text-muted-foreground">
                This browser doesn't support camera access. Enter the code
                manually instead.
              </p>
            )}
          </div>
        )}
      </div>

      {cameraState === "live" && (
        <Button variant="ghost" size="sm" onClick={stopCamera}>
          Stop camera
        </Button>
      )}
    </div>
  )
}

export default QrScanner
