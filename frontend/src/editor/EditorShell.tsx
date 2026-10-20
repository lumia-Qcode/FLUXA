import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Moon,
  Play,
  Redo2,
  Sun,
  Undo2,
} from "lucide-react";
import { getTheme } from "../rendering/themes";
import { PresentMode } from "../rendering/PresentMode";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
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
import { commands } from "./store/documentStore";
import { useDocument } from "./store/DocumentContext";

export const EditorShell: React.FC = () => {
  const {
    doc,
    selectedSlideId,
    undo,
    redo,
    canUndo,
    canRedo,
    saveStatus,
    lastSavedTime,
    saveNow,
    resolveConflict,
    conflictServerDoc,
    execute,
  } = useDocument();

  const { showToast } = useToast();

  const [presenting, setPresenting] = useState(false);
  const [sorterOpen, setSorterOpen] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.getAttribute("data-theme") === "dark";
  });
  const [exportMenuPos, setExportMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Responsive check for small viewports (< 500px)
  const [isMobileScreen, setIsMobileScreen] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth < 500
  );

  useEffect(() => {
    const handleResize = () =>
      setIsMobileScreen(window.innerWidth > 0 && window.innerWidth < 500);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const activeTheme = getTheme(doc.theme.themeId);

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

  // Mobile Viewport screen: explains editing requires a larger screen while Present works
  if (isMobileScreen) {
    return (
      <div
        className="ui-editor-mobile-fallback"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: "24px",
          background: "var(--bg-app)",
          color: "var(--ink)",
          textAlign: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "var(--signal-weak)",
            color: "var(--signal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "20px",
          }}
        >
          F
        </div>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>{doc.title}</h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-2)", maxWidth: "320px", lineHeight: 1.5 }}>
          Editing requires a larger screen. You can still present and view this deck on your device.
        </p>
        <Button
          variant="primary"
          icon={<Play size={14} />}
          onClick={() => setPresenting(true)}
          style={{ marginTop: "8px" }}
        >
          Present Deck
        </Button>
        <Link to="/" style={{ color: "var(--ink-2)", fontSize: "12px", textDecoration: "none", marginTop: "8px" }}>
          Back to Workspace
        </Link>

        {presenting && (
          <PresentMode
            slides={doc.slides}
            theme={activeTheme}
            datasets={doc.datasets}
            variables={doc.variables}
            presentationId={doc.id}
            initialSlideIndex={Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlideId))}
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
      </div>
    );
  }

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
      {/* 40px Quiet Top Bar */}
      <header
        className="ui-editor-topbar"
        style={{
          height: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--line)",
          userSelect: "none",
          zIndex: 100,
        }}
      >
        {/* Left: Brand + Title + Save Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            to="/"
            title="Return to Workspace"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              borderRadius: "4px",
              background: "var(--ink)",
              color: "var(--bg-panel)",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            F
          </Link>

          <input
            type="text"
            className="deck-title"
            value={doc.title}
            onChange={(e) => execute("Rename Deck", commands.setDeckTitle(e.target.value))}
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              outline: "none",
              minWidth: "160px",
              maxWidth: "320px",
              padding: "2px 4px",
              borderRadius: "2px",
            }}
          />

          {/* Save Status Indicator */}
          <div
            className="ui-save-status"
            style={{
              fontSize: "11px",
              color: saveStatus === "offline" ? "var(--warn)" : "var(--ink-3)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {saveStatus === "saving" && <span>Saving…</span>}
            {saveStatus === "saved" && <span>Saved {lastSavedTime}</span>}
            {saveStatus === "offline" && <span>Offline: changes kept on this device</span>}
            {saveStatus === "error" && (
              <button
                type="button"
                onClick={saveNow}
                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}
              >
                Couldn’t save: Retry
              </button>
            )}
            {saveStatus === "conflict" && (
              <button
                type="button"
                onClick={() => {}}
                style={{ background: "none", border: "none", color: "var(--danger)", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Conflict detected
              </button>
            )}
          </div>
        </div>

        {/* Center: Command Bar Trigger */}
        <button
          type="button"
          onClick={() => setCommandBarOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 10px",
            background: "var(--bg-app)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm, 4px)",
            color: "var(--ink-2)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <span>Search or commands</span>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
            Ctrl+K
          </span>
        </button>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Tooltip content="Undo" shortcut="Ctrl+Z">
            <IconButton
              size="sm"
              label="Undo"
              disabled={!canUndo}
              icon={<Undo2 size={14} />}
              onClick={undo}
            />
          </Tooltip>

          <Tooltip content="Redo" shortcut="Ctrl+Shift+Z">
            <IconButton
              size="sm"
              label="Redo"
              disabled={!canRedo}
              icon={<Redo2 size={14} />}
              onClick={redo}
            />
          </Tooltip>

          <div style={{ width: "1px", height: "16px", background: "var(--line)", margin: "0 4px" }} />

          <Tooltip content={isDarkMode ? "Light mode" : "Dark mode"}>
            <IconButton
              size="sm"
              label="Toggle Theme Mode"
              icon={isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
              onClick={toggleThemeMode}
            />
          </Tooltip>

          <Button
            size="sm"
            variant="ghost"
            icon={<Download size={14} />}
            onClick={() => setExportDialogOpen(true)}
          >
            Export
          </Button>

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

      {/* Main Three-Panel Workspace */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Panel: Slide Rail */}
        <SlideRail theme={activeTheme} onOpenSorter={() => setSorterOpen(true)} />

        {/* Center Panel: Canvas */}
        <EditorCanvas theme={activeTheme} />

        {/* Right Panel: Contextual Inspector */}
        <InspectorPanel />
      </div>

      {/* Present Mode Portal */}
      {presenting && (
        <PresentMode
          slides={doc.slides}
          theme={activeTheme}
          datasets={doc.datasets}
          variables={doc.variables}
          presentationId={doc.id}
          initialSlideIndex={Math.max(0, doc.slides.findIndex((s) => s.id === selectedSlideId))}
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

      {/* 409 Conflict Dialog */}
      {saveStatus === "conflict" && conflictServerDoc && (
        <Dialog
          open={true}
          title="Resolve Conflicting Changes"
          description="Another session or tab updated this presentation. How would you like to resolve the conflict?"
          onClose={() => {}}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
            <Button variant="secondary" onClick={() => resolveConflict("server")}>
              Reload Server Version (Discard My Changes)
            </Button>
            <Button variant="primary" onClick={() => resolveConflict("mine")}>
              Keep My Local Version (Overwrite Server)
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
