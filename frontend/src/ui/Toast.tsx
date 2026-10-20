import React, { createContext, useCallback, useContext, useState } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type?: "info" | "ok" | "warn" | "danger";
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = "info", action, duration = 5000 }: Omit<ToastItem, "id">) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const item: ToastItem = { id, message, type, action, duration };

      setToasts((prev) => [...prev, item]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Floating Toasts Viewport */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 999999,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "var(--bg-panel)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm, 4px)",
              padding: "8px 12px",
              fontSize: "13px",
              boxShadow: "var(--elevation-floating)",
              minWidth: "260px",
              maxWidth: "400px",
            }}
          >
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--signal)",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: "3px",
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink-3)",
                cursor: "pointer",
                padding: "2px",
                fontSize: "14px",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
