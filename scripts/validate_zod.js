import fs from "fs";
import { DeckSchema, SlideSchema, BlockSchema } from "../shared/spec.ts";

function main() {
  const input = fs.readFileSync(0, "utf-8");
  const payload = JSON.parse(input);
  const type = payload.type;
  const data = payload.data;

  try {
    if (type === "deck") {
      DeckSchema.parse(data);
    } else if (type === "slide") {
      SlideSchema.parse(data);
    } else if (type === "block") {
      BlockSchema.parse(data);
    } else {
      throw new Error(`Unknown type: ${type}`);
    }
    process.stdout.write(JSON.stringify({ ok: true }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message, issues: err.issues }));
    process.exit(1);
  }
}

main();
