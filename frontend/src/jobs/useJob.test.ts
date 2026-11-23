import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJob } from "./useJob";

const base = {
  id: "j1",
  kind: "test.echo",
  progress: 0,
  stage: "",
  message: "",
  result: null,
  error: null,
  attempts: 1,
  cancelRequested: false,
  createdAt: 1,
  startedAt: null,
  finishedAt: null,
};

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useJob", () => {
  it("follows nothing when given no id", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useJob(null));
    expect(result.current.job).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("polls until the job finishes when the browser has no EventSource", async () => {
    vi.stubGlobal("EventSource", undefined);
    const replies = [
      { ...base, status: "running", progress: 0.4, stage: "Reading files" },
      { ...base, status: "succeeded", progress: 1, result: { ok: true } },
    ];
    const fetchSpy = vi.fn((_url: string) => respond({ job: replies.shift() }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useJob("j1"));
    await waitFor(() => expect(result.current.job?.stage).toBe("Reading files"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.job?.result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/jobs/j1");
  });

  it("uses the SSE stream and stops at done", async () => {
    const instances: FakeSource[] = [];
    class FakeSource {
      url: string;
      closed = false;
      listeners: Record<string, (e: MessageEvent) => void> = {};
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }
      addEventListener(name: string, fn: (e: MessageEvent) => void) {
        this.listeners[name] = fn;
      }
      close() {
        this.closed = true;
      }
      emit(name: string, data: unknown) {
        this.listeners[name]?.({ data: JSON.stringify(data) } as MessageEvent);
      }
    }
    vi.stubGlobal("EventSource", FakeSource);
    vi.stubGlobal("fetch", vi.fn());

    const { result } = renderHook(() => useJob("j1"));
    expect(instances[0].url).toBe("/api/jobs/j1/events");
    act(() => instances[0].emit("progress", { ...base, status: "running", progress: 0.5 }));
    expect(result.current.job?.progress).toBe(0.5);
    act(() => instances[0].emit("done", { ...base, status: "failed", error: "That file isn't a deck." }));
    expect(result.current.finished).toBe(true);
    expect(result.current.job?.error).toBe("That file isn't a deck.");
    expect(instances[0].closed).toBe(true);
  });

  it("cancels through the API", async () => {
    vi.stubGlobal("EventSource", undefined);
    const fetchSpy = vi.fn((url: string) =>
      url.endsWith("/cancel")
        ? respond({ job: { ...base, status: "cancelled" } })
        : respond({ job: { ...base, status: "running" } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useJob("j1"));
    await waitFor(() => expect(result.current.job?.status).toBe("running"));
    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.job?.status).toBe("cancelled");
    expect(fetchSpy.mock.calls.some((c) => c[0] === "/api/jobs/j1/cancel")).toBe(true);
  });
});
