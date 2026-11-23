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
import { Field } from "../../ui/Field";
import { useDocument } from "../store/DocumentContext";
import { commands } from "../store/documentStore";

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
  // #8 Live Demo Generator
  const { doc, selectedSlide, execute, setSelectedSlideId } = useDocument();
  // #9 Presentation Memory: reuse slides from the org's other decks
  const [reuseAnchor, setReuseAnchor] = useState<DOMRect | null>(null);
  const [reuseQ, setReuseQ] = useState("");
  const [reuseBusy, setReuseBusy] = useState(false);
  const [reuseResults, setReuseResults] = useState<any[] | null>(null);

  const searchReuse = async (q: string) => {
    setReuseBusy(true);
    try {
      const res = await fetch(`/api/presentations/${doc.id}/related-slides?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      setReuseResults(res.ok ? data.slides || [] : []);
    } finally {
      setReuseBusy(false);
    }
  };

  const reuseSlide = (item: any) => {
    const stamp = Date.now().toString(36);
    const clone = JSON.parse(JSON.stringify(item.spec));
    const renames: Record<string, string> = {};
    const incoming: Record<string, any> = item.datasets || {};
    for (const key of Object.keys(incoming)) {
      const clash = doc.datasets?.[key] && JSON.stringify(doc.datasets[key]) !== JSON.stringify(incoming[key]);
      renames[key] = clash ? `${key}_${stamp}` : key;
    }
    clone.id = `slide-reuse-${stamp}`;
    clone.hidden = false;
    delete clone.dbId;
    (clone.blocks || []).forEach((b: any, i: number) => {
      b.id = `${b.type || "blk"}-reuse-${stamp}-${i}`;
      if (b.dataset && renames[b.dataset]) b.dataset = renames[b.dataset];
      if (b.props?.dataset && renames[b.props.dataset]) b.props.dataset = renames[b.props.dataset];
    });
    const at = Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlide?.id)) + 1;
    execute(`Reuse slide from "${item.deckTitle}"`, (draft) => {
      for (const [key, ds] of Object.entries(incoming)) {
        draft.datasets[renames[key]] = { ...(ds as any), id: renames[key] };
      }
      draft.slides.splice(at, 0, clone);
      draft.slides.forEach((sl, i) => {
        sl.order = i;
      });
    });
    setSelectedSlideId(clone.id);
    setReuseAnchor(null);
  };

  // #13 Decision Rooms
  const [decisionAnchor, setDecisionAnchor] = useState<DOMRect | null>(null);
  const [decisionQ, setDecisionQ] = useState("");
  const [decisionOpts, setDecisionOpts] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const decisionOptions = decisionOpts.split(/[,;]/).map((o) => o.trim()).filter(Boolean).slice(0, 4);

  const handleDecision = async () => {
    if (decisionQ.trim().length < 3 || decisionOptions.length < 2) return;
    setDecisionBusy(true);
    setDecisionError("");
    try {
      const res = await fetch(`/api/presentations/${doc.id}/ai/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: decisionQ.trim(), options: decisionOptions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't prepare the decision room.");
      const at = Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlide?.id)) + 1;
      execute("Add decision room", commands.addSlide(at, data.slide));
      setSelectedSlideId(data.slide.id);
      setDecisionAnchor(null);
      setDecisionQ("");
      setDecisionOpts("");
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "Couldn't prepare the decision room.");
    } finally {
      setDecisionBusy(false);
    }
  };
  const [demoAnchor, setDemoAnchor] = useState<DOMRect | null>(null);
  const [demoAsk, setDemoAsk] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");

  const handleGenerateDemo = async () => {
    if (demoAsk.trim().length < 3) return;
    setDemoBusy(true);
    setDemoError("");
    try {
      const titleBlock: any = selectedSlide?.blocks.find((b: any) => b.role === "title");
      const res = await fetch(`/api/presentations/${doc.id}/ai/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: demoAsk.trim(), slideTitle: titleBlock?.content || titleBlock?.text || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't build the demo.");
      // Each demo gets its own slide after the current one, so it never covers existing content.
      const stamp = Date.now();
      const title = String(data.title || "Live demo");
      const demoSlide: any = {
        id: `slide-demo-${stamp}`,
        layout: "blank",
        notes: data.explanation || "",
        transition: { effect: "fade", duration: 300 },
        blocks: [
          {
            id: `blk-demo-title-${stamp}`,
            type: "text",
            role: "title",
            x: 100,
            y: 60,
            w: 1720,
            h: 100,
            content: title,
            doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: title }] }] },
            style: { fontSize: 44, fontWeight: 700 },
          },
          { id: `block-demo-${stamp}`, type: "html", name: title, x: 100, y: 190, w: 1720, h: 820, code: data.code },
        ],
      };
      const at = Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlide?.id)) + 1;
      execute("Add live demo", commands.addSlide(at, demoSlide));
      setSelectedSlideId(demoSlide.id);
      setDemoAnchor(null);
      setDemoAsk("");
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Couldn't build the demo.");
    } finally {
      setDemoBusy(false);
    }
  };

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
        <Button
          size="sm"
          variant="ghost"
          icon={<Play size={14} />}
          onClick={(e) => setDemoAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          Demo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Sliders size={14} />}
          onClick={(e) => setDecisionAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          Decision
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<TableIcon size={14} />}
          onClick={(e) => {
            setReuseAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
            if (!reuseResults) searchReuse("");
          }}
        >
          Reuse
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

      {demoAnchor && (
        <Popover open anchorRect={demoAnchor} onClose={() => !demoBusy && setDemoAnchor(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 300 }}>
            <Field
              label="Demonstrate…"
              value={demoAsk}
              autoFocus
              placeholder="e.g. a compound interest calculator with sliders"
              onChange={(e) => setDemoAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateDemo();
                }
              }}
            />
            <Button size="sm" variant="primary" onClick={handleGenerateDemo} disabled={demoBusy || demoAsk.trim().length < 3}>
              {demoBusy ? "Building the demo…" : "Generate demo"}
            </Button>
            {demoError && <div role="alert" style={{ fontSize: 12, color: "var(--danger, #C4262E)" }}>{demoError}</div>}
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Runs in a sandbox with no network access. Use “Try it” to interact.</div>
          </div>
        </Popover>
      )}

      {reuseAnchor && (
        <Popover open anchorRect={reuseAnchor} onClose={() => setReuseAnchor(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 340 }}>
            <Field
              label="Reuse a slide from your past decks"
              value={reuseQ}
              placeholder="Search, or leave empty for slides related to this deck"
              onChange={(e) => setReuseQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchReuse(reuseQ);
                }
              }}
            />
            {reuseBusy && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Searching…</div>}
            {reuseResults && !reuseBusy && reuseResults.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}>No related slides found. Try other words.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {(reuseResults || []).map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => reuseSlide(item)}
                  style={{ textAlign: "left", border: "1px solid var(--line)", borderRadius: 4, background: "var(--bg-panel)", padding: "6px 8px", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{item.slideTitle || "Untitled slide"}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>From “{item.deckTitle}”</div>
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}

      {decisionAnchor && (
        <Popover open anchorRect={decisionAnchor} onClose={() => !decisionBusy && setDecisionAnchor(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 300 }}>
            <Field label="Decision" value={decisionQ} autoFocus placeholder="e.g. Which rollout plan should we fund?" onChange={(e) => setDecisionQ(e.target.value)} />
            <Field label="Options (comma-separated, 2 to 4)" value={decisionOpts} placeholder="e.g. Radiology first, Scribes first, All at once" onChange={(e) => setDecisionOpts(e.target.value)} />
            <Button size="sm" variant="primary" onClick={handleDecision} disabled={decisionBusy || decisionQ.trim().length < 3 || decisionOptions.length < 2}>
              {decisionBusy ? "Projecting outcomes…" : "Create decision room"}
            </Button>
            {decisionError && <div role="alert" style={{ fontSize: 12, color: "var(--danger, #C4262E)" }}>{decisionError}</div>}
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Adds a slide comparing each option's projected consequences. Go Live to let the audience vote.</div>
          </div>
        </Popover>
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
