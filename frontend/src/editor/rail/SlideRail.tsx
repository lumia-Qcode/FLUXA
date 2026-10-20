import React, { useRef, useState } from "react";
import { Grid, Plus } from "lucide-react";
import { Slide } from "../../../../shared/spec";
import { Theme } from "../../rendering/themes";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Panel } from "../../ui/Panel";
import { useToast } from "../../ui/Toast";
import { commands } from "../store/documentStore";
import { useDocument } from "../store/DocumentContext";
import { SlideThumbnail } from "./SlideThumbnail";

interface SlideRailProps {
  theme: Theme;
  onOpenSorter: () => void;
}

export const SlideRail: React.FC<SlideRailProps> = ({ theme, onOpenSorter }) => {
  const { doc, selectedSlideId, setSelectedSlideId, execute } = useDocument();
  const { showToast } = useToast();
  const draggedIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAddSlide = (atIndex?: number) => {
    const targetIdx = atIndex !== undefined ? atIndex : doc.slides.length;
    const newSlideId = `slide-${Date.now()}`;
    const newSlide: Slide = {
      id: newSlideId,
      order: targetIdx,
      layout: "title",
      blocks: [
        {
          id: `b-title-${Date.now()}`,
          type: "text",
          role: "title",
          x: 200,
          y: 400,
          w: 1520,
          h: 160,
          doc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "New Slide" }] }],
          },
          style: { fontSize: 56, fontWeight: 700, align: "center" },
        },
      ],
      notes: "",
      transition: { effect: "fade", duration: 300 },
    };

    execute("Add Slide", commands.addSlide(targetIdx, newSlide));
    setSelectedSlideId(newSlideId);
  };

  const handleDeleteSlide = (slideId: string) => {
    const slideToDelete = doc.slides.find((s) => s.id === slideId);
    if (!slideToDelete || doc.slides.length <= 1) return;

    execute("Delete Slide", commands.removeSlide(slideId));

    // Offer Undo Toast instead of confirmation dialog per Section 5.7!
    showToast({
      message: `Deleted slide ${slideToDelete.order + 1}`,
      action: {
        label: "Undo",
        onClick: () => {
          execute("Undo Delete Slide", commands.addSlide(slideToDelete.order, slideToDelete));
          setSelectedSlideId(slideToDelete.id);
        },
      },
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = draggedIndexRef.current;
    draggedIndexRef.current = null;
    setDragOverIndex(null);

    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const newSlideIds = [...doc.slides.map((s) => s.id)];
    const [movedId] = newSlideIds.splice(sourceIndex, 1);
    newSlideIds.splice(targetIndex, 0, movedId);

    // Apply locally
    execute("Reorder Slides", commands.reorderSlides(newSlideIds));

    // Sync with existing backend reorder route
    try {
      // Map slide ids to numeric database ids if possible
      const numericIds = newSlideIds.map((id) => parseInt(id.replace("slide-", ""), 10));
      if (!numericIds.some(isNaN)) {
        await fetch(`/api/presentations/${doc.id}/reorder`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide_ids: numericIds }),
        });
      }
    } catch {
      // Fallback: autosave will sync specs
    }
  };

  return (
    <Panel
      className="ui-slide-rail"
      borderRight
      style={{
        width: "200px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
      title={`Slides (${doc.slides.length})`}
      actions={
        <div style={{ display: "flex", gap: "2px" }}>
          <IconButton
            size="sm"
            label="Slide sorter (G)"
            icon={<Grid size={13} />}
            onClick={onOpenSorter}
          />
          <IconButton
            size="sm"
            label="Add slide"
            icon={<Plus size={13} />}
            onClick={() => handleAddSlide()}
          />
        </div>
      }
    >
      <div
        className="ui-slide-rail-list"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "8px",
          overflowY: "auto",
        }}
      >
        {doc.slides.map((slide, idx) => (
          <SlideThumbnail
            key={slide.id}
            slide={slide}
            index={idx}
            isActive={slide.id === selectedSlideId}
            theme={theme}
            datasets={doc.datasets}
            variables={doc.variables}
            onSelect={() => setSelectedSlideId(slide.id)}
            onDuplicate={() => execute("Duplicate Slide", commands.duplicateSlide(slide.id))}
            onDelete={() => handleDeleteSlide(slide.id)}
            onHideToggle={() => {
              execute("Toggle Hide Slide", (draft) => {
                const s = draft.slides.find((sl) => sl.id === slide.id);
                if (s) s.hidden = !s.hidden;
              });
            }}
            onNewSlideAfter={() => handleAddSlide(idx + 1)}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
          />
        ))}

        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => handleAddSlide()}
          style={{ width: "100%", marginTop: "4px" }}
        >
          Add slide
        </Button>
      </div>
    </Panel>
  );
};
