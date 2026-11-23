import React, { useState } from "react";
import { api } from "../../api";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import type { SketchfabModel } from "../../rendering/blocks/SketchfabEmbed";

interface Props {
  current?: SketchfabModel | null;
  onPick: (model: SketchfabModel | null) => void;
}

/** Find a real 3D model for the slide ("heart", "jet engine") in Sketchfab's public library. */
export const Model3DSearch: React.FC<Props> = ({ current, onPick }) => {
  const [query, setQuery] = useState(current?.query || "");
  const [results, setResults] = useState<SketchfabModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await api.searchModels3d(q);
      setResults(data.models || []);
      if (!data.models?.length) setMessage("No 3D models found. Try a simpler word, like \"heart\" or \"car\".");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Field
        label="Find a 3D model"
        value={query}
        placeholder="e.g. human heart, jet engine, solar panel"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            search();
          }
        }}
      />
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" variant="primary" onClick={search} disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search 3D library"}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={() => onPick(null)}>
            Remove 3D model
          </Button>
        )}
      </div>
      {current && (
        <div style={{ fontSize: "11px", color: "var(--ink-secondary, #94A3B8)" }}>
          Showing: {current.name}
          {current.author ? ` by ${current.author}` : ""}
        </div>
      )}
      {message && <div style={{ fontSize: "12px", color: "var(--ink-secondary, #94A3B8)" }}>{message}</div>}
      {results.length > 0 && (
        <div role="list" aria-label="3D models" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          {results.map((m) => (
            <button
              key={m.uid}
              type="button"
              role="listitem"
              title={`${m.name}${m.author ? ` by ${m.author}` : ""}${m.license ? ` (${m.license})` : ""}`}
              onClick={() => onPick({ ...m, query: query.trim() })}
              style={{
                padding: 0,
                border: current?.uid === m.uid ? "2px solid var(--signal, #3B82F6)" : "1px solid var(--line, rgba(255,255,255,0.12))",
                borderRadius: "8px",
                overflow: "hidden",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {m.thumbnail ? (
                <img src={m.thumbnail} alt="" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "16 / 10" }} />
              )}
              <div
                style={{
                  padding: "4px 6px",
                  fontSize: "11px",
                  color: "var(--ink, #E5E7EB)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
