import React from "react";
import { Block, Dataset } from "../../../../shared/spec";
import { TextBlockRenderer } from "./TextBlockRenderer";
import { ShapeBlockRenderer } from "./ShapeBlockRenderer";
import { ImageBlockRenderer } from "./ImageBlockRenderer";
import { IconBlockRenderer } from "./IconBlockRenderer";
import { ChartBlockRenderer } from "./ChartBlockRenderer";
import { KpiBlockRenderer } from "./KpiBlockRenderer";
import { TableBlockRenderer } from "./TableBlockRenderer";
import { StepsTimelineBlockRenderer } from "./StepsTimelineBlockRenderer";
import { ComparisonBlockRenderer } from "./ComparisonBlockRenderer";
import { QuoteBlockRenderer } from "./QuoteBlockRenderer";
import { ControlBlockRenderer } from "./ControlBlockRenderer";
import { EmbedBlockRenderer } from "./EmbedBlockRenderer";
import { UnknownBlockRenderer } from "./UnknownBlockRenderer";

interface Props {
  block: Block;
  datasets?: Record<string, Dataset>;
  themeChartColors?: string[];
  interactive?: boolean;
  onControlChange?: (variable: string, val: any) => void;
}

export const BlockRenderer: React.FC<Props> = ({
  block,
  datasets,
  themeChartColors,
  interactive,
  onControlChange,
}) => {
  switch (block.type) {
    case "text":
      return <TextBlockRenderer block={block} />;
    case "shape":
      return <ShapeBlockRenderer block={block} />;
    case "image":
      return <ImageBlockRenderer block={block} />;
    case "icon":
      return <IconBlockRenderer block={block} />;
    case "chart":
      return (
        <ChartBlockRenderer
          block={block}
          dataset={datasets?.[block.dataset]}
          themeChartColors={themeChartColors}
        />
      );
    case "kpi":
      return <KpiBlockRenderer block={block} />;
    case "table":
      return (
        <TableBlockRenderer
          block={block}
          dataset={datasets?.[block.dataset]}
        />
      );
    case "steps":
    case "timeline":
      return <StepsTimelineBlockRenderer block={block} />;
    case "comparison":
      return <ComparisonBlockRenderer block={block} />;
    case "quote":
      return <QuoteBlockRenderer block={block} />;
    case "control":
      return (
        <ControlBlockRenderer
          block={block}
          interactive={interactive}
          onValueChange={onControlChange}
        />
      );
    case "embed":
      return <EmbedBlockRenderer block={block} />;
    default:
      return <UnknownBlockRenderer type={(block as any).type || "unknown"} id={block.id} />;
  }
};
