import React from "react";
import { Block, Dataset } from "../../../../shared/spec";

type TableBlock = Extract<Block, { type: "table" }>;

interface Props {
  block: TableBlock;
  dataset?: Dataset;
}

export const TableBlockRenderer: React.FC<Props> = ({ block, dataset }) => {
  const { style = "plain", columns: propColumns } = block;

  const datasetColumns = dataset?.columns?.map((c) => c.key) || [];
  const activeColumns =
    propColumns && propColumns.length > 0
      ? propColumns
      : datasetColumns.length > 0
      ? datasetColumns
      : ["col1", "col2", "col3"];

  const rows = dataset?.rows || [
    { col1: "Item A", col2: "Category 1", col3: 150 },
    { col1: "Item B", col2: "Category 2", col3: 280 },
    { col1: "Item C", col2: "Category 3", col3: 420 },
  ];

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
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px",
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
                  textTransform: "capitalize",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
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
              {activeColumns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: "0.6rem 1rem",
                  }}
                >
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
