import React, { useState } from "react";
import { Block } from "../../../../shared/spec";
import { BlockRenderer } from "./BlockRenderer";

interface TabsBlock {
  id: string;
  type: "tabs";
  x: number;
  y: number;
  w: number;
  h: number;
  tabs: { id: string; label: string; blocks: Block[] }[];
}

interface Props {
  block: TabsBlock | any;
  datasets?: any;
  variables?: any;
  interactive?: boolean;
}

export const TabsBlockRenderer: React.FC<Props> = ({
  block,
  datasets,
  variables,
  interactive = true,
}) => {
  const tabs = block.tabs || [
    { id: "tab-1", label: "Overview", blocks: [] },
    { id: "tab-2", label: "Details", blocks: [] },
  ];

  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || "");

  const activeTab = tabs.find((t: any) => t.id === activeTabId) || tabs[0];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(128, 128, 128, 0.05)",
        border: "1px solid var(--line, rgba(128, 128, 128, 0.2))",
        borderRadius: "6px",
        overflow: "hidden",
      }}
      className="tabs-block-container block-tabs"
      onClick={(e) => {
        // Prevent click from advancing present slide
        e.stopPropagation();
      }}
    >
      {/* Tab headers */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--line, rgba(128, 128, 128, 0.2))",
          background: "var(--bg-app, rgba(0,0,0,0.02))",
        }}
      >
        {tabs.map((tab: any) => {
          const isActive = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={!interactive}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                border: "none",
                borderBottom: isActive ? "2px solid var(--signal, #2352F5)" : "2px solid transparent",
                background: isActive ? "var(--bg-panel, #FFFFFF)" : "transparent",
                color: isActive ? "var(--ink, #111827)" : "var(--ink-2, #6B7280)",
                cursor: interactive ? "pointer" : "default",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div style={{ flex: 1, position: "relative", padding: "12px", overflow: "auto" }}>
        {(activeTab?.blocks || []).map((childBlock: Block) => (
          <div
            key={childBlock.id}
            style={{
              position: "absolute",
              left: `${childBlock.x}px`,
              top: `${childBlock.y}px`,
              width: `${childBlock.w}px`,
              height: `${childBlock.h}px`,
            }}
          >
            <BlockRenderer
              block={childBlock}
              datasets={datasets}
              variables={variables}
              interactive={interactive}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
