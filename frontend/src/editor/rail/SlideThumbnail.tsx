import React, { useState } from "react";
import { Copy, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dataset, Slide, Variable } from "../../../../shared/spec";
import { SlideStage } from "../../rendering/SlideStage";
import { Theme } from "../../rendering/themes";
import { Menu, MenuItem } from "../../ui/Menu";

interface SlideThumbnailProps {
  slide: Slide;
  index: number;
  isActive: boolean;
  theme: Theme;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHideToggle: () => void;
  onNewSlideAfter: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export const SlideThumbnail: React.FC<SlideThumbnailProps> = ({
  slide,
  index,
  isActive,
  theme,
  datasets,
  variables,
  onSelect,
  onDuplicate,
  onDelete,
  onHideToggle,
  onNewSlideAfter,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const menuItems: MenuItem[] = [
    {
      id: "dup",
      label: "Duplicate slide",
      icon: <Copy size={13} />,
      onClick: onDuplicate,
    },
    {
      id: "add-after",
      label: "New slide below",
      icon: <Plus size={13} />,
      onClick: onNewSlideAfter,
    },
    {
      id: "hide",
      label: slide.hidden ? "Unhide slide" : "Hide slide",
      icon: <EyeOff size={13} />,
      onClick: onHideToggle,
    },
    { id: "div-1", label: "", divider: true },
    {
      id: "del",
      label: "Delete slide",
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: onDelete,
    },
  ];

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        className={`ui-slide-thumb-card ${isActive ? "is-active" : ""}`}
        style={{
          display: "flex",
          gap: "8px",
          padding: "6px",
          borderRadius: "var(--radius-sm, 4px)",
          background: isActive ? "var(--bg-app)" : "transparent",
          cursor: "pointer",
          userSelect: "none",
          position: "relative",
          outline: isActive ? "1.5px solid var(--signal)" : "1px solid transparent",
          transition: "background 80ms ease, outline 80ms ease",
        }}
      >
        {/* Slide Number */}
        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: isActive ? "var(--signal)" : "var(--ink-3)",
            fontWeight: 600,
            width: "16px",
            textAlign: "right",
            paddingTop: "2px",
          }}
        >
          {index + 1}
        </span>

        {/* 16:9 Thumbnail Frame */}
        <div
          style={{
            width: "140px",
            height: "78.75px", // 16:9 ratio
            background: "#FFFFFF",
            borderRadius: "2px",
            border: "1px solid var(--line)",
            overflow: "hidden",
            position: "relative",
            opacity: slide.hidden ? 0.45 : 1,
            pointerEvents: "none",
          }}
        >
          <SlideStage slide={slide} theme={theme} datasets={datasets} variables={variables} mode="thumbnail" />
        </div>
      </div>

      {contextMenu && (
        <Menu
          open={Boolean(contextMenu)}
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};
