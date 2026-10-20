import React from "react";
import { Block } from "../../../../shared/spec";

type ShapeBlock = Extract<Block, { type: "shape" }>;

interface Props {
  block: ShapeBlock;
}

export const ShapeBlockRenderer: React.FC<Props> = ({ block }) => {
  const { shape, fill, stroke, radius = 0, w, h } = block;
  const fillColor = fill?.color || "var(--theme-primary)";
  const fillOpacity = fill?.opacity ?? 1;
  const strokeColor = stroke?.color || "transparent";
  const strokeWidth = stroke?.width || 0;
  const strokeDash =
    stroke?.dash === "dashed" ? "8 4" : stroke?.dash === "dotted" ? "3 3" : undefined;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: "visible" }}
    >
      {shape === "rect" && (
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={Math.max(0, w - strokeWidth)}
          height={Math.max(0, h - strokeWidth)}
          rx={radius}
          ry={radius}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDash}
        />
      )}

      {shape === "ellipse" && (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(0, (w - strokeWidth) / 2)}
          ry={Math.max(0, (h - strokeWidth) / 2)}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDash}
        />
      )}

      {shape === "line" && (
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke={strokeColor !== "transparent" ? strokeColor : fillColor}
          strokeWidth={strokeWidth || 2}
          strokeDasharray={strokeDash}
        />
      )}

      {shape === "arrow" && (
        <g>
          <line
            x1={0}
            y1={h / 2}
            x2={w - 14}
            y2={h / 2}
            stroke={strokeColor !== "transparent" ? strokeColor : fillColor}
            strokeWidth={strokeWidth || 2}
            strokeDasharray={strokeDash}
          />
          <polygon
            points={`${w},${h / 2} ${w - 16},${h / 2 - 8} ${w - 16},${h / 2 + 8}`}
            fill={strokeColor !== "transparent" ? strokeColor : fillColor}
          />
        </g>
      )}

      {shape === "triangle" && (
        <polygon
          points={`${w / 2},${strokeWidth} ${w - strokeWidth},${h - strokeWidth} ${strokeWidth},${h - strokeWidth}`}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDash}
        />
      )}
    </svg>
  );
};
