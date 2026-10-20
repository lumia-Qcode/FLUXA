import React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  className = "",
}) => {
  return (
    <div
      role="tablist"
      className={`ui-tabs ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--line)",
        width: "100%",
        background: "var(--bg-panel)",
        padding: "0 4px",
      }}
    >
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "12px",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--ink)" : "var(--ink-2)",
              background: "transparent",
              border: "none",
              borderBottom: "2px solid",
              borderColor: isActive ? "var(--signal)" : "transparent",
              cursor: "pointer",
              marginBottom: "-1px",
              userSelect: "none",
              transition: "color 100ms ease, border-color 100ms ease",
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
