import React from "react";
import { Block } from "../../../../shared/spec";

export type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";

interface SelectionOverlayProps {
  block: Block;
  scale: number;
  onHandlePointerDown: (e: React.PointerEvent, handle: HandleType) => void;
}

const HANDLES: { type: HandleType; cursor: string; x: string; y: string }[] = [
  { type: "nw", cursor: "nwse-resize", x: "0%", y: "0%" },
  { type: "n", cursor: "ns-resize", x: "50%", y: "0%" },
  { type: "ne", cursor: "nesw-resize", x: "100%", y: "0%" },
  { type: "e", cursor: "ew-resize", x: "100%", y: "50%" },
  { type: "se", cursor: "nwse-resize", x: "100%", y: "100%" },
  { type: "s", cursor: "ns-resize", x: "50%", y: "100%" },
  { type: "sw", cursor: "nesw-resize", x: "0%", y: "100%" },
  { type: "w", cursor: "ew-resize", x: "0%", y: "50%" },
];

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  block,
  scale,
  onHandlePointerDown,
}) => {
  const handleSize = 8 / (scale || 1);
  const rotDistance = 24 / (scale || 1);

  return (
    <div
      className="ui-selection-overlay"
      style={{
        position: "absolute",
        left: `${block.x}px`,
        top: `${block.y}px`,
        width: `${block.w}px`,
        height: `${block.h}px`,
        transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
        transformOrigin: "center center",
        outline: "1.5px solid var(--signal)",
        outlineOffset: "1px",
        pointerEvents: "none",
        zIndex: 9000,
      }}
    >
      {/* 8 Resize Handles */}
      {HANDLES.map((h) => (
        <div
          key={h.type}
          className="ui-resize-handle"
          title={`Resize ${h.type}`}
          onPointerDown={(e) => onHandlePointerDown(e, h.type)}
          style={{
            position: "absolute",
            left: h.x,
            top: h.y,
            width: `${handleSize}px`,
            height: `${handleSize}px`,
            marginLeft: `-${handleSize / 2}px`,
            marginTop: `-${handleSize / 2}px`,
            background: "#FFFFFF",
            border: "1.5px solid var(--signal)",
            borderRadius: "1px",
            cursor: h.cursor,
            pointerEvents: "auto",
            zIndex: 9001,
          }}
        />
      ))}

      {/* Rotation Handle with stem */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `-${rotDistance}px`,
          height: `${rotDistance}px`,
          width: "1px",
          background: "var(--signal)",
          marginLeft: "-0.5px",
          pointerEvents: "none",
        }}
      />
      <div
        className="ui-rotation-handle"
        onPointerDown={(e) => onHandlePointerDown(e, "rot")}
        title="Rotate block"
        style={{
          position: "absolute",
          left: "50%",
          top: `-${rotDistance}px`,
          width: `${handleSize * 1.2}px`,
          height: `${handleSize * 1.2}px`,
          marginLeft: `-${(handleSize * 1.2) / 2}px`,
          marginTop: `-${(handleSize * 1.2) / 2}px`,
          background: "#FFFFFF",
          border: "1.5px solid var(--signal)",
          borderRadius: "50%",
          cursor: "grab",
          pointerEvents: "auto",
          zIndex: 9002,
        }}
      />

      {/* Size Badge */}
      <div
        style={{
          position: "absolute",
          bottom: `-${20 / (scale || 1)}px`,
          right: "0",
          fontSize: `${11 / (scale || 1)}px`,
          fontFamily: "var(--font-mono)",
          background: "var(--ink)",
          color: "var(--bg-panel)",
          padding: `1px ${4 / (scale || 1)}px`,
          borderRadius: "2px",
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(block.w)} × {Math.round(block.h)}
      </div>
    </div>
  );
};
