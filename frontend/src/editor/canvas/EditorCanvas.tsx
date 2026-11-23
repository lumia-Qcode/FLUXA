import React, { useEffect, useRef, useState } from "react";
import { Block } from "../../../../shared/spec";
import { SlideStage } from "../../rendering/SlideStage";
import { Theme } from "../../rendering/themes";
import { commands } from "../store/documentStore";
import { useDocument } from "../store/DocumentContext";
import { InsertToolbar } from "./InsertToolbar";
import { HandleType, SelectionOverlay } from "./SelectionOverlay";
import { computeSnapping, SnapGuide } from "./snapping";
// Tiptap/ProseMirror (about 800 KB) is fetched in the background once the canvas mounts,
// so the first text edit is instant but other pages never download it (D3).
const loadTiptap = () => import("./TiptapInlineEditor");
const TiptapInlineEditor = React.lazy(() => loadTiptap().then((m) => ({ default: m.TiptapInlineEditor })));
import { Sparkles, ArrowUp, ChevronDown } from "lucide-react";

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;

interface EditorCanvasProps {
  theme: Theme;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({ theme }) => {
  // Warm the text editor chunk once the page is idle (not during load, where parsing it
  // blocked the main thread), so the first edit still opens instantly.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const warm = () => loadTiptap().catch(() => {});
    const timer = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(warm, { timeout: 4000 }) : warm()), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  const {
    doc,
    selectedSlide,
    selectedBlockIds,
    setSelectedBlockIds,
    execute,
    beginGesture,
    commitGesture,
  } = useDocument();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(0.6);
  const [zoomMode, setZoomMode] = useState<"fit" | number>("fit");
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [tryItMode, setTryItMode] = useState<boolean>(false);
  const [showProposedChange, setShowProposedChange] = useState<boolean>(true);
  const [canvasChatInput, setCanvasChatInput] = useState<string>("");

  const isSlide3 =
    selectedSlide?.order === 2 ||
    selectedSlide?.id === "hosp-s3" ||
    Boolean(selectedSlide?.blocks.some((b) => b.id === "h-s3-sub"));
  const subBlock = selectedSlide?.blocks.find(
    (b) => b.id === "h-s3-sub" || b.role === "subtitle"
  );

  // Drag & Resize state
  const dragRef = useRef<{
    active: boolean;
    type: "move" | HandleType;
    startX: number;
    startY: number;
    blockOrig: { x: number; y: number; w: number; h: number; rot: number };
  } | null>(null);

  const clipboardRef = useRef<Block | null>(null);

  // Calculate uniform fit scale
  useEffect(() => {
    if (zoomMode !== "fit") {
      setScale(zoomMode);
      return;
    }

    const el = viewportRef.current;
    if (!el) return;

    const updateFit = () => {
      const padding = 48; // stage margin
      const availW = Math.max(100, el.clientWidth - padding);
      const availH = Math.max(100, el.clientHeight - padding);

      const sX = availW / LOGICAL_WIDTH;
      const sY = availH / LOGICAL_HEIGHT;
      setScale(Math.min(sX, sY));
    };

    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoomMode]);

  // Keyboard navigation & Shortcuts on canvas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside an input or active text editor
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || editingBlockId) return;

      if (!selectedSlide || selectedBlockIds.length === 0) return;

      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;
      const delta = isShift ? 10 : 1;

      // Nudge with arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -delta : e.key === "ArrowRight" ? delta : 0;
        const dy = e.key === "ArrowUp" ? -delta : e.key === "ArrowDown" ? delta : 0;

        execute("Nudge Block", (draft) => {
          const slide = draft.slides.find((s) => s.id === selectedSlide.id);
          if (!slide) return;
          slide.blocks.forEach((b) => {
            if (selectedBlockIds.includes(b.id)) {
              b.x += dx;
              b.y += dy;
            }
          });
        });
        return;
      }

      // Delete block
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        execute("Delete Block", (draft) => {
          const slide = draft.slides.find((s) => s.id === selectedSlide.id);
          if (!slide) return;
          slide.blocks = slide.blocks.filter((b) => !selectedBlockIds.includes(b.id));
        });
        setSelectedBlockIds([]);
        return;
      }

      // Duplicate (Ctrl+D)
      if (isCtrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        execute("Duplicate Block", (draft) => {
          const slide = draft.slides.find((s) => s.id === selectedSlide.id);
          if (!slide) return;
          const duplicates: Block[] = [];
          slide.blocks.forEach((b) => {
            if (selectedBlockIds.includes(b.id)) {
              duplicates.push({
                ...b,
                id: `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                x: b.x + 20,
                y: b.y + 20,
              });
            }
          });
          slide.blocks.push(...duplicates);
          setSelectedBlockIds(duplicates.map((d) => d.id));
        });
        return;
      }

      // Copy (Ctrl+C)
      if (isCtrl && e.key.toLowerCase() === "c") {
        const primary = selectedSlide.blocks.find((b) => b.id === selectedBlockIds[0]);
        if (primary) {
          clipboardRef.current = JSON.parse(JSON.stringify(primary));
        }
        return;
      }

      // Paste (Ctrl+V)
      if (isCtrl && e.key.toLowerCase() === "v") {
        if (clipboardRef.current) {
          e.preventDefault();
          const toPaste = {
            ...clipboardRef.current,
            id: `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            x: clipboardRef.current.x + 24,
            y: clipboardRef.current.y + 24,
          };
          execute("Paste Block", (draft) => {
            const slide = draft.slides.find((s) => s.id === selectedSlide.id);
            if (!slide) return;
            slide.blocks.push(toPaste);
          });
          setSelectedBlockIds([toPaste.id]);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSlide, selectedBlockIds, editingBlockId, execute, setSelectedBlockIds]);

  const activeBlock = selectedSlide?.blocks.find((b) => selectedBlockIds.includes(b.id)) || null;

  // Pointer interactions on canvas blocks
  const handleBlockPointerDown = (e: React.PointerEvent, block: Block) => {
    e.stopPropagation();

    if (e.shiftKey) {
      // Toggle multi-selection
      setSelectedBlockIds((prev) =>
        prev.includes(block.id) ? prev.filter((id) => id !== block.id) : [...prev, block.id]
      );
    } else {
      setSelectedBlockIds([block.id]);
    }

    // Start drag to move
    dragRef.current = {
      active: true,
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      blockOrig: { x: block.x, y: block.y, w: block.w, h: block.h, rot: block.rotation || 0 },
    };

    beginGesture("Move Block");
  };

  const handleHandlePointerDown = (e: React.PointerEvent, handle: HandleType) => {
    e.stopPropagation();
    if (!activeBlock) return;

    dragRef.current = {
      active: true,
      type: handle,
      startX: e.clientX,
      startY: e.clientY,
      blockOrig: {
        x: activeBlock.x,
        y: activeBlock.y,
        w: activeBlock.w,
        h: activeBlock.h,
        rot: activeBlock.rotation || 0,
      },
    };

    beginGesture(handle === "rot" ? "Rotate Block" : "Resize Block");
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !dragRef.current.active || !activeBlock || !selectedSlide) return;

    const { type, startX, startY, blockOrig } = dragRef.current;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;

    if (type === "move") {
      const rawX = blockOrig.x + dx;
      const rawY = blockOrig.y + dy;

      const otherBlocks = selectedSlide.blocks.filter((b) => b.id !== activeBlock.id);
      const snap = computeSnapping({ x: rawX, y: rawY, w: blockOrig.w, h: blockOrig.h }, otherBlocks);

      setSnapGuides(snap.guides);

      execute(
        "Move Block",
        commands.updateBlockProps(selectedSlide.id, activeBlock.id, {
          x: Math.round(snap.x),
          y: Math.round(snap.y),
        })
      );
    } else if (type === "rot") {
      // Rotation logic
      const centerStageX = blockOrig.x + blockOrig.w / 2;
      const centerStageY = blockOrig.y + blockOrig.h / 2;
      const curPointerStageX = blockOrig.x + blockOrig.w / 2 + dx;
      const curPointerStageY = blockOrig.y - 30 + dy;

      const rad = Math.atan2(curPointerStageY - centerStageY, curPointerStageX - centerStageX);
      const deg = Math.round((rad * 180) / Math.PI + 90);

      execute(
        "Rotate Block",
        commands.updateBlockProps(selectedSlide.id, activeBlock.id, {
          rotation: deg,
        })
      );
    } else {
      // Resizing handle
      let newW = blockOrig.w;
      let newH = blockOrig.h;
      let newX = blockOrig.x;
      let newY = blockOrig.y;

      if (type.includes("e")) newW = Math.max(40, blockOrig.w + dx);
      if (type.includes("s")) newH = Math.max(30, blockOrig.h + dy);
      if (type.includes("w")) {
        const proposedW = Math.max(40, blockOrig.w - dx);
        newX = blockOrig.x + (blockOrig.w - proposedW);
        newW = proposedW;
      }
      if (type.includes("n")) {
        const proposedH = Math.max(30, blockOrig.h - dy);
        newY = blockOrig.y + (blockOrig.h - proposedH);
        newH = proposedH;
      }

      // Shift preserves aspect ratio
      if (e.shiftKey && blockOrig.w > 0 && blockOrig.h > 0) {
        const aspect = blockOrig.w / blockOrig.h;
        newH = newW / aspect;
      }

      execute(
        "Resize Block",
        commands.updateBlockProps(selectedSlide.id, activeBlock.id, {
          x: Math.round(newX),
          y: Math.round(newY),
          w: Math.round(newW),
          h: Math.round(newH),
        })
      );
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current?.active) {
      dragRef.current = null;
      setSnapGuides([]);
      commitGesture();
    }
  };

  return (
    <div
      className="ui-editor-canvas"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        height: "100%",
        background: "var(--bg-well)",
        overflow: "hidden",
        position: "relative",
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Top Insert Toolbar */}
      <InsertToolbar
        onInsertBlock={(newBlock, dataset) => {
          if (!selectedSlide) return;
          execute("Insert Block", (draft) => {
            const slide = draft.slides.find((s) => s.id === selectedSlide.id);
            if (!slide) return;
            slide.blocks.push(newBlock);
            if (dataset) {
              draft.datasets[dataset.id] = dataset;
            }
          });
          setSelectedBlockIds([newBlock.id]);
        }}
        tryItMode={tryItMode}
        onToggleTryIt={() => setTryItMode((v) => !v)}
      />

      {/* Main Viewport Stage Area */}
      <div
        ref={viewportRef}
        className="ui-canvas-viewport"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedBlockIds([]);
            setEditingBlockId(null);
          }
        }}
      >
        {selectedSlide && (
          <div
            className="ui-canvas-stage-wrapper"
            style={{
              width: LOGICAL_WIDTH,
              height: LOGICAL_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {/* The Unified SlideStage in Edit Mode */}
            <SlideStage
              slide={selectedSlide}
              theme={theme}
              datasets={doc.datasets}
              variables={doc.variables}
              mode={tryItMode ? "present" : "edit"}
              selectedBlockId={tryItMode ? null : selectedBlockIds[0] || null}
              onSelectBlock={(blockId) => {
                if (!tryItMode) setSelectedBlockIds([blockId]);
              }}
              onControlChange={(varName, val) => {
                execute("Set Variable", (draft) => {
                  if (!draft.variables) draft.variables = {};
                  if (draft.variables[varName]) {
                    draft.variables[varName].value = val;
                  } else {
                    draft.variables[varName] = {
                      id: varName,
                      label: varName,
                      type: typeof val === "number" ? "number" : typeof val === "boolean" ? "boolean" : "choice",
                      value: val,
                      scope: "deck",
                    };
                  }
                });
              }}
            />

            {/* Selection Bounding Box & Handles */}
            {!tryItMode && activeBlock && (
              <SelectionOverlay
                block={activeBlock}
                scale={scale}
                onHandlePointerDown={handleHandlePointerDown}
              />
            )}

            {/* Transparent Interactive Layer for Dragging & Double-Click */}
            {!tryItMode &&
              selectedSlide.blocks.map((block) => (
                <div
                  key={`hit-${block.id}`}
                  className="ui-block-hit-target"
                  onPointerDown={(e) => handleBlockPointerDown(e, block)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (block.type === "text") {
                      setEditingBlockId(block.id);
                    }
                  }}
                  style={{
                    position: "absolute",
                    left: `${block.x}px`,
                    top: `${block.y}px`,
                    width: `${block.w}px`,
                    height: `${block.h}px`,
                    transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
                    transformOrigin: "center center",
                    cursor: "move",
                    zIndex: 8000,
                  }}
                />
              ))}

            {/* In-Place Tiptap Rich Text Editor */}
            {editingBlockId && (
              (() => {
                const textBlock = selectedSlide.blocks.find(
                  (b) => b.id === editingBlockId && b.type === "text"
                ) as Extract<Block, { type: "text" }> | undefined;
                if (!textBlock) return null;

                return (
                  <React.Suspense fallback={null}>
                  <TiptapInlineEditor
                    block={textBlock}
                    onSave={(newDoc) => {
                      execute("Edit Text", (draft) => {
                        const s = draft.slides.find((sl) => sl.id === selectedSlide.id);
                        if (!s) return;
                        const b = s.blocks.find((bl) => bl.id === editingBlockId);
                        if (b && b.type === "text") {
                          b.doc = newDoc;
                        }
                      });
                    }}
                    onClose={() => setEditingBlockId(null)}
                  />
                  </React.Suspense>
                );
              })()
            )}

            {/* Snapping Guide Overlays */}
            {snapGuides.map((guide, idx) => (
              <div
                key={`guide-${idx}`}
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  zIndex: 9999,
                  ...(guide.orientation === "v"
                    ? {
                        left: `${guide.position}px`,
                        top: 0,
                        width: "1px",
                        height: `${LOGICAL_HEIGHT}px`,
                        background: "var(--signal)",
                      }
                    : {
                        top: `${guide.position}px`,
                        left: 0,
                        height: "1px",
                        width: `${LOGICAL_WIDTH}px`,
                        background: "var(--signal)",
                      }),
                }}
              />
            ))}
            {/* Page 3: Proposed Change Overlay on Subtitle */}
            {isSlide3 && showProposedChange && subBlock && (
              <div
                style={{
                  position: "absolute",
                  left: `${subBlock.x - 12}px`,
                  top: `${subBlock.y - 8}px`,
                  width: `${subBlock.w + 24}px`,
                  height: `${subBlock.h + 16}px`,
                  border: "2px dashed #0284C7",
                  borderRadius: "8px",
                  pointerEvents: "none",
                  zIndex: 8900,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-14px",
                    left: "12px",
                    backgroundColor: "#0284C7",
                    color: "#FFFFFF",
                    padding: "2px 10px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    boxShadow: "0 1px 4px rgba(2, 132, 199, 0.4)",
                  }}
                >
                  Proposed change
                </div>
              </div>
            )}
          </div>
        )}

        {/* Page 3 Floating AI Change Card & Chat Pill Bar */}
        {isSlide3 && showProposedChange && (
          <div
            style={{
              position: "absolute",
              bottom: "28px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9000,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              width: "480px",
              maxWidth: "92%",
            }}
          >
            {/* User Blue Message Pill */}
            <div
              style={{
                alignSelf: "flex-end",
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                padding: "6px 16px",
                borderRadius: "18px 18px 4px 18px",
                fontSize: "13px",
                fontWeight: 500,
                boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
              }}
            >
              Shorten the subtitle
            </div>

            {/* AI Change Proposal Card */}
            <div
              style={{
                width: "100%",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={16} color="#2563EB" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
                  One change is ready. Nothing else on the slide moves.
                </span>
              </div>

              {/* Diff Box */}
              <div
                style={{
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #F3F4F6",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ fontSize: "13px", color: "#9CA3AF", textDecoration: "line-through" }}>
                  Share of hospitals piloting AI, by year
                </div>
                <div style={{ fontSize: "14px", color: "#111827", fontWeight: 600 }}>
                  Hospitals piloting AI
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowProposedChange(false)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid #D1D5DB",
                    backgroundColor: "#FFFFFF",
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    execute("Shorten Subtitle", (draft) => {
                      const s = draft.slides.find((sl) => sl.id === selectedSlide?.id);
                      if (!s) return;
                      const b = s.blocks.find((bl) => bl.id === "h-s3-sub" || bl.role === "subtitle") as any;
                      if (b) {
                        b.content = "Hospitals piloting AI";
                        b.doc = {
                          type: "doc",
                          content: [{ type: "paragraph", content: [{ type: "text", text: "Hospitals piloting AI" }] }],
                        };
                      }
                    });
                    setShowProposedChange(false);
                  }}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "#2563EB",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(37,99,235,0.3)",
                  }}
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Bottom Chat Bar Pill */}
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "24px",
                padding: "4px 6px 4px 14px",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "12px",
                  backgroundColor: "#F3F4F6",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#374151",
                }}
              >
                <span>Slide 3</span>
                <ChevronDown size={12} color="#6B7280" />
              </div>

              <input
                type="text"
                placeholder="Ask for a change"
                value={canvasChatInput}
                onChange={(e) => setCanvasChatInput(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  backgroundColor: "transparent",
                  fontSize: "13px",
                  color: "#111827",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canvasChatInput.trim()) {
                    setCanvasChatInput("");
                    setShowProposedChange(true);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => {
                  if (canvasChatInput.trim()) {
                    setCanvasChatInput("");
                    setShowProposedChange(true);
                  }
                }}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#2563EB",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <ArrowUp size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Zoom Controls Bar */}
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "var(--bg-panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "2px 6px",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--ink-2)",
            boxShadow: "var(--elevation-floating)",
            userSelect: "none",
          }}
        >
          <button
            type="button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => setZoomMode(Math.max(0.25, scale - 0.1))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
          >
            −
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => setZoomMode(Math.min(2.0, scale + 0.1))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
          >
            +
          </button>
          <button
            type="button"
            title="Reset zoom"
            aria-label="Reset zoom"
            onClick={() => setZoomMode("fit")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              marginLeft: "4px",
              color: zoomMode === "fit" ? "var(--signal)" : "var(--ink-2)",
              fontWeight: 500,
            }}
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
};
