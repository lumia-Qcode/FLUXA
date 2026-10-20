import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { api } from "../api";
import { ShortcutSheetModal } from "../editor/ShortcutSheetModal";
import { SlideStage } from "../rendering/SlideStage";
import { getTheme } from "../rendering/themes";
import { Button, Dialog, Field, IconButton, Kbd, Menu, Select, useToast } from "../ui";

type SortOption = "updated" | "created" | "title" | "slides";
type ViewMode = "grid" | "list";

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "Just now";
  const date = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffSec) || diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const WorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [presentations, setPresentations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Modals & menus
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<any | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuDeck, setMenuDeck] = useState<any | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadPresentations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listPresentations();
      setPresentations(data.presentations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresentations();
  }, [loadPresentations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateBlank();
        return;
      }
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setShortcutModalOpen((o) => !o);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCreateBlank = async () => {
    if (creating) return;
    try {
      setCreating(true);
      const res = await api.createPresentation({
        title: "Untitled presentation",
        theme: { themeId: "midnight" },
      });
      const pid = res.presentation?.id || res.id;
      // Add first slide
      const initialSlide: Slide = {
        id: "slide-1",
        order: 0,
        layout: "title",
        notes: "",
        blocks: [
          {
            id: "block-1",
            type: "text",
            x: 10,
            y: 35,
            w: 80,
            h: 30,
            content: "Untitled presentation",
            style: { fontSize: 48, fontWeight: 700, align: "center" },
            role: "title",
          },
        ],
      };
      await api.addSlide(pid, {
        title: "Untitled presentation",
        content: "",
        spec: initialSlide,
      });
      navigate(`/presentations/${pid}`);
    } catch (err: any) {
      addToast(err.message || "Failed to create presentation", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateFromPrompt = () => {
    navigate("/create");
  };

  const handleDuplicate = async (deck: any) => {
    try {
      const res = await api.duplicatePresentation(deck.id);
      addToast(`Duplicated "${deck.title}"`, "success");
      loadPresentations();
      if (res.id) {
        navigate(`/presentations/${res.id}`);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to duplicate presentation", "error");
    }
  };

  const handleExportJson = async (deck: any) => {
    try {
      const data = await api.getPresentation(deck.id);
      const jsonStr = JSON.stringify(data.presentation, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${deck.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("Presentation JSON exported", "success");
    } catch (err: any) {
      addToast("Failed to export JSON", "error");
    }
  };

  const handleDelete = async (deck: any) => {
    try {
      await api.deletePresentation(deck.id);
      setDeleteTarget(null);
      setPresentations((prev) => prev.filter((p) => p.id !== deck.id));
      addToast(`Deleted "${deck.title}"`, "info");
    } catch (err: any) {
      addToast(err.message || "Failed to delete presentation", "error");
    }
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    try {
      await api.updatePresentation(renameTarget.id, { title: renameTitle.trim() });
      setPresentations((prev) =>
        prev.map((p) => (p.id === renameTarget.id ? { ...p, title: renameTitle.trim() } : p))
      );
      setRenameTarget(null);
      addToast("Presentation renamed", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to rename", "error");
    }
  };

  // Filter & sort
  const filteredPresentations = useMemo(() => {
    let result = [...presentations];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      if (sortBy === "updated") {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      if (sortBy === "created") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (sortBy === "slides") {
        return (b.slide_count || 0) - (a.slide_count || 0);
      }
      return 0;
    });
    return result;
  }, [presentations, searchQuery, sortBy]);

  // Convert first_slide to Slide for thumbnail
  const getThumbnailSlide = (p: any): Slide => {
    if (p.first_slide?.spec && p.first_slide.spec.blocks) {
      return p.first_slide.spec;
    }
    return {
      id: `thumb-${p.id}`,
      order: 0,
      layout: "title",
      notes: "",
      blocks: [
        {
          id: `b-${p.id}`,
          type: "text",
          x: 10,
          y: 35,
          w: 80,
          h: 30,
          content: p.first_slide?.title || p.title || "Untitled Presentation",
          style: { fontSize: 44, fontWeight: 700, align: "center" },
          role: "title",
        },
      ],
    };
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: "var(--bg-app, #090A0D)",
        color: "var(--ink, #FFFFFF)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* Top Workspace Bar */}
      <header
        style={{
          height: 52,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-dim, #1E232B)",
          backgroundColor: "var(--bg-surface, #12151B)",
          gap: 16,
        }}
      >
        {/* Brand & Workspace Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                backgroundColor: "var(--signal, #3B82F6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                color: "#FFF",
              }}
            >
              F
            </div>
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: -0.3 }}>FLUXA</span>
          </div>

          <div
            style={{
              padding: "4px 8px",
              borderRadius: "var(--radius-sm, 4px)",
              backgroundColor: "var(--bg-elevated, #181C24)",
              color: "var(--ink-secondary, #9CA3AF)",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--signal, #3B82F6)",
              }}
            />
            Personal workspace
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ flex: "0 1 480px", position: "relative" }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search presentations…"
            aria-label="Search presentations"
            style={{
              width: "100%",
              height: 34,
              padding: "0 60px 0 32px",
              backgroundColor: "var(--bg-elevated, #181C24)",
              border: "1px solid var(--border-dim, #1E232B)",
              borderRadius: "var(--radius-md, 6px)",
              color: "var(--ink, #FFFFFF)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-tertiary, #6B7280)",
            }}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <Kbd>Ctrl K</Kbd>
          </div>
        </div>

        {/* Right Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconButton
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            label="Keyboard shortcuts (?)"
            onClick={() => setShortcutModalOpen(true)}
          />

          {/* New Deck Split Button */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <Button
              variant="primary"
              size="md"
              disabled={creating}
              onClick={handleCreateBlank}
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              {creating ? "Creating…" : "New presentation"}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleCreateFromPrompt}
              title="Generate with AI prompt"
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: "0 8px",
              }}
            >
              AI ▾
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1440, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* Controls row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Presentations</h1>
            <span
              style={{
                fontSize: 13,
                color: "var(--ink-secondary, #9CA3AF)",
                backgroundColor: "var(--bg-elevated, #181C24)",
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {filteredPresentations.length}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Sort Dropdown */}
            <div style={{ width: 160 }}>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                options={[
                  { label: "Last edited", value: "updated" },
                  { label: "Created date", value: "created" },
                  { label: "Title (A–Z)", value: "title" },
                  { label: "Slide count", value: "slides" },
                ]}
              />
            </div>

            {/* View Toggle */}
            <div
              style={{
                display: "flex",
                backgroundColor: "var(--bg-surface, #12151B)",
                border: "1px solid var(--border-dim, #1E232B)",
                borderRadius: "var(--radius-md, 6px)",
                padding: 2,
              }}
            >
              <IconButton
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                }
                label="Grid view"
                active={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              />
              <IconButton
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                }
                label="List view"
                active={viewMode === "list"}
                onClick={() => setViewMode("list")}
              />
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--ink-secondary, #9CA3AF)",
              fontSize: 14,
            }}
          >
            Loading presentations…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            style={{
              padding: 24,
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--danger, #EF4444)",
              borderRadius: "var(--radius-md, 6px)",
              color: "var(--ink, #FFF)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={loadPresentations}>
              Retry
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredPresentations.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 24px",
              textAlign: "center",
              backgroundColor: "var(--bg-surface, #12151B)",
              border: "1px dashed var(--border-dim, #1E232B)",
              borderRadius: "var(--radius-lg, 8px)",
              marginTop: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--radius-md, 6px)",
                backgroundColor: "var(--bg-elevated, #181C24)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                color: "var(--signal, #3B82F6)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 }}>
              {searchQuery ? "No matching presentations" : "No presentations yet"}
            </h3>
            <p
              style={{
                margin: "0 0 20px 0",
                color: "var(--ink-secondary, #9CA3AF)",
                fontSize: 13,
                maxWidth: 380,
              }}
            >
              {searchQuery
                ? `No presentations found matching "${searchQuery}". Try a different keyword.`
                : "Create a blank presentation or generate one with AI to get started."}
            </p>
            {!searchQuery && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Button variant="primary" onClick={handleCreateBlank}>
                  Create blank deck <Kbd>Ctrl N</Kbd>
                </Button>
                <Button variant="secondary" onClick={handleCreateFromPrompt}>
                  Generate with AI
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Grid View */}
        {!loading && !error && filteredPresentations.length > 0 && viewMode === "grid" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {filteredPresentations.map((deck) => {
              const themeId =
                typeof deck.theme === "string" ? deck.theme : deck.theme?.themeId || "default";
              const theme = getTheme(themeId);
              const thumbSlide = getThumbnailSlide(deck);

              return (
                <div
                  key={deck.id}
                  style={{
                    backgroundColor: "var(--bg-surface, #12151B)",
                    border: "1px solid var(--border-dim, #1E232B)",
                    borderRadius: "var(--radius-lg, 8px)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "border-color 150ms ease",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle, #2D333F)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-dim, #1E232B)";
                  }}
                >
                  {/* Thumbnail area with 16:9 ratio */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      paddingBottom: "56.25%",
                      backgroundColor: "#000",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                      }}
                    >
                      <SlideStage mode="thumbnail" theme={theme} slide={thumbSlide} />
                    </div>

                    {/* Play button hover overlay */}
                    <div
                      className="deck-hover-overlay"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.45)",
                        opacity: 0,
                        transition: "opacity 150ms ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0";
                      }}
                    >
                      <Link
                        to={`/presentations/${deck.id}?present=true`}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          backgroundColor: "var(--signal, #3B82F6)",
                          color: "#FFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textDecoration: "none",
                        }}
                        title="Present deck"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </Link>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div
                    style={{
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <Link
                        to={`/presentations/${deck.id}`}
                        style={{
                          color: "var(--ink, #FFFFFF)",
                          fontSize: 14,
                          fontWeight: 500,
                          textDecoration: "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                        title={deck.title}
                      >
                        {deck.title || "Untitled presentation"}
                      </Link>

                      {/* Three-dots menu */}
                      <IconButton
                        icon={
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        }
                        label="More options"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuDeck(deck);
                          setMenuPos({ x: r.left, y: r.bottom + 4 });
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 12,
                        color: "var(--ink-secondary, #9CA3AF)",
                      }}
                    >
                      <span>
                        {deck.slide_count || 1} {deck.slide_count === 1 ? "slide" : "slides"}
                      </span>
                      <span>{formatRelativeTime(deck.updated_at || deck.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {!loading && !error && filteredPresentations.length > 0 && viewMode === "list" && (
          <div
            style={{
              backgroundColor: "var(--bg-surface, #12151B)",
              border: "1px solid var(--border-dim, #1E232B)",
              borderRadius: "var(--radius-lg, 8px)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 140px 60px",
                padding: "10px 16px",
                borderBottom: "1px solid var(--border-dim, #1E232B)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-tertiary, #6B7280)",
              }}
            >
              <span>Title</span>
              <span>Slides</span>
              <span>Last edited</span>
              <span />
            </div>

            {filteredPresentations.map((deck) => (
              <div
                key={deck.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 140px 60px",
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border-dim, #1E232B)",
                  fontSize: 13,
                }}
              >
                <Link
                  to={`/presentations/${deck.id}`}
                  style={{
                    color: "var(--ink, #FFFFFF)",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  {deck.title || "Untitled presentation"}
                </Link>
                <span style={{ color: "var(--ink-secondary, #9CA3AF)" }}>
                  {deck.slide_count || 1} {deck.slide_count === 1 ? "slide" : "slides"}
                </span>
                <span style={{ color: "var(--ink-secondary, #9CA3AF)", fontSize: 12 }}>
                  {formatRelativeTime(deck.updated_at || deck.created_at)}
                </span>
                <div style={{ textAlign: "right" }}>
                  <IconButton
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    }
                    label="Actions"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenuDeck(deck);
                      setMenuPos({ x: r.left, y: r.bottom + 4 });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Context Menu for Deck Card */}
      {menuDeck && menuPos && (
        <Menu
          open={Boolean(menuPos)}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => {
            setMenuDeck(null);
            setMenuPos(null);
          }}
          items={[
            {
              id: "present",
              label: "Present",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ),
              onClick: () => navigate(`/presentations/${menuDeck.id}?present=true`),
            },
            {
              id: "rename",
              label: "Rename",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ),
              onClick: () => {
                setRenameTarget(menuDeck);
                setRenameTitle(menuDeck.title || "");
              },
            },
            {
              id: "duplicate",
              label: "Duplicate",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              ),
              onClick: () => handleDuplicate(menuDeck),
            },
            {
              id: "export",
              label: "Export JSON",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              ),
              onClick: () => handleExportJson(menuDeck),
            },
            {
              id: "delete",
              label: "Delete",
              danger: true,
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              ),
              onClick: () => setDeleteTarget(menuDeck),
            },
          ]}
        />
      )}

      {/* Rename Dialog */}
      <Dialog
        open={Boolean(renameTarget)}
        title="Rename presentation"
        onClose={() => setRenameTarget(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRenameConfirm}>
              Save
            </Button>
          </div>
        }
      >
        <Field label="Presentation title">
          <input
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
            }}
            autoFocus
            style={{
              width: "100%",
              height: 36,
              padding: "0 10px",
              backgroundColor: "var(--bg-elevated, #181C24)",
              border: "1px solid var(--border-dim, #1E232B)",
              borderRadius: "var(--radius-md, 6px)",
              color: "var(--ink, #FFFFFF)",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </Field>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        title="Delete presentation?"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleDelete(deleteTarget)}>
              Delete permanently
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-secondary, #9CA3AF)" }}>
          Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This action cannot be
          undone.
        </p>
      </Dialog>

      {/* Shortcut Sheet Modal */}
      <ShortcutSheetModal open={shortcutModalOpen} onClose={() => setShortcutModalOpen(false)} />
    </div>
  );
};
