import React from "react";
import * as Icons from "lucide-react";
import { Block } from "../../../../shared/spec";

type IconBlock = Extract<Block, { type: "icon" }>;

interface Props {
  block: IconBlock;
}

export const IconBlockRenderer: React.FC<Props> = ({ block }) => {
  const { name, color, w, h } = block;
  const iconSize = Math.min(w, h, 64);

  // Dynamic lookup from Lucide icons map
  const LucideIcon = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[name] || Icons.CircleDot;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: color || "var(--theme-primary)",
      }}
    >
      <LucideIcon size={iconSize} color={color || "currentColor"} />
    </div>
  );
};
