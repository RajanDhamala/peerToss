import { ArrowDown } from "lucide-react";

/**
 * SpeedGauge — dark neon arc speedometer
 * ---------------------------------------------------------------
 * <SpeedGauge value={44.63} />
 * <SpeedGauge value={612} maxValue={1000} label="Upload" unit="Mbps" />
 *
 * Ticks use a non-linear (cube-root) scale — like most speed-test
 * gauges — so low values get more room on the dial than high ones.
 */

const CX = 200;
const CY = 200;
const START_ANGLE = 225; // degrees, 0 = top, clockwise
const SWEEP = 270;
const TRACK_R = 150;
const NEEDLE_LEN = 118;
const DEFAULT_TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

function polar(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function describeArc(r: number, startAngle: number, endAngle: number) {
  if (endAngle <= startAngle) return "";
  const start = polar(r, startAngle);
  const end = polar(r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function toT(value: number, maxValue: number, exponent: number) {
  const clamped = Math.min(Math.max(value, 0), maxValue);
  return Math.pow(clamped / maxValue, 1 / exponent);
}

export default function SpeedGauge({
  value = 44.63,
  maxValue = 1000,
  unit = "Mbps",
  label = "Download",
  ticks = DEFAULT_TICKS,
  scaleExponent = 3,
}) {
  const t = toT(value, maxValue, scaleExponent);
  const needleAngle = START_ANGLE + t * SWEEP;
  const needleRotation = needleAngle - START_ANGLE;

  const activeTickValue = [...ticks].reverse().find((v) => v <= value) ?? ticks[0];

  return (
    <div className="inline-flex flex-col items-center rounded-3xl bg-black p-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .sg-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      `}</style>

      <svg viewBox="0 0 400 400" className="w-[320px] sm:w-[380px]">
        <defs>
          <linearGradient id="sg-active" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5CF6FF" />
            <stop offset="55%" stopColor="#28C7FF" />
            <stop offset="100%" stopColor="#4E6BFF" />
          </linearGradient>
          <filter id="sg-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="sg-needle" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3A3A44" />
            <stop offset="100%" stopColor="#F2F2F5" />
          </linearGradient>
        </defs>

        {/* base track */}
        <path
          d={describeArc(TRACK_R, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#221E33"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* glow layer for the active arc */}
        {t > 0.01 && (
          <path
            d={describeArc(TRACK_R, START_ANGLE, needleAngle)}
            fill="none"
            stroke="#33E6FF"
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.55"
            filter="url(#sg-glow)"
          />
        )}

        {/* crisp active arc */}
        {t > 0.01 && (
          <path
            d={describeArc(TRACK_R, START_ANGLE, needleAngle)}
            fill="none"
            stroke="url(#sg-active)"
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}

        {/* ticks + labels */}
        {ticks.map((v) => {
          const tt = toT(v, maxValue, scaleExponent);
          const angle = START_ANGLE + tt * SWEEP;
          const inner = polar(TRACK_R - 22, angle);
          const outer = polar(TRACK_R - 12, angle);
          const label3 = polar(TRACK_R - 42, angle);
          const isActive = v === activeTickValue;
          return (
            <g key={v}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={isActive ? "#EAF6FF" : "#4A465C"}
                strokeWidth="2"
              />
              <text
                x={label3.x}
                y={label3.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="sg-mono"
                fontSize={isActive ? 17 : 14}
                fontWeight={isActive ? 700 : 400}
                fill={isActive ? "#F5FAFF" : "#6B6780"}
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* needle */}
        <g
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${needleRotation}deg)`,
            transition: "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={polar(NEEDLE_LEN, START_ANGLE).x}
            y2={polar(NEEDLE_LEN, START_ANGLE).y}
            stroke="url(#sg-needle)"
            strokeWidth="5"
            strokeLinecap="round"
            filter="url(#sg-glow)"
          />
        </g>
        <circle cx={CX} cy={CY} r="7" fill="#100E1A" stroke="#57536B" strokeWidth="2" />

        {/* readout */}
        <text
          x={CX}
          y={CY + 62}
          textAnchor="middle"
          className="sg-mono"
          fontSize="40"
          fontWeight="500"
          fill="#E7B98C"
        >
          {value.toFixed(2)}
        </text>
      </svg>

      <div className="-mt-2 flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full border border-[#2E9E93]">
          <ArrowDown className="size-2.5 text-[#2E9E93]" strokeWidth={2.5} />
        </span>
        <span className="sg-mono text-sm text-[#8B8FA3]">{unit}</span>
      </div>

      {label && (
        <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-[#514D63]">
          {label}
        </p>
      )}
    </div>
  );
}
