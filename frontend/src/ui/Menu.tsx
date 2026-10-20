import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

export interface MenuProps {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const Menu: React.FC<MenuProps> = ({ open, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 999995,
        minWidth: "160px",
        background: "var(--bg-panel)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-md, 6px)",
        boxShadow: "var(--elevation-floating)",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`div-${idx}`}
              style={{
                height: "1px",
                background: "var(--line)",
                margin: "4px 0",
              }}
            />
          );
        }

        return (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "6px 8px",
              fontSize: "12px",
              fontFamily: "var(--font-sans)",
              color: item.danger ? "var(--danger)" : item.disabled ? "var(--ink-3)" : "var(--ink)",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm, 4px)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              textAlign: "left",
              userSelect: "none",
              transition: "background 80ms ease",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = item.danger ? "var(--danger-weak)" : "var(--bg-app)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {item.icon && (
                <span style={{ display: "inline-flex", color: item.danger ? "var(--danger)" : "var(--ink-2)" }}>
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-3)",
                  marginLeft: "12px",
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
};
