import React from "react";
import { Block } from "../../../../shared/spec";
import { useTextFit } from "../textFit";

type TextBlock = Extract<Block, { type: "text" }>;

interface Props {
  block: TextBlock;
}

export const TextBlockRenderer: React.FC<Props> = ({ block }) => {
  const isTitle = block.role === "title";
  const initialSize = block.style?.fontSize || (isTitle ? 48 : 22);
  const minSize = isTitle ? 24 : 12;

  const { containerRef, fontSize } = useTextFit(
    block.doc,
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

  // Render Tiptap/ProseMirror doc nodes or fallback text
  const renderDocContent = () => {
    if (!block.doc?.content || block.doc.content.length === 0) {
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
          <ul key={i} style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
            {node.content?.map((item: any, j: number) => {
              const text = item.content?.map((p: any) => p.content?.map((c: any) => c.text).join("")).join("") || "";
              return <li key={j} style={{ margin: "0.4rem 0" }}>{text}</li>;
            })}
          </ul>
        );
      }

      // Default paragraph
      const text = node.content?.map((c: any) => c.text).join("") || "";
      return (
        <p key={i} style={{ margin: "0 0 0.5rem 0" }}>
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
