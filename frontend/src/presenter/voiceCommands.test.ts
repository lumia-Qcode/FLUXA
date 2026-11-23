import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voiceCommands";
import { keywords, slideText } from "./speech";

describe("voice commands", () => {
  it("moves between slides", () => {
    expect(parseVoiceCommand("Next slide please")).toEqual({ type: "next" });
    expect(parseVoiceCommand("okay go back")).toEqual({ type: "previous" });
    expect(parseVoiceCommand("go to slide five")).toEqual({ type: "goto", slide: 5 });
    expect(parseVoiceCommand("Jump to slide 12.")).toEqual({ type: "goto", slide: 12 });
    expect(parseVoiceCommand("go to the last slide")).toEqual({ type: "goto", slide: -1 });
  });

  it("understands time left", () => {
    expect(parseVoiceCommand("I have 5 minutes left")).toEqual({ type: "time", minutes: 5 });
    expect(parseVoiceCommand("we've got ten minutes")).toEqual({ type: "time", minutes: 10 });
    expect(parseVoiceCommand("only twenty five minutes remaining")).toEqual({ type: "time", minutes: 25 });
  });

  it("asks for 3D models and demos", () => {
    expect(parseVoiceCommand("Show me a 3D model of a human heart")).toEqual({ type: "model", query: "human heart" });
    expect(parseVoiceCommand("show the jet engine in 3D")).toEqual({ type: "model", query: "jet engine" });
    expect(parseVoiceCommand("Demonstrate a compound interest calculator")).toEqual({ type: "demo", request: "compound interest calculator" });
    expect(parseVoiceCommand("back to the slides")).toEqual({ type: "close" });
  });

  it("ignores ordinary talk", () => {
    expect(parseVoiceCommand("hospitals adopted AI quickly in radiology")).toBeNull();
    expect(parseVoiceCommand("the next big thing is ambient scribing")).toBeNull();
    expect(parseVoiceCommand("")).toBeNull();
  });

  it("reads slide text for Autopilot matching", () => {
    const slide = {
      notes: "Mention the sepsis study",
      blocks: [
        { role: "title", content: "Radiology leads adoption" },
        { role: "body", bullets: ["78% of departments use AI"] },
      ],
    };
    const t = slideText(slide);
    expect(t.title).toBe("Radiology leads adoption");
    expect(keywords(t.text)).toEqual(expect.arrayContaining(["radiology", "adoption", "departments", "sepsis"]));
  });
});
