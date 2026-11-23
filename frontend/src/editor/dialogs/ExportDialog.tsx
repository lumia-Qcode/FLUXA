import React, { useState, useEffect } from "react";
import {
  FileText,
  FileSpreadsheet,
  Globe,
  Printer,
  Archive,
  Share2,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  Loader2,
  X,
} from "lucide-react";
import { DeckDocument } from "../store/types";
import { buildMarkdownOutline } from "../../export/markdownExporter";
// PptxGenJS, JSZip and html-to-image load only when that export is clicked (D3).
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";

interface ExportDialogProps {
  open: boolean;
  doc: DeckDocument;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, doc, onClose }) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"formats" | "share">("formats");
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");

  // Share state
  const [isShared, setIsShared] = useState<boolean>(Boolean(doc.isShared));
  const [shareToken, setShareToken] = useState<string>(doc.shareToken || "");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sync with document state
  useEffect(() => {
    setIsShared(Boolean(doc.isShared));
    setShareToken(doc.shareToken || "");
  }, [doc.isShared, doc.shareToken]);

  if (!open) return null;

  const baseTitle = (doc.title || "presentation").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "presentation";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = shareToken ? `${origin}/v/${shareToken}` : `${origin}/v/${doc.id}`;

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 1. Export PowerPoint
  async function handleExportPptx() {
    setBusyFormat("pptx");
    setProgressMsg("Compiling slides & native charts…");
    try {
      const { exportToPptx } = await import("../../export/pptxExporter");
      const blob = await exportToPptx(doc, {
        shareUrl: isShared ? shareUrl : undefined,
        onProgress: (p) => setProgressMsg(p.stage),
      });
      downloadBlob(blob, `${baseTitle}.pptx`);
      showToast({ message: "PowerPoint presentation exported successfully." });
    } catch (err: any) {
      showToast({ message: err.message || "Failed to export PowerPoint presentation." });
    } finally {
      setBusyFormat(null);
      setProgressMsg("");
    }
  }

  // 2. Export Standalone HTML
  async function handleExportHtml() {
    setBusyFormat("html");
    try {
      const { buildStandaloneHtml, deckFontFamilies } = await import("../../export/htmlExporter");
      const { embedFontCss } = await import("../../export/embedFonts");
      const fontCss = await embedFontCss(deckFontFamilies(doc)).catch(() => "");
      const htmlContent = buildStandaloneHtml(doc, fontCss);
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, `${baseTitle}.html`);
      showToast({ message: "Standalone interactive HTML presentation exported." });
    } catch (err: any) {
      showToast({ message: err.message || "Failed to generate standalone HTML." });
    } finally {
      setBusyFormat(null);
    }
  }

  // 3. Export PNG Zip
  async function handleExportPngZip() {
    setBusyFormat("png");
    setProgressMsg("Rendering high-resolution slides…");
    try {
      const { exportSlidesToZip } = await import("../../export/imageExporter");
      const blob = await exportSlidesToZip(doc, {
        onProgress: (p) => setProgressMsg(p.stage),
      });
      downloadBlob(blob, `${baseTitle}-slides.zip`);
      showToast({ message: "Slide images zip archive exported." });
    } catch (err: any) {
      showToast({ message: err.message || "Failed to export slide images." });
    } finally {
      setBusyFormat(null);
      setProgressMsg("");
    }
  }

  // 4. Copy / Download Markdown
  function handleCopyMarkdown() {
    try {
      const md = buildMarkdownOutline(doc);
      navigator.clipboard.writeText(md);
      showToast({ message: "Markdown outline copied to clipboard." });
    } catch {
      showToast({ message: "Could not copy outline to clipboard." });
    }
  }

  function handleDownloadMarkdown() {
    try {
      const md = buildMarkdownOutline(doc);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, `${baseTitle}.md`);
      showToast({ message: "Markdown outline downloaded." });
    } catch (err: any) {
      showToast({ message: err.message || "Could not download markdown outline." });
    }
  }

  // Share link handlers
  async function handleCreateShareLink() {
    setSharingBusy(true);
    try {
      const res = await fetch(`/api/presentations/${doc.id}/share`, { method: "POST" });
      if (!res.ok) throw new Error("Could not create share link.");
      const data = await res.json();
      setShareToken(data.share_token);
      setIsShared(true);
      showToast({ message: "Public share link generated." });
    } catch (err: any) {
      showToast({ message: err.message || "Failed to create share link." });
    } finally {
      setSharingBusy(false);
    }
  }

  async function handleRevokeShareLink() {
    setSharingBusy(true);
    try {
      const res = await fetch(`/api/presentations/${doc.id}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not revoke share link.");
      setIsShared(false);
      showToast({ message: "Share link revoked. Access disabled." });
    } catch (err: any) {
      showToast({ message: err.message || "Failed to revoke share link." });
    } finally {
      setSharingBusy(false);
    }
  }

  function handleCopyShareLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    showToast({ message: "Share link copied to clipboard." });
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ui-export-dialog"
        style={{
          width: "680px",
          maxWidth: "92vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-panel)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md, 8px)",
          color: "var(--ink)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
        }}
      >
        {/* Dialog Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div>
            <h2
              id="export-dialog-title"
              style={{
                fontSize: "17px",
                fontWeight: 600,
                margin: 0,
                color: "var(--ink)",
              }}
            >
              Export and share
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
              Export presentation across formats with full fidelity disclosures.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs Bar */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            padding: "0 20px",
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-app)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("formats")}
            style={{
              background: "none",
              border: "none",
              padding: "10px 0",
              fontSize: "13px",
              fontWeight: 600,
              color: activeTab === "formats" ? "var(--signal)" : "var(--ink-2)",
              borderBottom: activeTab === "formats" ? "2px solid var(--signal)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Export Formats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("share")}
            style={{
              background: "none",
              border: "none",
              padding: "10px 0",
              fontSize: "13px",
              fontWeight: 600,
              color: activeTab === "share" ? "var(--signal)" : "var(--ink-2)",
              borderBottom: activeTab === "share" ? "2px solid var(--signal)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Share Link ({isShared ? "Active" : "Disabled"})
          </button>
        </div>

        {/* Dialog Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {activeTab === "formats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Standalone HTML (Highlighted) */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1.5px solid var(--signal)",
                  background: "var(--signal-weak)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        background: "var(--signal)",
                        color: "#FFFFFF",
                        display: "flex",
                      }}
                    >
                      <Globe size={18} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                          Standalone HTML (.html)
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "10px",
                            background: "var(--signal)",
                            color: "#FFFFFF",
                          }}
                        >
                          Recommended
                        </span>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
                        Single self-contained file with inlined runtime and deck JSON. Works completely offline.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    disabled={Boolean(busyFormat)}
                    onClick={handleExportHtml}
                    style={{ flexShrink: 0 }}
                  >
                    Export HTML
                  </Button>
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    lineHeight: "1.4",
                    color: "var(--ink-2)",
                    background: "var(--bg-panel)",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <strong style={{ color: "var(--ink)" }}>Keeps:</strong> Live animated charts, interactive controls (sliders, buttons), dataset recalculations, and transitions. PowerPoint cannot match this format.
                </div>
              </div>

              {/* PowerPoint (.pptx) */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "var(--bg-app)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        background: "#D97706",
                        color: "#FFFFFF",
                        display: "flex",
                      }}
                    >
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                        Microsoft PowerPoint (.pptx)
                      </span>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
                        Native editable slides with built-in PowerPoint charts and Excel data sheets.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    disabled={Boolean(busyFormat)}
                    onClick={handleExportPptx}
                    style={{ flexShrink: 0 }}
                  >
                    {busyFormat === "pptx" ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Loader2 size={13} className="animate-spin" />
                        Exporting…
                      </span>
                    ) : (
                      "Export PPTX"
                    )}
                  </Button>
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    lineHeight: "1.4",
                    color: "var(--ink-2)",
                    background: "var(--bg-panel)",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <strong style={{ color: "var(--ink)" }}>Keeps:</strong> Native text, shapes, tables, notes, and editable PowerPoint charts.
                  <br />
                  <strong style={{ color: "var(--ink)" }}>Loses:</strong> Dynamic sliders and HTML widgets become snapshot slides with live hyperlinks.
                </div>
              </div>

              {/* PDF Document */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "var(--bg-app)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      background: "#DC2626",
                      color: "#FFFFFF",
                      display: "flex",
                    }}
                  >
                    <Printer size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                      Print / PDF Document
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
                      Vector presentation rendered at 1920×1080 per page via dedicated print engine.
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => window.open(`/print/${doc.id}?autoprint=1`, "_blank")}
                >
                  Open Print View
                </Button>
              </div>

              {/* PNG Images Zip */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "var(--bg-app)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      background: "#059669",
                      color: "#FFFFFF",
                      display: "flex",
                    }}
                  >
                    <Archive size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                      Slide Images (.zip)
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
                      Package of high-resolution PNG snapshots for every slide in the presentation.
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  disabled={Boolean(busyFormat)}
                  onClick={handleExportPngZip}
                >
                  {busyFormat === "png" ? "Zipping…" : "Download Zip"}
                </Button>
              </div>

              {/* Markdown Outline */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: "var(--bg-app)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      background: "#4B5563",
                      color: "#FFFFFF",
                      display: "flex",
                    }}
                  >
                    <FileText size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                      Markdown Outline (.md)
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-2)" }}>
                      Structured text outline with titles, bullet items, and speaker notes.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <Button variant="ghost" onClick={handleCopyMarkdown}>
                    Copy
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadMarkdown}>
                    Download
                  </Button>
                </div>
              </div>

              {progressMsg && (
                <div style={{ fontSize: "12px", color: "var(--signal)", textAlign: "center", fontWeight: 500 }}>
                  {progressMsg}
                </div>
              )}
            </div>
          )}

          {activeTab === "share" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div
                style={{
                  padding: "16px",
                  background: "var(--bg-app)",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Share2 size={16} color="var(--signal)" />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                      Read-only Presentation Link
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: isShared ? "var(--ok-weak, #DEF7EC)" : "var(--bg-panel)",
                      color: isShared ? "var(--ok, #03543F)" : "var(--ink-3)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {isShared ? "Active" : "Disabled"}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-2)", lineHeight: "1.4" }}>
                  Share links are unguessable random tokens. Anyone with the link can view the presentation in full-bleed present mode with live data interactions, but cannot make edits.
                </p>

                {isShared ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "13px",
                          fontFamily: "var(--font-mono)",
                          background: "var(--bg-panel)",
                          border: "1px solid var(--line)",
                          borderRadius: "4px",
                          color: "var(--ink)",
                        }}
                      />
                      <Button
                        variant="secondary"
                        onClick={handleCopyShareLink}
                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedLink ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "12px",
                          color: "var(--signal)",
                          textDecoration: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>Open preview in new tab</span>
                        <ExternalLink size={12} />
                      </a>

                      <Button
                        variant="danger"
                        disabled={sharingBusy}
                        onClick={handleRevokeShareLink}
                        style={{ fontSize: "12px", padding: "4px 10px" }}
                      >
                        {sharingBusy ? "Revoking…" : "Revoke Link"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: "4px" }}>
                    <Button
                      variant="primary"
                      disabled={sharingBusy}
                      onClick={handleCreateShareLink}
                      style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <Share2 size={14} />
                      <span>{sharingBusy ? "Generating…" : "Generate Share Link"}</span>
                    </Button>
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: "12px",
                  background: "var(--bg-panel)",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                }}
              >
                <ShieldAlert size={16} color="var(--ink-2)" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div style={{ fontSize: "12px", color: "var(--ink-2)", lineHeight: "1.4" }}>
                  <strong>Revocation guarantee:</strong> Revoking a link immediately disables the public URL. Navigating to the revoked token will return an honest "Presentation is no longer shared" screen.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
