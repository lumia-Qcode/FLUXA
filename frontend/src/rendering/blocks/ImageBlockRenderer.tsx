import React from "react";
import { Block } from "../../../../shared/spec";

type ImageBlock = Extract<Block, { type: "image" }>;

interface Props {
  block: ImageBlock;
}

export const ImageBlockRenderer: React.FC<Props> = ({ block }) => {
  const { assetId, fit = "cover", radius = 0, alt = "" } = block;
  const src = assetId.startsWith("http") || assetId.startsWith("/") ? assetId : `/api/assets/${assetId}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: `${radius}px`,
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          display: "block",
        }}
        onError={(e) => {
          // Graceful fallback for missing assets
          (e.target as HTMLElement).style.display = "none";
        }}
      />
    </div>
  );
};
