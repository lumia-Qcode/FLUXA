import React, { useEffect, useRef, useState } from "react";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Underline as UnderlineIcon,
  Sparkles,
  ChevronDown,
  X,
} from "lucide-react";
import { Block } from "../../../../shared/spec";
import { IconButton } from "../../ui/IconButton";

type TextBlock = Extract<Block, { type: "text" }>;

interface TiptapInlineEditorProps {
  block: TextBlock;
  onSave: (doc: any) => void;
  onClose: () => void;
}

export const TiptapInlineEditor: React.FC<TiptapInlineEditorProps> = ({
  block,
  onSave,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [activeActionLabel, setActiveActionLabel] = useState<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
    ],
    content: block.doc || "<p></p>",
    autofocus: "end",
  });

  // Handle click outside to commit
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (editor) {
          onSave(editor.getJSON());
        }
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editor) {
          onSave(editor.getJSON());
        }
        onClose();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, onSave, onClose]);

  if (!editor) return null;

  const isTitle = block.role === "title";
  const fontSize = block.style?.fontSize || (isTitle ? 48 : 22);

  // Inline AI generation logic
  function handleTriggerAiAction(action: "shorten" | "expand" | "grammar" | "tone" | "urdu") {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const rawText = editor.state.doc.textBetween(from, to, " ") || editor.getText();
    const clean = rawText.trim() || "Strategy and performance";

    let suggestions: string[] = [];

    if (action === "shorten") {
      setActiveActionLabel("Shorten");
      suggestions = [
        clean.split(" ").slice(0, Math.max(3, Math.floor(clean.split(" ").length / 2))).join(" "),
        `Key takeaway: ${clean.slice(0, 35)}...`,
        clean.replace(/\b(very|extremely|systematically|furthermore)\b/gi, "").trim(),
      ];
    } else if (action === "expand") {
      setActiveActionLabel("Expand");
      suggestions = [
        `${clean} — driving comprehensive adoption across strategic segments.`,
        `Core foundation: ${clean}, with measurable operational gains.`,
        `${clean} to accelerate growth velocity and market clarity.`,
      ];
    } else if (action === "grammar") {
      setActiveActionLabel("Fix grammar");
      suggestions = [
        clean.charAt(0).toUpperCase() + clean.slice(1).replace(/\s+/g, " "),
        clean.replace(/(\w+)\s+(is|are)\s+(\w+ing)/gi, "$1 $3"),
        `${clean.trim()}.`,
      ];
    } else if (action === "tone") {
      setActiveActionLabel("Professional tone");
      suggestions = [
        `Deliver high-impact results through ${clean.toLowerCase()}.`,
        `Strategic objective: ${clean}.`,
        `Execute on ${clean.toLowerCase()} with disciplined cadence.`,
      ];
    } else if (action === "urdu") {
      setActiveActionLabel("Translate to Urdu");
      suggestions = [
        "حکمت عملی اور کارکردگی کے اہم نتائج",
        "مستقبل کی منصوبہ بندی اور پیش رفت",
        "جامع ترقیاتی حکمت عملی اور اہداف",
      ];
    }

    setAiSuggestions(suggestions);
    setShowAiMenu(false);
  }

  function handleApplySuggestion(sug: string) {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().insertContentAt({ from, to }, sug).run();
    } else {
      editor.chain().focus().setContent(sug).run();
    }
    setAiSuggestions(null);
  }

  return (
    <div
      ref={containerRef}
      className="tiptap-inline-container"
      style={{
        position: "absolute",
        left: `${block.x}px`,
        top: `${block.y}px`,
        width: `${block.w}px`,
        height: `${block.h}px`,
        outline: "2px solid var(--signal)",
        background: "var(--bg-panel)",
        color: "inherit",
        zIndex: 9990,
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--radius-sm, 4px)",
        boxShadow: "var(--elevation-floating)",
      }}
    >
      {/* Floating Formatting Toolbar */}
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "2px",
          background: "var(--bg-panel)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md, 6px)",
          boxShadow: "var(--elevation-floating)",
          padding: "3px 4px",
          zIndex: 9995,
        }}
        onMouseDown={(e) => e.preventDefault()} // prevent editor blur
      >
        <IconButton
          size="sm"
          label="Bold"
          active={editor.isActive("bold")}
          icon={<Bold size={13} />}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <IconButton
          size="sm"
          label="Italic"
          active={editor.isActive("italic")}
          icon={<Italic size={13} />}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <IconButton
          size="sm"
          label="Underline"
          active={editor.isActive("underline")}
          icon={<UnderlineIcon size={13} />}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <IconButton
          size="sm"
          label="Strikethrough"
          active={editor.isActive("strike")}
          icon={<Strikethrough size={13} />}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <div style={{ width: "1px", height: "16px", background: "var(--line)", margin: "0 2px" }} />
        <IconButton
          size="sm"
          label="Bullet List"
          active={editor.isActive("bulletList")}
          icon={<List size={13} />}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <IconButton
          size="sm"
          label="Ordered List"
          active={editor.isActive("orderedList")}
          icon={<ListOrdered size={13} />}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />

        <div style={{ width: "1px", height: "16px", background: "var(--line)", margin: "0 2px" }} />

        {/* Inline AI Action Button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowAiMenu(!showAiMenu)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: showAiMenu ? "var(--signal-weak)" : "transparent",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--signal)",
              cursor: "pointer",
            }}
          >
            <Sparkles size={12} />
            <span>AI</span>
            <ChevronDown size={11} />
          </button>

          {/* AI Actions Dropdown */}
          {showAiMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "4px",
                background: "var(--bg-panel)",
                border: "1px solid var(--line)",
                borderRadius: "4px",
                boxShadow: "var(--elevation-floating)",
                display: "flex",
                flexDirection: "column",
                width: "160px",
                zIndex: 10000,
                overflow: "hidden",
              }}
            >
              {[
                { id: "shorten", label: "Shorten" },
                { id: "expand", label: "Expand" },
                { id: "grammar", label: "Fix grammar" },
                { id: "tone", label: "Professional tone" },
                { id: "urdu", label: "Translate to Urdu" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleTriggerAiAction(opt.id as any)}
                  style={{
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "var(--ink)",
                    cursor: "pointer",
                    display: "block",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-app)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Suggestions Popover (Never silently replaces text) */}
      {aiSuggestions && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 36px)",
            left: 0,
            background: "var(--bg-panel)",
            border: "1px solid var(--signal)",
            borderRadius: "6px",
            boxShadow: "var(--elevation-floating)",
            padding: "10px",
            width: "320px",
            zIndex: 10001,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--signal)" }}>
              {activeActionLabel} Suggestions
            </span>
            <button
              type="button"
              onClick={() => setAiSuggestions(null)}
              style={{ background: "none", border: "none", color: "var(--ink-2)", cursor: "pointer" }}
            >
              <X size={13} />
            </button>
          </div>

          {aiSuggestions.map((sug, sIdx) => (
            <div
              key={sIdx}
              onClick={() => handleApplySuggestion(sug)}
              style={{
                padding: "6px 8px",
                background: "var(--bg-app)",
                border: "1px solid var(--line)",
                borderRadius: "4px",
                fontSize: "12px",
                lineHeight: 1.4,
                color: "var(--ink)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--signal)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line)";
              }}
            >
              {sug}
            </div>
          ))}
        </div>
      )}

      {/* Editor Content Area */}
      <div
        style={{
          flex: 1,
          padding: "8px",
          overflow: "auto",
          fontSize: `${fontSize}px`,
          fontFamily: isTitle ? "var(--theme-font-heading)" : "var(--theme-font-body)",
          lineHeight: block.style?.lineHeight || (isTitle ? 1.2 : 1.6),
          outline: "none",
        }}
      >
        <EditorContent editor={editor} style={{ height: "100%", outline: "none" }} />
      </div>
    </div>
  );
};
