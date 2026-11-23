import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  Play,
  Redo2,
  Sparkles,
  Undo2,
  ChevronLeft,
  ChevronDown,
  Type,
  Square,
  Image as ImageIcon,
  BarChart3,
  Table as TableIcon,
  Sliders,
} from "lucide-react";
import { resolveDeckTheme } from "../rendering/themes";
import { PresentMode } from "../rendering/PresentMode";
import { LiveMeetingModal } from "../components/live/LiveMeetingModal";
import { LiveSessionState, startLiveSession } from "../components/live/liveApi";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuItem } from "../ui/Menu";
import { Tooltip } from "../ui/Tooltip";
import { useToast } from "../ui/Toast";
import { EditorCanvas } from "./canvas/EditorCanvas";
import { CommandBar } from "./CommandBar";
import { InspectorPanel } from "./inspector/InspectorPanel";
import { SlideRail } from "./rail/SlideRail";
import { SlideSorterModal } from "./rail/SlideSorterModal";
import { ShortcutSheetModal } from "./ShortcutSheetModal";
import { ExportDialog } from "./dialogs/ExportDialog";
import { GenerationOverviewView } from "./overview/GenerationOverviewView";
import { useDocument } from "./store/DocumentContext";

export const EditorShell: React.FC = () => {
  const {
    doc,
    selectedSlideId,
    setSelectedSlideId,
    undo,
    redo,
    canUndo,
    canRedo,
    saveStatus,
    execute,
  } = useDocument();

  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const slideParam = searchParams.get("slide");
  const [viewMode, setViewMode] = useState<"overview" | "edit">(() => {
    return viewParam === "edit" ? "edit" : "overview";
  });
  const [showRail] = useState(false);

  useEffect(() => {
    if (viewParam === "edit" && viewMode !== "edit") {
      setViewMode("edit");
    } else if (viewParam === "overview" && viewMode !== "overview") {
      setViewMode("overview");
    }
  }, [viewParam]);

  useEffect(() => {
    if (slideParam) {
      const match = doc.slides.find((s) => s.id === slideParam || s.id === `slide-${slideParam}`);
      if (match) {
        setSelectedSlideId(match.id);
      }
    }
  }, [slideParam, doc.slides, setSelectedSlideId]);

  const [presenting, setPresenting] = useState(false);
  // #5 Instant Recovery: a "continue on another device" link opens present mode on its slide.
  useEffect(() => {
    if (searchParams.get("present") === "1") setPresenting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editorLiveSession, setEditorLiveSession] = useState<LiveSessionState | null>(null);
  const [editorLiveModalOpen, setEditorLiveModalOpen] = useState(false);
  const [sorterOpen, setSorterOpen] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.getAttribute("data-theme") === "dark";
  });
  const [exportMenuPos, setExportMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let assetId = "";
      if (doc.id) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch(`/api/presentations/${doc.id}/assets`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            assetId = data.id || data.url;
          }
        } catch {
          // fallback to data url
        }
      }
      if (!assetId) {
        assetId = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const newBlock: any = {
        id: `block-image-${Date.now()}`,
        type: "image",
        role: "media",
        x: 320,
        y: 200,
        w: 640,
        h: 400,
        assetId,
        fit: "cover",
        radius: 8,
      };

      execute("Insert Image", (draft) => {
        const slide =
          draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
        if (slide) {
          if (!slide.blocks) slide.blocks = [];
          slide.blocks.push(newBlock);
          if ((slide as any).spec) {
            if (!(slide as any).spec.blocks) (slide as any).spec.blocks = [];
            (slide as any).spec.blocks.push(newBlock);
          }
        }
      });
      showToast({ message: "Image inserted" });
    } catch (err: any) {
      showToast({ message: `Failed to insert image: ${err?.message || err}` });
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  // Theme toggle
  const toggleThemeMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  // Global key bindings
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable ||
        target?.closest?.(".ProseMirror") ||
        target?.closest?.("[contenteditable='true']")
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandBarOpen((o) => !o);
      } else if (e.key === "?" && !isCtrl) {
        e.preventDefault();
        setShortcutSheetOpen(true);
      } else if (e.key.toLowerCase() === "g" && !isCtrl) {
        e.preventDefault();
        setSorterOpen(true);
      } else if (e.key.toLowerCase() === "p" && !isCtrl) {
        e.preventDefault();
        setPresenting(true);
      } else if (isCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [canUndo, canRedo, undo, redo]);

  const handleStartLiveMeeting = async () => {
    if (editorLiveSession) {
      setEditorLiveModalOpen(true);
      return;
    }
    if (!doc.id) return;
    try {
      const sess = await startLiveSession(doc.id, "Host Presenter");
      setEditorLiveSession(sess);
      setEditorLiveModalOpen(true);
    } catch (err) {
      console.error("Failed to start live session", err);
    }
  };

  const activeTheme = resolveDeckTheme(doc.theme.themeId, doc.brand, (doc.theme as any).fontPairing);

  // Render Page 2 (Overview Split View) when viewMode === "overview"
  if (viewMode === "overview") {
    return (
      <>
        <GenerationOverviewView
          doc={doc}
          theme={activeTheme}
          onEditSlide={(slideId) => {
            setSelectedSlideId(slideId);
            setViewMode("edit");
            setSearchParams({ view: "edit", slide: slideId });
          }}
          onPresent={() => setPresenting(true)}
          onExport={() => setExportDialogOpen(true)}
        />

        {presenting && (
          <PresentMode
            slides={doc.slides.filter((s) => !s.hidden)}
            theme={activeTheme}
            datasets={doc.datasets}
            variables={doc.variables}
            presentationId={doc.id}
            initialSlideIndex={Math.max(0, doc.slides.filter((s) => !s.hidden).findIndex((s) => s.id === selectedSlideId))}
            onControlChange={(varName, val) => {
              execute("Set Variable", (draft) => {
                if (draft.variables[varName]) {
                  draft.variables[varName].value = val;
                }
              });
            }}
            onClose={() => setPresenting(false)}
          />
        )}

        <ExportDialog
          open={exportDialogOpen}
          doc={doc}
          onClose={() => setExportDialogOpen(false)}
        />
      </>
    );
  }

  const exportMenuItems: MenuItem[] = [
    {
      id: "pdf",
      label: "Print / Save as PDF",
      onClick: () => {
        window.open(`/print/${doc.id}`, "_blank");
      },
    },
    {
      id: "share",
      label: "Open share viewer",
      onClick: () => {
        window.open(`/v/${doc.id}`, "_blank");
      },
    },
    {
      id: "md",
      label: "Copy as Markdown outline",
      onClick: () => {
        const md = `# ${doc.title}\n\n` +
          doc.slides
            .map((s: any, idx) => `## Slide ${idx + 1}: ${s.title || "Untitled"}\n${s.notes || ""}`)
            .join("\n\n---\n\n");
        navigator.clipboard.writeText(md);
        showToast({ message: "Markdown outline copied to clipboard!" });
      },
    },
  ];

  const currentSlideIndex = Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlideId));

  return (
    <div
      className="ui-editor-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg-app)",
      }}
    >
      {/* Page 3 Top Bar matching PDF */}
      <header
        className="ui-editor-topbar"
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          userSelect: "none",
          zIndex: 100,
        }}
      >
        {/* Left: < Done button + Slide X of Y */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            type="button"
            onClick={() => {
              setViewMode("overview");
              setSearchParams({ view: "overview" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 12px",
              borderRadius: "6px",
              border: "1px solid #E5E7EB",
              backgroundColor: "#FFFFFF",
              color: "#374151",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={16} />
            <span>Done</span>
          </button>

          <span style={{ fontSize: "13px", fontWeight: 500, color: "#6B7280" }}>
            Slide {currentSlideIndex + 1} of {doc.slides.length}
          </span>
        </div>

        {/* Center: Tools (Undo, Redo, T, Square, Image, Chart, Table, Slider, Fit) */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Tooltip content="Undo" shortcut="Ctrl+Z">
            <IconButton size="sm" label="Undo" disabled={!canUndo} icon={<Undo2 size={14} />} onClick={undo} />
          </Tooltip>
          <Tooltip content="Redo" shortcut="Ctrl+Shift+Z">
            <IconButton size="sm" label="Redo" disabled={!canRedo} icon={<Redo2 size={14} />} onClick={redo} />
          </Tooltip>

          <div style={{ width: "1px", height: "16px", background: "#E5E7EB", margin: "0 6px" }} />

          <button
            type="button"
            title="Text block"
            onClick={() => {
              const newBlock: any = {
                id: `block-text-${Date.now()}`,
                type: "text",
                role: "body",
                x: 200,
                y: 300,
                w: 600,
                h: 180,
                doc: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Click to write your content here." }],
                    },
                  ],
                },
                style: { fontSize: 24, align: "left" },
              };
              execute("Insert Text", (draft) => {
                const slide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
                if (slide) slide.blocks.push(newBlock);
              });
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <Type size={15} />
          </button>

          <button
            type="button"
            title="Shape block"
            onClick={() => {
              const newBlock: any = {
                id: `block-shape-${Date.now()}`,
                type: "shape",
                x: 300,
                y: 300,
                w: 400,
                h: 240,
                shape: "rect",
                fill: { color: "#2352F5", opacity: 0.15 },
                stroke: { color: "#2352F5", width: 2 },
                radius: 8,
              };
              execute("Insert Shape", (draft) => {
                const slide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
                if (slide) slide.blocks.push(newBlock);
              });
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <Square size={15} />
          </button>

          <button
            type="button"
            title="Image"
            onClick={() => imageInputRef.current?.click()}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <ImageIcon size={15} />
          </button>
          <input
            type="file"
            ref={imageInputRef}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={handleImageFileSelect}
          />

          <button
            type="button"
            title="Chart"
            onClick={() => {
              const dsId = `ds_sample_${Date.now()}`;
              const sampleDataset = {
                id: dsId,
                name: "Sample Chart Data",
                source: "user",
                columns: [
                  { key: "label", label: "Category", type: "text" },
                  { key: "value", label: "Value", type: "number" },
                ],
                rows: [
                  { label: "Product A", value: 45 },
                  { label: "Product B", value: 78 },
                  { label: "Product C", value: 62 },
                  { label: "Product D", value: 91 },
                ],
              };
              const newBlock: any = {
                id: `block-chart-${Date.now()}`,
                type: "chart",
                role: "chart",
                x: 240,
                y: 200,
                w: 800,
                h: 500,
                kind: "bar",
                dataset: dsId,
                xField: "label",
                series: [{ field: "value", label: "Volume" }],
                options: {},
              };
              execute("Insert Chart", (draft) => {
                const slide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
                if (slide) slide.blocks.push(newBlock);
                draft.datasets[dsId] = sampleDataset as any;
              });
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <BarChart3 size={15} />
          </button>

          <button
            type="button"
            title="Table"
            onClick={() => {
              const dsId = `ds_table_${Date.now()}`;
              const sampleDataset = {
                id: dsId,
                name: "Table Data",
                source: "user",
                columns: [
                  { key: "metric", label: "Metric", type: "text" },
                  { key: "target", label: "Target", type: "number" },
                  { key: "actual", label: "Actual", type: "number" },
                ],
                rows: [
                  { metric: "Retention", target: 80, actual: 86 },
                  { metric: "NPS", target: 50, actual: 64 },
                  { metric: "Uptime", target: 99.9, actual: 99.95 },
                ],
              };
              const newBlock: any = {
                id: `block-table-${Date.now()}`,
                type: "table",
                x: 240,
                y: 240,
                w: 700,
                h: 300,
                dataset: dsId,
                style: "ruled",
              };
              execute("Insert Table", (draft) => {
                const slide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
                if (slide) slide.blocks.push(newBlock);
                draft.datasets[dsId] = sampleDataset as any;
              });
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <TableIcon size={15} />
          </button>

          <button
            type="button"
            title="Slider control"
            onClick={() => {
              const newBlock: any = {
                id: `block-ctrl-${Date.now()}`,
                type: "control",
                x: 300,
                y: 400,
                w: 500,
                h: 90,
                control: "slider",
                label: "Target Capacity (%)",
                min: 0,
                max: 100,
                step: 5,
              };
              execute("Insert Control", (draft) => {
                const slide = draft.slides.find((s) => s.id === selectedSlideId) || draft.slides[0];
                if (slide) slide.blocks.push(newBlock);
              });
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <Sliders size={15} />
          </button>

          <div style={{ width: "1px", height: "16px", background: "#E5E7EB", margin: "0 6px" }} />

          {/* Fit zoom chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: "12px",
              fontWeight: 500,
              color: "#374151",
              backgroundColor: "#F3F4F6",
            }}
          >
            <span>Fit</span>
            <ChevronDown size={12} color="#6B7280" />
          </div>
        </div>

        {/* Right: Save Status + Export + Present */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            className="ui-save-status"
            style={{
              fontSize: "12px",
              color: saveStatus === "offline" ? "var(--warn)" : "#9CA3AF",
              marginRight: "4px",
            }}
          >
            {saveStatus === "saving" && <span>Saving…</span>}
            {saveStatus === "saved" && <span>Saved</span>}
          </div>

          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles size={14} style={{ color: "var(--signal)" }} />}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("fluxa:open-copilot"));
            }}
          >
            Copilot
          </Button>

          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={14} />}
            onClick={() => setExportDialogOpen(true)}
          >
            Export
          </Button>

          <button
            type="button"
            onClick={handleStartLiveMeeting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "5px 13px",
              borderRadius: "20px",
              border: editorLiveSession
                ? "1px solid rgba(16, 185, 129, 0.45)"
                : "1px solid rgba(0, 0, 0, 0.12)",
              background: editorLiveSession
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(0, 0, 0, 0.03)",
              color: editorLiveSession ? "#059669" : "#374151",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: editorLiveSession ? "#10B981" : "#94A3B8",
                boxShadow: editorLiveSession ? "0 0 8px #10B981" : "none",
              }}
            />
            <span>{editorLiveSession ? "Live Hub" : "Go Live"}</span>
          </button>

          <Button
            size="sm"
            variant="primary"
            icon={<Play size={13} />}
            onClick={() => setPresenting(true)}
          >
            Present
          </Button>
        </div>
      </header>

      {/* Main Two/Three-Panel Workspace */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Panel: Slide Rail (collapsible, hidden on Page 3 by default for clean canvas focus) */}
        {showRail && (
          <SlideRail theme={activeTheme} onOpenSorter={() => setSorterOpen(true)} />
        )}

        {/* Center Panel: Canvas */}
        <EditorCanvas theme={activeTheme} />

        {/* Right Panel: Contextual Inspector */}
        <InspectorPanel />
      </div>

      {/* Present Mode Portal */}
      {presenting && (
        <PresentMode
          slides={doc.slides.filter((s) => !s.hidden)}
          theme={activeTheme}
          datasets={doc.datasets}
          variables={doc.variables}
          presentationId={doc.id}
          initialSlideIndex={Math.max(0, doc.slides.filter((s) => !s.hidden).findIndex((s) => s.id === selectedSlideId))}
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
          onClose={() => setPresenting(false)}
        />
      )}

      {/* Slide Sorter Modal */}
      <SlideSorterModal open={sorterOpen} theme={activeTheme} onClose={() => setSorterOpen(false)} />

      {/* Command Bar Modal */}
      <CommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        onPresent={() => setPresenting(true)}
        onToggleThemeMode={toggleThemeMode}
        isDarkMode={isDarkMode}
      />

      {/* Keyboard Shortcut Sheet Modal */}
      <ShortcutSheetModal open={shortcutSheetOpen} onClose={() => setShortcutSheetOpen(false)} />

      {/* Export and Share Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        doc={doc}
        onClose={() => setExportDialogOpen(false)}
      />

      {/* Export Dropdown Menu */}
      {exportMenuPos && (
        <Menu
          open={Boolean(exportMenuPos)}
          x={exportMenuPos.x}
          y={exportMenuPos.y}
          items={exportMenuItems}
          onClose={() => setExportMenuPos(null)}
        />
      )}

      {/* Live Meeting Moderator Modal */}
      {editorLiveSession && (
        <LiveMeetingModal
          session={editorLiveSession}
          currentSlideIndex={Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlideId))}
          isOpen={editorLiveModalOpen}
          onClose={() => setEditorLiveModalOpen(false)}
          onSessionEnded={() => setEditorLiveSession(null)}
        />
      )}
    </div>
  );
};
