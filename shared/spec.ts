import { z } from "zod";

// --- Primitives and Bindings ---
export const NumBindSchema = z.union([
  z.number(),
  z.object({ $bind: z.string().min(1) }),
]);
export type Num = z.infer<typeof NumBindSchema>;

export const StrBindSchema = z.union([
  z.string(),
  z.object({ $bind: z.string().min(1) }),
]);
export type Str = z.infer<typeof StrBindSchema>;

export const ColorSchema = z.string();
export type Color = z.infer<typeof ColorSchema>;

export const FillSchema = z.object({
  color: z.string(),
  opacity: z.number().min(0).max(1).optional(),
});
export type Fill = z.infer<typeof FillSchema>;

export const StrokeSchema = z.object({
  color: z.string(),
  width: z.number().min(0),
  dash: z.enum(["solid", "dashed", "dotted"]).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const TextStyleSchema = z.object({
  fontSize: z.number().positive().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  color: z.string().optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.string().optional(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const NumFormatSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  decimals: z.number().int().min(0).max(10).optional(),
  compact: z.boolean().optional(),
});
export type NumFormat = z.infer<typeof NumFormatSchema>;

export const TransitionSchema = z.object({
  effect: z.enum(["none", "fade", "push", "zoom"]),
  duration: z.number().min(0).default(300),
  direction: z.enum(["l", "r", "u", "d"]).optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const LayoutIdSchema = z.enum([
  "title",
  "section",
  "bullets",
  "two-column",
  "big-number",
  "chart-text",
  "image-text",
  "quote",
  "timeline",
  "comparison",
  "swot",
  "market-size",
  "funnel",
  "full-bleed",
  "blank",
]);
export type LayoutId = z.infer<typeof LayoutIdSchema>;

export const ThemeTokensSchema = z.object({
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
    mono: z.string().optional(),
  }),
  colors: z.object({
    bg: z.string(),
    text: z.string(),
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    chart: z.array(z.string()).min(6),
  }),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

export const RichTextDocSchema = z.object({
  type: z.string().default("doc"),
  content: z.array(z.record(z.string(), z.any())).optional(),
});
export type RichTextDoc = z.infer<typeof RichTextDocSchema>;

// --- Animation ---
export const AnimationStepSchema = z.object({
  effect: z.enum(["fade", "rise", "slide", "zoom", "wipe", "draw", "countUp", "exit"]),
  trigger: z.enum(["onEnter", "onClick", "afterPrev", "withPrev"]),
  delay: z.number().min(0).optional(),
  duration: z.number().min(0).optional(),
  easing: z.string().optional(),
  direction: z.enum(["l", "r", "u", "d"]).optional(),
});
export type AnimationStep = z.infer<typeof AnimationStepSchema>;

// --- Datasets & Variables ---
export const DatasetColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.enum(["text", "number", "date"]),
  expr: z.string().optional(),
});
export type DatasetColumn = z.infer<typeof DatasetColumnSchema>;

export const DatasetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  source: z.enum(["user", "import", "ai-estimate", "research"]),
  columns: z.array(DatasetColumnSchema),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  /** Research datasets: reference lines of the sources the values were taken from. */
  citations: z.array(z.string()).optional(),
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const VariableSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: z.enum(["number", "boolean", "choice"]),
  value: z.union([z.number(), z.boolean(), z.string()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  scope: z.enum(["deck", "slide"]).default("deck"),
  resetOnEnter: z.boolean().optional(),
});
export type Variable = z.infer<typeof VariableSchema>;

// --- Block Definitions ---
export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().optional(),
});
export type Box = z.infer<typeof BoxSchema>;

export const BlockBaseSchema = BoxSchema.extend({
  id: z.string().min(1),
  role: z.enum([
    "title",
    "subtitle",
    "body",
    "media",
    "chart",
    "kpi",
    "aside",
    "footer",
  ]).optional(),
  name: z.string().optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  alt: z.string().optional(),
  animation: z.array(AnimationStepSchema).optional(),
});
export type BlockBase = z.infer<typeof BlockBaseSchema>;

export const TextBlockSchema = BlockBaseSchema.extend({
  type: z.literal("text"),
  doc: RichTextDocSchema,
  style: TextStyleSchema.default({}),
});

export const ShapeBlockSchema = BlockBaseSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line", "arrow", "triangle"]),
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  radius: z.number().min(0).optional(),
});

export const ImageBlockSchema = BlockBaseSchema.extend({
  type: z.literal("image"),
  assetId: z.string().min(1),
  fit: z.enum(["cover", "contain"]).default("cover"),
  radius: z.number().min(0).optional(),
});

export const IconBlockSchema = BlockBaseSchema.extend({
  type: z.literal("icon"),
  name: z.string().min(1),
  color: ColorSchema.optional(),
});

export const ChartBlockSchema = BlockBaseSchema.extend({
  type: z.literal("chart"),
  kind: z.enum(["bar", "column", "line", "area", "pie", "donut", "scatter", "radar", "stacked"]),
  dataset: z.string().min(1),
  xField: z.string().min(1).default("label"),
  series: z.array(
    z.object({
      field: z.string().min(1),
      label: z.string().optional(),
      color: ColorSchema.optional(),
    })
  ),
  options: z.object({
    unit: z.string().optional(),
    legend: z.enum(["auto", "off", "bottom"]).optional(),
    valueLabels: z.boolean().optional(),
    min: NumBindSchema.optional(),
    max: NumBindSchema.optional(),
    animateMs: z.number().min(0).optional(),
  }).default({}),
});

export const KpiBlockSchema = BlockBaseSchema.extend({
  type: z.literal("kpi"),
  value: z.union([NumBindSchema, StrBindSchema]),
  label: z.string(),
  delta: NumBindSchema.optional(),
  format: NumFormatSchema.optional(),
  countUp: z.boolean().optional(),
});

export const TableBlockSchema = BlockBaseSchema.extend({
  type: z.literal("table"),
  dataset: z.string().min(1),
  columns: z.array(z.string()).optional(),
  style: z.enum(["plain", "striped", "ruled"]).default("plain"),
});

export const StepsBlockSchema = BlockBaseSchema.extend({
  type: z.literal("steps"),
  items: z.array(
    z.object({
      title: z.string(),
      body: z.string().optional(),
      date: z.string().optional(),
    })
  ),
  orientation: z.enum(["h", "v"]).default("h"),
});

export const TimelineBlockSchema = BlockBaseSchema.extend({
  type: z.literal("timeline"),
  items: z.array(
    z.object({
      title: z.string(),
      body: z.string().optional(),
      date: z.string().optional(),
    })
  ),
  orientation: z.enum(["h", "v"]).default("h"),
});

export const ComparisonBlockSchema = BlockBaseSchema.extend({
  type: z.literal("comparison"),
  columns: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.string()),
    })
  ),
});

export const QuoteBlockSchema = BlockBaseSchema.extend({
  type: z.literal("quote"),
  text: z.string(),
  attribution: z.string().optional(),
});

export const ControlBlockSchema = BlockBaseSchema.extend({
  type: z.literal("control"),
  control: z.enum(["slider", "toggle", "select", "segmented", "button"]),
  variable: z.string().optional(),
  label: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  action: z
    .object({
      goToSlide: z.string().optional(),
      setVariable: z.tuple([z.string(), z.any()]).optional(),
      openUrl: z.string().optional(),
    })
    .optional(),
});

export const EmbedBlockSchema = BlockBaseSchema.extend({
  type: z.literal("embed"),
  kind: z.enum(["video", "url"]),
  src: z.string().min(1),
});

export const HtmlBlockSchema = BlockBaseSchema.extend({
  type: z.literal("html"),
  code: z.object({
    html: z.string(),
    css: z.string(),
    js: z.string(),
  }),
  snapshotAssetId: z.string().optional(),
});

export type Block =
  | z.infer<typeof TextBlockSchema>
  | z.infer<typeof ShapeBlockSchema>
  | z.infer<typeof ImageBlockSchema>
  | z.infer<typeof IconBlockSchema>
  | z.infer<typeof ChartBlockSchema>
  | z.infer<typeof KpiBlockSchema>
  | z.infer<typeof TableBlockSchema>
  | z.infer<typeof StepsBlockSchema>
  | z.infer<typeof TimelineBlockSchema>
  | z.infer<typeof ComparisonBlockSchema>
  | z.infer<typeof QuoteBlockSchema>
  | z.infer<typeof ControlBlockSchema>
  | z.infer<typeof EmbedBlockSchema>
  | z.infer<typeof HtmlBlockSchema>
  | {
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rotation?: number;
      role?: BlockBase["role"];
      name?: string;
      locked?: boolean;
      hidden?: boolean;
      alt?: string;
      animation?: AnimationStep[];
      type: "tabs";
      tabs: { id: string; label: string; blocks: Block[] }[];
    };

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    TextBlockSchema,
    ShapeBlockSchema,
    ImageBlockSchema,
    IconBlockSchema,
    ChartBlockSchema,
    KpiBlockSchema,
    TableBlockSchema,
    StepsBlockSchema,
    TimelineBlockSchema,
    ComparisonBlockSchema,
    QuoteBlockSchema,
    ControlBlockSchema,
    EmbedBlockSchema,
    HtmlBlockSchema,
    BlockBaseSchema.extend({
      type: z.literal("tabs"),
      tabs: z.array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          blocks: z.array(BlockSchema),
        })
      ),
    }),
  ])
);

// --- Slide & Deck Specifications ---
export const SlideSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  layout: LayoutIdSchema.nullable().default(null),
  background: FillSchema.optional(),
  notes: z.string().default(""),
  hidden: z.boolean().optional(),
  transition: TransitionSchema.optional(),
  blocks: z.array(BlockSchema).default([]),
});
export type Slide = z.infer<typeof SlideSchema>;

export const DeckSettingsSchema = z.object({
  transition: TransitionSchema.default({ effect: "fade", duration: 300 }),
  loop: z.boolean().default(false),
});
export type DeckSettings = z.infer<typeof DeckSettingsSchema>;

export const DeckSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().min(1),
  themeId: z.string().default("default"),
  themeOverrides: ThemeTokensSchema.partial().optional(),
  datasets: z.record(z.string(), DatasetSchema).default({}),
  variables: z.record(z.string(), VariableSchema).default({}),
  settings: DeckSettingsSchema.default({ transition: { effect: "fade", duration: 300 }, loop: false }),
});
export type Deck = z.infer<typeof DeckSchema>;
