import { DeckDocument } from "../editor/store/types";

/**
 * Builds a clean Markdown representation of the deck specification per Section 5.6.
 */
export function buildMarkdownOutline(doc: DeckDocument): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title || "FLUXA Presentation"}`);
  if (doc.description) {
    lines.push(`\n> ${doc.description}\n`);
  }
  lines.push("");

  const themeId = doc.theme?.themeId || "clean-light";
  lines.push(`- **Theme:** \`${themeId}\``);
  lines.push(`- **Total slides:** ${doc.slides.length}`);
  lines.push(`- **Schema version:** ${doc.schemaVersion}`);
  lines.push("\n---\n");

  doc.slides.forEach((slide, idx) => {
    const slideNum = idx + 1;
    const titleBlock = slide.blocks.find((b) => b.role === "title" || b.type === "text") as any;
    const slideTitle = (slide as any).title || titleBlock?.props?.text || "Untitled Slide";
    lines.push(`## Slide ${slideNum}: ${slideTitle}`);
    if (slide.layout) {
      lines.push(`*Layout: ${slide.layout}*`);
    }

    if (slide.notes) {
      lines.push(`\n> **Speaker Notes:** ${slide.notes}\n`);
    }

    slide.blocks.forEach((block) => {
      if (block.type === "text") {
        if (block.doc && Array.isArray(block.doc.content)) {
          block.doc.content.forEach((node: any) => {
            if (node.type === "paragraph") {
              const text = (node.content || []).map((c: any) => c.text || "").join("");
              if (text) lines.push(text);
            } else if (node.type === "bulletList") {
              (node.content || []).forEach((li: any) => {
                const liText = li.content?.[0]?.content?.map((c: any) => c.text || "").join("") || "";
                if (liText) lines.push(`- ${liText}`);
              });
            }
          });
        } else if ((block as any).props?.bullets) {
          (block as any).props.bullets.forEach((b: string) => lines.push(`- ${b}`));
        } else if ((block as any).props?.text) {
          lines.push((block as any).props.text);
        }
      } else if (block.type === "kpi") {
        lines.push(`\n**KPI: ${block.value}** (${block.label || "Metric"})\n`);
      } else if (block.type === "chart") {
        lines.push(`\n[Chart: ${block.kind} - Dataset: \`${block.dataset || "inline"}\`]\n`);
      } else if (block.type === "table") {
        lines.push(`\n[Table: ${(block as any).rows?.length || 0} rows]\n`);
      } else if (block.type === "control") {
        lines.push(`\n[Control: ${(block as any).label || (block as any).variable} = ${(block as any).value}]\n`);
      }
    });

    lines.push("\n---\n");
  });

  return lines.join("\n");
}
