import React, { useState } from "react";
import {
  BarChart3,
  Code,
  Hash,
  Play,
  Sliders,
  Square,
  Table as TableIcon,
  Type,
} from "lucide-react";
import { Block } from "../../../../shared/spec";
import { Button } from "../../ui/Button";
import { Popover } from "../../ui/Popover";

interface InsertToolbarProps {
  onInsertBlock: (block: Block, dataset?: any) => void;
  tryItMode?: boolean;
  onToggleTryIt?: () => void;
}

export const InsertToolbar: React.FC<InsertToolbarProps> = ({
  onInsertBlock,
  tryItMode = false,
  onToggleTryIt,
}) => {
  const [chartPickerAnchor, setChartPickerAnchor] = useState<DOMRect | null>(null);

  const handleInsertText = () => {
    const newBlock: Block = {
      id: `block-text-${Date.now()}`,
      type: "text",
      role: "body",
      x: 200,
      y: 300,
      w: 600,
      h: 180,
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Click to write your content here." }],
          },
        ],
      },
      style: { fontSize: 24, align: "left" },
    };
    onInsertBlock(newBlock);
  };

  const handleInsertShape = () => {
    const newBlock: Block = {
      id: `block-shape-${Date.now()}`,
      type: "shape",
      x: 300,
      y: 300,
      w: 400,
      h: 240,
      shape: "rect",
      fill: { color: "#2352F5", opacity: 0.15 },
      stroke: { color: "#2352F5", width: 2 },
      radius: 8,
    };
    onInsertBlock(newBlock);
  };

  const handleInsertKpi = () => {
    const newBlock: Block = {
      id: `block-kpi-${Date.now()}`,
      type: "kpi",
      role: "kpi",
      x: 300,
      y: 260,
      w: 640,
      h: 300,
      value: "94.8%",
      label: "Customer Satisfaction Score",
      delta: 3.2,
    };
    onInsertBlock(newBlock);
  };

  const handleInsertChart = (kind: "bar" | "column" | "line" | "donut") => {
    const dsId = `ds_sample_${Date.now()}`;
    const sampleDataset = {
      id: dsId,
      name: "Sample Chart Data",
      source: "user",
      columns: [
        {"key": "label", "label": "Category", "type": "text"},
        {"key": "value", "label": "Value", "type": "number"},
      ],
      rows: [
        { label: "Product A", value: 45 },
        { label: "Product B", value: 78 },
        { label: "Product C", value: 62 },
        { label: "Product D", value: 91 },
      ],
    };

    const newBlock: Block = {
      id: `block-chart-${Date.now()}`,
      type: "chart",
      role: "chart",
      x: 240,
      y: 200,
      w: 800,
      h: 500,
      kind,
      dataset: dsId,
      xField: "label",
      series: [{ field: "value", label: "Volume" }],
      options: {},
    };

    onInsertBlock(newBlock, sampleDataset);
    setChartPickerAnchor(null);
  };

  const handleInsertControl = () => {
    const newBlock: Block = {
      id: `block-ctrl-${Date.now()}`,
      type: "control",
      x: 300,
      y: 400,
      w: 500,
      h: 90,
      control: "slider",
      label: "Target Capacity (%)",
      min: 0,
      max: 100,
      step: 5,
    };
    onInsertBlock(newBlock);
  };

  const handleInsertTable = () => {
    const dsId = `ds_table_${Date.now()}`;
    const sampleDataset = {
      id: dsId,
      name: "Table Data",
      source: "user",
      columns: [
        { key: "metric", label: "Metric", type: "text" },
        { key: "target", label: "Target", type: "number" },
        { key: "actual", label: "Actual", type: "number" },
      ],
      rows: [
        { metric: "Retention", target: 80, actual: 86 },
        { metric: "NPS", target: 50, actual: 64 },
        { metric: "Uptime", target: 99.9, actual: 99.95 },
      ],
    };

    const newBlock: Block = {
      id: `block-table-${Date.now()}`,
      type: "table",
      x: 240,
      y: 240,
      w: 700,
      h: 300,
      dataset: dsId,
      style: "ruled",
    };
    onInsertBlock(newBlock, sampleDataset);
  };

  const handleInsertHtml = () => {
    const newBlock: Block = {
      id: `block-html-${Date.now()}`,
      type: "html",
      x: 260,
      y: 200,
      w: 680,
      h: 360,
      code: {
        html: `<div class="card">\n  <h3>Interactive Widget</h3>\n  <p>Count: <span id="val">0</span></p>\n  <button id="btn">+ Increment</button>\n</div>`,
        css: `.card { padding: 1.5rem; background: rgba(35, 82, 245, 0.08); border-radius: 8px; border: 1px solid rgba(35, 82, 245, 0.2); }\nbutton { padding: 6px 14px; background: #2352F5; color: #fff; border: none; border-radius: 4px; cursor: pointer; }`,
        js: `let count = 0;\nconst valEl = document.getElementById("val");\ndocument.getElementById("btn").addEventListener("click", () => {\n  count++;\n  valEl.innerText = count;\n});`,
      },
    };
    onInsertBlock(newBlock);
  };

  return (
    <div
      className="ui-insert-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--line)",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--ink-3)",
            marginRight: "6px",
            letterSpacing: "0.02em",
          }}
        >
          INSERT
        </span>
        <Button size="sm" variant="ghost" icon={<Type size={14} />} onClick={handleInsertText}>
          Text
        </Button>
        <Button size="sm" variant="ghost" icon={<Square size={14} />} onClick={handleInsertShape}>
          Shape
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<BarChart3 size={14} />}
          onClick={(e) => setChartPickerAnchor(e.currentTarget.getBoundingClientRect())}
        >
          Chart ▾
        </Button>
        <Button size="sm" variant="ghost" icon={<Hash size={14} />} onClick={handleInsertKpi}>
          KPI
        </Button>
        <Button size="sm" variant="ghost" icon={<TableIcon size={14} />} onClick={handleInsertTable}>
          Table
        </Button>
        <Button size="sm" variant="ghost" icon={<Sliders size={14} />} onClick={handleInsertControl}>
          Control
        </Button>
        <Button size="sm" variant="ghost" icon={<Code size={14} />} onClick={handleInsertHtml}>
          Widget
        </Button>
      </div>

      {/* "Try it" mode toggle */}
      {onToggleTryIt && (
        <button
          type="button"
          onClick={onToggleTryIt}
          title={tryItMode ? "Exit Try-it mode (return to editing)" : "Try it: interact with live controls and widgets"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "4px",
            border: tryItMode ? "1px solid var(--signal)" : "1px solid var(--line)",
            background: tryItMode ? "var(--signal-weak)" : "transparent",
            color: tryItMode ? "var(--signal)" : "var(--ink-2)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <Play size={12} fill={tryItMode ? "currentColor" : "none"} />
          <span>{tryItMode ? "Try it: ON" : "Try it"}</span>
        </button>
      )}

      {/* Chart Kind Picker Popover */}
      {chartPickerAnchor && (
        <Popover
          open={Boolean(chartPickerAnchor)}
          anchorRect={chartPickerAnchor}
          onClose={() => setChartPickerAnchor(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "140px" }}>
            <Button size="sm" variant="ghost" onClick={() => handleInsertChart("bar")}>
              Bar Chart
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleInsertChart("column")}>
              Column Chart
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleInsertChart("line")}>
              Line Chart
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleInsertChart("donut")}>
              Donut Chart
            </Button>
          </div>
        </Popover>
      )}
    </div>
  );
};
