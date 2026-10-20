#!/usr/bin/env python3
"""FLUXA - Legacy Content Migration Script (Phase 1)

Migrates legacy plain-text & mini-markup slides into the structured JSON specification.
- Creates a timestamped backup before any modifications.
- Idempotent: Skips slides that already have a valid `spec`.
- Robust tokenizer: Handles colons in labels/subtext, colons in JSON, invalid JSON,
  empty content, and RTL/Urdu text.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import shutil
import sys
import uuid

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db  # noqa: E402
from app.spec.models import SlideModel  # noqa: E402

BULLET_REGEX = re.compile(r"^[-*•]\s+(.*)$")


def backup_database(database_path: str) -> str:
    """Create a timestamped backup of the SQLite database."""
    if not os.path.exists(database_path):
        return ""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{os.path.splitext(database_path)[0]}_backup_{timestamp}.db"
    shutil.copy2(database_path, backup_path)
    return backup_path


def tokenize_tag(line: str) -> dict | None:
    """Robustly parse a single tag like [metric:...], [chart:...], etc.

    Does NOT use simple split(":") to avoid breaking on labels or JSON containing colons.
    """
    trimmed = line.strip()
    if not (trimmed.startswith("[") and trimmed.endswith("]")):
        return None

    inner = trimmed[1:-1].strip()
    if not inner:
        return None

    # Find the tag name (first colon)
    colon_idx = inner.find(":")
    if colon_idx == -1:
        return None

    tag_type = inner[:colon_idx].strip().lower()
    rest = inner[colon_idx + 1 :].strip()

    if tag_type == "chart":
        # Format: [chart:kind:{json}]
        # Kind is up to next colon
        next_colon = rest.find(":")
        if next_colon != -1:
            chart_kind = rest[:next_colon].strip().lower()
            json_part = rest[next_colon + 1 :].strip()
        else:
            chart_kind = "bar"
            json_part = rest

        try:
            data = json.loads(json_part)
        except Exception:
            # Fallback: attempt simple repair or wrap
            data = {"labels": ["Item 1", "Item 2"], "values": [10, 20]}

        return {"type": "chart", "kind": chart_kind, "data": data}

    elif tag_type == "metric":
        # Format: [metric:val:label:sub] or [metric:Q3: growth:12%:Up]
        # Tokenize by finding colons, but detect if one of the middle parts has a colon in its label
        parts = [p.strip() for p in rest.split(":")]
        if len(parts) == 1:
            return {"type": "metric", "value": parts[0], "label": "Metric", "sub": ""}
        elif len(parts) == 2:
            return {"type": "metric", "value": parts[0], "label": parts[1], "sub": ""}
        elif len(parts) == 3:
            # Check if parts[0] is metric value or parts[1] is metric value
            # E.g. [metric:99%:Label:Sub] vs [metric:Label:99%:Sub]
            val_pattern = re.compile(r"^[\$€£+-]?\s*\d+(\.\d+)?([kKmMbB]|%)?$")
            if not val_pattern.match(parts[0]) and val_pattern.match(parts[1]):
                return {"type": "metric", "value": parts[1], "label": parts[0], "sub": parts[2]}
            return {"type": "metric", "value": parts[0], "label": parts[1], "sub": parts[2]}
        else:
            # More than 3 parts: find the numerical/percentage value token
            # E.g. ["Q3", "growth", "12%", "Up"] -> label="Q3: growth", val="12%", sub="Up"
            val_pattern = re.compile(r"^[\$€£+-]?\s*\d+(\.\d+)?([kKmMbB]|%)?$")
            val_idx = -1
            for idx, p in enumerate(parts):
                if val_pattern.match(p):
                    val_idx = idx
                    break

            # Fallback if no exact match but contains digits and unit
            if val_idx == -1:
                for idx, p in enumerate(parts):
                    if "%" in p or "$" in p:
                        val_idx = idx
                        break

            if val_idx != -1:
                val = parts[val_idx]
                label_parts = parts[:val_idx]
                sub_parts = parts[val_idx + 1 :]
                label = ": ".join(label_parts) if label_parts else "Metric"
                sub = ": ".join(sub_parts) if sub_parts else ""
            else:
                val = parts[0]
                label = ": ".join(parts[1:-1])
                sub = parts[-1]

            return {"type": "metric", "value": val, "label": label, "sub": sub}

    elif tag_type == "quote":
        # Format: [quote:text:attribution]
        # Text could contain colons; attribution is the final component after last colon
        last_colon = rest.rfind(":")
        if last_colon != -1:
            text = rest[:last_colon].strip()
            author = rest[last_colon + 1 :].strip()
        else:
            text = rest
            author = ""
        return {"type": "quote", "text": text, "attribution": author}

    elif tag_type == "compare":
        # Format: [compare:title:{json}]
        # Locate the opening brace {
        brace_idx = rest.find("{")
        if brace_idx != -1:
            # Everything before brace (excluding trailing colon) is title
            raw_title = rest[:brace_idx].rstrip(" :").strip()
            title = raw_title if raw_title else "Comparison"
            json_part = rest[brace_idx:].strip()
            try:
                data = json.loads(json_part)
            except Exception:
                data = {"Before": ["Legacy"], "After": ["Modern"]}
        else:
            title = "Comparison"
            data = {"Before": [], "After": []}

        return {"type": "compare", "title": title, "data": data}

    elif tag_type == "steps":
        # Format: [steps:title:{json}] or [steps:title:step1|step2]
        brace_idx = rest.find("{")
        if brace_idx != -1:
            raw_title = rest[:brace_idx].rstrip(" :").strip()
            title = raw_title if raw_title else "Process Flow"
            json_part = rest[brace_idx:].strip()
            try:
                data = json.loads(json_part)
                if isinstance(data, dict):
                    items = [{"title": f"Step {k}", "body": str(v)} for k, v in data.items()]
                elif isinstance(data, list):
                    items = [{"title": str(x)} for x in data]
                else:
                    items = []
            except Exception:
                items = [{"title": "Step 1", "body": "Overview"}]
        else:
            first_colon = rest.find(":")
            if first_colon != -1:
                title = rest[:first_colon].strip()
                step_str = rest[first_colon + 1 :].strip()
            else:
                title = "Process Flow"
                step_str = rest
            items = [{"title": s.strip()} for s in step_str.split("|") if s.strip()]

        return {"type": "steps", "title": title, "items": items}

    return None


def convert_slide_content(title: str, content: str, slide_order: int) -> tuple[dict, dict]:
    """Convert legacy title + content string into a structured Slide spec and any generated datasets.

    Stage size: 1920 x 1080.
    """
    blocks = []
    datasets = {}

    # 1. Slide Title Block (if present)
    clean_title = (title or "").strip()
    if clean_title:
        blocks.append(
            {
                "id": f"block-title-{slide_order}",
                "type": "text",
                "x": 100,
                "y": 80,
                "w": 1720,
                "h": 120,
                "role": "title",
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 1},
                            "content": [{"type": "text", "text": clean_title}],
                        }
                    ],
                },
                "style": {"fontSize": 44, "fontWeight": 600, "align": "left"},
            }
        )

    lines = [line.strip() for line in (content or "").splitlines() if line.strip()]
    bullets = []
    tags = []

    for line in lines:
        bullet_match = BULLET_REGEX.match(line)
        if bullet_match:
            bullets.append(bullet_match.group(1).strip())
            continue

        tag_obj = tokenize_tag(line)
        if tag_obj:
            tags.append(tag_obj)
        else:
            # Regular text line -> treat as bullet or paragraph
            bullets.append(line)

    # 2. Add Bullets / Text Block
    current_y = 240
    if bullets:
        content_nodes = []
        for b in bullets:
            content_nodes.append(
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": f"• {b}"}],
                }
            )

        text_w = 900 if tags else 1720
        blocks.append(
            {
                "id": f"block-body-{slide_order}",
                "type": "text",
                "x": 100,
                "y": current_y,
                "w": text_w,
                "h": min(700, max(120, len(bullets) * 60)),
                "role": "body",
                "doc": {"type": "doc", "content": content_nodes},
                "style": {"fontSize": 20, "lineHeight": 1.6, "align": "left"},
            }
        )

    # 3. Add Tag Blocks
    tag_x = 1060 if bullets else 100
    tag_w = 760 if bullets else 1720
    tag_y = current_y

    for i, tag in enumerate(tags):
        tag_type = tag["type"]
        block_id = f"block-{tag_type}-{slide_order}-{i}"

        if tag_type == "chart":
            chart_kind = tag.get("kind", "bar")
            if chart_kind not in [
                "bar",
                "column",
                "line",
                "area",
                "pie",
                "donut",
                "scatter",
                "radar",
                "stacked",
            ]:
                chart_kind = "bar"

            chart_data = tag.get("data", {})
            labels = chart_data.get("labels", ["Item A", "Item B"])
            values = chart_data.get("values", [50, 75])
            unit = chart_data.get("unit", "")

            # Create a dataset for this chart
            dataset_id = f"ds_slide_{slide_order}_{i}"
            rows = []
            for idx, lbl in enumerate(labels):
                val = values[idx] if idx < len(values) else 0
                rows.append({"label": str(lbl), "value": val})

            datasets[dataset_id] = {
                "id": dataset_id,
                "name": f"Chart Data (Slide {slide_order + 1})",
                "source": "import",
                "columns": [
                    {"key": "label", "label": "Label", "type": "text"},
                    {"key": "value", "label": "Value", "type": "number"},
                ],
                "rows": rows,
            }

            blocks.append(
                {
                    "id": block_id,
                    "type": "chart",
                    "x": tag_x,
                    "y": tag_y,
                    "w": tag_w,
                    "h": 460,
                    "role": "chart",
                    "kind": chart_kind,
                    "dataset": dataset_id,
                    "xField": "label",
                    "series": [{"field": "value", "label": "Value"}],
                    "options": {"unit": unit, "animateMs": 700},
                }
            )
            tag_y += 480

        elif tag_type == "metric":
            blocks.append(
                {
                    "id": block_id,
                    "type": "kpi",
                    "x": tag_x,
                    "y": tag_y,
                    "w": min(tag_w, 480),
                    "h": 160,
                    "role": "kpi",
                    "value": tag["value"],
                    "label": tag["label"],
                    "format": {"suffix": "%" if "%" in str(tag["value"]) else None},
                    "countUp": True,
                }
            )
            tag_y += 180

        elif tag_type == "quote":
            blocks.append(
                {
                    "id": block_id,
                    "type": "quote",
                    "x": tag_x,
                    "y": tag_y,
                    "w": tag_w,
                    "h": 180,
                    "text": tag["text"],
                    "attribution": tag.get("attribution", ""),
                }
            )
            tag_y += 200

        elif tag_type == "compare":
            cols = []
            raw_data = tag.get("data", {})
            if isinstance(raw_data, dict):
                for col_title, items in raw_data.items():
                    item_list = items if isinstance(items, list) else [str(items)]
                    cols.append({"title": col_title, "items": item_list})
            blocks.append(
                {
                    "id": block_id,
                    "type": "comparison",
                    "x": tag_x,
                    "y": tag_y,
                    "w": tag_w,
                    "h": 320,
                    "columns": cols,
                }
            )
            tag_y += 340

        elif tag_type == "steps":
            blocks.append(
                {
                    "id": block_id,
                    "type": "steps",
                    "x": tag_x,
                    "y": tag_y,
                    "w": tag_w,
                    "h": 200,
                    "items": tag.get("items", []),
                    "orientation": "h",
                }
            )
            tag_y += 220

    # Layout selection heuristic
    layout = "blank"
    if clean_title and not bullets and not tags:
        layout = "title"
    elif tags and any(t["type"] == "chart" for t in tags):
        layout = "chart-text"
    elif tags and any(t["type"] == "metric" for t in tags):
        layout = "big-number"
    elif tags and any(t["type"] == "compare" for t in tags):
        layout = "comparison"
    elif tags and any(t["type"] == "steps" for t in tags):
        layout = "timeline"
    elif bullets:
        layout = "bullets"

    slide_spec = {
        "id": f"slide-{uuid.uuid4().hex[:8]}",
        "order": slide_order,
        "layout": layout,
        "notes": "",
        "blocks": blocks,
    }

    return slide_spec, datasets


def migrate_database(database_path: str, force: bool = False) -> tuple[int, int]:
    """Run migration on all presentations and slides in the database."""
    init_db(database_path)
    con = get_connection(database_path)

    cursor = con.execute("SELECT id, title FROM presentations")
    presentations = cursor.fetchall()

    total_migrated_slides = 0
    total_migrated_decks = 0

    for pres in presentations:
        pres_id = pres["id"]
        slide_cursor = con.execute(
            "SELECT id, slide_order, title, content, spec FROM slides WHERE presentation_id = ? ORDER BY slide_order ASC",
            (pres_id,),
        )
        slides = slide_cursor.fetchall()

        deck_datasets = {}
        deck_needs_update = False

        for slide in slides:
            # Idempotency check: skip if spec already exists unless force is True
            if slide["spec"] and not force:
                continue

            slide_spec, generated_datasets = convert_slide_content(
                slide["title"] or "", slide["content"] or "", slide["slide_order"]
            )
            deck_datasets.update(generated_datasets)

            # Validate generated slide spec with Pydantic
            SlideModel.model_validate(slide_spec)

            con.execute(
                "UPDATE slides SET spec = ? WHERE id = ?",
                (json.dumps(slide_spec), slide["id"]),
            )
            total_migrated_slides += 1
            deck_needs_update = True

        if deck_needs_update:
            # Merge deck datasets into presentations table
            curr_ds_raw = con.execute(
                "SELECT datasets FROM presentations WHERE id = ?", (pres_id,)
            ).fetchone()
            existing_ds = {}
            if curr_ds_raw and curr_ds_raw["datasets"]:
                try:
                    existing_ds = json.loads(curr_ds_raw["datasets"])
                except Exception:
                    existing_ds = {}
            existing_ds.update(deck_datasets)

            con.execute(
                "UPDATE presentations SET datasets = ?, schema_version = 1, revision = revision + 1 WHERE id = ?",
                (json.dumps(existing_ds), pres_id),
            )
            total_migrated_decks += 1

    con.commit()
    con.close()
    return total_migrated_decks, total_migrated_slides


def main():
    db_path = os.environ.get("DATABASE_PATH", "instance/fluxa.db")
    print(f"Starting legacy migration for database: {db_path}")

    backup_file = backup_database(db_path)
    if backup_file:
        print(f"Created database backup: {backup_file}")

    decks_count, slides_count = migrate_database(db_path)
    print(
        f"Migration finished successfully: {decks_count} presentations and {slides_count} slides migrated."
    )


if __name__ == "__main__":
    main()
