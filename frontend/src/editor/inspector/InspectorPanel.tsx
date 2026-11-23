import React, { useState, useRef } from "react";
import { Panel } from "../../ui/Panel";
import { Tabs } from "../../ui/Tabs";
import { useDocument } from "../store/DocumentContext";
import { BlockInspector } from "./BlockInspector";
import { SlideInspector } from "./SlideInspector";
import { DataInspector } from "./DataInspector";
import { AnimateInspector } from "./AnimateInspector";
import { AskInspector } from "./AskInspector";
import { RehearseInspector } from "./RehearseInspector";

export const InspectorPanel: React.FC = () => {
  const { selectedSlide, selectedBlockIds } = useDocument();
  // Opens on Design and stays on whatever tab the user picks while they move between slides
  // (a demo rule used to force the Data tab on every deck's third slide, closing Copilot).
  const [activeTab, setActiveTab] = useState("design");
  const [isWide, setIsWide] = useState(false);
  const previousTabRef = useRef<string>("design");

  React.useEffect(() => {
    if (activeTab !== "ask") {
      previousTabRef.current = activeTab;
    }
  }, [activeTab]);

  React.useEffect(() => {
    const handleOpen = () => setActiveTab("ask");
    window.addEventListener("fluxa:open-copilot", handleOpen);
    return () => window.removeEventListener("fluxa:open-copilot", handleOpen);
  }, []);

  const activeBlock = selectedSlide?.blocks.find((b) => selectedBlockIds.includes(b.id)) || null;

  const handleBackFromCopilot = () => {
    setActiveTab(previousTabRef.current || "design");
  };

  return (
    <Panel
      className="ui-inspector-panel"
      borderLeft
      style={{
        width: activeTab === "ask" ? (isWide ? "420px" : "380px") : activeTab === "rehearse" ? "340px" : "300px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        transition: "width 200ms ease",
        backgroundColor: activeTab === "ask" ? "#FFFFFF" : undefined,
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* 4 Tabs - Hidden when Copilot is active so Copilot ChatHeader sits at the top */}
      {activeTab !== "ask" && (
        <Tabs
          activeId={activeTab}
          onChange={setActiveTab}
          items={[
            { id: "design", label: "Design" },
            { id: "animate", label: "Animate" },
            { id: "data", label: "Data" },
            { id: "rehearse", label: "Rehearse" },
            { id: "ask", label: "Copilot" },
          ]}
        />
      )}

      <div
        style={{
          flex: 1,
          overflowY: activeTab === "ask" ? "hidden" : "auto",
          display: "flex",
          flexDirection: "column",
          height: activeTab === "ask" ? "100%" : undefined,
        }}
      >
        {activeTab === "design" && (
          activeBlock ? <BlockInspector block={activeBlock} /> : <SlideInspector />
        )}

        {activeTab === "animate" && <AnimateInspector />}

        {activeTab === "data" && <DataInspector />}

        {activeTab === "rehearse" && <RehearseInspector />}

        {activeTab === "ask" && (
          <AskInspector
            isWide={isWide}
            onToggleWide={() => setIsWide(!isWide)}
            onBack={handleBackFromCopilot}
          />
        )}
      </div>
    </Panel>
  );
};
