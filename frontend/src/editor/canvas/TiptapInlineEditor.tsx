import React, { useEffect, useRef } from "react";
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
      </div>

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
