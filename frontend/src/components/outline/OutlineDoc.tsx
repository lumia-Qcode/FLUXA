import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, GripVertical, Loader2, Plus, RefreshCw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import type { OutlineItem } from "./previewSpec";

export interface Source {
  title?: string;
  url?: string;
  source?: string;
}

function hostOf(s: Source): string {
  if (s.url) {
    try {
      return new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      /* not a URL */
    }
  }
  return s.source || s.title || "Source";
}

export interface OutlineDocProps {
  deckTitle: string;
  onDeckTitleChange: (t: string) => void;
  meta: string[];
  items: OutlineItem[];
  layoutName: (id?: string) => string;
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<OutlineItem>) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (idx: number) => void;
  onInsertAfter: (idx: number) => void;
  onRegenerate: (idx: number) => void;
  regeneratingIdx: number | null;
  maxItems: number;
  sources?: Source[];
  disabled?: boolean;
}

export const OutlineDoc: React.FC<OutlineDocProps> = ({
  deckTitle,
  onDeckTitleChange,
  meta,
  items,
  layoutName,
  selectedIdx,
  onSelect,
  onUpdate,
  onMove,
  onDelete,
  onInsertAfter,
  onRegenerate,
  regeneratingIdx,
  maxItems,
  sources = [],
  disabled,
}) => {
  const titleRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Move focus after inserts/reorders (Notion-style editing).
  useEffect(() => {
    if (focusIdx === null) return;
    titleRefs.current[focusIdx]?.focus();
    setFocusIdx(null);
  }, [focusIdx, items.length]);

  const copy = async (idx: number) => {
    const it = items[idx];
    try {
      await navigator.clipboard.writeText(`${idx + 1}. ${it.title}${it.purpose ? `\n- ${it.purpose}` : ""}`);
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
    } catch {
      setCopiedIdx(null);
    }
  };

  const onTitleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if (e.altKey && e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      onMove(idx, idx - 1);
      setFocusIdx(idx - 1);
    } else if (e.altKey && e.key === "ArrowDown" && idx < items.length - 1) {
      e.preventDefault();
      onMove(idx, idx + 1);
      setFocusIdx(idx + 1);
    } else if (!e.altKey && e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      titleRefs.current[idx - 1]?.focus();
    } else if (!e.altKey && e.key === "ArrowDown" && idx < items.length - 1) {
      e.preventDefault();
      titleRefs.current[idx + 1]?.focus();
    } else if (e.key === "Enter" && items.length < maxItems && !disabled) {
      e.preventDefault();
      onInsertAfter(idx);
      setFocusIdx(idx + 1);
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  const shownSources = sources.filter((s) => s && (s.url || s.title || s.source)).slice(0, 8);

  return (
    <section className="fx-paper fx-doc" aria-label="Outline document">
      <label htmlFor="deck-title" className="fx-sr-only">
        Deck title
      </label>
      <input
        id="deck-title"
        className="fx-doc-title"
        value={deckTitle}
        onChange={(e) => onDeckTitleChange(e.target.value)}
        disabled={disabled}
      />
      <div className="fx-doc-meta">
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>

      <ol className="fx-rows">
        {items.map((item, idx) => {
          const selected = idx === selectedIdx;
          const fb = item._feedback ?? null;
          return (
            <li
              key={item._key ?? idx}
              className={`fx-row ${selected ? "is-selected" : ""} ${dragIdx === idx ? "is-dragging" : ""} ${
                overIdx === idx && dragIdx !== null && dragIdx !== idx ? "is-drop" : ""
              }`}
              onFocusCapture={() => onSelect(idx)}
              onMouseDown={() => onSelect(idx)}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                setOverIdx(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx) onMove(dragIdx, idx);
                setDragIdx(null);
                setOverIdx(null);
              }}
            >
              <button
                type="button"
                className="fx-handle"
                draggable={!disabled}
                aria-label={`Drag slide ${idx + 1} to reorder`}
                title="Drag to reorder"
                onDragStart={(e) => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(idx));
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              >
                <GripVertical size={16} />
              </button>
              <span className="fx-num" aria-hidden="true">
                {idx + 1}
              </span>

              <div className="fx-row-main">
                <textarea
                  ref={(el) => {
                    titleRefs.current[idx] = el;
                  }}
                  className="fx-row-title"
                  rows={1}
                  value={item.title}
                  aria-label={`Slide ${idx + 1} title`}
                  disabled={disabled}
                  onChange={(e) => onUpdate(idx, { title: e.target.value.replace(/\n/g, " ") })}
                  onKeyDown={(e) => onTitleKey(e, idx)}
                />
                <div className="fx-row-point-wrap">
                  <textarea
                    className="fx-row-point"
                    rows={1}
                    value={item.purpose || ""}
                    placeholder="Add the key point for this slide"
                    aria-label={`Slide ${idx + 1} key point`}
                    disabled={disabled}
                    onChange={(e) => onUpdate(idx, { purpose: e.target.value })}
                  />
                </div>
                <div className="fx-row-tags">
                  <span className="fx-tag is-accent">{layoutName(item.layout)}</span>
                  {item.visual && item.visual !== "none" && <span className="fx-tag">{item.visual}</span>}
                </div>
              </div>

              <div className="fx-row-actions">
                <button type="button" className="fx-icon" onClick={() => copy(idx)} aria-label={copiedIdx === idx ? `Slide ${idx + 1} copied` : `Copy slide ${idx + 1}`} title="Copy">
                  {copiedIdx === idx ? <Check size={15} /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  className="fx-icon"
                  onClick={() => onRegenerate(idx)}
                  disabled={disabled || regeneratingIdx !== null}
                  aria-label={regeneratingIdx === idx ? `Regenerating slide ${idx + 1}` : `Regenerate slide ${idx + 1}`}
                  title="Regenerate"
                >
                  {regeneratingIdx === idx ? <Loader2 size={15} className="fx-spin" /> : <RefreshCw size={15} />}
                </button>
                <button
                  type="button"
                  className="fx-icon"
                  aria-pressed={fb === "up"}
                  aria-label={`Good slide ${idx + 1}`}
                  title="Good"
                  onClick={() => onUpdate(idx, { _feedback: fb === "up" ? null : "up" })}
                >
                  <ThumbsUp size={15} />
                </button>
                <button
                  type="button"
                  className="fx-icon"
                  aria-pressed={fb === "down"}
                  aria-label={`Needs work, slide ${idx + 1}`}
                  title="Needs work"
                  onClick={() => onUpdate(idx, { _feedback: fb === "down" ? null : "down" })}
                >
                  <ThumbsDown size={15} />
                </button>
                <button
                  type="button"
                  className="fx-icon is-danger"
                  onClick={() => onDelete(idx)}
                  disabled={disabled || items.length <= 1}
                  aria-label={`Delete slide ${idx + 1}`}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="fx-add-row"
        onClick={() => {
          onInsertAfter(items.length - 1);
          setFocusIdx(items.length);
        }}
        disabled={disabled || items.length >= maxItems}
      >
        <Plus size={16} aria-hidden="true" />
        Add slide
      </button>

      <p className="fx-kbd-hint">
        <kbd>Enter</kbd> adds a slide, <kbd>↑</kbd> <kbd>↓</kbd> move between slides, <kbd>Alt</kbd>+<kbd>↑</kbd> <kbd>↓</kbd> reorder,{" "}
        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> generates slides.
      </p>

      {shownSources.length > 0 && (
        <div className="fx-refs">
          <h3>Learn more</h3>
          <ol>
            {shownSources.map((s, i) => (
              <li key={i}>
                {s.url ? (
                  <a className="fx-ref" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title || s.url}>
                    <span>{i + 1}</span>
                    <span>{hostOf(s)}</span>
                  </a>
                ) : (
                  <span className="fx-ref" title={s.title}>
                    <span>{i + 1}</span>
                    <span>{hostOf(s)}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};
