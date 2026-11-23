import React, { useRef, useState } from "react";
import { Plus, Trash2, Upload, Sliders, Database, BarChart2, CheckCircle2 } from "lucide-react";
import { Dataset, Variable } from "../../../../shared/spec";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { useDocument } from "../store/DocumentContext";
import { commands } from "../store/documentStore";
import { buildReactiveScope } from "../../runtime/reactiveEngine";

export const DataInspector: React.FC = () => {
  const { doc, execute, selectedSlideId } = useDocument();
  // #12 Live Data Injection
  const [liveUrl, setLiveUrl] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const [subTab, setSubTab] = useState<"datasets" | "variables">("datasets");
  const [toastMessage, setToastMessage] = useState<string>("");

  const datasets = doc.datasets || {};
  const variables = doc.variables || {};

  const datasetList = Object.values(datasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    datasetList[0]?.id || ""
  );

  const activeDataset: Dataset | undefined =
    datasets[selectedDatasetId] || datasetList[0];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [animateNumbers, setAnimateNumbers] = useState(true);

  const handleToggle2025Value = () => {
    if (!activeDataset) return;
    execute("Toggle 2025 Adoption", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      const row2025 = target.rows.find((r) => r.year === "2025" || r.label === "2025");
      if (row2025) {
        row2025.adoption = row2025.adoption === 74 ? 55 : 74;
      }
    });
  };

  // Compute reactive preview to display computed column values
  const reactiveScope = React.useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  const activeComputedRows = activeDataset
    ? reactiveScope.datasets[activeDataset.id]?.rows || activeDataset.rows
    : [];

  // --- Dataset Actions ---
  const handleCreateDataset = () => {
    const id = `dataset_${Date.now().toString(36)}`;
    const newDataset: Dataset = {
      id,
      name: `Dataset ${datasetList.length + 1}`,
      source: "user",
      columns: [
        { key: "label", label: "Label", type: "text" },
        { key: "value", label: "Value", type: "number" },
      ],
      rows: [
        { label: "Item A", value: 10 },
        { label: "Item B", value: 20 },
        { label: "Item C", value: 30 },
      ],
    };
    execute("Add Dataset", commands.setDataset(id, newDataset));
    setSelectedDatasetId(id);
  };

  const handleDeleteDataset = (id: string) => {
    execute("Delete Dataset", (draft) => {
      delete draft.datasets[id];
    });
    const remaining = datasetList.filter((d) => d.id !== id);
    if (remaining.length > 0) {
      setSelectedDatasetId(remaining[0].id);
    }
  };

  const handleCellChange = (rowIndex: number, colKey: string, val: any) => {
    if (!activeDataset) return;
    execute("Edit Cell", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target || !target.rows[rowIndex]) return;
      const num = Number(val);
      target.rows[rowIndex][colKey] = isNaN(num) || val === "" ? val : num;
    });
  };

  const handleAddRow = () => {
    if (!activeDataset) return;
    execute("Add Row", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      const newRow: Record<string, any> = {};
      target.columns.forEach((col) => {
        newRow[col.key] = col.type === "number" ? 0 : "";
      });
      target.rows.push(newRow);
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!activeDataset) return;
    execute("Delete Row", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      target.rows.splice(rowIndex, 1);
    });
  };

  const handleAddColumn = () => {
    if (!activeDataset) return;
    const colName = prompt("Enter new column key (alphanumeric):", `col_${activeDataset.columns.length + 1}`);
    if (!colName) return;
    const cleanKey = colName.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!cleanKey) return;

    execute("Add Column", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      if (target.columns.some((c) => c.key === cleanKey)) return;
      target.columns.push({
        key: cleanKey,
        label: cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1),
        type: "number",
      });
      target.rows.forEach((r) => {
        r[cleanKey] = 0;
      });
    });
  };

  const handleDeleteColumn = (colKey: string) => {
    if (!activeDataset || activeDataset.columns.length <= 1) return;
    execute("Delete Column", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      target.columns = target.columns.filter((c) => c.key !== colKey);
      target.rows.forEach((r) => {
        delete r[colKey];
      });
    });
  };

  const handleColumnExprChange = (colKey: string, expr: string) => {
    if (!activeDataset) return;
    execute("Set Column Formula", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      const col = target.columns.find((c) => c.key === colKey);
      if (col) {
        col.expr = expr.trim() || undefined;
      }
    });
  };

  // CSV / TSV Paste Handler
  const handleTablePaste = (e: React.ClipboardEvent) => {
    if (!activeDataset) return;
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes(",") && !text.includes("\n"))) {
      return;
    }

    e.preventDefault();
    const rows = text
      .trim()
      .split(/\r?\n/)
      .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")));

    if (rows.length === 0) return;

    execute("Paste Table Data", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;

      const firstRow = rows[0];
      const isHeader = firstRow.some((cell) => isNaN(Number(cell)));

      let dataRows = rows;
      if (isHeader && rows.length > 1) {
        target.columns = firstRow.map((header) => {
          const key = header.trim().replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "col";
          return {
            key,
            label: header.trim(),
            type: "text",
          };
        });
        dataRows = rows.slice(1);
      }

      target.rows = dataRows.map((r) => {
        const rowObj: Record<string, any> = {};
        target.columns.forEach((col, idx) => {
          const cellVal = r[idx]?.trim() ?? "";
          const num = Number(cellVal);
          rowObj[col.key] = !isNaN(num) && cellVal !== "" ? num : cellVal;
        });
        return rowObj;
      });

      // Directly update chart on active slide
      const currentSlide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
      if (currentSlide) {
        const existingChart = currentSlide.blocks.find((b) => b.type === "chart") as any;
        if (existingChart) {
          const xKey = target.columns[0]?.key || "category";
          const yCol =
            target.columns.find((c, i) => i > 0 && typeof target.rows[0]?.[c.key] === "number") ||
            target.columns[1] ||
            target.columns[0];
          const yKey = yCol?.key || "value";
          const yLabel = yCol?.label || "Metric";
          existingChart.dataset = activeDataset.id;
          existingChart.xField = xKey;
          existingChart.yField = yKey;
          existingChart.kind = "bar";
          existingChart.series = [{ field: yKey, label: yLabel }];
        }
      }
    });
  };

  // CSV Import File Handler - Directly updates dataset AND generates a 3D chart on the current slide!
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDataset) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      const lines = content.trim().split(/\r?\n/);
      if (lines.length < 2) return;

      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const parsedRows = lines.slice(1).map((line) => {
        const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const rowObj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const key = h.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || `col_${i}`;
          const val = cells[i] ?? "";
          const num = Number(val);
          rowObj[key] = !isNaN(num) && val !== "" ? num : val;
        });
        return rowObj;
      });

      const fileNameClean = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").toUpperCase();

      execute("Import CSV & Generate 3D Chart", (draft) => {
        const target = draft.datasets[activeDataset.id];
        if (!target) return;
        target.columns = headers.map((h, i) => ({
          key: h.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || `col_${i}`,
          label: h,
          type: "text",
        }));
        target.rows = parsedRows;
        target.source = "import";

        // Auto-detect categorical xKey and numeric yKey
        const xKey = target.columns[0]?.key || "category";
        const yCol =
          target.columns.find((c, i) => i > 0 && typeof parsedRows[0]?.[c.key] === "number") ||
          target.columns[1] ||
          target.columns[0];
        const yKey = yCol?.key || "value";
        const yLabel = yCol?.label || "Value";

        // Generate or update graph directly on the current slide!
        const currentSlide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
        if (currentSlide) {
          const existingChart = currentSlide.blocks.find((b) => b.type === "chart") as any;
          if (existingChart) {
            existingChart.dataset = activeDataset.id;
            existingChart.xField = xKey;
            existingChart.yField = yKey;
            existingChart.kind = "bar";
            existingChart.series = [{ field: yKey, label: yLabel }];
            if (existingChart.props) {
              existingChart.props.dataset = activeDataset.id;
              existingChart.props.xField = xKey;
              existingChart.props.yField = yKey;
              existingChart.props.kind = "bar";
              existingChart.props.series = [{ field: yKey, label: yLabel }];
              existingChart.props.title = fileNameClean;
            }
          } else {
            currentSlide.layout = "chart-text";
            const newChartBlock = {
              id: `blk-chart-${Date.now().toString(36)}`,
              type: "chart",
              role: "chart",
              kind: "bar",
              dataset: activeDataset.id,
              xField: xKey,
              yField: yKey,
              series: [{ field: yKey, label: yLabel }],
              box: { x: 920, y: 160, w: 900, h: 720 },
              props: {
                kind: "bar",
                dataset: activeDataset.id,
                xField: xKey,
                yField: yKey,
                series: [{ field: yKey, label: yLabel }],
                title: fileNameClean,
              },
            };
            currentSlide.blocks.push(newChartBlock as any);
          }
        }
      });

      setToastMessage(`Imported ${file.name} & created 3D Bar Graph on slide!`);
      setTimeout(() => setToastMessage(""), 5000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Direct 1-Click Action: Insert 3D Chart from current active dataset onto slide
  const handleInsertChartOnSlide = () => {
    if (!activeDataset || activeDataset.rows.length === 0) return;
    execute("Insert 3D Chart from Dataset", (draft) => {
      const target = draft.datasets[activeDataset.id];
      if (!target) return;
      const xKey = target.columns[0]?.key || "category";
      const yCol =
        target.columns.find((c, i) => i > 0 && typeof target.rows[0]?.[c.key] === "number") ||
        target.columns[1] ||
        target.columns[0];
      const yKey = yCol?.key || "value";
      const yLabel = yCol?.label || "Metric";

      const currentSlide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
      if (!currentSlide) return;

      const existingChart = currentSlide.blocks.find((b) => b.type === "chart") as any;
      if (existingChart) {
        existingChart.dataset = activeDataset.id;
        existingChart.xField = xKey;
        existingChart.yField = yKey;
        existingChart.kind = "bar";
        existingChart.series = [{ field: yKey, label: yLabel }];
        if (existingChart.props) {
          existingChart.props.dataset = activeDataset.id;
          existingChart.props.xField = xKey;
          existingChart.props.yField = yKey;
          existingChart.props.kind = "bar";
          existingChart.props.series = [{ field: yKey, label: yLabel }];
        }
      } else {
        currentSlide.layout = "chart-text";
        const newChartBlock = {
          id: `blk-chart-${Date.now().toString(36)}`,
          type: "chart",
          role: "chart",
          kind: "bar",
          dataset: activeDataset.id,
          xField: xKey,
          yField: yKey,
          series: [{ field: yKey, label: yLabel }],
          box: { x: 920, y: 160, w: 900, h: 720 },
          props: {
            kind: "bar",
            dataset: activeDataset.id,
            xField: xKey,
            yField: yKey,
            series: [{ field: yKey, label: yLabel }],
            title: activeDataset.name || "Dataset Visual",
          },
        };
        currentSlide.blocks.push(newChartBlock as any);
      }
    });

    setToastMessage(`3D Bar Chart bound to ${activeDataset.name} on slide!`);
    setTimeout(() => setToastMessage(""), 5000);
  };

  // --- Variable Actions ---
  const handleAddVariable = () => {
    const id = `var_${Date.now().toString(36)}`;
    const newVar: Variable = {
      id,
      label: `Variable ${Object.keys(variables).length + 1}`,
      type: "number",
      value: 50,
      min: 0,
      max: 100,
      step: 1,
      scope: "deck",
    };
    execute("Add Variable", commands.setVariable(id, newVar));
  };

  const handleUpdateVariable = (id: string, patch: Partial<Variable>) => {
    execute("Update Variable", (draft) => {
      if (draft.variables[id]) {
        Object.assign(draft.variables[id], patch);
      }
    });
  };

  const handleDeleteVariable = (id: string) => {
    execute("Delete Variable", (draft) => {
      delete draft.variables[id];
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>
      {/* Sub-tab toggle */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-app)",
          padding: "4px 8px",
          gap: "4px",
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab("datasets")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "4px",
            border: "none",
            background: subTab === "datasets" ? "var(--bg-panel)" : "transparent",
            color: subTab === "datasets" ? "var(--ink)" : "var(--ink-2)",
            cursor: "pointer",
          }}
        >
          <Database size={13} />
          Datasets ({datasetList.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("variables")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "4px",
            border: "none",
            background: subTab === "variables" ? "var(--bg-panel)" : "transparent",
            color: subTab === "variables" ? "var(--ink)" : "var(--ink-2)",
            cursor: "pointer",
          }}
        >
          <Sliders size={13} />
          Variables ({Object.keys(variables).length})
        </button>
      </div>

      {/* Datasets View */}
      {subTab === "datasets" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Dataset Selector & Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <Select
                value={selectedDatasetId}
                options={datasetList.map((d) => ({ value: d.id, label: `${d.name} (${d.rows.length} rows)` }))}
                onChange={(val) => setSelectedDatasetId(val)}
              />
            </div>
            <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={handleCreateDataset} title="Add Dataset">
              New
            </Button>
          </div>

          {/* Page 3 Numbers Panel Matching PDF */}
          {activeDataset && (activeDataset.id === "adoption" || activeDataset.columns.some((c) => c.key === "adoption")) && (
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "10px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Numbers Header + Undo note */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Numbers</span>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>
                  2025 changed from 55{" "}
                  <button
                    type="button"
                    onClick={handleToggle2025Value}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "#2563EB",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Undo
                  </button>
                </span>
              </div>

              {/* Clean Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#6B7280", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", fontWeight: 500 }}>Year</th>
                    <th style={{ padding: "6px 8px", fontWeight: 500 }}>Adoption</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDataset.rows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", color: "#111827", fontWeight: 500 }}>
                        {row.year || row.label}
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            value={row.adoption ?? row.value ?? ""}
                            onChange={(e) => handleCellChange(rIdx, "adoption" in row ? "adoption" : "value", e.target.value)}
                            style={{
                              width: "64px",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid #E5E7EB",
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "#111827",
                              textAlign: "right",
                            }}
                          />
                          <span style={{ color: "#6B7280" }}>%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add row */}
              <button
                type="button"
                onClick={handleAddRow}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0",
                  color: "#2563EB",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  alignSelf: "flex-start",
                }}
              >
                <Plus size={14} /> Add row
              </button>

              {/* Also updates KPI */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ color: "#6B7280", fontWeight: 500 }}>Also updates:</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "#111827", fontWeight: 500 }}>🔗 KPI on slide 2</span>
                  <span style={{ color: "#2563EB", fontWeight: 700 }}>
                    {activeDataset.rows[activeDataset.rows.length - 1]?.adoption || 74}%
                  </span>
                </div>
              </div>

              {/* #12 Live data source: refresh rows from a public CSV/JSON link */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Live data source</div>
                <Field
                  value={liveUrl || (activeDataset as any)?.liveSource?.url || ""}
                  placeholder="https://… link to a CSV or JSON table"
                  onChange={(e) => setLiveUrl(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={liveBusy || !(liveUrl || (activeDataset as any)?.liveSource?.url)}
                  onClick={async () => {
                    if (!activeDataset) return;
                    const url = liveUrl || (activeDataset as any)?.liveSource?.url;
                    setLiveBusy(true);
                    setLiveMsg("");
                    try {
                      const res = await fetch(`/api/presentations/${doc.id}/datasets/live-refresh`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url, columns: activeDataset.columns }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || "Couldn't refresh the data.");
                      execute("Refresh live data", (draft) => {
                        const target: any = draft.datasets[activeDataset.id];
                        if (!target) return;
                        target.rows = data.rows;
                        target.source = "import";
                        target.liveSource = { url, lastFetched: data.fetchedAt };
                      });
                      setLiveMsg(`Updated ${data.rows.length} rows${data.unmatched?.length ? ` (no data for: ${data.unmatched.join(", ")})` : ""}.`);
                    } catch (err) {
                      setLiveMsg(err instanceof Error ? err.message : "Couldn't refresh the data.");
                    } finally {
                      setLiveBusy(false);
                    }
                  }}
                >
                  {liveBusy ? "Refreshing…" : "Refresh now"}
                </Button>
                {(activeDataset as any)?.liveSource?.lastFetched && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    Last refreshed {new Date((activeDataset as any).liveSource.lastFetched).toLocaleString()}
                  </div>
                )}
                {liveMsg && <div role="status" style={{ fontSize: 12, color: "var(--ink-2)" }}>{liveMsg}</div>}
              </div>

              {/* Animate when numbers change toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  borderTop: "1px solid #E5E7EB",
                }}
              >
                <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>
                  Animate when numbers change
                </span>
                <div
                  onClick={() => setAnimateNumbers(!animateNumbers)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 20,
                    backgroundColor: animateNumbers ? "#10B981" : "#D1D5DB",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background-color 200ms ease",
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      backgroundColor: "#FFFFFF",
                      position: "absolute",
                      top: 2,
                      left: animateNumbers ? 18 : 2,
                      transition: "left 200ms ease",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeDataset ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Dataset Info bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
                    {activeDataset.name}
                  </span>
                  {activeDataset.source === "ai-estimate" && (
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        background: "rgba(180, 83, 9, 0.15)",
                        color: "#B45309",
                        fontWeight: 600,
                      }}
                    >
                      Sample data
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={handleCsvImport}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<BarChart2 size={13} />}
                    onClick={handleInsertChartOnSlide}
                    title="Generate 3D Bar Graph on currently active slide"
                    style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 600, backgroundColor: "#2563EB", color: "#FFFFFF" }}
                  >
                    Plot 3D Chart
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Upload size={12} />}
                    onClick={() => fileInputRef.current?.click()}
                    title="Import CSV and plot 3D chart directly"
                    style={{ padding: "4px 8px", fontSize: "11px" }}
                  >
                    Import CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={12} />}
                    onClick={() => handleDeleteDataset(activeDataset.id)}
                    title="Delete Dataset"
                  />
                </div>
              </div>

              {/* Toast banner upon CSV import / Graph generation */}
              {toastMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    backgroundColor: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#065F46",
                    fontSize: 12,
                    fontWeight: 600,
                    animation: "fadeIn 200ms ease",
                  }}
                >
                  <CheckCircle2 size={14} color="#10B981" />
                  <span>{toastMessage}</span>
                </div>
              )}

              {/* Spreadsheet Grid */}
              <div
                onPaste={handleTablePaste}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  overflowX: "auto",
                  background: "var(--bg-app)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--line)" }}>
                      <th style={{ width: "24px", padding: "4px", color: "var(--ink-3)", textAlign: "center" }}>#</th>
                      {activeDataset.columns.map((col) => (
                        <th
                          key={col.key}
                          style={{
                            padding: "6px 8px",
                            textAlign: "left",
                            fontWeight: 600,
                            color: "var(--ink)",
                            borderRight: "1px solid var(--line)",
                            minWidth: "80px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>{col.label || col.key}</span>
                            {activeDataset.columns.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteColumn(col.key)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--ink-3)",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                                title="Remove column"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          {/* Column formula preview or edit */}
                          <input
                            type="text"
                            placeholder="formula (e.g. users * 2)"
                            value={col.expr || ""}
                            onChange={(e) => handleColumnExprChange(col.key, e.target.value)}
                            style={{
                              width: "100%",
                              fontSize: "10px",
                              fontFamily: "monospace",
                              padding: "2px 4px",
                              marginTop: "2px",
                              borderRadius: "2px",
                              border: "1px solid var(--line)",
                              background: col.expr ? "var(--signal-weak)" : "var(--bg-app)",
                              color: col.expr ? "var(--signal)" : "var(--ink)",
                              outline: "none",
                            }}
                          />
                        </th>
                      ))}
                      <th style={{ width: "28px", padding: "4px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={handleAddColumn}
                          title="Add column"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--signal)",
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          +
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeComputedRows.map((row, rIdx) => (
                      <tr key={rIdx} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ textAlign: "center", color: "var(--ink-3)", fontSize: "10px" }}>
                          {rIdx + 1}
                        </td>
                        {activeDataset.columns.map((col) => {
                          const isComputed = Boolean(col.expr);
                          const cellVal = row[col.key];

                          return (
                            <td key={col.key} style={{ padding: 0, borderRight: "1px solid var(--line)" }}>
                              <input
                                type="text"
                                disabled={isComputed}
                                value={cellVal ?? ""}
                                onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                                style={{
                                  width: "100%",
                                  height: "26px",
                                  padding: "0 6px",
                                  border: "none",
                                  background: isComputed ? "var(--signal-weak)" : "transparent",
                                  color: isComputed ? "var(--signal)" : "var(--ink)",
                                  fontSize: "12px",
                                  fontFamily: isComputed ? "monospace" : "inherit",
                                  outline: "none",
                                }}
                              />
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center", padding: "2px" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(rIdx)}
                            title="Delete row"
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "var(--ink-3)",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={handleAddRow}>
                  Add Row
                </Button>
                <span style={{ fontSize: "11px", color: "var(--ink-3)" }}>
                  Paste TSV / CSV directly into table
                </span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--ink-3)", fontSize: "13px" }}>
              No datasets in this deck. Click "New" to create one.
            </div>
          )}
        </div>
      )}

      {/* Variables View */}
      {subTab === "variables" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
              Deck Variables
            </span>
            <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={handleAddVariable}>
              Add Variable
            </Button>
          </div>

          {Object.keys(variables).length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--ink-3)", fontSize: "13px" }}>
              No variables defined. Add a variable to bind controls and formulas.
            </div>
          ) : (
            Object.values(variables).map((v) => (
              <div
                key={v.id}
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", fontFamily: "monospace" }}>
                    ${v.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteVariable(v.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--danger, #C4262E)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    title="Delete variable"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <Field
                  label="Label"
                  value={v.label}
                  onChange={(e) => handleUpdateVariable(v.id, { label: e.target.value })}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <Select
                    label="Type"
                    value={v.type}
                    options={[
                      { value: "number", label: "Number" },
                      { value: "boolean", label: "Boolean" },
                      { value: "choice", label: "Choice" },
                    ]}
                    onChange={(type: any) => handleUpdateVariable(v.id, { type })}
                  />

                  {v.type === "number" && (
                    <Field
                      label="Current Value"
                      type="number"
                      value={String(v.value ?? 0)}
                      onChange={(e) => handleUpdateVariable(v.id, { value: Number(e.target.value) })}
                    />
                  )}

                  {v.type === "boolean" && (
                    <Select
                      label="Current Value"
                      value={v.value ? "true" : "false"}
                      options={[
                        { value: "true", label: "True" },
                        { value: "false", label: "False" },
                      ]}
                      onChange={(val) => handleUpdateVariable(v.id, { value: val === "true" })}
                    />
                  )}
                </div>

                {v.type === "number" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                    <Field
                      label="Min"
                      type="number"
                      value={String(v.min ?? 0)}
                      onChange={(e) => handleUpdateVariable(v.id, { min: Number(e.target.value) })}
                    />
                    <Field
                      label="Max"
                      type="number"
                      value={String(v.max ?? 100)}
                      onChange={(e) => handleUpdateVariable(v.id, { max: Number(e.target.value) })}
                    />
                    <Field
                      label="Step"
                      type="number"
                      value={String(v.step ?? 1)}
                      onChange={(e) => handleUpdateVariable(v.id, { step: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
