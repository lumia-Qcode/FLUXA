"""Semantic-to-blocks compiler and content limits repair pass for FLUXA AI generation."""

import uuid
from typing import Any, Dict, List, Tuple

LAYOUT_SLOTS = {
    "title": [
        {"role": "title", "x": 160, "y": 320, "w": 1600, "h": 220, "align": "center"},
        {"role": "subtitle", "x": 260, "y": 560, "w": 1400, "h": 140, "align": "center"},
        {"role": "footer", "x": 400, "y": 840, "w": 1120, "h": 80, "align": "center"},
    ],
    "section": [
        {"role": "subtitle", "x": 200, "y": 360, "w": 1520, "h": 60, "align": "left"},
        {"role": "title", "x": 200, "y": 440, "w": 1520, "h": 240, "align": "left"},
    ],
    "bullets": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 240, "w": 1720, "h": 720, "align": "left"},
    ],
    "two-column": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 240, "w": 820, "h": 720, "align": "left"},
        {"role": "aside", "x": 1000, "y": 240, "w": 820, "h": 720, "align": "left"},
    ],
    "big-number": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "kpi", "x": 100, "y": 240, "w": 900, "h": 450, "align": "left"},
        {"role": "body", "x": 1060, "y": 260, "w": 760, "h": 680, "align": "left"},
        {"role": "footer", "x": 100, "y": 740, "w": 900, "h": 180, "align": "left"},
    ],
    "chart-text": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 240, "w": 680, "h": 720, "align": "left"},
        {"role": "chart", "x": 840, "y": 240, "w": 980, "h": 720, "align": "left"},
    ],
    "image-text": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "media", "x": 100, "y": 240, "w": 880, "h": 720, "align": "left"},
        {"role": "body", "x": 1040, "y": 240, "w": 780, "h": 720, "align": "left"},
    ],
    "quote": [
        {"role": "body", "x": 200, "y": 280, "w": 1520, "h": 480, "align": "center"},
        {"role": "subtitle", "x": 300, "y": 780, "w": 1320, "h": 100, "align": "center"},
    ],
    "timeline": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 240, "w": 1720, "h": 720, "align": "left"},
    ],
    "comparison": [
        {"role": "title", "x": 100, "y": 80, "w": 1720, "h": 120, "align": "left"},
        {"role": "body", "x": 100, "y": 240, "w": 1720, "h": 720, "align": "left"},
    ],
    "full-bleed": [
        {"role": "title", "x": 120, "y": 860, "w": 1680, "h": 140, "align": "left"},
    ],
    "blank": [],
}


def repair_content_limits(semantic: Dict[str, Any]) -> Dict[str, Any]:
    """Apply strict content limits per Section 4.5.
    - title <= 70 chars
    - <= 5 bullets
    - <= 90 chars per bullet
    - chart <= 12 data points
    """
    repaired = dict(semantic)

    # Title limit
    if "title" in repaired and isinstance(repaired["title"], str):
        title = repaired["title"].strip()
        if len(title) > 70:
            title = title[:67].rstrip() + "..."
        repaired["title"] = title

    # Subtitle limit
    if "subtitle" in repaired and isinstance(repaired["subtitle"], str):
        sub = repaired["subtitle"].strip()
        if len(sub) > 100:
            sub = sub[:97].rstrip() + "..."
        repaired["subtitle"] = sub

    # Bullets limit
    if "bullets" in repaired and isinstance(repaired["bullets"], list):
        bullets = [str(b).strip() for b in repaired["bullets"] if str(b).strip()]
        bullets = bullets[:5]  # Max 5 bullets
        capped_bullets = []
        for b in bullets:
            if len(b) > 90:
                b = b[:87].rstrip() + "..."
            capped_bullets.append(b)
        repaired["bullets"] = capped_bullets

    # Chart data points limit
    if "chart" in repaired and isinstance(repaired["chart"], dict):
        chart_data = repaired["chart"].get("data")
        if isinstance(chart_data, list) and len(chart_data) > 12:
            repaired["chart"]["data"] = chart_data[:12]

    # Validate layout
    layout = repaired.get("layout", "bullets")
    # Normalize aliases
    alias_map = {
        "two_column": "two-column",
        "big_number": "big-number",
        "chart_text": "chart-text",
        "image_text": "image-text",
        "title_bullets": "bullets",
        "full_bleed": "full-bleed",
    }
    layout = alias_map.get(layout, layout)
    if layout not in LAYOUT_SLOTS:
        layout = "bullets"
    repaired["layout"] = layout

    return repaired


def compile_semantic_slide(
    semantic: Dict[str, Any],
    slide_index: int = 1,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Compile a semantic slide definition into a validated SlideSpec with positioned blocks.
    Returns (slide_spec, generated_datasets).
    """
    repaired = repair_content_limits(semantic)
    layout_id = repaired.get("layout", "bullets")
    slots = LAYOUT_SLOTS.get(layout_id, LAYOUT_SLOTS["bullets"])

    blocks: List[Dict[str, Any]] = []
    datasets: Dict[str, Any] = {}

    title_text = repaired.get("title", f"Slide {slide_index}")
    subtitle_text = repaired.get("subtitle", "")
    bullets = repaired.get("bullets", [])
    notes = repaired.get("notes", "")

    # Map layout slots to blocks
    slot_map = {s["role"]: s for s in slots}

    # 1. Title Block
    if "title" in slot_map and title_text:
        slot = slot_map["title"]
        blocks.append(
            {
                "id": f"blk-title-{uuid.uuid4().hex[:8]}",
                "type": "text",
                "role": "title",
                "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                "props": {
                    "text": title_text,
                    "fontSize": 48 if layout_id == "title" else 36,
                    "align": slot.get("align", "left"),
                    "bold": True,
                },
            }
        )

    # 2. Subtitle Block
    if "subtitle" in slot_map and subtitle_text:
        slot = slot_map["subtitle"]
        blocks.append(
            {
                "id": f"blk-sub-{uuid.uuid4().hex[:8]}",
                "type": "text",
                "role": "subtitle",
                "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                "props": {
                    "text": subtitle_text,
                    "fontSize": 24,
                    "align": slot.get("align", "center" if layout_id == "title" else "left"),
                    "color": "var(--ink-2)",
                },
            }
        )

    # 3. Layout Specific Content
    if layout_id == "big-number":
        kpi_data = repaired.get("kpi") or {
            "value": 85,
            "label": "Completion Rate",
            "delta": "+12%",
        }
        if "kpi" in slot_map:
            slot = slot_map["kpi"]
            blocks.append(
                {
                    "id": f"blk-kpi-{uuid.uuid4().hex[:8]}",
                    "type": "kpi",
                    "role": "kpi",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "value": kpi_data.get("value", 85),
                        "label": kpi_data.get("label", "Key Metric"),
                        "delta": kpi_data.get("delta", ""),
                    },
                }
            )
        if "body" in slot_map and bullets:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-body-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "bullets": bullets,
                        "fontSize": 22,
                    },
                }
            )

    elif layout_id == "chart-text":
        chart_info = repaired.get("chart") or {}
        dataset_name = chart_info.get("dataset") or f"dataset_{uuid.uuid4().hex[:6]}"
        data_rows = chart_info.get("data")
        x_field = chart_info.get("xField", "category")
        y_field = chart_info.get("yField", "value")

        if not data_rows:
            data_rows = [
                {"category": "Q1", "value": 45},
                {"category": "Q2", "value": 60},
                {"category": "Q3", "value": 75},
                {"category": "Q4", "value": 90},
            ]

        # Dataset tagged with source = 'ai-estimate' per Section 4.5
        datasets[dataset_name] = {
            "id": dataset_name,
            "name": chart_info.get("title", "Dataset"),
            "source": "ai-estimate",
            "columns": [
                {"name": x_field, "type": "string"},
                {"name": y_field, "type": "number"},
            ],
            "rows": data_rows,
        }

        if "chart" in slot_map:
            slot = slot_map["chart"]
            blocks.append(
                {
                    "id": f"blk-chart-{uuid.uuid4().hex[:8]}",
                    "type": "chart",
                    "role": "chart",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "kind": chart_info.get("kind", "bar"),
                        "dataset": dataset_name,
                        "xField": x_field,
                        "yField": y_field,
                        "title": chart_info.get("title", ""),
                    },
                }
            )

        if "body" in slot_map and bullets:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-body-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "bullets": bullets,
                        "fontSize": 20,
                    },
                }
            )

    elif layout_id == "two-column":
        # Split bullets into left and right columns
        half = (len(bullets) + 1) // 2
        left_bullets = bullets[:half] if bullets else ["Key pillar A", "Supporting factor"]
        right_bullets = (
            bullets[half:] if len(bullets) > 1 else ["Key pillar B", "Supporting factor"]
        )

        if "body" in slot_map:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-col1-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "bullets": left_bullets,
                        "fontSize": 22,
                    },
                }
            )
        if "aside" in slot_map:
            slot = slot_map["aside"]
            blocks.append(
                {
                    "id": f"blk-col2-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "aside",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "bullets": right_bullets,
                        "fontSize": 22,
                    },
                }
            )

    elif layout_id == "quote":
        quote_info = repaired.get("quote") or {}
        quote_text = quote_info.get("text") or (
            bullets[0] if bullets else "Design is how it works."
        )
        quote_author = quote_info.get("author") or subtitle_text or "Industry Leader"

        if "body" in slot_map:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-quote-{uuid.uuid4().hex[:8]}",
                    "type": "quote",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "text": quote_text,
                        "fontSize": 34,
                        "italic": True,
                        "align": "center",
                    },
                }
            )
        if "subtitle" in slot_map:
            slot = slot_map["subtitle"]
            blocks.append(
                {
                    "id": f"blk-author-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "subtitle",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "text": f"— {quote_author}",
                        "fontSize": 22,
                        "align": "center",
                        "color": "var(--ink-2)",
                    },
                }
            )

    elif layout_id == "timeline":
        timeline_info = repaired.get("timeline") or {}
        steps = timeline_info.get("steps") or [
            {
                "step": "1",
                "title": b.split(":")[0] if ":" in b else f"Phase {i + 1}",
                "desc": b.split(":")[1] if ":" in b else b,
            }
            for i, b in enumerate(bullets[:4])
        ]
        if "body" in slot_map:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-timeline-{uuid.uuid4().hex[:8]}",
                    "type": "steps",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "steps": steps,
                    },
                }
            )

    elif layout_id == "comparison":
        comp_info = repaired.get("comparison") or {}
        left_title = comp_info.get("leftTitle", "Option A")
        left_items = comp_info.get("leftItems", bullets[:2] if bullets else ["Standard approach"])
        right_title = comp_info.get("rightTitle", "Option B")
        right_items = comp_info.get(
            "rightItems", bullets[2:] if len(bullets) > 2 else ["Enhanced approach"]
        )

        if "body" in slot_map:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-compare-{uuid.uuid4().hex[:8]}",
                    "type": "comparison",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "leftTitle": left_title,
                        "leftItems": left_items,
                        "rightTitle": right_title,
                        "rightItems": right_items,
                    },
                }
            )

    else:
        # Default bullets layout
        if "body" in slot_map and bullets:
            slot = slot_map["body"]
            blocks.append(
                {
                    "id": f"blk-body-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "role": "body",
                    "box": {"x": slot["x"], "y": slot["y"], "w": slot["w"], "h": slot["h"]},
                    "props": {
                        "bullets": bullets,
                        "fontSize": 24,
                    },
                }
            )

    # Support AI generated HTML widget block if present
    if "html" in repaired and isinstance(repaired["html"], dict):
        widget_box = {"x": 200, "y": 240, "w": 1520, "h": 720}
        blocks.append(
            {
                "id": f"blk-html-{uuid.uuid4().hex[:8]}",
                "type": "html",
                "role": "body",
                "box": widget_box,
                "props": {
                    "html": repaired["html"].get("html", "<div>Widget</div>"),
                    "css": repaired["html"].get("css", ""),
                    "js": repaired["html"].get("js", ""),
                },
            }
        )

    slide_spec = {
        "id": f"slide-{uuid.uuid4().hex[:12]}",
        "layout": layout_id,
        "background": {"type": "color", "value": "transparent"},
        "notes": notes,
        "transition": {"effect": "none", "duration": 300},
        "blocks": blocks,
    }

    return slide_spec, datasets
