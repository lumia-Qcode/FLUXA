import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Eye, Layout, Moon, Play, Plus, Search, Sun } from "lucide-react";
import { commands } from "./store/documentStore";
import { useDocument } from "./store/DocumentContext";

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  onPresent: () => void;
  onToggleThemeMode: () => void;
  isDarkMode: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  open,
  onClose,
  onPresent,
  onToggleThemeMode,
  isDarkMode,
}) => {
  const { doc, setSelectedSlideId, execute } = useDocument();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Build command list
  const allCommands = [
    {
      id: "present",
      label: "Present Deck",
      icon: <Play size={14} />,
      shortcut: "P",
      action: () => {
        onPresent();
        onClose();
      },
    },
    {
      id: "toggle-dark",
      label: isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: isDarkMode ? <Sun size={14} /> : <Moon size={14} />,
      action: () => {
        onToggleThemeMode();
        onClose();
      },
    },
    ...doc.slides.map((s, idx) => ({
      id: `jump-slide-${s.id}`,
      label: `Jump to Slide ${idx + 1}: ${s.title || "Untitled slide"}`,
      icon: <Eye size={14} />,
      action: () => {
        setSelectedSlideId(s.id);
        onClose();
      },
    })),
  ];

  const filtered = allCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          selected.action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "80px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--bg-panel)",
          color: "var(--ink)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg, 8px)",
          boxShadow: "var(--elevation-floating)",
          overflow: "hidden",
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Search size={16} color="var(--ink-3)" />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Type a command or search slides…"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "14px",
              fontFamily: "var(--font-sans)",
              color: "var(--ink)",
            }}
          />
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
            ESC
          </span>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: "300px", overflowY: "auto", padding: "6px" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--ink-3)", fontSize: "12px" }}>
              No commands found.
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm, 4px)",
                    background: isSelected ? "var(--bg-app)" : "transparent",
                    cursor: "pointer",
                    fontSize: "13px",
                    userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: isSelected ? "var(--signal)" : "var(--ink-2)", display: "flex" }}>
                      {cmd.icon}
                    </span>
                    <span>{cmd.label}</span>
                  </div>
                  {cmd.shortcut && (
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
                      {cmd.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
