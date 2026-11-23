"""BrandTokens: the brand design-token schema (version 1).

A superset of the deck theme tokens (`ThemeTokens` in shared/spec.ts). The parts the
renderer uses today (colors, typography) are typed strictly. The other sections
(logo, footer, legal, layouts, charts, imagery, language) are accepted as objects now
and get their full types when Part C fills them (see docs/BRAND_INTELLIGENCE.md §3).

The JSON Schema in shared/brand/brand.schema.json is generated from this model:
    python -m app.brand.tokens
A test fails if the file and the model drift apart.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "brand" / "brand.schema.json"
MAX_TOKENS_BYTES = 64 * 1024

HEX = r"^#[0-9A-Fa-f]{6}$"
# Font names end up inside CSS values; allow only plain family-name characters.
FONT_NAME = r"^[A-Za-z0-9][A-Za-z0-9 .\-_]{0,79}$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Swatch(_Strict):
    hex: str = Field(pattern=HEX)
    name: Optional[str] = Field(default=None, max_length=80)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class ColorPair(_Strict):
    fg: str = Field(pattern=HEX)
    bg: str = Field(pattern=HEX)
    contrast: Optional[float] = Field(default=None, ge=1, le=21)


class BrandColors(_Strict):
    primary: List[Swatch] = Field(min_length=1, max_length=8)
    secondary: List[Swatch] = Field(default_factory=list, max_length=8)
    accent: List[Swatch] = Field(default_factory=list, max_length=8)
    # In order: background, text, muted. More are allowed.
    neutrals: List[str] = Field(default_factory=list, max_length=12)
    chart: List[str] = Field(default_factory=list, max_length=16)
    allowedPairs: List[ColorPair] = Field(default_factory=list, max_length=50)
    contrastWarnings: List[ColorPair] = Field(default_factory=list, max_length=50)

    @field_validator("neutrals", "chart")
    @classmethod
    def _hex_list(cls, values: List[str]) -> List[str]:
        for v in values:
            if not re.match(HEX, v):
                raise ValueError(f"{v!r} is not a #RRGGBB colour")
        return values

    @field_validator("chart")
    @classmethod
    def _chart_size(cls, values: List[str]) -> List[str]:
        if values and len(values) < 6:
            raise ValueError("chart needs at least 6 colours (or none)")
        return values


class FontRole(_Strict):
    family: str = Field(pattern=FONT_NAME)
    weights: List[int] = Field(default_factory=list, max_length=9)
    fontId: Optional[str] = Field(default=None, max_length=64)
    fallback: List[str] = Field(default_factory=list, max_length=6)

    @field_validator("weights")
    @classmethod
    def _weights(cls, values: List[int]) -> List[int]:
        for w in values:
            if w < 100 or w > 900 or w % 100:
                raise ValueError(f"font weight {w} must be 100..900 in steps of 100")
        return values

    @field_validator("fallback")
    @classmethod
    def _fallback(cls, values: List[str]) -> List[str]:
        for name in values:
            if not re.match(FONT_NAME, name):
                raise ValueError(f"{name!r} is not a plain font family name")
        return values


class TypeScale(_Strict):
    title: Optional[int] = Field(default=None, ge=8, le=400)
    h1: Optional[int] = Field(default=None, ge=8, le=400)
    body: Optional[int] = Field(default=None, ge=8, le=400)
    caption: Optional[int] = Field(default=None, ge=8, le=400)


class Typography(_Strict):
    heading: Optional[FontRole] = None
    body: Optional[FontRole] = None
    scale: TypeScale = Field(default_factory=TypeScale)


class BrandTokens(_Strict):
    schemaVersion: Literal[1] = 1
    colors: BrandColors
    typography: Typography = Field(default_factory=Typography)
    # Typed in Part C (C1 extraction, C4 locks, C5 compliance).
    logo: Optional[Dict[str, Any]] = None
    header: Optional[Dict[str, Any]] = None
    footer: Optional[Dict[str, Any]] = None
    legal: Optional[Dict[str, Any]] = None
    layouts: Optional[Dict[str, Any]] = None
    charts: Optional[Dict[str, Any]] = None
    imagery: Optional[Dict[str, Any]] = None
    language: Optional[Dict[str, Any]] = None


class TokenError(ValueError):
    def __init__(self, problems: List[Dict[str, str]]):
        super().__init__("; ".join(f"{p['path']}: {p['message']}" for p in problems))
        self.problems = problems


def validate_tokens(raw: Any) -> Dict[str, Any]:
    """Validate brand tokens and return them normalised. Raises TokenError."""
    if not isinstance(raw, dict):
        raise TokenError([{"path": "", "message": "tokens must be a JSON object"}])
    if len(json.dumps(raw)) > MAX_TOKENS_BYTES:
        raise TokenError([{"path": "", "message": f"tokens are larger than {MAX_TOKENS_BYTES // 1024} KB"}])
    try:
        model = BrandTokens.model_validate(raw)
    except ValidationError as exc:
        raise TokenError(
            [{"path": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()[:20]]
        ) from None
    return model.model_dump(exclude_none=True)


def to_theme_overrides(tokens: Dict[str, Any]) -> Dict[str, Any]:
    """Map brand tokens onto the renderer's theme shape (only the keys the brand sets).

    The frontend merges this over the deck's base theme, so anything the brand leaves
    out keeps the theme's value.
    """
    colors_in = tokens.get("colors", {})
    colors: Dict[str, Any] = {}

    def first(name: str, index: int = 0) -> Optional[str]:
        items = colors_in.get(name) or []
        return items[index]["hex"] if len(items) > index else None

    colors["primary"] = first("primary")
    colors["secondary"] = first("secondary") or first("primary", 1)
    colors["accent"] = first("accent") or first("secondary", 1)
    neutrals = colors_in.get("neutrals") or []
    for key, index in (("bg", 0), ("text", 1), ("muted", 2)):
        if len(neutrals) > index:
            colors[key] = neutrals[index]
    if len(colors_in.get("chart") or []) >= 6:
        colors["chart"] = list(colors_in["chart"])
    out: Dict[str, Any] = {"colors": {k: v for k, v in colors.items() if v}}

    typo = tokens.get("typography") or {}
    fonts = {role: typo[role]["family"] for role in ("heading", "body") if typo.get(role)}
    if fonts:
        out["fonts"] = fonts
    title_size = (typo.get("scale") or {}).get("title")
    if title_size:
        out["titleStyle"] = {"size": title_size}
    return out


def json_schema() -> Dict[str, Any]:
    schema = BrandTokens.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://fluxa.local/schemas/brand.schema.json"
    return schema


def write_schema_file() -> None:
    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.write_text(json.dumps(json_schema(), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    write_schema_file()
    print(f"wrote {SCHEMA_PATH}")
