import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface PopoverProps {
  open: boolean;
  anchorRect?: DOMRect | null;
  x?: number;
  y?: number;
  onClose: () => void;
  children: React.ReactNode;
  placement?: "top" | "bottom";
  className?: string;
  style?: React.CSSProperties;
}

export const Popover: React.FC<PopoverProps> = ({
  open,
  anchorRect,
  x,
  y,
  onClose,
  children,
  placement = "bottom",
  className = "",
  style = {},
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  let posX = x ?? 0;
  let posY = y ?? 0;

  if (anchorRect) {
    posX = anchorRect.left + anchorRect.width / 2;
    posY = placement === "bottom" ? anchorRect.bottom + 6 : anchorRect.top - 6;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={`ui-popover ${className}`}
      style={{
        position: "fixed",
        left: `${posX}px`,
        top: `${posY}px`,
        transform: anchorRect
          ? placement === "bottom"
            ? "translateX(-50%)"
            : "translateX(-50%) translateY(-100%)"
          : "none",
        zIndex: 999990,
        background: "var(--bg-panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-md, 6px)",
        boxShadow: "var(--elevation-floating)",
        padding: "8px",
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
};
