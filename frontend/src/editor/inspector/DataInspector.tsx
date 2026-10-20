import React, { useRef, useState } from "react";
import { Plus, Trash2, Upload, Sliders, Database } from "lucide-react";
import { Dataset, Variable } from "../../../../shared/spec";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { useDocument } from "../store/DocumentContext";
import { commands } from "../store/documentStore";
import { buildReactiveScope } from "../../runtime/reactiveEngine";

export const DataInspector: React.FC = () => {
  const { doc, execute } = useDocument();
  const [subTab, setSubTab] = useState<"datasets" | "variables">("datasets");

  const datasets = doc.datasets || {};
  const variables = doc.variables || {};

  const datasetList = Object.values(datasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    datasetList[0]?.id || ""
  );

  const activeDataset: Dataset | undefined =
    datasets[selectedDatasetId] || datasetList[0];

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    });
  };

  // CSV Import File Handler
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

      execute("Import CSV", (draft) => {
        const target = draft.datasets[activeDataset.id];
        if (!target) return;
        target.columns = headers.map((h, i) => ({
          key: h.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || `col_${i}`,
          label: h,
          type: "text",
        }));
        target.rows = parsedRows;
        target.source = "import";
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={handleCsvImport}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Upload size={12} />}
                    onClick={() => fileInputRef.current?.click()}
                    title="Import CSV"
                  >
                    CSV
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
