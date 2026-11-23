import React from "react";
import { Block } from "../../../../shared/spec";

type ComparisonBlock = Extract<Block, { type: "comparison" }>;

interface Props {
  block: ComparisonBlock;
}

export const ComparisonBlockRenderer: React.FC<Props> = ({ block }) => {
  const columns =
    block.columns ||
    (block as any).props?.columns ||
    ((block as any).props?.leftTitle
      ? [
          {
            title: (block as any).props.leftTitle,
            items: (block as any).props.leftItems || [],
          },
          {
            title: (block as any).props.rightTitle || "Alternative",
            items: (block as any).props.rightItems || [],
          },
        ]
      : []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        gap: "2rem",
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
            borderRadius: "14px",
            padding: "2rem 2.25rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              fontWeight: 700,
              color: "var(--theme-text)",
              fontFamily: "var(--theme-font-heading)",
              borderBottom: "3px solid var(--theme-primary)",
              paddingBottom: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            {col.title}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {col.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  fontSize: "24px",
                  lineHeight: 1.5,
                  color: "var(--theme-text)",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--theme-primary, #2563EB)",
                    flexShrink: 0,
                    marginTop: 10,
                  }}
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
