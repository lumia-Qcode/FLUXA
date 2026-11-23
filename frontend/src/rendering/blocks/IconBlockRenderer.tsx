import React, { useEffect, useState } from "react";
import { Block } from "../../../../shared/spec";

type IconBlock = Extract<Block, { type: "icon" }>;
type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

interface Props {
  block: IconBlock;
}

/** "TrendingUp" / "trending-up" / "trendingUp" -> "trending-up" (lucide's file names). */
export function toIconKey(name: string): string {
  return (name || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

const cache = new Map<string, IconComponent>();

async function loadIcon(name: string): Promise<IconComponent> {
  const key = toIconKey(name);
  const hit = cache.get(key);
  if (hit) return hit;
  // One small chunk per icon, fetched on first use, instead of bundling all ~2,000 icons (D3).
  const { default: imports } = await import("lucide-react/dynamicIconImports");
  const map = imports as Record<string, () => Promise<{ default: IconComponent }>>;
  const load = map[key] || map["circle-dot"];
  const icon = (await load()).default;
  cache.set(key, icon);
  return icon;
}

export const IconBlockRenderer: React.FC<Props> = ({ block }) => {
  const { name, color, w, h } = block;
  const iconSize = Math.min(w, h, 64);
  const [Icon, setIcon] = useState<IconComponent | null>(() => cache.get(toIconKey(name)) || null);

  useEffect(() => {
    let alive = true;
    loadIcon(name)
      .then((c) => alive && setIcon(() => c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name]);

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
      {Icon ? <Icon size={iconSize} color={color || "currentColor"} /> : <span style={{ width: iconSize, height: iconSize }} />}
    </div>
  );
};
