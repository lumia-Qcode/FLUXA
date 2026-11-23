import React from "react";
import { Block } from "../../../../shared/spec";

type QuoteBlock = Extract<Block, { type: "quote" }>;

interface Props {
  block: QuoteBlock;
}

export const QuoteBlockRenderer: React.FC<Props> = ({ block }) => {
  const text = block.text || (block as any).props?.text || (block as any).content || "";
  const attribution =
    block.attribution ||
    (block as any).props?.attribution ||
    (block as any).props?.author ||
    (block as any).author;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "1.5rem 2rem",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <blockquote
        style={{
          margin: 0,
          fontSize: "clamp(24px, 3.5vw, 42px)",
          fontStyle: "italic",
          fontWeight: 500,
          lineHeight: 1.4,
          fontFamily: "var(--theme-font-heading)",
          color: "var(--theme-text)",
          maxWidth: "1400px",
        }}
      >
        “{text}”
      </blockquote>

      {attribution && (
        <div
          style={{
            marginTop: "1.25rem",
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--theme-secondary)",
            fontFamily: "var(--theme-font-body)",
          }}
        >
          — {attribution}
        </div>
      )}
    </div>
  );
};
