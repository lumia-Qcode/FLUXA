import React, { useEffect, useRef, useState } from "react";
import { Block, Dataset, Variable } from "../../../../shared/spec";
import { buildReactiveScope } from "../../runtime/reactiveEngine";

type TableBlock = Extract<Block, { type: "table" }>;

interface Props {
  block: TableBlock;
  dataset?: Dataset;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
}

export const TableBlockRenderer: React.FC<Props> = ({
  block,
  dataset,
  datasets = {},
  variables = {},
}) => {
  const { style = "plain", columns: propColumns } = block;

  const reactiveScope = React.useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  const activeDataset = dataset || (block.dataset ? datasets[block.dataset] : undefined);
  const datasetColumns = activeDataset?.columns?.map((c) => c.key) || [];
  const activeColumns =
    propColumns && propColumns.length > 0
      ? propColumns
      : datasetColumns.length > 0
      ? datasetColumns
      : [];

  // Use computed rows from reactiveScope if available
  const rows = activeDataset
    ? reactiveScope.datasets[activeDataset.id]?.rows || activeDataset.rows
    : []; // no dataset, no rows: never sample values

  // Track cell value changes to trigger flash animation
  const [flashedCells, setFlashedCells] = useState<Record<string, boolean>>({});
  const prevRowsRef = useRef<Record<string, any>[]>(rows);

  useEffect(() => {
    const prevRows = prevRowsRef.current;
    const changedKeys: Record<string, boolean> = {};

    rows.forEach((row: any, rIdx: number) => {
      const prevRow = prevRows[rIdx];
      if (!prevRow) return;

      activeColumns.forEach((col) => {
        if (row[col] !== prevRow[col]) {
          changedKeys[`${rIdx}_${col}`] = true;
        }
      });
    });

    prevRowsRef.current = rows;

    if (Object.keys(changedKeys).length > 0) {
      setFlashedCells(changedKeys);
      const timer = setTimeout(() => {
        setFlashedCells({});
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [rows, activeColumns]);

  const isStriped = style === "striped";
  const isRuled = style === "ruled";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        fontFamily: "var(--theme-font-body)",
      }}
      className="table-block-container block-table"
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "24px",
          lineHeight: 1.35,
          color: "var(--theme-text)",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "2px solid var(--theme-secondary, rgba(128, 128, 128, 0.3))",
              textAlign: "left",
            }}
          >
            {activeColumns.map((col) => (
              <th
                key={col}
                style={{
                  padding: "0.75rem 1rem",
                  fontWeight: 600,
                }}
              >
                {activeDataset?.columns?.find((c) => c.key === col)?.label || col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, rIdx: number) => (
            <tr
              key={rIdx}
              style={{
                backgroundColor:
                  isStriped && rIdx % 2 === 1
                    ? "rgba(128, 128, 128, 0.08)"
                    : "transparent",
                borderBottom:
                  isRuled || isStriped
                    ? "1px solid rgba(128, 128, 128, 0.15)"
                    : "none",
              }}
            >
              {activeColumns.map((col) => {
                const isFlashed = flashedCells[`${rIdx}_${col}`];
                return (
                  <td
                    key={col}
                    style={{
                      padding: "0.6rem 1rem",
                      backgroundColor: isFlashed ? "rgba(35, 82, 245, 0.25)" : "transparent",
                      transition: "background-color 0.4s ease",
                    }}
                  >
                    {String(row[col] ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {((block as any).props?.sourceNote || (activeDataset as any)?.citations?.length) && (
        <div style={{ fontSize: 15, marginTop: 8, color: "var(--ink-2, #4B5563)" }}>
          Source: {(block as any).props?.sourceNote || (activeDataset as any).citations.join("")}
        </div>
      )}
    </div>
  );
};
