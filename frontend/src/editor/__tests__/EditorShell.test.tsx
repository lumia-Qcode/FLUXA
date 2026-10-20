import { render, screen } from "@testing-library/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DeckDocument } from "../store/types";
import { DocumentProvider } from "../store/DocumentContext";
import { EditorShell } from "../EditorShell";
import { ToastProvider } from "../../ui";

const initialDoc: DeckDocument = {
  id: 42,
  title: "Phase 3 Executive Overview",
  theme: { themeId: "midnight" },
  datasets: {},
  variables: {},
  settings: { transition: { effect: "fade", duration: 300 }, loop: false },
  revision: 1,
  schemaVersion: 1,
  slides: [
    {
      id: "slide-1",
      order: 0,
      layout: "title",
      notes: "Speaker note for slide 1",
      blocks: [
        {
          id: "b-1",
          type: "text",
          x: 10,
          y: 20,
          w: 80,
          h: 20,
          content: "Phase 3 Executive Overview",
          role: "title",
        },
      ],
    },
    {
      id: "slide-2",
      order: 1,
      layout: "bullets",
      notes: "",
      blocks: [],
    },
  ],
};

function renderEditor() {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <DocumentProvider initialDoc={initialDoc}>
          <EditorShell />
        </DocumentProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

describe("EditorShell", () => {
  it("renders the 40px top bar with editable deck title, save status, and actions", () => {
    renderEditor();

    // Top bar title input
    const titleInput = screen.getByDisplayValue("Phase 3 Executive Overview");
    expect(titleInput).toBeInTheDocument();

    // Save status indicator
    expect(screen.getByText(/Saved/i)).toBeInTheDocument();

    // Present button
    expect(screen.getByRole("button", { name: /^Present$/ })).toBeInTheDocument();

    // Export button
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });

  it("renders the 200px left slide rail with slide thumbnails and add button", () => {
    renderEditor();

    const rail = document.querySelector(".ui-slide-rail");
    expect(rail).toBeInTheDocument();

    // Slide numbers
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Add slide button
    expect(screen.getByLabelText("Add slide")).toBeInTheDocument();
  });

  it("renders the center canvas with zoom controls", () => {
    renderEditor();

    const canvas = document.querySelector(".ui-editor-canvas");
    expect(canvas).toBeInTheDocument();

    // Zoom controls in bottom right
    expect(screen.getByTitle("Zoom out")).toBeInTheDocument();
    expect(screen.getByTitle("Zoom in")).toBeInTheDocument();
    expect(screen.getByTitle("Reset zoom")).toBeInTheDocument();
  });

  it("renders the 300px right inspector with tabs", () => {
    renderEditor();

    const inspector = document.querySelector(".ui-inspector-panel");
    expect(inspector).toBeInTheDocument();

    // Inspector tabs
    expect(screen.getByRole("tab", { name: "Design" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Animate" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ask" })).toBeInTheDocument();
  });
});
