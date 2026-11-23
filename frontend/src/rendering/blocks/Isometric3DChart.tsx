import React, { useState } from "react";
import { Sparkles, Box } from "lucide-react";

interface Isometric3DChartProps {
  kind: string;
  labels: string[];
  dataValues: number[];
  seriesLabel?: string;
  themeColors?: string[];
  unit?: string;
}


/** Category label wrapped to its slot width (max 3 lines, ellipsis after) so neighbours never overlap. */
function WrappedLabel({ text, x, y, slot, hovered }: { text: string; x: number; y: number; slot: number; hovered: boolean }) {
  const maxChars = Math.max(6, Math.floor(slot / 6.4));
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = shown[2].replace(/.?$/, "…");
  return (
    <text x={x} y={y} fill={hovered ? "#1E293B" : "#475569"} fontSize="12" fontWeight={hovered ? "700" : "600"} textAnchor="middle" fontFamily="system-ui, sans-serif">
      <title>{text}</title>
      {shown.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export const Isometric3DChart: React.FC<Isometric3DChartProps> = ({
  kind,
  labels,
  dataValues,
  seriesLabel = "Metric",
  themeColors = ["#2563EB", "#047857", "#B45309", "#7C3AED", "#BE185D", "#0369A1"],
  unit = "",
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tiltPreset, setTiltPreset] = useState<"standard" | "steep">("standard");

  const count = Math.max(1, dataValues.length);
  const maxVal = Math.max(...dataValues.map((v) => (isNaN(v) ? 0 : v)), 1);

  // SVG canvas dimensions
  const svgWidth = 620;
  const svgHeight = 330;

  // Isometric angle configuration
  const dx = tiltPreset === "standard" ? 22 : 16;
  const dy = tiltPreset === "standard" ? 14 : 22;

  // Chart area bounds
  const floorY = 260;
  const marginX = 65;
  const availableWidth = svgWidth - marginX * 2 - dx;
  const barWidth = Math.min(52, Math.max(24, Math.floor(availableWidth / (count * 1.5))));
  const gap = count > 1 ? (availableWidth - barWidth * count) / (count - 1) : 0;
  const maxHeight = 160;

  // Color helper functions
  const adjustColor = (hex: string, percent: number) => {
    let clean = hex.replace("#", "");
    if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
    const num = parseInt(clean, 16);
    if (isNaN(num)) return hex;
    const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(255 * (percent / 100))));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100))));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(255 * (percent / 100))));
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Render 3D Bar / Column Chart
  const render3DBarChart = () => {
    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {/* Linear gradients for each bar */}
          {dataValues.map((_, idx) => {
            const baseCol = themeColors[idx % themeColors.length];
            const lightCol = adjustColor(baseCol, 24);
            const darkCol = adjustColor(baseCol, -28);
            return (
              <React.Fragment key={`grad-${idx}`}>
                <linearGradient id={`grad-front-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lightCol} />
                  <stop offset="100%" stopColor={baseCol} />
                </linearGradient>
                <linearGradient id={`grad-side-${idx}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={darkCol} />
                  <stop offset="100%" stopColor={adjustColor(baseCol, -42)} />
                </linearGradient>
              </React.Fragment>
            );
          })}

          {/* Floor grid gradient */}
          <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(226, 232, 240, 0.4)" />
            <stop offset="100%" stopColor="rgba(203, 213, 225, 0.85)" />
          </linearGradient>

          {/* Shadow filter */}
          <filter id="barShadow" x="-20%" y="-20%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dx="2" dy="5" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.25" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 3D Isometric Base Plane Grid */}
        <g opacity="0.85">
          {/* Isometric Base Plane */}
          <polygon
            points={`
              ${marginX - 20},${floorY}
              ${marginX - 20 + dx * 2},${floorY - dy * 2}
              ${svgWidth - marginX + 30 + dx},${floorY - dy * 2}
              ${svgWidth - marginX + 30},${floorY}
            `}
            fill="url(#floorGrad)"
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth="1.5"
          />

          {/* Perspective grid lines */}
          {[0.25, 0.5, 0.75, 1.0].map((frac, i) => {
            const gy = floorY - maxHeight * frac;
            return (
              <g key={`grid-${i}`} opacity="0.6">
                <line
                  x1={marginX - 20 + dx}
                  y1={gy - dy}
                  x2={svgWidth - marginX + 30 + dx}
                  y2={gy - dy}
                  stroke="rgba(148, 163, 184, 0.3)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={marginX - 32}
                  y={gy - dy + 4}
                  fontSize="11"
                  fill="#94A3B8"
                  textAnchor="end"
                  fontFamily="system-ui, sans-serif"
                >
                  {Math.round(maxVal * frac)}
                </text>
              </g>
            );
          })}
        </g>

        {/* 3D Isometric Columns */}
        {dataValues.map((val, idx) => {
          const rawHeight = (Math.max(val, 0) / maxVal) * maxHeight;
          const barH = Math.max(rawHeight, 8);
          const bx = marginX + idx * (barWidth + gap);
          const isHovered = hoveredIdx === idx;
          const elevation = isHovered ? 8 : 0;
          const by = floorY - elevation;
          const baseColor = themeColors[idx % themeColors.length];
          const topColor = adjustColor(baseColor, 38);

          return (
            <g
              key={`bar-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer", transition: "transform 200ms ease" }}
            >
              {/* Floor Shadow */}
              <ellipse
                cx={bx + barWidth / 2 + dx / 2}
                cy={floorY - dy / 2 + 2}
                rx={barWidth / 2 + (isHovered ? 6 : 2)}
                ry={dy / 2 + (isHovered ? 3 : 1)}
                fill="rgba(15, 23, 42, 0.28)"
                opacity={isHovered ? 0.45 : 0.25}
              />

              {/* 3D Side Face (Depth extrusion) */}
              <polygon
                points={`
                  ${bx + barWidth},${by}
                  ${bx + barWidth + dx},${by - dy}
                  ${bx + barWidth + dx},${by - barH - dy}
                  ${bx + barWidth},${by - barH}
                `}
                fill={`url(#grad-side-${idx})`}
                stroke="rgba(0,0,0,0.15)"
                strokeWidth="0.5"
              />

              {/* 3D Front Face */}
              <polygon
                points={`
                  ${bx},${by}
                  ${bx + barWidth},${by}
                  ${bx + barWidth},${by - barH}
                  ${bx},${by - barH}
                `}
                fill={`url(#grad-front-${idx})`}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="0.8"
                filter={isHovered ? "url(#barShadow)" : undefined}
              />

              {/* 3D Top Face (Rhombus cap with specular highlight) */}
              <polygon
                points={`
                  ${bx},${by - barH}
                  ${bx + dx},${by - barH - dy}
                  ${bx + barWidth + dx},${by - barH - dy}
                  ${bx + barWidth},${by - barH}
                `}
                fill={topColor}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="1"
              />

              {/* Floating 3D Value Capsule above bar */}
              <g
                transform={`translate(${bx + barWidth / 2 + dx / 2}, ${by - barH - dy - 18})`}
                opacity={isHovered ? 1 : 0.92}
                style={{ transition: "all 150ms ease" }}
              >
                <rect
                  x="-24"
                  y="-11"
                  width="48"
                  height="22"
                  rx="11"
                  fill={isHovered ? "#0F172A" : "rgba(15, 23, 42, 0.88)"}
                  stroke={isHovered ? "#38BDF8" : "rgba(255, 255, 255, 0.35)"}
                  strokeWidth="1.2"
                />
                <text
                  x="0"
                  y="4"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {val}
                  {unit}
                </text>
              </g>

              {/* Base Category Label */}
              <WrappedLabel text={labels[idx] || `Item ${idx + 1}`} x={bx + barWidth / 2} y={floorY + 20} slot={barWidth + gap} hovered={isHovered} />
            </g>
          );
        })}
      </svg>
    );
  };

  // Render 3D Donut / Pie Chart
  const render3DDonutChart = () => {
    const total = dataValues.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) || 1;
    const cx = svgWidth / 2;
    const cy = 155;
    const rx = 135;
    const ry = 68;
    const innerRx = 62;
    const innerRy = 31;
    const depth = 34;

    let currentAngle = -Math.PI / 2;

    const slices = dataValues.map((val, idx) => {
      const angle = (val / total) * Math.PI * 2;
      const start = currentAngle;
      const end = currentAngle + angle;
      currentAngle = end;
      return {
        idx,
        val,
        pct: Math.round((val / total) * 100),
        start,
        end,
        color: themeColors[idx % themeColors.length],
        label: labels[idx] || `Segment ${idx + 1}`,
      };
    });

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          <radialGradient id="donutShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(15, 23, 42, 0.35)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* 3D Base Drop Shadow */}
        <ellipse
          cx={cx}
          cy={cy + depth + 14}
          rx={rx + 16}
          ry={ry + 8}
          fill="url(#donutShadow)"
        />

        {/* 3D Lower Extrusion Cylinder Walls (Front Hemisphere) */}
        {slices.map((slice) => {
          // Render side wall if slice intersects front hemisphere (0 to PI)
          const midAngle = (slice.start + slice.end) / 2;
          const isFront = Math.sin(midAngle) >= -0.2;
          if (!isFront) return null;

          const p1x = cx + rx * Math.cos(slice.start);
          const p1y = cy + ry * Math.sin(slice.start);
          const p2x = cx + rx * Math.cos(slice.end);
          const p2y = cy + ry * Math.sin(slice.end);
          const wallDark = adjustColor(slice.color, -34);

          return (
            <path
              key={`wall-${slice.idx}`}
              d={`
                M ${p1x} ${p1y}
                L ${p1x} ${p1y + depth}
                A ${rx} ${ry} 0 0 1 ${p2x} ${p2y + depth}
                L ${p2x} ${p2y}
                A ${rx} ${ry} 0 0 0 ${p1x} ${p1y}
                Z
              `}
              fill={wallDark}
              stroke="rgba(0,0,0,0.15)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* 3D Top Sliced Rings */}
        {slices.map((slice) => {
          const isHovered = hoveredIdx === slice.idx;
          const midAngle = (slice.start + slice.end) / 2;
          const explode = isHovered ? 8 : 0;
          const ox = Math.cos(midAngle) * explode;
          const oy = Math.sin(midAngle) * explode;

          const outerStart = {
            x: cx + ox + rx * Math.cos(slice.start),
            y: cy + oy + ry * Math.sin(slice.start),
          };
          const outerEnd = {
            x: cx + ox + rx * Math.cos(slice.end),
            y: cy + oy + ry * Math.sin(slice.end),
          };
          const innerStart = {
            x: cx + ox + innerRx * Math.cos(slice.start),
            y: cy + oy + innerRy * Math.sin(slice.start),
          };
          const innerEnd = {
            x: cx + ox + innerRx * Math.cos(slice.end),
            y: cy + oy + innerRy * Math.sin(slice.end),
          };

          const largeArc = slice.end - slice.start > Math.PI ? 1 : 0;
          const topFill = adjustColor(slice.color, isHovered ? 20 : 8);

          return (
            <g
              key={`top-${slice.idx}`}
              onMouseEnter={() => setHoveredIdx(slice.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer", transition: "all 150ms ease" }}
            >
              <path
                d={`
                  M ${outerStart.x} ${outerStart.y}
                  A ${rx} ${ry} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}
                  L ${innerEnd.x} ${innerEnd.y}
                  A ${innerRx} ${innerRy} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}
                  Z
                `}
                fill={topFill}
                stroke="#FFFFFF"
                strokeWidth={isHovered ? "2.5" : "1.2"}
              />

              {/* Floating label callout */}
              {slice.pct >= 6 && (
                <text
                  x={cx + ox + (rx * 0.75) * Math.cos(midAngle)}
                  y={cy + oy + (ry * 0.75) * Math.sin(midAngle) + 4}
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {slice.pct}%
                </text>
              )}
            </g>
          );
        })}

        {/* 3D Center Core Recessed Cylinder Shadow */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={innerRx}
          ry={innerRy}
          fill="rgba(15, 23, 42, 0.85)"
        />
        <text
          x={cx}
          y={cy + 4}
          fill="#F8FAFC"
          fontSize="12"
          fontWeight="700"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
        >
          {/* The chart title already sits above the chart; a long one here spilled out of the hole. */}
          {seriesLabel.length <= 14 ? seriesLabel : ""}
        </text>

        {/* Legend pills below donut */}
        <g transform={`translate(${cx - (slices.length * 55) / 2}, ${svgHeight - 24})`}>
          {slices.map((s, i) => (
            <g key={`leg-${i}`} transform={`translate(${i * 64}, 0)`}>
              <circle cx="0" cy="0" r="4" fill={s.color} />
              <text
                x="8"
                y="3"
                fontSize="11"
                fill="#475569"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
              >
                {s.label.slice(0, 8)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  };

  // Render 3D Isometric Ribbon Line Chart
  const render3DRibbonChart = () => {
    const floorY = 245;
    const stepX = count > 1 ? availableWidth / (count - 1) : availableWidth;

    const points = dataValues.map((val, idx) => {
      const rawH = (Math.max(val, 0) / maxVal) * maxHeight;
      const px = marginX + idx * stepX;
      const py = floorY - rawH;
      return { px, py, val, label: labels[idx] || `P${idx + 1}` };
    });

    const frontPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.px} ${p.py}`).join(" ");
    const backPath = points.map((p) => `L ${p.px + dx} ${p.py - dy}`).reverse().join(" ");
    const ribbonTopD = `${frontPath} ${backPath} Z`;

    const curtainD = `
      ${frontPath}
      L ${points[points.length - 1].px} ${floorY}
      L ${points[0].px} ${floorY}
      Z
    `;

    const primaryColor = themeColors[0] || "#2563EB";

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="curtainGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="ribbonGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={adjustColor(primaryColor, 35)} />
            <stop offset="100%" stopColor={adjustColor(primaryColor, 10)} />
          </linearGradient>
        </defs>

        {/* Ground grid */}
        <line
          x1={marginX - 20}
          y1={floorY}
          x2={svgWidth - marginX + 30}
          y2={floorY}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth="1.5"
        />

        {/* Curtain wall falling from 3D ribbon to floor */}
        <path d={curtainD} fill="url(#curtainGrad)" />

        {/* 3D Ribbon surface */}
        <path
          d={ribbonTopD}
          fill="url(#ribbonGrad)"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="1"
        />

        {/* Front glowing line edge */}
        <path
          d={frontPath}
          fill="none"
          stroke={primaryColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 3D Floating Data Nodes */}
        {points.map((p, idx) => {
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={`node-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Vertical guideline */}
              <line
                x1={p.px}
                y1={p.py}
                x2={p.px}
                y2={floorY}
                stroke={primaryColor}
                strokeDasharray="2 3"
                strokeWidth="1"
                opacity={isHovered ? 0.7 : 0.3}
              />

              {/* 3D Sphere Marker */}
              <circle
                cx={p.px}
                cy={p.py}
                r={isHovered ? 7 : 5}
                fill={adjustColor(primaryColor, 45)}
                stroke="#FFFFFF"
                strokeWidth="2"
              />

              {/* 3D Value Capsule */}
              <g
                transform={`translate(${p.px}, ${p.py - 18})`}
                opacity={isHovered ? 1 : 0.9}
              >
                <rect
                  x="-20"
                  y="-10"
                  width="40"
                  height="20"
                  rx="10"
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="#38BDF8"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="4"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {p.val}
                  {unit}
                </text>
              </g>

              {/* Base label */}
              <WrappedLabel text={p.label} x={p.px} y={floorY + 20} slot={points.length > 1 ? Math.abs(points[1].px - points[0].px) : 200} hovered={isHovered} />
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* 3D Visual Header Controls */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 6,
            backgroundColor: "rgba(37, 99, 235, 0.1)",
            border: "1px solid rgba(37, 99, 235, 0.3)",
            color: "#1D4ED8",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Sparkles size={12} color="#2563EB" />
          <span>3D Isometric Visual</span>
        </div>

        <button
          type="button"
          onClick={() => setTiltPreset((p) => (p === "standard" ? "steep" : "standard"))}
          title="Toggle 3D perspective angle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 7px",
            borderRadius: 6,
            backgroundColor: "#FFFFFF",
            border: "1px solid #CBD5E1",
            color: "#475569",
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Box size={11} />
          <span>{tiltPreset === "standard" ? "30° Angle" : "45° Angle"}</span>
        </button>
      </div>

      {/* 3D Visualization Body */}
      <div style={{ flex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {kind === "pie" || kind === "donut"
          ? render3DDonutChart()
          : kind === "line" || kind === "area"
          ? render3DRibbonChart()
          : render3DBarChart()}
      </div>
    </div>
  );
};
