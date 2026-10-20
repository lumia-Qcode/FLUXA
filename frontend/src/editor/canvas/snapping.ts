import { Block } from "../../../../shared/spec";

export interface SnapGuide {
  orientation: "h" | "v";
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const SNAP_THRESHOLD = 8; // logical pixels

export function computeSnapping(
  draggingBlock: { x: number; y: number; w: number; h: number },
  otherBlocks: Block[]
): SnapResult {
  let snapX = draggingBlock.x;
  let snapY = draggingBlock.y;
  const guides: SnapGuide[] = [];

  const dragLeft = draggingBlock.x;
  const dragCenter = draggingBlock.x + draggingBlock.w / 2;
  const dragRight = draggingBlock.x + draggingBlock.w;

  const dragTop = draggingBlock.y;
  const dragMiddle = draggingBlock.y + draggingBlock.h / 2;
  const dragBottom = draggingBlock.y + draggingBlock.h;

  // 1. Stage bounds snapping targets
  const targetXPoints = [
    0, // stage left
    STAGE_WIDTH / 2, // stage center
    STAGE_WIDTH, // stage right
  ];

  const targetYPoints = [
    0, // stage top
    STAGE_HEIGHT / 2, // stage middle
    STAGE_HEIGHT, // stage bottom
  ];

  // 2. Add other blocks' edge points
  for (const b of otherBlocks) {
    targetXPoints.push(b.x, b.x + b.w / 2, b.x + b.w);
    targetYPoints.push(b.y, b.y + b.h / 2, b.y + b.h);
  }

  // Find closest X snap
  let minDiffX = SNAP_THRESHOLD;
  for (const tx of targetXPoints) {
    // Snap left edge
    if (Math.abs(dragLeft - tx) < minDiffX) {
      minDiffX = Math.abs(dragLeft - tx);
      snapX = tx;
      guides.push({ orientation: "v", position: tx });
    }
    // Snap center
    else if (Math.abs(dragCenter - tx) < minDiffX) {
      minDiffX = Math.abs(dragCenter - tx);
      snapX = tx - draggingBlock.w / 2;
      guides.push({ orientation: "v", position: tx });
    }
    // Snap right edge
    else if (Math.abs(dragRight - tx) < minDiffX) {
      minDiffX = Math.abs(dragRight - tx);
      snapX = tx - draggingBlock.w;
      guides.push({ orientation: "v", position: tx });
    }
  }

  // Find closest Y snap
  let minDiffY = SNAP_THRESHOLD;
  for (const ty of targetYPoints) {
    // Snap top edge
    if (Math.abs(dragTop - ty) < minDiffY) {
      minDiffY = Math.abs(dragTop - ty);
      snapY = ty;
      guides.push({ orientation: "h", position: ty });
    }
    // Snap middle
    else if (Math.abs(dragMiddle - ty) < minDiffY) {
      minDiffY = Math.abs(dragMiddle - ty);
      snapY = ty - draggingBlock.h / 2;
      guides.push({ orientation: "h", position: ty });
    }
    // Snap bottom edge
    else if (Math.abs(dragBottom - ty) < minDiffY) {
      minDiffY = Math.abs(dragBottom - ty);
      snapY = ty - draggingBlock.h;
      guides.push({ orientation: "h", position: ty });
    }
  }

  return { x: snapX, y: snapY, guides };
}
