import React from "react";

/** A Sketchfab model chosen for the slide's topic (see app/ai/model_library.py). */
export interface SketchfabModel {
  uid: string;
  name: string;
  author?: string;
  authorUrl?: string;
  license?: string;
  thumbnail?: string;
  viewerUrl?: string;
  query?: string;
}

const UID_RE = /^[0-9a-f]{32}$/;

export function isSketchfabModel(value: unknown): value is SketchfabModel {
  return !!value && typeof value === "object" && UID_RE.test(String((value as SketchfabModel).uid || ""));
}

interface Props {
  model: SketchfabModel;
  /** Live, rotatable viewer when true; a still image (thumbnails, print, export) when false. */
  interactive?: boolean;
  radius?: number;
}

/**
 * Shows a real 3D model from Sketchfab's public library in Sketchfab's own viewer
 * (drag to rotate, scroll to zoom), with the author credit its licence asks for.
 */
export const SketchfabEmbed: React.FC<Props> = ({ model, interactive = true, radius = 14 }) => {
  if (!isSketchfabModel(model)) return null;
  const params = new URLSearchParams({
    autostart: "1",
    autospin: "0.2",
    preload: "1",
    transparent: "1",
    ui_theme: "dark",
    ui_infos: "0",
    ui_hint: "0",
    ui_help: "0",
    ui_settings: "0",
    ui_vr: "0",
    ui_ar: "0",
    ui_inspector: "0",
    ui_annotations: "0",
    ui_stop: "0",
    ui_watermark_link: "0",
  });
  const src = `https://sketchfab.com/models/${model.uid}/embed?${params}`;
  const credit = [model.name, model.author && `by ${model.author}`, model.license && `(${model.license})`].filter(Boolean).join(" ");

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: `${radius}px`,
        overflow: "hidden",
        background: "radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)",
      }}
    >
      {interactive ? (
        <iframe
          title={`3D model: ${model.name}`}
          src={src}
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      ) : model.thumbnail ? (
        <img
          src={model.thumbnail}
          alt={model.name}
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : null}
      <a
        href={model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "10px",
          bottom: "10px",
          maxWidth: "calc(100% - 20px)",
          padding: "3px 8px",
          borderRadius: "8px",
          background: "rgba(2, 6, 23, 0.72)",
          color: "#CBD5E1",
          fontSize: "11px",
          lineHeight: 1.4,
          textDecoration: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          pointerEvents: interactive ? "auto" : "none",
        }}
      >
        3D: {credit} · Sketchfab
      </a>
    </div>
  );
};
