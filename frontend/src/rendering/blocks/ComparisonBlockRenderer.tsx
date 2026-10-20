import React from "react";
import { Block } from "../../../../shared/spec";

type ComparisonBlock = Extract<Block, { type: "comparison" }>;

interface Props {
  block: ComparisonBlock;
}

export const ComparisonBlockRenderer: React.FC<Props> = ({ block }) => {
  const { columns = [] } = block;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        gap: "1.5rem",
        fontFamily: "var(--theme-font-body)",
        overflow: "hidden",
      }}
    >
      {columns.map((col, idx) => (
        <div
          key={idx}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "rgba(128, 128, 128, 0.05)",
            border: "1px solid rgba(128, 128, 128, 0.18)",
            borderRadius: "6px",
            padding: "1.25rem 1.5rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--theme-text)",
              fontFamily: "var(--theme-font-heading)",
              borderBottom: "2px solid var(--theme-primary)",
              paddingBottom: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            {col.title}
          </div>

          <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--theme-text)" }}>
            {col.items.map((item, itemIdx) => (
              <li key={itemIdx} style={{ margin: "0.5rem 0", fontSize: "14px", lineHeight: 1.5 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
