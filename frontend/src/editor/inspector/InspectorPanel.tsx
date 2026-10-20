import React, { useState } from "react";
import { Panel } from "../../ui/Panel";
import { Tabs } from "../../ui/Tabs";
import { useDocument } from "../store/DocumentContext";
import { BlockInspector } from "./BlockInspector";
import { SlideInspector } from "./SlideInspector";
import { DataInspector } from "./DataInspector";
import { AnimateInspector } from "./AnimateInspector";
import { AskInspector } from "./AskInspector";

export const InspectorPanel: React.FC = () => {
  const { selectedSlide, selectedBlockIds } = useDocument();
  const [activeTab, setActiveTab] = useState("design");
  const [isWide, setIsWide] = useState(false);

  const activeBlock = selectedSlide?.blocks.find((b) => selectedBlockIds.includes(b.id)) || null;

  return (
    <Panel
      className="ui-inspector-panel"
      borderLeft
      style={{
        width: isWide && activeTab === "ask" ? "420px" : "300px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        transition: "width 200ms ease",
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

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {activeTab === "design" && (
          activeBlock ? <BlockInspector block={activeBlock} /> : <SlideInspector />
        )}

        {activeTab === "animate" && <AnimateInspector />}

        {activeTab === "data" && <DataInspector />}

        {activeTab === "ask" && (
          <AskInspector
            isWide={isWide}
            onToggleWide={() => setIsWide(!isWide)}
          />
        )}
      </div>
    </Panel>
  );
};
