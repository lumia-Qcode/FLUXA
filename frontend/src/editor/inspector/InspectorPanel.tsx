import React, { useState } from "react";
import { Panel } from "../../ui/Panel";
import { Tabs } from "../../ui/Tabs";
import { useDocument } from "../store/DocumentContext";
import { BlockInspector } from "./BlockInspector";
import { SlideInspector } from "./SlideInspector";
import { DataInspector } from "./DataInspector";
import { AnimateInspector } from "./AnimateInspector";

export const InspectorPanel: React.FC = () => {
  const { selectedSlide, selectedBlockIds } = useDocument();
  const [activeTab, setActiveTab] = useState("design");

  const activeBlock = selectedSlide?.blocks.find((b) => selectedBlockIds.includes(b.id)) || null;

  return (
    <Panel
      className="ui-inspector-panel"
      borderLeft
      style={{
        width: "300px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      {/* 4 Tabs */}
      <Tabs
        activeId={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "design", label: "Design" },
          { id: "animate", label: "Animate" },
          { id: "data", label: "Data" },
          { id: "ask", label: "Ask" },
        ]}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "design" && (
          activeBlock ? <BlockInspector block={activeBlock} /> : <SlideInspector />
        )}

        {activeTab === "animate" && <AnimateInspector />}

        {activeTab === "data" && <DataInspector />}

        {activeTab === "ask" && (
          <div style={{ padding: "16px", color: "var(--ink-2)", fontSize: "13px" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--ink)" }}>FLUXA Assistant</p>
            <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.5 }}>
              The multi-provider AI copilot engine will be enabled in Phase 5.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
};
