import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmVariant?: "primary" | "danger";
  children?: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  title,
  description,
  onClose,
  confirmLabel,
  onConfirm,
  confirmVariant = "primary",
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-panel)",
          color: "var(--ink)",
          borderRadius: "var(--radius-lg, 8px)",
          border: "1px solid var(--line)",
          boxShadow: "var(--elevation-floating)",
          overflow: "hidden",
          margin: "16px",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{title}</h2>
          {description && (
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-2)" }}>
              {description}
            </p>
          )}
        </div>

        {children && <div style={{ padding: "16px 20px" }}>{children}</div>}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 20px",
            background: "var(--bg-app)",
            borderTop: "1px solid var(--line)",
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {confirmLabel && (
            <Button
              variant={confirmVariant}
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
