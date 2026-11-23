import React from "react";
import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineDoc } from "../OutlineDoc";
import { PipelineTimeline } from "../PipelineTimeline";
import { buildPreviewSlide, layoutRects, OutlineItem } from "../previewSpec";
import { LAYOUTS } from "../../../rendering/layouts";

const items: OutlineItem[] = [
  { title: "Intro", layout: "title", purpose: "Why this matters", _key: "a" },
  { title: "Body", layout: "bullets", purpose: "The details", visual: "chart", _key: "b" },
];

function doc(overrides: Partial<React.ComponentProps<typeof OutlineDoc>> = {}) {
  const props = {
    deckTitle: "Deck",
    onDeckTitleChange: vi.fn(),
    meta: ["2 slides"],
    items,
    layoutName: (id?: string) => id || "Bullets",
    selectedIdx: 0,
    onSelect: vi.fn(),
    onUpdate: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onInsertAfter: vi.fn(),
    onRegenerate: vi.fn(),
    regeneratingIdx: null,
    maxItems: 15,
    ...overrides,
  };
  render(<OutlineDoc {...props} />);
  return props;
}

test("renders each slide as an editable row with its key point and layout tag", () => {
  doc();
  expect(screen.getByLabelText("Slide 1 title")).toHaveValue("Intro");
  expect(screen.getByLabelText("Slide 2 key point")).toHaveValue("The details");
  expect(screen.getByText("chart")).toBeInTheDocument();
});

test("Enter in a title inserts a slide after it; Alt+ArrowDown reorders", () => {
  const props = doc();
  fireEvent.keyDown(screen.getByLabelText("Slide 1 title"), { key: "Enter" });
  expect(props.onInsertAfter).toHaveBeenCalledWith(0);
  fireEvent.keyDown(screen.getByLabelText("Slide 1 title"), { key: "ArrowDown", altKey: true });
  expect(props.onMove).toHaveBeenCalledWith(0, 1);
});

test("feedback toggles and the last slide can't be deleted", async () => {
  const props = doc({ items: [items[0]] });
  await userEvent.click(screen.getByRole("button", { name: "Good slide 1" }));
  expect(props.onUpdate).toHaveBeenCalledWith(0, { _feedback: "up" });
  expect(screen.getByRole("button", { name: "Delete slide 1" })).toBeDisabled();
});

test("sources render as numbered links that open safely", () => {
  doc({ sources: [{ title: "Study", url: "https://www.example.org/x" }] });
  expect(screen.getByRole("link", { name: /example\.org/ })).toHaveAttribute("rel", "noopener noreferrer");
});

test("timeline marks the active step and shows the live log there", async () => {
  const onCancel = vi.fn();
  render(
    <PipelineTimeline
      heading="Drafting"
      steps={[
        { id: "a", title: "Brief", status: "done" },
        { id: "b", title: "Draft", status: "active" },
        { id: "c", title: "Review", status: "pending" },
      ]}
      log={["Brief sent", "Waiting"]}
      elapsedSeconds={65}
      onCancel={onCancel}
    />
  );
  expect(screen.getByText("Draft").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByLabelText("Live log")).toHaveTextContent("Waiting");
  expect(screen.getByText("1:05")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalled();
});

test("preview spec puts the title and key point into real text blocks", () => {
  const layout = LAYOUTS.find((l) => l.id === "chart-text") || LAYOUTS[0];
  const spec = buildPreviewSlide({ title: "Revenue", purpose: "Up 20%", visual: "chart" }, layout, "Deck");
  const texts = spec.blocks.filter((b) => b.type === "text");
  expect(texts.some((b) => b.text === "Revenue")).toBe(true);
  expect(spec.blocks.every((b) => typeof b.x === "number" && typeof b.w === "number")).toBe(true);
  expect(layoutRects(layout).length).toBe(layout.slots.length);
});
