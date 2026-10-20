import { describe, it, expect, vi } from "vitest";
import { postStream, StreamCallbacks } from "../streamClient";

describe("postStream client", () => {
  it("parses SSE lines for outline, slide, progress, and done", async () => {
    const ssePayload = [
      'event: outline\ndata: {"title": "Test Topic", "slides": [{"title": "S1"}]}\n\n',
      'event: slide\ndata: {"index": 0, "slide": {"title": "S1"}}\n\n',
      'event: progress\ndata: {"current": 1, "total": 1}\n\n',
      'event: done\ndata: {"presentation": {"id": 10}}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    // Mock fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });
    vi.stubGlobal("fetch", fetchMock);

    const onOutline = vi.fn();
    const onSlide = vi.fn();
    const onProgress = vi.fn();
    const onDone = vi.fn();

    const callbacks: StreamCallbacks = {
      onOutline,
      onSlide,
      onProgress,
      onDone,
    };

    await postStream("/api/presentations/generate", { topic: "Test" }, callbacks);

    expect(onOutline).toHaveBeenCalledWith({
      title: "Test Topic",
      slides: [{ title: "S1" }],
    });
    expect(onSlide).toHaveBeenCalledWith({
      index: 0,
      slide: { title: "S1" },
    });
    expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 1 });
    expect(onDone).toHaveBeenCalledWith({ presentation: { id: 10 } });

    vi.unstubAllGlobals();
  });
});
