from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field


# --- Primitives and Bindings ---
class BindExpression(BaseModel):
    bind: str = Field(alias="$bind", min_length=1)

    model_config = {"populate_by_name": True}


Num = Union[float, int, BindExpression]
Str = Union[str, BindExpression]


class Fill(BaseModel):
    color: str
    opacity: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class Stroke(BaseModel):
    color: str
    width: float = Field(ge=0.0)
    dash: Optional[Literal["solid", "dashed", "dotted"]] = None


class TextStyle(BaseModel):
    fontSize: Optional[float] = Field(default=None, gt=0)
    fontWeight: Optional[Union[int, str]] = None
    color: Optional[str] = None
    align: Optional[Literal["left", "center", "right", "justify"]] = None
    lineHeight: Optional[float] = Field(default=None, gt=0)
    letterSpacing: Optional[str] = None


class NumFormat(BaseModel):
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    decimals: Optional[int] = Field(default=None, ge=0, le=10)
    compact: Optional[bool] = None


class Transition(BaseModel):
    effect: Literal["none", "fade", "push", "zoom"] = "fade"
    duration: int = Field(default=300, ge=0)
    direction: Optional[Literal["l", "r", "u", "d"]] = None


LayoutId = Literal[
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
    "full-bleed",
    "blank",
]


class ThemeFonts(BaseModel):
    heading: str
    body: str
    mono: Optional[str] = None


class ThemeColors(BaseModel):
    bg: str
    text: str
    primary: str
    secondary: str
    accent: str
    chart: list[str] = Field(min_length=6)


class ThemeTokens(BaseModel):
    fonts: ThemeFonts
    colors: ThemeColors


class RichTextDoc(BaseModel):
    type: str = "doc"
    content: Optional[list[dict[str, Any]]] = None


# --- Animation ---
class AnimationStep(BaseModel):
    effect: Literal["fade", "rise", "slide", "zoom", "wipe", "draw", "countUp", "exit"]
    trigger: Literal["onEnter", "onClick", "afterPrev", "withPrev"]
    delay: Optional[int] = Field(default=None, ge=0)
    duration: Optional[int] = Field(default=None, ge=0)
    easing: Optional[str] = None
    direction: Optional[Literal["l", "r", "u", "d"]] = None


# --- Datasets & Variables ---
class DatasetColumn(BaseModel):
    key: str = Field(min_length=1)
    label: str
    type: Literal["text", "number", "date"]
    expr: Optional[str] = None


class Dataset(BaseModel):
    id: str = Field(min_length=1)
    name: str
    source: Literal["user", "import", "ai-estimate"]
    columns: list[DatasetColumn] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)


class Variable(BaseModel):
    id: str = Field(min_length=1)
    label: str
    type: Literal["number", "boolean", "choice"]
    value: Union[float, int, bool, str]
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: Optional[list[str]] = None
    scope: Literal["deck", "slide"] = "deck"
    resetOnEnter: Optional[bool] = None


# --- Block Definitions ---
class BlockBase(BaseModel):
    id: str = Field(min_length=1)
    x: float
    y: float
    w: float = Field(gt=0)
    h: float = Field(gt=0)
    rotation: Optional[float] = None
    role: Optional[
        Literal["title", "subtitle", "body", "media", "chart", "kpi", "aside", "footer"]
    ] = None
    name: Optional[str] = None
    locked: Optional[bool] = None
    hidden: Optional[bool] = None
    alt: Optional[str] = None
    animation: Optional[list[AnimationStep]] = None


class TextBlock(BlockBase):
    type: Literal["text"] = "text"
    doc: RichTextDoc = Field(default_factory=RichTextDoc)
    style: TextStyle = Field(default_factory=TextStyle)


class ShapeBlock(BlockBase):
    type: Literal["shape"] = "shape"
    shape: Literal["rect", "ellipse", "line", "arrow", "triangle"]
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    radius: Optional[float] = Field(default=None, ge=0)


class ImageBlock(BlockBase):
    type: Literal["image"] = "image"
    assetId: str = Field(min_length=1)
    fit: Literal["cover", "contain"] = "cover"
    radius: Optional[float] = Field(default=None, ge=0)


class IconBlock(BlockBase):
    type: Literal["icon"] = "icon"
    name: str = Field(min_length=1)
    color: Optional[str] = None


class ChartSeries(BaseModel):
    field: str = Field(min_length=1)
    label: Optional[str] = None
    color: Optional[str] = None


class ChartOptions(BaseModel):
    unit: Optional[str] = None
    legend: Optional[Literal["auto", "off", "bottom"]] = None
    valueLabels: Optional[bool] = None
    min: Optional[Num] = None
    max: Optional[Num] = None
    animateMs: Optional[int] = Field(default=None, ge=0)


class ChartBlock(BlockBase):
    type: Literal["chart"] = "chart"
    kind: Literal["bar", "column", "line", "area", "pie", "donut", "scatter", "radar", "stacked"]
    dataset: str = Field(min_length=1)
    xField: str = Field(default="label", min_length=1)
    series: list[ChartSeries] = Field(default_factory=list)
    options: ChartOptions = Field(default_factory=ChartOptions)


class KpiBlock(BlockBase):
    type: Literal["kpi"] = "kpi"
    value: Union[Num, Str]
    label: str
    delta: Optional[Num] = None
    format: Optional[NumFormat] = None
    countUp: Optional[bool] = None


class TableBlock(BlockBase):
    type: Literal["table"] = "table"
    dataset: str = Field(min_length=1)
    columns: Optional[list[str]] = None
    style: Literal["plain", "striped", "ruled"] = "plain"


class StepItem(BaseModel):
    title: str
    body: Optional[str] = None
    date: Optional[str] = None


class StepsBlock(BlockBase):
    type: Literal["steps"] = "steps"
    items: list[StepItem] = Field(default_factory=list)
    orientation: Literal["h", "v"] = "h"


class TimelineBlock(BlockBase):
    type: Literal["timeline"] = "timeline"
    items: list[StepItem] = Field(default_factory=list)
    orientation: Literal["h", "v"] = "h"


class ComparisonColumn(BaseModel):
    title: str
    items: list[str] = Field(default_factory=list)


class ComparisonBlock(BlockBase):
    type: Literal["comparison"] = "comparison"
    columns: list[ComparisonColumn] = Field(default_factory=list)


class QuoteBlock(BlockBase):
    type: Literal["quote"] = "quote"
    text: str
    attribution: Optional[str] = None


class ControlAction(BaseModel):
    goToSlide: Optional[str] = None
    setVariable: Optional[tuple[str, Any]] = None
    openUrl: Optional[str] = None


class ControlBlock(BlockBase):
    type: Literal["control"] = "control"
    control: Literal["slider", "toggle", "select", "segmented", "button"]
    variable: Optional[str] = None
    label: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: Optional[list[str]] = None
    action: Optional[ControlAction] = None


class EmbedBlock(BlockBase):
    type: Literal["embed"] = "embed"
    kind: Literal["video", "url"]
    src: str = Field(min_length=1)


class HtmlCode(BaseModel):
    html: str
    css: str
    js: str


class HtmlBlock(BlockBase):
    type: Literal["html"] = "html"
    code: HtmlCode
    snapshotAssetId: Optional[str] = None


class TabItem(BaseModel):
    id: str = Field(min_length=1)
    label: str
    blocks: list[Block] = Field(default_factory=list)


class TabsBlock(BlockBase):
    type: Literal["tabs"] = "tabs"
    tabs: list[TabItem] = Field(default_factory=list)


Block = Annotated[
    Union[
        TextBlock,
        ShapeBlock,
        ImageBlock,
        IconBlock,
        ChartBlock,
        KpiBlock,
        TableBlock,
        StepsBlock,
        TimelineBlock,
        ComparisonBlock,
        QuoteBlock,
        ControlBlock,
        EmbedBlock,
        HtmlBlock,
        TabsBlock,
    ],
    Field(discriminator="type"),
]

# Update forward references for nested blocks in TabsBlock
TabItem.model_rebuild()
TabsBlock.model_rebuild()


# --- Slide & Deck Specifications ---
class SlideModel(BaseModel):
    id: str = Field(min_length=1)
    order: int = Field(ge=0)
    layout: Optional[LayoutId] = None
    background: Optional[Fill] = None
    notes: str = ""
    hidden: Optional[bool] = None
    transition: Optional[Transition] = None
    blocks: list[Block] = Field(default_factory=list)


class DeckSettings(BaseModel):
    transition: Transition = Field(default_factory=Transition)
    loop: bool = False


class DeckModel(BaseModel):
    schemaVersion: Literal[1] = 1
    title: str = Field(min_length=1)
    themeId: str = "default"
    themeOverrides: Optional[dict[str, Any]] = None
    datasets: dict[str, Dataset] = Field(default_factory=dict)
    variables: dict[str, Variable] = Field(default_factory=dict)
    settings: DeckSettings = Field(default_factory=DeckSettings)
