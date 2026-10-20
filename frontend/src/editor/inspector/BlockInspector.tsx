import React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Block } from "../../../../shared/spec";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { NumberField } from "../../ui/NumberField";
import { Select } from "../../ui/Select";
import { commands } from "../store/documentStore";
import { useDocument } from "../store/DocumentContext";

interface BlockInspectorProps {
  block: Block;
}

export const BlockInspector: React.FC<BlockInspectorProps> = ({ block }) => {
  const { doc, selectedSlide, execute, setSelectedBlockIds } = useDocument();

  if (!selectedSlide) return null;

  const updateProp = (patch: Partial<Block>) => {
    execute("Update Block", commands.updateBlockProps(selectedSlide.id, block.id, patch));
  };

  const handleBringForward = () => {
    const ids = selectedSlide.blocks.map((b) => b.id);
    const i = ids.indexOf(block.id);
    if (i < ids.length - 1) {
      ids.splice(i, 1);
      ids.splice(i + 1, 0, block.id);
      execute("Bring Forward", commands.reorderBlocks(selectedSlide.id, ids));
    }
  };

  const handleSendBackward = () => {
    const ids = selectedSlide.blocks.map((b) => b.id);
    const i = ids.indexOf(block.id);
    if (i > 0) {
      ids.splice(i, 1);
      ids.splice(i - 1, 0, block.id);
      execute("Send Backward", commands.reorderBlocks(selectedSlide.id, ids));
    }
  };

  const handleDelete = () => {
    execute("Delete Block", commands.removeBlock(selectedSlide.id, block.id));
    setSelectedBlockIds([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px" }}>
      {/* Block Type & ID Badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>
          {block.type} Block
        </span>
        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={handleDelete} title="Delete">
          Delete
        </Button>
      </div>

      {/* Geometry / Transform */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          TRANSFORM
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <NumberField label="X" value={block.x} onChange={(val) => updateProp({ x: Math.round(val) })} />
          <NumberField label="Y" value={block.y} onChange={(val) => updateProp({ y: Math.round(val) })} />
          <NumberField label="W" value={block.w} min={20} onChange={(val) => updateProp({ w: Math.round(val) })} />
          <NumberField label="H" value={block.h} min={20} onChange={(val) => updateProp({ h: Math.round(val) })} />
        </div>
        <NumberField
          label="Rotation (°)"
          value={block.rotation || 0}
          onChange={(val) => updateProp({ rotation: Math.round(val) })}
        />
      </div>

      {/* Text Style Options */}
      {block.type === "text" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            TYPOGRAPHY
          </span>
          <NumberField
            label="Font Size (px)"
            value={block.style?.fontSize || 24}
            min={10}
            max={120}
            onChange={(val) =>
              updateProp({
                style: { ...(block.style || {}), fontSize: val },
              })
            }
          />
          <Select
            label="Alignment"
            value={block.style?.align || "left"}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            onChange={(align: any) =>
              updateProp({
                style: { ...(block.style || {}), align },
              })
            }
          />
        </div>
      )}

      {/* Chart Style Options */}
      {block.type === "chart" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            CHART OPTIONS
          </span>
          <Select
            label="Chart Kind"
            value={block.kind}
            options={[
              { value: "bar", label: "Bar" },
              { value: "column", label: "Column" },
              { value: "line", label: "Line" },
              { value: "donut", label: "Donut" },
              { value: "pie", label: "Pie" },
              { value: "stacked", label: "Stacked" },
            ]}
            onChange={(kind: any) => updateProp({ kind })}
          />
        </div>
      )}

      {/* KPI Style Options */}
      {block.type === "kpi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            KPI METRIC
          </span>
          <Field
            label="Value"
            value={typeof block.value === "string" ? block.value : String(block.value || "")}
            onChange={(e) => updateProp({ value: e.target.value })}
          />
          <Field
            label="Label"
            value={block.label}
            onChange={(e) => updateProp({ label: e.target.value })}
          />
          <NumberField
            label="Delta (%)"
            value={typeof block.delta === "number" ? block.delta : 0}
            onChange={(delta) => updateProp({ delta })}
          />
        </div>
      )}

      {/* Shape Options */}
      {block.type === "shape" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
            SHAPE APPEARANCE
          </span>
          <Select
            label="Shape"
            value={block.shape}
            options={[
              { value: "rect", label: "Rectangle" },
              { value: "circle", label: "Circle" },
              { value: "line", label: "Line" },
            ]}
            onChange={(shape: any) => updateProp({ shape })}
          />
          <Field
            label="Fill Color"
            type="color"
            value={block.fill?.color || "#2352F5"}
            onChange={(e) =>
              updateProp({
                fill: { ...(block.fill || {}), color: e.target.value },
              })
            }
          />
          <NumberField
            label="Corner Radius (px)"
            value={block.radius || 0}
            min={0}
            max={100}
            onChange={(radius) => updateProp({ radius })}
          />
        </div>
      )}

      {/* Layer Arrange */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          LAYER ORDER
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          <Button size="sm" variant="secondary" icon={<ArrowUp size={13} />} onClick={handleBringForward}>
            Forward
          </Button>
          <Button size="sm" variant="secondary" icon={<ArrowDown size={13} />} onClick={handleSendBackward}>
            Backward
          </Button>
        </div>
      </div>
    </div>
  );
};
