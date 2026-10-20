import React from "react";

interface Props {
  type: string;
  id: string;
}

export const UnknownBlockRenderer: React.FC<Props> = ({ type, id }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(220, 38, 38, 0.08)",
        border: "1px dashed #DC2626",
        borderRadius: "6px",
        color: "#DC2626",
        fontSize: "13px",
        fontFamily: "monospace",
        padding: "1rem",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <span style={{ fontWeight: 700 }}>Unsupported Block</span>
      <span style={{ fontSize: "11px", opacity: 0.8, marginTop: "0.25rem" }}>
        Type: {type} | ID: {id}
      </span>
    </div>
  );
};
