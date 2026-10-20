import React from "react";
import { Block } from "../../../../shared/spec";

type EmbedBlock = Extract<Block, { type: "embed" }>;

interface Props {
  block: EmbedBlock;
}

export const EmbedBlockRenderer: React.FC<Props> = ({ block }) => {
  const { kind, src } = block;

  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "6px" }}
      />
    );
  }

  return (
    <iframe
      src={src}
      title="Embed"
      sandbox="allow-scripts allow-same-origin"
      style={{ width: "100%", height: "100%", border: "none", borderRadius: "6px" }}
    />
  );
};
