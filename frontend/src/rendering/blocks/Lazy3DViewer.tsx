import React, { Suspense } from "react";
import type { Model3DType } from "./Interactive3DViewer";

export type { Model3DType };

type ViewerProps = React.ComponentProps<typeof import("./Interactive3DViewer").Interactive3DViewer>;

// three.js (about 1.7 MB) loads only when a 3D block is actually rendered (D1 item 1).
const Viewer = React.lazy(() => import("./Interactive3DViewer").then((m) => ({ default: m.Interactive3DViewer })));

/** Same box and background as the viewer, so nothing shifts while three.js loads. */
const Placeholder: React.FC<{ style?: React.CSSProperties; className?: string }> = ({ style, className }) => (
  <div
    aria-hidden="true"
    className={`interactive-3d-container ${className || ""}`}
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: "260px",
      borderRadius: "16px",
      overflow: "hidden",
      background: "radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 40px rgba(56, 189, 248, 0.08)",
      ...style,
    }}
  />
);

export const Interactive3DViewer: React.FC<ViewerProps> = (props) => (
  <Suspense fallback={<Placeholder style={props.style} className={props.className} />}>
    <Viewer {...props} />
  </Suspense>
);
