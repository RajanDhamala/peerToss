import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import toast from "react-hot-toast"
import { CameraOff, ScanLine } from "lucide-react"

import { Button } from "@/components/ui/button"

type QrScannerProps = {
  onDetect: (value: string) => void | Promise<void>
}

type CameraState = "starting" | "live" | "denied" | "unsupported" | "stopped"

const SCAN_FRAME_SIZE = 480
const SCAN_INTERVAL_MS = 160
const DETECTION_RETRY_MS = 1_500
const SCAN_REGION_RATIO = 0.82

const QrScanner = ({ onDetect }: QrScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const retryTimerRef = useRef(0)
  const processingRef = useRef(false)
  const lastScanAtRef = useRef(0)

  const supported =
    typeof navigator.mediaDevices?.getUserMedia === "function"

  const [cameraState, setCameraState] = useState<CameraState>(() =>
    supported ? "starting" : "unsupported"
  )

  useEffect(() => {
    if (!supported) return

    let cancelled = false
    let detectorStarted = false

    const decodeFrame = (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement
    ) => {
      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight
      if (!videoWidth || !videoHeight) return null

      if (
        canvas.width !== SCAN_FRAME_SIZE ||
        canvas.height !== SCAN_FRAME_SIZE
      ) {
        canvas.width = SCAN_FRAME_SIZE
        canvas.height = SCAN_FRAME_SIZE
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return null

      const sourceSize = Math.min(videoWidth, videoHeight) * SCAN_REGION_RATIO
      const sourceX = (videoWidth - sourceSize) / 2
      const sourceY = (videoHeight - sourceSize) / 2

      const decode = (mirrored: boolean) => {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, SCAN_FRAME_SIZE, SCAN_FRAME_SIZE)
        if (mirrored) {
          ctx.translate(SCAN_FRAME_SIZE, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          SCAN_FRAME_SIZE,
          SCAN_FRAME_SIZE
        )
        ctx.restore()

        const image = ctx.getImageData(
          0,
          0,
          SCAN_FRAME_SIZE,
          SCAN_FRAME_SIZE
        )
        return jsQR(image.data, image.width, image.height, {
          inversionAttempts: "attemptBoth",
        })
      }

      return decode(false) ?? decode(true)
    }

    const scanLoop = (timestamp: number) => {
      if (cancelled) return

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      if (
        processingRef.current ||
        video.readyState < video.HAVE_CURRENT_DATA ||
        timestamp - lastScanAtRef.current < SCAN_INTERVAL_MS
      ) {
        rafRef.current = requestAnimationFrame(scanLoop)
        return
      }

      lastScanAtRef.current = timestamp
      const code = decodeFrame(video, canvas)

      if (code?.data) {
        processingRef.current = true
        toast.success("QR code detected", {
          id: "qr-code-detected",
          icon: <ScanLine className="size-4" />,
        })

        void Promise.resolve(onDetect(code.data)).finally(() => {
          if (cancelled) return
          retryTimerRef.current = window.setTimeout(() => {
            if (cancelled) return
            processingRef.current = false
            lastScanAtRef.current = 0
            rafRef.current = requestAnimationFrame(scanLoop)
          }, DETECTION_RETRY_MS)
        })
        return
      }

      rafRef.current = requestAnimationFrame(scanLoop)
    }

    const startDetector = () => {
      if (cancelled || detectorStarted) return
      detectorStarted = true
      setCameraState("live")
      rafRef.current = requestAnimationFrame(scanLoop)
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
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
      clearTimeout(retryTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [onDetect, supported])

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(retryTimerRef.current)
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
