"""Semantic-to-blocks compiler and content-limits repair pass for FLUXA AI generation.

The model (or the deck writer) decides what a slide says and shows; this module only
decides where things go on the 1920x1080 stage. It never adds content of its own: a
slide without chart data gets no chart, a slide without a sourced number gets no KPI,
a slide without an image gets a text layout, and nothing gets placeholder citations.
"""

import re
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

from app.ai.model_library import model_for_slide

W, H = 1920, 1080
MARGIN_X = 100

LAYOUT_SLOTS = {
    "title": [
        {"role": "title", "x": 100, "y": 200, "w": 900, "h": 340, "align": "left"},
        {"role": "subtitle", "x": 100, "y": 560, "w": 900, "h": 240, "align": "left"},
        {"role": "media", "x": 1060, "y": 120, "w": 760, "h": 840, "align": "center"},
        {"role": "footer", "x": 100, "y": 860, "w": 900, "h": 60, "align": "left"},
    ],
    "section": [
        {"role": "subtitle", "x": 200, "y": 360, "w": 1520, "h": 60, "align": "left"},
        {"role": "title", "x": 200, "y": 440, "w": 1520, "h": 240, "align": "left"},
    ],
    "bullets": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 960, "h": 720, "align": "left"},
        {"role": "media", "x": 1100, "y": 230, "w": 720, "h": 720, "align": "center"},
    ],
    "text": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 1720, "h": 720, "align": "left"},
    ],
    "two-column": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 820, "h": 720, "align": "left"},
        {"role": "aside", "x": 1000, "y": 230, "w": 820, "h": 720, "align": "left"},
    ],
    "big-number": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "kpi", "x": 100, "y": 240, "w": 820, "h": 340, "align": "left"},
        {"role": "body", "x": 1000, "y": 240, "w": 820, "h": 710, "align": "left"},
    ],
    "chart-text": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 680, "h": 720, "align": "left"},
        {"role": "chart", "x": 840, "y": 230, "w": 980, "h": 720, "align": "left"},
    ],
    "image-text": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "media", "x": 100, "y": 230, "w": 860, "h": 720, "align": "left"},
        {"role": "body", "x": 1020, "y": 230, "w": 800, "h": 720, "align": "left"},
    ],
    "quote": [
        {"role": "body", "x": 200, "y": 260, "w": 1520, "h": 480, "align": "center"},
        {"role": "subtitle", "x": 300, "y": 770, "w": 1320, "h": 100, "align": "center"},
    ],
    "timeline": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 1720, "h": 720, "align": "left"},
    ],
    "comparison": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 1720, "h": 720, "align": "left"},
    ],
    "table": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 230, "w": 1720, "h": 720, "align": "left"},
    ],
    "references": [
        {"role": "title", "x": 100, "y": 70, "w": 1720, "h": 110, "align": "left"},
        {"role": "body", "x": 100, "y": 200, "w": 1720, "h": 820, "align": "left"},
    ],
    "swot": [
        {"role": "title", "x": 100, "y": 70, "w": 1720, "h": 100, "align": "left"},
        {"role": "body", "x": 100, "y": 180, "w": 1720, "h": 760, "align": "left"},
    ],
    "market-size": [
        {"role": "title", "x": 100, "y": 70, "w": 1720, "h": 100, "align": "left"},
        {"role": "body", "x": 100, "y": 190, "w": 1720, "h": 750, "align": "left"},
    ],
    "funnel": [
        {"role": "title", "x": 100, "y": 70, "w": 1720, "h": 100, "align": "left"},
        {"role": "body", "x": 100, "y": 190, "w": 1720, "h": 750, "align": "left"},
    ],
    "full-bleed": [
        {"role": "title", "x": 120, "y": 860, "w": 1680, "h": 140, "align": "left"},
    ],
    "blank": [],
}

TITLE_MAX = 70
SUBTITLE_MAX = 100
BULLETS_MAX = 5
BULLET_MAX = 220  # long enough for a complete sourced claim plus its citation marks
CHART_POINTS_MAX = 12

ALIASES = {
    "two_column": "two-column", "big_number": "big-number", "chart_text": "chart-text", "image_text": "image-text",
    "title_bullets": "bullets", "full_bleed": "full-bleed", "tam_sam_som": "market-size", "tam-sam-som": "market-size",
    "market_size": "market-size",
}


def _cut(text: str, limit: int) -> str:
    """Shorten at a word boundary, keeping trailing citation marks like [3][7]."""
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    marks = re.search(r"(\s*(?:\[\d+\])+)$", text)
    tail = marks.group(1) if marks else ""
    body = text[: len(text) - len(tail)] if tail else text
    room = max(10, limit - len(tail) - 1)
    cut = body[:room].rsplit(" ", 1)[0].rstrip(",;:-(")
    return f"{cut}…{tail}"


def repair_content_limits(semantic: Dict[str, Any]) -> Dict[str, Any]:
    """Enforce content limits without inventing anything: title, subtitle, bullets, chart size."""
    repaired = dict(semantic)
    if isinstance(repaired.get("title"), str):
        repaired["title"] = _cut(repaired["title"].strip(), TITLE_MAX)
    if isinstance(repaired.get("subtitle"), str):
        repaired["subtitle"] = _cut(repaired["subtitle"].strip(), SUBTITLE_MAX)
    if isinstance(repaired.get("bullets"), list):
        bullets = [str(b).strip() for b in repaired["bullets"] if str(b).strip()]
        repaired["bullets"] = [_cut(b, BULLET_MAX) for b in bullets[:BULLETS_MAX]]
    if isinstance(repaired.get("chart"), dict):
        data = repaired["chart"].get("data")
        if isinstance(data, list) and len(data) > CHART_POINTS_MAX:
            repaired["chart"] = {**repaired["chart"], "data": data[:CHART_POINTS_MAX]}
    layout = ALIASES.get(repaired.get("layout", "bullets"), repaired.get("layout", "bullets"))
    repaired["layout"] = layout if layout in LAYOUT_SLOTS else "bullets"
    return repaired


def _new_id(prefix: str) -> str:
    return f"blk-{prefix}-{uuid.uuid4().hex[:8]}"


def _box(slot: Dict[str, Any], **override) -> Dict[str, Any]:
    box = {k: override.get(k, slot[k]) for k in ("x", "y", "w", "h")}
    return {**box, "box": dict(box)}


def _text_block(prefix: str, role: str, slot: Dict[str, Any], *, text: str = "", bullets: Optional[List[str]] = None,
                size: int = 26, align: Optional[str] = None, color: Optional[str] = None, bold: bool = False, **box_override) -> Dict[str, Any]:
    props: Dict[str, Any] = {"fontSize": size, "align": align or slot.get("align", "left")}
    block: Dict[str, Any] = {"id": _new_id(prefix), "type": "text", "role": role, **_box(slot, **box_override)}
    if bullets is not None:
        block["bullets"] = bullets
        props["bullets"] = bullets
    else:
        block["content"] = text
        props["text"] = text
    if color:
        props["color"] = color
    if bold:
        props["bold"] = True
    block["props"] = props
    block["style"] = {"fontSize": size, "fontWeight": 700 if bold else 400, **({"lineHeight": 1.45} if bullets is not None else {})}
    return block


_DOMAIN_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("medical", ["hospital", "patient", "clinical", "clinic", "medical", "medicine", "doctor", "surgery", "healthcare", "cardiac", "cardiology", "heart"]),
    ("dna", ["dna", "biotech", "genomics", "genetics", "genome", "molecular", "gene", "chromosome", "double helix"]),
    ("automotive", ["automobile", "automotive", "car", "electric vehicle", "vehicle", "fleet", "powertrain"]),
    ("finance", ["finance", "fintech", "banking", "investment", "valuation", "revenue", "profit", "crypto"]),
    ("city", ["real estate", "architecture", "skyscraper", "construction", "smart city", "urban planning"]),
    ("energy", ["solar energy", "wind energy", "clean energy", "renewable", "wind turbine", "solar panel", "power grid"]),
    ("server", ["datacenter", "data center", "server rack", "cloud compute", "gpu cluster", "neural network", "supercomputer"]),
    ("logistics", ["supply chain", "logistics", "freight", "shipping container", "cargo"]),
    ("torus", ["quantum", "cryptography", "encryption"]),
    ("globe", ["global", "worldwide", "climate", "earth", "planet", "geography"]),
    ("crystal", ["artificial intelligence", "algorithm", "software platform", "cybersecurity"]),
]
_DOMAIN_FALLBACKS = {
    "medical": ["medical", "dna", "crystal", "globe"], "dna": ["dna", "medical", "crystal"], "automotive": ["automotive", "energy", "city"],
    "finance": ["finance", "city", "globe"], "city": ["city", "energy", "finance"], "energy": ["energy", "automotive", "globe"],
    "server": ["server", "crystal", "torus"], "logistics": ["logistics", "globe", "server"], "torus": ["torus", "crystal", "server"],
    "globe": ["globe", "city", "logistics"], "crystal": ["crystal", "server", "torus"],
}


def _matched_domain(text: str) -> Optional[str]:
    low = text.lower()
    for domain, kws in _DOMAIN_KEYWORDS:
        for kw in kws:
            if (" " in kw and kw in low) or re.search(rf"\b{re.escape(kw)}(?:s|es)?\b", low):
                return domain
    return None


def _pick_3d(deck_topic: str, title: str, used: Set[str], slide_index: int, total: int, last_3d: Optional[List[int]], wanted: bool,
             builtin: bool = True) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """A topic-matched 3D model (budget: 2-3 per deck, never on consecutive slides).

    `builtin=False` (research decks) means only a real Sketchfab model for the slide's subject;
    the generic procedural scenes (a globe, a crystal) are never substituted.
    """
    if not wanted:
        return None, None
    if len(used) >= (3 if total >= 6 else 2):
        return None, None
    if last_3d and last_3d[0] > 0 and slide_index - last_3d[0] < 2:
        return None, None
    used_uids = {u[3:] for u in used if u.startswith("sf:")}
    sketchfab = model_for_slide(deck_topic, title, exclude=used_uids)
    if sketchfab:
        used.add("sf:" + sketchfab["uid"])
        if last_3d is not None:
            last_3d[0] = slide_index
        return None, sketchfab
    if not builtin:
        return None, None
    domain = _matched_domain(f"{title} {deck_topic}")
    for cand in _DOMAIN_FALLBACKS.get(domain or "", []):
        if cand not in used:
            used.add(cand)
            if last_3d is not None:
                last_3d[0] = slide_index
            return cand, None
    return None, None


def compile_semantic_slide(
    semantic: Dict[str, Any],
    slide_index: int = 1,
    used_3d_models: Optional[Set[str]] = None,
    total_slides: int = 1,
    last_3d_slide: Optional[List[int]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Compile a semantic slide into a SlideSpec with positioned blocks. Returns (slide_spec, datasets)."""
    if used_3d_models is None:
        used_3d_models = set()
    s = repair_content_limits(semantic)
    layout = s["layout"]
    title = s.get("title") or ""
    subtitle = s.get("subtitle") or ""
    bullets: List[str] = s.get("bullets") or []
    deck_topic = s.get("deck_topic") or title
    image = s.get("image") if isinstance(s.get("image"), dict) and s["image"].get("url") else None
    legacy_url = s.get("imageUrl") or ((s.get("image") or {}).get("assetId") if isinstance(s.get("image"), dict) else None)
    # Research decks say per slide whether a 3D model is the right visual. Older callers (mock
    # provider, copilot) don't, and keep getting topic-matched 3D models on media slides.
    research = "visual_type" in s
    # Media slides get a real 3D model of their subject when Sketchfab has one, within the deck's
    # budget; research decks search with the slide's own image query and never use a stand-in scene.
    wants_3d = layout in ("image-text", "title", "bullets") or s.get("visual_type") == "3d"
    subject = s.get("image_query") or title
    model_3d, sketchfab = (None, None)

    # Decide the final layout from what content actually exists.
    if layout == "chart-text" and not ((s.get("chart") or {}).get("data")):
        layout = "image-text" if image else "text"
    if layout == "big-number" and not (s.get("kpi") or {}).get("value"):
        layout = "image-text" if image else "text"
    if layout == "quote" and not (s.get("quote") or {}).get("text"):
        layout = "text"
    if layout == "timeline" and not ((s.get("timeline") or {}).get("steps")):
        layout = "text"
    if layout == "comparison" and not s.get("comparison"):
        layout = "two-column" if len(bullets) >= 2 else "text"
    if layout == "table" and not (s.get("table") or {}).get("rows"):
        layout = "text"
    if layout in ("swot", "market-size", "funnel") and not s.get({"swot": "swot", "market-size": "marketSize", "funnel": "funnel"}[layout]):
        layout = "text"
    if layout in ("image-text", "bullets", "title") and not (image or legacy_url):
        model_3d, sketchfab = _pick_3d(deck_topic, subject, used_3d_models, slide_index, total_slides, last_3d_slide, wants_3d, builtin=not research)
        if not (model_3d or sketchfab) and layout != "title":
            layout = "text"
    if layout == "two-column" and len(bullets) < 2:
        layout = "text"
    if layout in ("image-text", "title") and (image or legacy_url) and wants_3d and not (model_3d or sketchfab):
        model_3d, sketchfab = _pick_3d(deck_topic, subject, used_3d_models, slide_index, total_slides, last_3d_slide, True, builtin=not research)

    slots = {slot["role"]: slot for slot in LAYOUT_SLOTS[layout]}
    blocks: List[Dict[str, Any]] = []
    datasets: Dict[str, Any] = {}
    has_media = layout in ("title", "image-text", "bullets") and bool(image or legacy_url or model_3d or sketchfab)

    # Title
    if "title" in slots and title:
        slot = slots["title"]
        wide = {"w": 1720} if layout == "title" and not has_media else {}
        blocks.append(_text_block("title", "title", slot, text=title, size=60 if layout == "title" else 46, bold=True, **wide))
    if "subtitle" in slots and subtitle and layout != "quote":
        slot = slots["subtitle"]
        wide = {"w": 1720} if layout == "title" and not has_media else {}
        blocks.append(_text_block("sub", "subtitle", slot, text=subtitle, size=30 if layout == "title" else 28, color="var(--ink-2)", **wide))

    # Media (photo, diagram, or 3D model)
    if has_media and "media" in slots:
        slot = slots["media"]
        url = (image or {}).get("url") or legacy_url or ""
        props = {
            "assetId": url, "model3d": model_3d, "sketchfab": sketchfab, "fit": "contain" if s.get("visual_type") == "diagram" else "cover",
            "radius": 16 if layout == "title" else 12, "alt": (image or {}).get("alt") or title,
            "credit": (image or {}).get("credit", ""), "sourcePage": (image or {}).get("source_page", ""), "license": (image or {}).get("license", ""),
            # A slide that got a 3D model opens in 3D; its photo stays one click away.
            "prefer3d": bool(model_3d or sketchfab),
        }
        blocks.append({"id": _new_id("media"), "type": "image", "role": "media", "assetId": url, "model3d": model_3d,
                       "sketchfab": sketchfab, "alt": props["alt"], **_box(slot), "props": props})

    if layout == "title" and s.get("footer") and "footer" in slots:
        blocks.append(_text_block("foot", "footer", slots["footer"], text=s["footer"], size=18, color="var(--ink-3)"))

    body_size = 26 if len(" ".join(bullets)) < 520 else 23

    if layout == "big-number":
        kpi = s["kpi"]
        blocks.append({"id": _new_id("kpi"), "type": "kpi", "role": "kpi", "value": kpi["value"], "label": kpi.get("label", ""),
                       "delta": kpi.get("delta", ""), **_box(slots["kpi"]),
                       "props": {"value": kpi["value"], "label": kpi.get("label", ""), "delta": kpi.get("delta", "")}})
        if bullets:
            blocks.append(_text_block("body", "body", slots["body"], bullets=bullets, size=body_size))

    elif layout == "chart-text":
        chart = s["chart"]
        data = [r for r in chart["data"] if isinstance(r, dict)]
        x_field, y_field = chart.get("xField") or "category", chart.get("yField") or "value"
        if data:
            keys = list(data[0].keys())
            strs = [k for k in keys if isinstance(data[0][k], str)]
            nums = [k for k in keys if isinstance(data[0][k], (int, float)) and not isinstance(data[0][k], bool)]
            x_field = strs[0] if strs else x_field
            y_field = nums[0] if nums else y_field
        name = chart.get("dataset") or f"dataset_{uuid.uuid4().hex[:6]}"
        from_research = chart.get("source") == "research"
        datasets[name] = {
            "id": name, "name": chart.get("title") or title, "source": "research" if from_research else "ai-estimate",
            "columns": [{"key": x_field, "label": x_field.capitalize(), "type": "text"}, {"key": y_field, "label": y_field.capitalize(), "type": "number"}],
            "rows": data,
            **({"citations": [f"[{n}]" for n in chart.get("citations") or []]} if from_research else {}),
        }
        kind = chart.get("kind") or "bar"
        blocks.append({"id": _new_id("chart"), "type": "chart", "role": "chart", "kind": kind, "dataset": name, "xField": x_field,
                       "yField": y_field, "series": [{"field": y_field, "label": chart.get("title") or "Value"}], **_box(slots["chart"]),
                       "props": {"kind": kind, "dataset": name, "xField": x_field, "yField": y_field,
                                 "series": [{"field": y_field, "label": chart.get("title") or "Value"}], "title": chart.get("title", ""),
                                 "sourceNote": ("Source: " + "".join(f"[{n}]" for n in chart.get("citations") or [])) if from_research else ""}})
        if bullets:
            blocks.append(_text_block("body", "body", slots["body"], bullets=bullets, size=24))
        if s.get("interactive"):
            var = f"metric_scale_{slide_index}"
            blocks.append({"id": _new_id("slider"), "type": "control", "control": "slider", "variable": var, "label": f"{chart.get('title') or 'Metric'} scale",
                           "min": 0, "max": 100, "step": 5, "x": 100, "y": 870, "w": 680, "h": 80, "box": {"x": 100, "y": 870, "w": 680, "h": 80},
                           "props": {"control": "slider", "variable": var, "min": 0, "max": 100, "step": 5}})

    elif layout == "timeline":
        steps = s["timeline"]["steps"]
        items = [{"title": st.get("title") or st.get("step") or "", "body": st.get("body") or st.get("desc") or "", "date": st.get("date") or f"{i + 1:02d}"}
                 for i, st in enumerate(steps)]
        blocks.append({"id": _new_id("timeline"), "type": "steps", "role": "body", "items": items, "orientation": "h",
                       **_box(slots["body"], h=560 if bullets else 720), "props": {"items": items, "steps": steps}})
        if bullets:
            blocks.append(_text_block("body", "body", slots["body"], bullets=bullets[:2], size=22, y=800, h=150))

    elif layout == "comparison":
        c = s["comparison"]
        columns = [{"title": c.get("leftTitle", ""), "items": c.get("leftItems") or []}, {"title": c.get("rightTitle", ""), "items": c.get("rightItems") or []}]
        blocks.append({"id": _new_id("compare"), "type": "comparison", "role": "body", "columns": columns,
                       **_box(slots["body"], h=520 if bullets else 720),
                       "props": {"columns": columns, "leftTitle": columns[0]["title"], "leftItems": columns[0]["items"],
                                 "rightTitle": columns[1]["title"], "rightItems": columns[1]["items"]}})
        if bullets:
            blocks.append(_text_block("body", "body", slots["body"], bullets=bullets[:3], size=22, y=770, h=180))

    elif layout == "table":
        t = s["table"]
        cols = [f"c{i}" for i in range(len(t["columns"]))]
        name = f"table_{uuid.uuid4().hex[:6]}"
        datasets[name] = {
            "id": name, "name": t.get("title") or title, "source": "research",
            "columns": [{"key": k, "label": label, "type": "text"} for k, label in zip(cols, t["columns"])],
            "rows": [{k: v for k, v in zip(cols, row)} for row in t["rows"]],
            "citations": re.findall(r"\[\d+\]", t.get("marks") or ""),
        }
        blocks.append({"id": _new_id("table"), "type": "table", "role": "body", "dataset": name, "columns": cols, "style": "striped",
                       **_box(slots["body"], h=520 if bullets else 680), "props": {"dataset": name, "columns": cols, "style": "striped", "sourceNote": t.get("marks", "")}})
        if bullets:
            blocks.append(_text_block("body", "body", slots["body"], bullets=bullets[:3], size=22, y=770, h=180))

    elif layout == "quote":
        q = s["quote"]
        blocks.append({"id": _new_id("quote"), "type": "quote", "role": "body", "text": q["text"], "attribution": q.get("author", ""),
                       **_box(slots["body"]), "props": {"text": q["text"], "attribution": q.get("author", ""), "author": q.get("author", ""), "fontSize": 38, "italic": True, "align": "center"}})
        if q.get("author"):
            blocks.append(_text_block("author", "subtitle", slots["subtitle"], text=f"— {q['author']}", size=24, align="center", color="var(--ink-2)"))

    elif layout == "two-column":
        half = (len(bullets) + 1) // 2
        blocks.append(_text_block("col1", "body", slots["body"], bullets=bullets[:half], size=body_size))
        blocks.append(_text_block("col2", "aside", slots["aside"], bullets=bullets[half:], size=body_size))

    elif layout == "references":
        refs = [str(r) for r in s.get("references") or []]
        block = _text_block("refs", "body", slots["body"], bullets=refs, size=20)
        block["props"]["links"] = s.get("reference_links") or []
        block["props"]["listStyle"] = "none"
        blocks.append(block)

    elif layout in ("swot", "market-size", "funnel"):
        key = {"swot": "swot", "market-size": "marketSize", "funnel": "funnel"}[layout]
        blocks.append({"id": _new_id(layout), "type": layout, "role": "body", key: s[key], **_box(slots["body"]), "props": {key: s[key]}})

    elif layout in ("image-text", "bullets", "text") and bullets:
        blocks.append(_text_block("body", "body", slots["body"], bullets=bullets, size=body_size if layout != "text" else 28))

    # Claim-level provenance travels with the text block that shows the claims.
    if s.get("points"):
        for b in blocks:
            if b.get("type") == "text" and b.get("role") in ("body", "aside") and b.get("bullets"):
                b["props"]["points"] = [p for p in s["points"] if any(p.get("text", "")[:40] in x for x in b["bullets"])]

    # Per-slide source footnote: the short references cited on this slide.
    citations = [c for c in s.get("citations") or [] if isinstance(c, str) and c.strip()]
    if citations and layout not in ("title", "section", "references"):
        blocks.append({"id": _new_id("cite"), "type": "citation", "role": "footnote", "citations": citations,
                       "x": 100, "y": 975, "w": 1720, "h": 70, "box": {"x": 100, "y": 975, "w": 1720, "h": 70},
                       "props": {"citations": citations, "links": s.get("citation_links") or []}})

    if isinstance(s.get("html"), dict):
        box = {"x": 200, "y": 240, "w": 1520, "h": 720}
        blocks.append({"id": _new_id("html"), "type": "html", "role": "body", **box, "box": dict(box),
                       "props": {"html": s["html"].get("html", ""), "css": s["html"].get("css", ""), "js": s["html"].get("js", "")}})

    spec = {
        "id": f"slide-{uuid.uuid4().hex[:12]}",
        "layout": layout,
        "background": {"type": "color", "value": "transparent"},
        "notes": s.get("notes", ""),
        "transition": {"effect": "none", "duration": 300},
        "blocks": blocks,
    }
    if s.get("points"):
        spec["provenance"] = {"points": s["points"], "extractive": bool(s.get("extractive"))}
    return spec, datasets
