import PptxGenJS from "pptxgenjs";
import { Block, Slide } from "../../../shared/spec";
import { DeckDocument } from "../editor/store/types";
import { getTheme, Theme } from "../rendering/themes";
import { buildReactiveScope } from "../runtime/reactiveEngine";

// Stage 1920x1080 px -> PowerPoint 13.333x7.5 inches (144 px = 1 inch)
const SCALE = 144;

function pxToIn(px: number): number {
  return Number((px / SCALE).toFixed(3));
}

function hexClean(hex?: string, defaultHex = "000000"): string {
  if (!hex) return defaultHex;
  return hex.replace("#", "").trim();
}

/**
 * Extract plain text or structured runs from a ProseMirror doc
 */
function extractTextRuns(
  block: Extract<Block, { type: "text" }>,
  fontFace: string,
  defaultColor: string
): PptxGenJS.TextProps[] {
  const doc = block.doc;
  const runs: PptxGenJS.TextProps[] = [];

  const baseFontSize = block.style?.fontSize ? Math.round(block.style.fontSize * 0.75) : 16;
  const blockColor = hexClean(block.style?.color, defaultColor);

  if (doc && Array.isArray(doc.content)) {
    for (const node of doc.content) {
      if (node.type === "paragraph" && Array.isArray(node.content)) {
        for (const item of node.content) {
          if (item.type === "text" && item.text) {
            const isBold = item.marks?.some((m: any) => m.type === "bold") || false;
            const isItalic = item.marks?.some((m: any) => m.type === "italic") || false;
            const isUnderline = item.marks?.some((m: any) => m.type === "underline") || false;

            runs.push({
              text: item.text,
              options: {
                fontFace,
                fontSize: baseFontSize,
                color: blockColor,
                bold: isBold,
                italic: isItalic,
                underline: isUnderline ? { style: "sng" } : undefined,
                align: block.style?.align || "left",
                breakLine: false,
              },
            });
          }
        }
        // Paragraph break
        runs.push({ text: "\n", options: { breakLine: true } });
      } else if (node.type === "bulletList" && Array.isArray(node.content)) {
        for (const listItem of node.content) {
          const p = listItem.content?.[0];
          const text = p?.content?.map((c: any) => c.text || "").join("") || "";
          if (text) {
            runs.push({
              text: text + "\n",
              options: {
                fontFace,
                fontSize: baseFontSize,
                color: blockColor,
                bullet: true,
                align: block.style?.align || "left",
                breakLine: true,
              },
            });
          }
        }
      }
    }
  }

  // Fallback to legacy props if doc has no extractable text
  if (runs.length === 0) {
    const props = (block as any).props || {};
    if (Array.isArray(props.bullets) && props.bullets.length > 0) {
      for (const b of props.bullets) {
        runs.push({
          text: String(b) + "\n",
          options: {
            fontFace,
            fontSize: baseFontSize,
            color: blockColor,
            bullet: true,
            breakLine: true,
          },
        });
      }
    } else if (props.text) {
      runs.push({
        text: String(props.text),
        options: {
          fontFace,
          fontSize: baseFontSize,
          color: blockColor,
          breakLine: false,
        },
      });
    }
  }

  return runs;
}

/**
 * Client-side PowerPoint exporter with native editable charts, text, shapes, and notes.
 */
export async function exportToPptx(
  doc: DeckDocument,
  options?: {
    shareUrl?: string;
    onProgress?: (progress: { current: number; total: number; stage: string }) => void;
  }
): Promise<Blob> {
  const pptx = new PptxGenJS();

  // Set widescreen 16:9 layout
  pptx.layout = "LAYOUT_16x9";
  pptx.title = doc.title || "FLUXA Presentation";

  const themeId = doc.theme?.themeId || "default";
  const theme: Theme = getTheme(themeId);
  const fallbackFont = theme.pptxFallbackFont || "Arial";

  const reactiveScope = buildReactiveScope(doc.datasets || {}, doc.variables || {});
  const totalSlides = doc.slides.length;

  for (let sIdx = 0; sIdx < totalSlides; sIdx++) {
    const slide: Slide = doc.slides[sIdx];
    options?.onProgress?.({
      current: sIdx + 1,
      total: totalSlides,
      stage: `Exporting slide ${sIdx + 1} of ${totalSlides}…`,
    });

    const pptSlide = pptx.addSlide();

    // Slide background
    const bgHex = hexClean(theme.colors.bg, "FFFFFF");
    pptSlide.background = { color: bgHex };

    // Slide speaker notes
    if (slide.notes) {
      pptSlide.addNotes(slide.notes);
    }

    // Process blocks
    for (const block of slide.blocks) {
      const x = pxToIn(block.x);
      const y = pxToIn(block.y);
      const w = pxToIn(block.w);
      const h = pxToIn(block.h);

      if (block.type === "text") {
        const textRuns = extractTextRuns(block, fallbackFont, hexClean(theme.colors.text, "111827"));
        if (textRuns.length > 0) {
          pptSlide.addText(textRuns, {
            x,
            y,
            w,
            h,
            valign: "top",
          });
        }
      } else if (block.type === "shape") {
        const fillHex = hexClean(block.fill?.color, hexClean(theme.colors.primary, "2563EB"));
        const strokeHex = block.stroke?.color ? hexClean(block.stroke.color) : undefined;
        let shapeType = pptx.ShapeType.rect;
        if (block.shape === "ellipse") shapeType = pptx.ShapeType.ellipse;
        else if (block.shape === "triangle") shapeType = pptx.ShapeType.triangle;
        else if (block.shape === "line") shapeType = pptx.ShapeType.line;

        pptSlide.addShape(shapeType, {
          x,
          y,
          w,
          h,
          fill: { color: fillHex },
          line: strokeHex ? { color: strokeHex, width: 1 } : undefined,
        });
      } else if (block.type === "chart") {
        // Native PowerPoint Chart with embedded editable data sheet
        const { kind, xField = "label", series = [] } = block;
        const activeDataset = block.dataset ? doc.datasets?.[block.dataset] : undefined;

        const rows = activeDataset
          ? reactiveScope.datasets[activeDataset.id]?.rows || activeDataset.rows
          : [
              { [xField]: "2023", value: 35 },
              { [xField]: "2024", value: 55 },
              { [xField]: "2025", value: 75 },
              { [xField]: "2026", value: 95 },
            ];

        const labels = rows.map((r: any) => String(r[xField] ?? ""));
        const seriesDefs = series.length > 0 ? series : [{ field: "value", label: "Value" }];

        const chartData = seriesDefs.map((sDef) => ({
          name: sDef.label || sDef.field,
          labels,
          values: rows.map((r: any) => Number(r[sDef.field] ?? 0)),
        }));

        let chartType = pptx.ChartType.bar;
        if (kind === "bar") chartType = pptx.ChartType.bar;
        else if (kind === "line") chartType = pptx.ChartType.line;
        else if (kind === "donut") chartType = pptx.ChartType.doughnut;
        else if (kind === "pie") chartType = pptx.ChartType.pie;
        else if (kind === "radar") chartType = pptx.ChartType.radar;
        else if (kind === "scatter") chartType = pptx.ChartType.scatter;

        const chartColors = (theme.colors.chart || [
          "#2563EB",
          "#047857",
          "#B45309",
          "#7C3AED",
          "#BE185D",
          "#0369A1",
        ]).map((c) => hexClean(c));

        try {
          pptSlide.addChart(chartType, chartData, {
            x,
            y,
            w,
            h,
            showTitle: false,
            showLegend: true,
            chartColors,
            dataLabelColor: hexClean(theme.colors.text),
          });
        } catch {
          // If chart generation fails, add descriptive placeholder
          pptSlide.addShape(pptx.ShapeType.rect, {
            x,
            y,
            w,
            h,
            fill: { color: "F3F4F6" },
            line: { color: "D1D5DB", width: 1 },
          });
          pptSlide.addText(`[Chart: ${kind}]`, {
            x,
            y,
            w,
            h,
            align: "center",
            valign: "middle",
            fontFace: fallbackFont,
            fontSize: 14,
            color: "6B7280",
          });
        }
      } else if (block.type === "kpi") {
        const val = String(block.value ?? "0");
        const label = block.label || "";
        const primaryColor = hexClean(theme.colors.primary, "2563EB");
        const secondaryColor = hexClean(theme.colors.secondary, "4B5563");

        pptSlide.addText(
          [
            { text: val + "\n", options: { fontSize: 44, bold: true, color: primaryColor } },
            { text: label, options: { fontSize: 14, color: secondaryColor } },
          ],
          { x, y, w, h, align: "center", valign: "middle", fontFace: fallbackFont }
        );
      } else if (block.type === "table") {
        const tableRows = (block as any).rows || [["Item", "Metric", "Status"]];
        const formattedTable = tableRows.map((row: any[], rIdx: number) =>
          row.map((cell: any) => ({
            text: String(cell ?? ""),
            options: {
              fontFace: fallbackFont,
              fontSize: 11,
              bold: rIdx === 0,
              color: hexClean(theme.colors.text),
              fill: rIdx === 0 ? { color: "F3F4F6" } : undefined,
              border: { pt: 1, color: "E5E7EB" },
            },
          }))
        );

        pptSlide.addTable(formattedTable, {
          x,
          y,
          w,
          h,
          colW: w / (tableRows[0]?.length || 3),
        });
      } else if (block.type === "control") {
        const label = (block as any).label || (block as any).variable || "Control";
        const val = String((block as any).value ?? "");

        pptSlide.addShape(pptx.ShapeType.roundRect, {
          x,
          y,
          w,
          h,
          fill: { color: "F3F4F6" },
          line: { color: "D1D5DB", width: 1 },
        });
        pptSlide.addText(`${label}: ${val}`, {
          x,
          y,
          w,
          h,
          align: "center",
          valign: "middle",
          fontFace: fallbackFont,
          fontSize: 13,
          color: "374151",
        });
      } else if (block.type === "html" || block.type === "embed") {
        // Snapshot fallback placeholder with Live version hyperlink
        pptSlide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w,
          h,
          fill: { color: "F9FAFB" },
          line: { color: "E5E7EB", width: 1 },
        });

        const liveTextRuns: PptxGenJS.TextProps[] = [
          {
            text: "Interactive Widget\n",
            options: { fontSize: 13, bold: true, color: "4B5563" },
          },
          {
            text: options?.shareUrl ? "Open live version in browser" : "Live reactive software slide",
            options: {
              fontSize: 11,
              color: "2563EB",
              underline: { style: "sng" },
              hyperlink: options?.shareUrl ? { url: options.shareUrl } : undefined,
            },
          },
        ];

        pptSlide.addText(liveTextRuns, {
          x,
          y,
          w,
          h,
          align: "center",
          valign: "middle",
          fontFace: fallbackFont,
        });
      }
    }
  }

  // Generate binary output
  const output = (await pptx.write({ outputType: "blob" })) as Blob;
  return output;
}
