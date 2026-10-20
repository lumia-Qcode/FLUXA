import React from "react";
import { Dialog } from "../ui/Dialog";
import { Kbd } from "../ui/Kbd";

interface ShortcutSheetModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { section: "Navigation & Modes", items: [
    { label: "Present full screen", keys: ["P"] },
    { label: "Slide sorter grid", keys: ["G"] },
    { label: "Command bar", keys: ["Ctrl", "K"] },
    { label: "Keyboard shortcuts", keys: ["?"] },
  ]},
  { section: "Canvas & Selection", items: [
    { label: "Nudge selected block 1px", keys: ["Arrows"] },
    { label: "Nudge selected block 10px", keys: ["Shift", "Arrows"] },
    { label: "Duplicate block", keys: ["Ctrl", "D"] },
    { label: "Copy block", keys: ["Ctrl", "C"] },
    { label: "Paste block", keys: ["Ctrl", "V"] },
    { label: "Delete block", keys: ["Del"] },
  ]},
  { section: "History & Edit", items: [
    { label: "Undo last action", keys: ["Ctrl", "Z"] },
    { label: "Redo action", keys: ["Ctrl", "Shift", "Z"] },
    { label: "Fit zoom to canvas", keys: ["Ctrl", "0"] },
  ]},
  { section: "In Present Mode", items: [
    { label: "Next slide", keys: ["Right", "Space"] },
    { label: "Previous slide", keys: ["Left"] },
    { label: "Toggle blank screen", keys: ["B"] },
    { label: "Toggle fullscreen", keys: ["F"] },
    { label: "Exit present mode", keys: ["Esc"] },
  ]},
];

export const ShortcutSheetModal: React.FC<ShortcutSheetModalProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} title="Keyboard Shortcuts" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "400px", overflowY: "auto" }}>
        {SHORTCUTS.map((sec) => (
          <div key={sec.section} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
              {sec.section.toUpperCase()}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {sec.items.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "var(--ink)",
                    padding: "3px 0",
                  }}
                >
                  <span>{item.label}</span>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {item.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
};
