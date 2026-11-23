/** Voice commands for present mode. Parsing is local and deterministic (no AI per sentence). */

export type VoiceCommand =
  | { type: "next" }
  | { type: "previous" }
  | { type: "goto"; slide: number }
  | { type: "time"; minutes: number }
  | { type: "model"; query: string }
  | { type: "demo"; request: string }
  | { type: "close" };

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1,
};

function toNumber(word: string): number | null {
  const w = word.toLowerCase().trim();
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  if (w in WORD_NUMBERS) return WORD_NUMBERS[w];
  const m = /^(twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine)$/.exec(w);
  return m ? WORD_NUMBERS[m[1]] + WORD_NUMBERS[m[2]] : null;
}

const NUM = "(\\d+|[a-z]+(?:[ -][a-z]+)?)";

export function parseVoiceCommand(raw: string): VoiceCommand | null {
  const t = raw.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  if (/\b(close|hide|dismiss) (the )?(model|demo|overlay)\b|\bback to (the )?slides?\b/.test(t)) return { type: "close" };
  if (/\b(next slide|go forward|move on to the next|skip ahead)\b/.test(t)) return { type: "next" };
  if (/\b(previous slide|go back( a slide)?|last slide back|back one slide)\b/.test(t)) return { type: "previous" };

  let m = new RegExp(`\\b(?:go to|jump to|show|open) (?:the )?slide (?:number )?${NUM}\\b`).exec(t)
    || new RegExp(`\\b(?:go to|jump to) (?:the )?${NUM} slide\\b`).exec(t);
  if (m) {
    const n = toNumber(m[1]);
    if (n !== null) return { type: "goto", slide: n };
  }

  m = new RegExp(`\\b(?:i have|i've got|i got|we have|we've got|only|just) ${NUM} (?:more )?minutes?\\b`).exec(t)
    || new RegExp(`\\b${NUM} minutes? (?:left|remaining)\\b`).exec(t);
  if (m) {
    const n = toNumber(m[1]);
    if (n !== null && n > 0 && n <= 240) return { type: "time", minutes: n };
  }

  m = /\b(?:show|display|bring up|open)(?: me| us)? (?:a |an |the )?(?:3d|three d|3 d) (?:model|view|scene) of (?:a |an |the )?(.+)$/.exec(t)
    || /\b(?:show|display|bring up)(?: me| us)? (?:a |an |the )?(.+?) in (?:3d|three d|3 d)\b/.exec(t);
  if (m && m[1].trim().length >= 3) return { type: "model", query: m[1].trim().slice(0, 80) };

  m = /\b(?:demonstrate|build a demo of|show a demo of|make a demo of|create a demo of)(?: a| an| the)? (.+)$/.exec(t);
  if (m && m[1].trim().length >= 5) return { type: "demo", request: m[1].trim().slice(0, 300) };

  return null;
}

export function describeCommand(c: VoiceCommand): string {
  switch (c.type) {
    case "next": return "Next slide";
    case "previous": return "Previous slide";
    case "goto": return c.slide === -1 ? "Last slide" : `Slide ${c.slide}`;
    case "time": return `Fitting the talk into ${c.minutes} min…`;
    case "model": return `Finding a 3D model of ${c.query}…`;
    case "demo": return `Building a demo: ${c.request}…`;
    case "close": return "Back to the slides";
  }
}
