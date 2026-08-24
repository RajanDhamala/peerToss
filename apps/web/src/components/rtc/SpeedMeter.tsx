import { useId } from "react"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type SpeedDirection = "download" | "upload"

const SPEED_STOPS = [0, 5, 10, 50, 100, 250, 500, 750, 1000]
const DIAL_START = 135
const DIAL_SWEEP = 270
const DIAL_CENTER_X = 150
const DIAL_CENTER_Y = 114
const DIAL_RADIUS = 92
const MINOR_TICKS_PER_SECTION = 4
const MINOR_TICK_RATIOS = Array.from(
  { length: (SPEED_STOPS.length - 1) * MINOR_TICKS_PER_SECTION + 1 },
  (_, index) => index / ((SPEED_STOPS.length - 1) * MINOR_TICKS_PER_SECTION)
).filter((_, index) => index % MINOR_TICKS_PER_SECTION !== 0)

function speedRatio(speed: number | null) {
  if (speed === null || speed <= 0) return 0
  if (speed >= SPEED_STOPS.at(-1)!) return 1

  const upperIndex = SPEED_STOPS.findIndex((stop) => speed <= stop)
  const lowerIndex = Math.max(0, upperIndex - 1)
  const lower = SPEED_STOPS[lowerIndex]
  const upper = SPEED_STOPS[upperIndex]
  const segmentProgress = (speed - lower) / (upper - lower)

  return (lowerIndex + segmentProgress) / (SPEED_STOPS.length - 1)
}

function dialPoint(angle: number, radius: number) {
  const radians = angle * Math.PI / 180
  return {
    x: DIAL_CENTER_X + Math.cos(radians) * radius,
    y: DIAL_CENTER_Y + Math.sin(radians) * radius,
  }
}

function describeArc(startAngle: number, endAngle: number) {
  if (endAngle <= startAngle) return ""

  const start = dialPoint(startAngle, DIAL_RADIUS)
  const end = dialPoint(endAngle, DIAL_RADIUS)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return `M ${start.x} ${start.y} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function formatSpeed(value: number | null, digits = 1) {
  return value === null ? "—" : value.toFixed(digits)
}

function SpeedMeter({
  downloadMbps,
  uploadMbps,
  running,
  activeDirection,
  waitingForPeer,
  disabled,
  sampleSizeLabel = "4 MB",
  onRun,
  className,
}: {
  downloadMbps: number | null
  uploadMbps: number | null
  running: boolean
  activeDirection: SpeedDirection | null
  waitingForPeer: boolean
  disabled: boolean
  sampleSizeLabel?: string
  onRun: () => void
  className?: string
}) {
  const rawId = useId().replaceAll(":", "")
  const titleId = `speed-meter-${rawId}`
  const activeGradientId = `speed-active-${rawId}`
  const needleGradientId = `speed-needle-${rawId}`
  const needleShadowId = `speed-needle-shadow-${rawId}`
  const faceGradientId = `speed-face-${rawId}`
  const ratio = speedRatio(uploadMbps)
  const needleAngle = DIAL_START + ratio * DIAL_SWEEP
  const trackPath = describeArc(DIAL_START, DIAL_START + DIAL_SWEEP)
  const measuringUpload = running && uploadMbps === null
  const activePercentage = Math.min(100, Math.max(0, ratio * 100))
  const activeStopIndex = Math.min(
    SPEED_STOPS.length - 1,
    Math.floor(ratio * (SPEED_STOPS.length - 1))
  )

  const statusText = running
    ? waitingForPeer
      ? "Waiting for the peer result…"
      : activeDirection === "download"
        ? "Measuring download from your peer…"
        : "Measuring this device’s upload…"
    : uploadMbps === null && downloadMbps === null
      ? `${sampleSizeLabel} is sent each way and discarded.`
      : "Last result across the direct WebRTC link."

  return (
    <section
      className={cn("flex h-full min-h-[320px] flex-col", className)}
      aria-labelledby={titleId}
    >
      <style>{`
        @keyframes ptx-speed-track-scan {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -100; }
        }
        @keyframes ptx-speed-needle-scan {
          0% { transform: rotate(135deg); }
          52% { transform: rotate(378deg); }
          100% { transform: rotate(220deg); }
        }
        .ptx-speed-track-scan {
          animation: ptx-speed-track-scan 1.15s linear infinite;
        }
        .ptx-speed-needle-scan {
          transform: rotate(135deg);
          animation: ptx-speed-needle-scan 1.8s cubic-bezier(.42,0,.3,1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ptx-speed-track-scan,
          .ptx-speed-needle-scan { animation: none; }
        }
      `}</style>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="ptx-display text-sm font-semibold text-[#14171F]">
            Direct link speed
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#8A8776]">
            Device-to-device throughput.
          </p>
        </div>
        <span className="rounded-full border border-[#E4E1DA] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#4B5160]">
          WebRTC
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#8A8776]">
          <ArrowUp className="size-3.5 text-[#05BCE7]" />
          Your upload
        </span>
        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[#8A8776]">
            <ArrowDown className="size-3 text-[#16947F]" />
            Download
          </span>
          <p className="ptx-mono mt-0.5 text-sm font-medium text-[#14171F]">
            {formatSpeed(downloadMbps)} <span className="text-[10px] text-[#8A8776]">Mbps</span>
          </p>
        </div>
      </div>

      <div className="relative mx-auto -mt-1 w-full max-w-[285px]">
        <svg
          viewBox="0 0 300 225"
          role="meter"
          aria-label="Upload speed"
          aria-valuemin={0}
          aria-valuemax={1000}
          aria-valuenow={uploadMbps ?? 0}
          className="block h-auto w-full overflow-visible"
        >
          <defs>
            <linearGradient id={activeGradientId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#05BCE7" />
              <stop offset="100%" stopColor="#45D9EF" />
            </linearGradient>
            <linearGradient id={needleGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8E8F8B" />
              <stop offset="72%" stopColor="#C8C8C3" />
              <stop offset="100%" stopColor="#F4F4F1" stopOpacity="0.3" />
            </linearGradient>
            <radialGradient id={faceGradientId} cx="50%" cy="45%" r="62%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="72%" stopColor="#FAFAF8" />
              <stop offset="100%" stopColor="#F1F1EE" />
            </radialGradient>
            <filter id={needleShadowId} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#14171F" floodOpacity="0.12" />
            </filter>
          </defs>

          <path
            d={trackPath}
            fill="none"
            stroke="#E6E6E3"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {(ratio > 0 || running) && (
            <path
              d={trackPath}
              pathLength="100"
              fill="none"
              stroke={`url(#${activeGradientId})`}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={
                measuringUpload
                  ? "11 89"
                  : `${activePercentage} ${100 - activePercentage}`
              }
              className={measuringUpload ? "ptx-speed-track-scan" : undefined}
              style={{
                transition: measuringUpload
                  ? undefined
                  : "stroke-dasharray 700ms cubic-bezier(.22,1,.36,1)",
              }}
            />
          )}

          <circle
            cx={DIAL_CENTER_X}
            cy={DIAL_CENTER_Y}
            r="66"
            fill={`url(#${faceGradientId})`}
          />

          {MINOR_TICK_RATIOS.map((tickRatio) => {
            const angle = DIAL_START + tickRatio * DIAL_SWEEP
            const tickStart = dialPoint(angle, 78)
            const tickEnd = dialPoint(angle, 82)

            return (
              <line
                key={tickRatio}
                x1={tickStart.x}
                y1={tickStart.y}
                x2={tickEnd.x}
                y2={tickEnd.y}
                stroke="#D8D7D1"
                strokeWidth="0.85"
              />
            )
          })}

          {SPEED_STOPS.map((stop, index) => {
            const angle = DIAL_START + index / (SPEED_STOPS.length - 1) * DIAL_SWEEP
            const tickStart = dialPoint(angle, 75)
            const tickEnd = dialPoint(angle, 83)
            const label = dialPoint(angle, 61)
            const isActiveStop = uploadMbps !== null && index === activeStopIndex

            return (
              <g key={stop}>
                <line
                  x1={tickStart.x}
                  y1={tickStart.y}
                  x2={tickEnd.x}
                  y2={tickEnd.y}
                  stroke={isActiveStop ? "#05BCE7" : "#BEBDB7"}
                  strokeWidth={isActiveStop ? "1.8" : "1.25"}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActiveStop ? "#4B5160" : "#A5A39C"}
                  className="ptx-mono"
                  fontSize="9.5"
                  fontWeight={isActiveStop ? "700" : "600"}
                >
                  {stop}
                </text>
              </g>
            )
          })}

          <g
            className={measuringUpload ? "ptx-speed-needle-scan" : undefined}
            filter={`url(#${needleShadowId})`}
            style={{
              transformOrigin: `${DIAL_CENTER_X}px ${DIAL_CENTER_Y}px`,
              transform: measuringUpload ? undefined : `rotate(${needleAngle}deg)`,
              transition: measuringUpload
                ? undefined
                : "transform 700ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            <path
              d={`M ${DIAL_CENTER_X - 5} ${DIAL_CENTER_Y - 3.8} L ${DIAL_CENTER_X + 72} ${DIAL_CENTER_Y} L ${DIAL_CENTER_X - 5} ${DIAL_CENTER_Y + 3.8} Z`}
              fill={`url(#${needleGradientId})`}
            />
          </g>
          <circle
            cx={DIAL_CENTER_X}
            cy={DIAL_CENTER_Y}
            r="7"
            fill="#F8F8F5"
            stroke="#9D9D97"
            strokeWidth="2"
          />
          <circle cx={DIAL_CENTER_X} cy={DIAL_CENTER_Y} r="2.5" fill="#777872" />

          <text
            x={DIAL_CENTER_X}
            y="183"
            textAnchor="middle"
            fill="#4B5160"
            className="ptx-mono"
            fontSize="28"
            fontWeight="400"
          >
            {running && uploadMbps === null ? "…" : formatSpeed(uploadMbps, 2)}
          </text>
          <text
            x={DIAL_CENTER_X}
            y="203"
            textAnchor="middle"
            fill="#A5A39C"
            className="ptx-mono"
            fontSize="11"
          >
            Mbps upload
          </text>
        </svg>
      </div>

      <p className="-mt-1 min-h-4 text-center text-[11px] text-[#8A8776]">
        {statusText}
      </p>

      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#05BCE7] disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
      >
        {running && <Loader2 className="size-3.5 animate-spin" />}
        {running
          ? "Testing direct link…"
          : uploadMbps === null && downloadMbps === null
            ? "Run speed test"
            : "Test again"}
      </button>
    </section>
  )
}

export { SpeedMeter, type SpeedDirection }
