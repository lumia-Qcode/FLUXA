import React, { useEffect, useState } from "react";
import { Block } from "../../../../shared/spec";
import { Globe, Image as ImageIcon, ImageOff } from "lucide-react";
import { Interactive3DViewer, Model3DType } from "./Lazy3DViewer";
import { SketchfabEmbed, isSketchfabModel } from "./SketchfabEmbed";

type ImageBlock = Extract<Block, { type: "image" }>;

interface Props {
  block: ImageBlock;
  /** False in thumbnails, print and export: 3D shows as a still image there. */
  interactive?: boolean;
}

export const ImageBlockRenderer: React.FC<Props> = ({ block, interactive = true }) => {
  const asset =
    block.assetId ||
    (block as any).props?.assetId ||
    (block as any).props?.url ||
    (block as any).url ||
    "";
  const fit = block.fit || (block as any).props?.fit || "cover";
  const radius = block.radius ?? (block as any).props?.radius ?? 14;
  const alt = block.alt || (block as any).props?.alt || "Presentation visual";
  const [hasError, setHasError] = useState(false);

  // Check if 3D mode is configured or preferred
  const default3dType = (block as any).model3d as Model3DType | undefined;
  // A topic-matched model from Sketchfab (e.g. a heart for a heart slide) wins over the built-in scenes.
  const sketchfab = (block as any).sketchfab || (block as any).props?.sketchfab;
  const hasSketchfab = isSketchfabModel(sketchfab);
  // A verified, credited image wins by default; the 3D model stays one click away ("Rotate in 3D").
  // Third-party model titles are not always accurate (a "DNA double helix" model that shows an atom),
  // so 3D opens first only when there is no image, or when the block explicitly prefers it.
  const prefer3D = Boolean((block as any).props?.prefer3d) || !asset;
  const initial3D = Boolean(hasSketchfab || default3dType || (block as any).is3D) && prefer3D;
  const [is3DMode, setIs3DMode] = useState<boolean>(initial3D);
  useEffect(() => {
    if (hasSketchfab && prefer3D) setIs3DMode(true);
  }, [hasSketchfab, sketchfab?.uid, prefer3D]);
  const [activeModel, setActiveModel] = useState<Model3DType>(default3dType || "globe");

  const credit: string = (block as any).props?.credit || (block as any).credit || "";
  const sourcePage: string = (block as any).props?.sourcePage || "";
  // No stock-photo stand-in: an image that is missing or fails to load says so.
  const src = asset
    ? asset.startsWith("http") || asset.startsWith("/") || asset.startsWith("data:") || asset.startsWith("blob:")
      ? asset
      : `/api/assets/${asset}`
    : "";

  if (is3DMode) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: `${radius}px`,
          overflow: "hidden",
        }}
      >
        {hasSketchfab ? (
          <SketchfabEmbed model={sketchfab} interactive={interactive} radius={radius} />
        ) : (
          <Interactive3DViewer
            modelType={activeModel}
            modelUrl={(block as any).modelUrl || (block as any).props?.modelUrl}
            onModelChange={(m) => setActiveModel(m)}
            style={{ width: "100%", height: "100%" }}
          />
        )}

        {/* Switch back to 2D Image button */}
        {interactive && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIs3DMode(false); }}
          title="Switch to Photo View"
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#94A3B8",
            borderRadius: "14px",
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            zIndex: 20,
          }}
        >
          <ImageIcon size={12} />
          <span>Image View</span>
        </button>
        )}
      </div>
    );
  }

  if (!src || hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        data-image-state={src ? "error" : "missing"}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: `${radius}px`,
          border: "1px dashed var(--theme-card-border, rgba(128,128,128,0.4))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          boxSizing: "border-box",
          color: "var(--ink-3, #6B7280)",
          fontSize: 20,
          textAlign: "center",
        }}
      >
        <ImageOff size={36} />
        <span>{src ? "Image could not be loaded" : "No image"}</span>
        <span style={{ fontSize: 16, maxWidth: "80%" }}>{alt}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: `${radius}px`,
        position: "relative",
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.12)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxSizing: "border-box",
        backgroundColor: "#E2E8F0",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit as any,
          display: "block",
          transition: "transform 300ms ease",
        }}
        onError={() => setHasError(true)}
        crossOrigin={src.startsWith("http") ? "anonymous" : undefined}
        referrerPolicy="no-referrer"
        decoding="async"
      />

      {/* Subtle bottom vignette gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.05) 30%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {/* 3D Mode Toggle Button: only when this slide has a real model (never a stand-in globe) */}
      {interactive && (hasSketchfab || default3dType) && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIs3DMode(true); }}
        title="Flip to Interactive 3D Globe / Model"
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
          color: "#38BDF8",
          padding: "5px 12px",
          borderRadius: "16px",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.03em",
          cursor: "pointer",
          zIndex: 5,
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
          transition: "transform 0.15s ease, background-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.95)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.8)";
        }}
      >
        <Globe size={13} />
        <span>Rotate in 3D</span>
      </button>
      )}

      {/* Licence credit for the image (Wikimedia Commons and similar sources require it) */}
      {credit && (
        <div
          className="image-credit"
          title={sourcePage || credit}
          style={{
            position: "absolute",
            bottom: 8,
            left: 10,
            right: 10,
            color: "#FFFFFF",
            fontSize: 13,
            lineHeight: 1.3,
            textShadow: "0 1px 3px rgba(0,0,0,0.85)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {credit}
        </div>
      )}
    </div>
  );
};
