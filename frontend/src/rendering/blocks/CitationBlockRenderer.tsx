import React from "react";
import { Block } from "../../../../shared/spec";

interface Props {
  block: Block | any;
  interactive?: boolean;
}

/**
 * Per-slide source footnote: the short references cited on this slide ("[2] Stiles (2010): ...").
 * Each entry opens the actual retrieved source. Nothing is shown when a slide cites nothing;
 * there is no placeholder citation.
 */
export const CitationBlockRenderer: React.FC<Props> = ({ block, interactive = true }) => {
  const citations: string[] = (block.citations || block.props?.citations || []).filter(
    (c: unknown) => typeof c === "string" && c.trim()
  );
  const links: string[] = block.props?.links || [];
  if (citations.length === 0) return null;

  return (
    <div
      className="slide-sources"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        paddingTop: "10px",
        borderTop: "1px solid var(--theme-card-border, rgba(128, 128, 128, 0.35))",
        boxSizing: "border-box",
        fontSize: "15px",
        lineHeight: 1.35,
        color: "var(--ink-2, #4B5563)",
        fontFamily: "var(--theme-font-body, sans-serif)",
        overflow: "hidden",
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0, color: "var(--ink, inherit)" }}>Sources</span>
      <span style={{ display: "flex", flexWrap: "wrap", columnGap: "18px", rowGap: "2px", minWidth: 0 }}>
        {citations.map((cite, i) => {
          const href = links[i];
          const label = <span style={{ overflowWrap: "anywhere" }}>{cite}</span>;
          return href && interactive ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "inherit", textDecoration: "none", maxWidth: "100%" }}
              title={href}
            >
              {label}
            </a>
          ) : (
            <span key={i} style={{ maxWidth: "100%" }}>
              {label}
            </span>
          );
        })}
      </span>
    </div>
  );
};
