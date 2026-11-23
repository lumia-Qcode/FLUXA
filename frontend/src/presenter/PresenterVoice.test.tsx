import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresenterVoice } from "./PresenterVoice";
import { useSpeechEngine } from "./speech";

/** A stand-in for the browser's SpeechRecognition that the test "speaks" into. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = 0;
  onresult: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
  abort() {}
  say(text: string, final: boolean) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: final })] });
  }
}

const slides = [
  { id: "s1", blocks: [{ type: "text", text: "Welcome" }] },
  { id: "s2", blocks: [{ type: "text", text: "Battery prices" }] },
  { id: "s3", blocks: [{ type: "text", text: "Recycling" }] },
];

function Harness({ onGoTo }: { onGoTo: (i: number) => void }) {
  const engine = useSpeechEngine("en-US");
  return <PresenterVoice engine={engine} slides={slides} allSlides={slides} currentIndex={0} presentationId={1} onGoTo={onGoTo} onSkip={() => {}} />;
}

let consentActive = true;

beforeEach(() => {
  consentActive = true;
  (window as any).SpeechRecognition = FakeRecognition;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("consents") ? { consents: consentActive ? [{ purpose: "mic_capture", active: true }] : [] } : {}),
    }))
  );
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

afterEach(() => {
  delete (window as any).SpeechRecognition;
  vi.unstubAllGlobals();
});

describe("presenter voice", () => {
  it("runs “next slide” on the unfinished phrase, and only once", async () => {
    const onGoTo = vi.fn();
    render(<Harness onGoTo={onGoTo} />);
    fireEvent.click(screen.getByRole("button", { name: /^voice$/i }));
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(1));
    act(() => FakeRecognition.last!.say("next slide", false));
    act(() => FakeRecognition.last!.say("next slide please", false));
    act(() => FakeRecognition.last!.say("next slide please", true));
    expect(onGoTo).toHaveBeenCalledTimes(1);
    expect(onGoTo).toHaveBeenCalledWith(1);
  });

  it("waits for the full phrase before jumping to a numbered slide", async () => {
    const onGoTo = vi.fn();
    render(<Harness onGoTo={onGoTo} />);
    fireEvent.click(screen.getByRole("button", { name: /^voice$/i }));
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(1));
    act(() => FakeRecognition.last!.say("go to slide 3", false));
    expect(onGoTo).not.toHaveBeenCalled();
    act(() => FakeRecognition.last!.say("go to slide 3", true));
    expect(onGoTo).toHaveBeenCalledWith(2);
  });

  it("asks for consent in the page (not a browser dialog) the first time", async () => {
    consentActive = false;
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Harness onGoTo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^voice$/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("says plainly when there is no microphone", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(Object.assign(new Error("none"), { name: "NotFoundError" })) },
    });
    render(<Harness onGoTo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^voice$/i }));
    expect(await screen.findByText(/No microphone found/)).toBeTruthy();
  });

  it("keeps listening after the browser's pause, and backs off when offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness onGoTo={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /^voice$/i }));
      await waitFor(() => expect(FakeRecognition.last?.started).toBe(1));
      const rec = FakeRecognition.last!;
      act(() => rec.onend?.()); // normal silence timeout
      await act(async () => vi.advanceTimersByTime(200));
      expect(rec.started).toBe(2);
      act(() => {
        rec.onerror?.({ error: "network" });
        rec.onend?.();
      });
      expect(screen.getByText(/needs the internet/)).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(300));
      expect(rec.started).toBe(2); // not restarted in a tight loop
      await act(async () => vi.advanceTimersByTime(1000));
      expect(rec.started).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
