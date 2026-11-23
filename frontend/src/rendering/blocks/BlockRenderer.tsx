import React from "react";
import { Block, Dataset, Variable } from "../../../../shared/spec";
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
import { HtmlBlockRenderer } from "./HtmlBlockRenderer";
import { TabsBlockRenderer } from "./TabsBlockRenderer";
import { SwotBlockRenderer } from "./SwotBlockRenderer";
import { MarketSizeBlockRenderer } from "./MarketSizeBlockRenderer";
import { FunnelBlockRenderer } from "./FunnelBlockRenderer";
import { CitationBlockRenderer } from "./CitationBlockRenderer";
import { Interactive3DViewer } from "./Lazy3DViewer";
import { UnknownBlockRenderer } from "./UnknownBlockRenderer";

export interface BlockRendererProps {
  block: Block;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
  themeChartColors?: string[];
  interactive?: boolean;
  onControlChange?: (variable: string, val: any) => void;
  onNavigateSlide?: (slideId: string) => void;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  datasets = {},
  variables = {},
  themeChartColors,
  interactive,
  onControlChange,
  onNavigateSlide,
}) => {
  switch (block.type) {
    case "text":
      return <TextBlockRenderer block={block} />;
    case "shape":
      return <ShapeBlockRenderer block={block} />;
    case "image":
      return <ImageBlockRenderer block={block} interactive={interactive} />;
    case "model3d" as any:
    case "3d" as any:
      return (
        <Interactive3DViewer
          modelType={(block as any).modelType || (block as any).model3d || "globe"}
          modelUrl={(block as any).modelUrl || (block as any).props?.modelUrl}
          accentColor={(block as any).accentColor || (themeChartColors && themeChartColors[0]) || "#38BDF8"}
        />
      );
    case "icon":
      return <IconBlockRenderer block={block} />;
    case "chart":
      return (
        <ChartBlockRenderer
          block={block}
          dataset={datasets[block.dataset]}
          datasets={datasets}
          variables={variables}
          themeChartColors={themeChartColors}
          interactive={interactive !== false}
        />
      );
    case "kpi":
      return (
        <KpiBlockRenderer
          block={block}
          datasets={datasets}
          variables={variables}
        />
      );
    case "table":
      return (
        <TableBlockRenderer
          block={block}
          dataset={datasets[block.dataset]}
          datasets={datasets}
          variables={variables}
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
          variables={variables}
          interactive={interactive}
          onValueChange={onControlChange}
          onNavigateSlide={onNavigateSlide}
        />
      );
    case "html":
      return (
        <HtmlBlockRenderer
          block={block}
          variables={variables}
          interactive={interactive}
          onVariableChange={onControlChange}
        />
      );
    case "tabs":
      return (
        <TabsBlockRenderer
          block={block}
          datasets={datasets}
          variables={variables}
          interactive={interactive}
        />
      );
    case "embed":
      return <EmbedBlockRenderer block={block} />;
    case "swot" as any:
      return <SwotBlockRenderer block={block} />;
    case "market-size" as any:
    case "tam-sam-som" as any:
      return <MarketSizeBlockRenderer block={block} />;
    case "funnel" as any:
      return <FunnelBlockRenderer block={block} />;
    case "citation" as any:
      return <CitationBlockRenderer block={block} interactive={interactive !== false} />;
    default:
      return <UnknownBlockRenderer type={(block as any).type || "unknown"} id={(block as any).id || "unknown"} />;
  }
};
