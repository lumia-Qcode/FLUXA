import React from "react";
import { Block } from "../../../../shared/spec";
import { useTextFit } from "../textFit";

type TextBlock = Extract<Block, { type: "text" }>;

interface Props {
  block: TextBlock;
}

/** Text with citation marks like "[3][7]" set smaller and in the theme accent, so claims stay readable. */
export const CitedText: React.FC<{ text: string }> = ({ text }) => {
  const parts = String(text).split(/((?:\[\d+\])+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^(?:\[\d+\])+$/.test(part) ? (
          <span key={i} className="citation-mark" style={{ fontSize: "0.68em", fontWeight: 600, color: "var(--theme-primary, #2563EB)", whiteSpace: "nowrap", verticalAlign: "0.25em" }}>
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

export const TextBlockRenderer: React.FC<Props> = ({ block }) => {
  const isTitle = block.role === "title";
  const initialSize = block.style?.fontSize || (isTitle ? 52 : 28);
  const minSize = isTitle ? 26 : 14;

  const { containerRef, fontSize } = useTextFit(
    block.doc || (block as any).bullets || (block as any).content,
    block.h,
    initialSize,
    minSize
  );

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    fontSize: `${fontSize}px`,
    fontWeight: block.style?.fontWeight || (isTitle ? 700 : 400),
    color: block.style?.color || "inherit",
    textAlign: block.style?.align || "left",
    lineHeight: block.style?.lineHeight || (isTitle ? 1.2 : 1.6),
    letterSpacing: block.style?.letterSpacing || (isTitle ? "-0.01em" : "normal"),
    fontFamily: isTitle ? "var(--theme-font-heading)" : "var(--theme-font-body)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  // Render Tiptap/ProseMirror doc nodes, direct bullets, or fallback text
  const renderDocContent = () => {
    // 1. Direct bullets support from AI spec or block properties
    const rawBullets =
      (block as any).bullets ||
      (block as any).props?.bullets ||
      (block as any).style?.bullets;

    if (rawBullets && Array.isArray(rawBullets) && rawBullets.length > 0) {
      const plain = (block as any).props?.listStyle === "none" || (block as any).style?.listStyle === "none";
      if (plain) {
        // Reference lists: the lines already carry their [n] numbers.
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55em", width: "100%" }}>
            {rawBullets.map((item: any, j: number) => (
              <div key={j} style={{ lineHeight: 1.4, paddingLeft: "2.2em", textIndent: "-2.2em", overflowWrap: "anywhere" }}>
                <CitedText text={typeof item === "string" ? item : String(item?.text || "")} />
              </div>
            ))}
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45em", width: "100%" }}>
          {rawBullets.map((item: any, j: number) => {
            const textStr = typeof item === "string" ? item : String(item?.text || JSON.stringify(item));
            return (
              <div
                key={j}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6em",
                  padding: "0.6em 0.8em",
                  background: "var(--theme-card-bg, rgba(255, 255, 255, 0.06))",
                  border: "1px solid var(--theme-card-border, rgba(255, 255, 255, 0.12))",
                  borderLeft: "4px solid var(--theme-primary, #38BDF8)",
                  borderRadius: "0.5em",
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    width: "1.1em",
                    height: "1.1em",
                    borderRadius: "50%",
                    background: "var(--theme-primary, #2563EB)",
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.55em",
                    lineHeight: 1,
                    padding: "0.45em",
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: "0.25em",
                  }}
                >
                  {j + 1}
                </span>
                <span
                  style={{
                    fontSize: "inherit",
                    lineHeight: 1.45,
                    color: "var(--theme-text, inherit)",
                    fontWeight: 500,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <CitedText text={textStr} />
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    if (!block.doc?.content || block.doc.content.length === 0) {
      const fallback = (block as any).content || (block as any).props?.text || (block as any).text;
      if (fallback) {
        return (
          <p style={{ margin: 0, marginBottom: "0.25em", lineHeight: 1.55 }}>
            {fallback}
          </p>
        );
      }
      return null;
    }

    return block.doc.content.map((node, i) => {
      if (node.type === "heading") {
        const text = node.content?.map((c: any) => c.text).join("") || "";
        return (
          <h2 key={i} style={{ margin: "0 0 0.5rem 0", fontSize: "1.1em", fontWeight: 700 }}>
            {text}
          </h2>
        );
      }

      if (node.type === "bulletList") {
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", margin: "8px 0" }}>
            {node.content?.map((item: any, j: number) => {
              const text = item.content?.map((p: any) => p.content?.map((c: any) => c.text).join("")).join("") || "";
              return (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "16px",
                    padding: "16px 20px",
                    background: "rgba(128, 128, 128, 0.05)",
                    border: "1px solid rgba(128, 128, 128, 0.14)",
                    borderRadius: "12px",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "var(--theme-primary, #2563EB)",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {j + 1}
                  </span>
                  <span style={{ fontSize: "inherit", lineHeight: 1.5, color: "inherit", flex: 1 }}>
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }

      // Default paragraph
      const text = node.content?.map((c: any) => c.text).join("") || "";
      return (
        <p key={i} style={{ margin: "0 0 0.5rem 0", lineHeight: 1.55 }}>
          {text}
        </p>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      style={style}
      dir="auto"
      className={`block-text ${isTitle ? "is-title" : ""}`}
    >
      {renderDocContent()}
    </div>
  );
};
