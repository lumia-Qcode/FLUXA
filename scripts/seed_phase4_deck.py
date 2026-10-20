#!/usr/bin/env python3
"""FLUXA - Seed Phase 4 Dynamic Engine Deck

Creates a verification presentation specifically for:
1. The 55 -> 74 worked example (adoption chart + bound KPI with count-up).
2. The what-if forecast slider example (slider control driving variable and computed chart/KPI).
3. Sandboxed HTML widget block (security sandbox + fluxa bridge).
4. Hostile expression handling (graceful inline error, slide renders).
5. Build sequences and animations for Presenter view testing.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db


def seed_phase4(db_path: str = "instance/fluxa.db") -> int:
    init_db(db_path)
    conn = get_connection(db_path)

    title = "Phase 4 Dynamic Engine Verification"
    existing = conn.execute(
        "SELECT id FROM presentations WHERE title = ?", (title,)
    ).fetchone()

    datasets = {
        "adoption": {
            "id": "adoption",
            "name": "Adoption",
            "source": "user",
            "columns": [
                {"key": "year", "label": "Year", "type": "text"},
                {"key": "pct", "label": "Percentage", "type": "number"},
            ],
            "rows": [
                {"year": "2023", "pct": 35},
                {"year": "2024", "pct": 55},
            ],
        },
        "forecast": {
            "id": "forecast",
            "name": "Forecast Model",
            "source": "user",
            "columns": [
                {"key": "quarter", "label": "Quarter", "type": "text"},
                {"key": "base", "label": "Base Revenue", "type": "number"},
                {"key": "projected", "label": "Projected", "type": "number", "expr": "base * growth"},
            ],
            "rows": [
                {"quarter": "Q1", "base": 100},
                {"quarter": "Q2", "base": 150},
                {"quarter": "Q3", "base": 220},
                {"quarter": "Q4", "base": 300},
            ],
        },
    }

    variables = {
        "growth": {
            "id": "growth",
            "label": "Growth Multiplier",
            "type": "number",
            "value": 1.2,
            "min": 1.0,
            "max": 2.0,
            "step": 0.05,
            "scope": "deck",
        },
    }

    theme = {"themeId": "clean-light"}
    settings = {"transition": {"effect": "fade", "duration": 300}, "loop": False}

    if existing:
        pres_id = existing["id"]
        conn.execute("DELETE FROM slides WHERE presentation_id = ?", (pres_id,))
        conn.execute(
            """
            UPDATE presentations
            SET datasets = ?, variables = ?, theme = ?, settings = ?, revision = revision + 1
            WHERE id = ?
            """,
            (json.dumps(datasets), json.dumps(variables), json.dumps(theme), json.dumps(settings), pres_id),
        )
        conn.commit()
    else:
        cursor = conn.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1)
            """,
            (
                title,
                "Automated test deck for reactive engine, 55->74 example, what-if slider, HTML sandbox, presenter view.",
                json.dumps(theme),
                json.dumps(datasets),
                json.dumps(variables),
                json.dumps(settings),
            ),
        )
        pres_id = cursor.lastrowid
        conn.commit()

    # Slide 1: 55 -> 74 Worked Example (Chart + Bound KPI)
    slide1_spec = {
        "id": "slide-p4-1",
        "order": 0,
        "layout": "chart-text",
        "notes": "Slide 1 Speaker Notes: Test the 55 to 74 transition by editing the 2024 cell in Data tab.",
        "blocks": [
            {
                "id": "title-1",
                "type": "text",
                "x": 100, "y": 60, "w": 1720, "h": 90,
                "role": "title",
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Annual Adoption Velocity"}]}]},
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "chart-adoption",
                "type": "chart",
                "role": "chart",
                "x": 100, "y": 180, "w": 1080, "h": 780,
                "kind": "bar",
                "dataset": "adoption",
                "xField": "year",
                "series": [{"field": "pct", "label": "Adoption %", "color": "#2352F5"}],
                "options": {"animateMs": 700},
            },
            {
                "id": "kpi-adoption",
                "type": "kpi",
                "role": "kpi",
                "x": 1240, "y": 180, "w": 580, "h": 360,
                "value": {"$bind": "last(adoption.pct)"},
                "label": "Latest Adoption Rate",
                "format": {"suffix": "%"},
            },
            {
                "id": "text-desc",
                "type": "text",
                "role": "body",
                "x": 1240, "y": 580, "w": 580, "h": 380,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "The KPI block is reactively bound to last(adoption.pct). Changing the dataset row from 55 to 74 updates the chart bar and counts the KPI to 74."}]}
                    ]
                },
                "style": {"fontSize": 24, "lineHeight": 1.5, "align": "left"},
            },
        ],
    }

    # Slide 2: What-If Forecast Slider
    slide2_spec = {
        "id": "slide-p4-2",
        "order": 1,
        "layout": "chart-text",
        "notes": "Slide 2 Speaker Notes: Drag the growth slider to see real-time updates.",
        "blocks": [
            {
                "id": "title-2",
                "type": "text",
                "x": 100, "y": 60, "w": 1720, "h": 90,
                "role": "title",
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Interactive Revenue Forecast"}]}]},
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "slider-growth",
                "type": "control",
                "x": 100, "y": 180, "w": 700, "h": 100,
                "control": "slider",
                "variable": "growth",
                "label": "Growth Rate",
                "min": 1.0,
                "max": 2.0,
                "step": 0.05,
            },
            {
                "id": "chart-forecast",
                "type": "chart",
                "x": 100, "y": 310, "w": 1080, "h": 650,
                "kind": "column",
                "dataset": "forecast",
                "xField": "quarter",
                "series": [{"field": "projected", "label": "Projected ($M)", "color": "#047857"}],
                "options": {"animateMs": 300},
            },
            {
                "id": "kpi-forecast",
                "type": "kpi",
                "x": 1240, "y": 180, "w": 580, "h": 360,
                "value": {"$bind": "round(sum(forecast.projected), 1)"},
                "label": "Total Projected Revenue",
                "format": {"prefix": "$", "suffix": "M"},
            },
        ],
    }

    # Slide 3: Sandboxed HTML Widget Block
    slide3_spec = {
        "id": "slide-p4-3",
        "order": 2,
        "layout": "full-bleed",
        "notes": "Slide 3 Speaker Notes: Isolated iframe with strict CSP and fluxa postMessage bridge.",
        "blocks": [
            {
                "id": "widget-calc",
                "type": "html",
                "x": 200, "y": 150, "w": 1520, "h": 780,
                "code": {
                    "html": '<div id="container"><h2 id="widget-heading">Secure Sandboxed Widget</h2><p>Growth: <span id="current-growth">?</span></p><button id="btn-boost">Boost Growth to 1.8x</button></div>',
                    "css": "body { display: flex; align-items: center; justify-content: center; height: 100%; font-family: sans-serif; }\n#container { background: #FFFFFF; padding: 2rem; border-radius: 8px; border: 1px solid #D9D9DD; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-align: center; }\nbutton { margin-top: 1rem; padding: 8px 16px; background: #2352F5; color: #FFF; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }",
                    "js": 'const growthEl = document.getElementById("current-growth");\nif (window.fluxa) {\n  growthEl.innerText = window.fluxa.get("growth") || "1.0";\n  window.fluxa.on("change", (vars) => {\n    if (vars.growth) growthEl.innerText = vars.growth;\n  });\n  document.getElementById("btn-boost").addEventListener("click", () => {\n    window.fluxa.set("growth", 1.8);\n    growthEl.innerText = "1.8";\n  });\n}',
                },
            },
        ],
    }

    # Slide 4: Hostile Expression Resilience
    slide4_spec = {
        "id": "slide-p4-4",
        "order": 3,
        "layout": "blank",
        "notes": "Slide 4 Speaker Notes: Hostile and broken expressions show inline badges without crashing.",
        "blocks": [
            {
                "id": "kpi-hostile-1",
                "type": "kpi",
                "x": 200, "y": 200, "w": 600, "h": 300,
                "value": {"$bind": "constructor.constructor('alert(1)')()"},
                "label": "Prohibited Constructor Access",
            },
            {
                "id": "kpi-hostile-2",
                "type": "kpi",
                "x": 900, "y": 200, "w": 600, "h": 300,
                "value": {"$bind": "1 + * 2"},
                "label": "Invalid Syntax",
            },
        ],
    }

    # Slide 5: Build Sequence for Presenter View Testing
    slide5_spec = {
        "id": "slide-p4-5",
        "order": 4,
        "layout": "bullets",
        "notes": "Slide 5 Speaker Notes: Stepping through builds before advancing to next slide.",
        "blocks": [
            {
                "id": "title-builds",
                "type": "text",
                "x": 100, "y": 60, "w": 1720, "h": 90,
                "role": "title",
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Sequential Block Builds"}]}]},
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "step-1",
                "type": "text",
                "x": 100, "y": 220, "w": 1720, "h": 120,
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Step 1: First concept is introduced."}]}]},
                "style": {"fontSize": 32, "align": "left"},
                "animation": [{"effect": "fade", "trigger": "onClick", "duration": 300}],
            },
            {
                "id": "step-2",
                "type": "text",
                "x": 100, "y": 380, "w": 1720, "h": 120,
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Step 2: Second concept is added on next click."}]}]},
                "style": {"fontSize": 32, "align": "left"},
                "animation": [{"effect": "rise", "trigger": "onClick", "duration": 300}],
            },
            {
                "id": "step-3",
                "type": "text",
                "x": 100, "y": 540, "w": 1720, "h": 120,
                "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Step 3: Third concept concludes the sequence."}]}]},
                "style": {"fontSize": 32, "align": "left"},
                "animation": [{"effect": "zoom", "trigger": "onClick", "duration": 300}],
            },
        ],
    }

    slides = [slide1_spec, slide2_spec, slide3_spec, slide4_spec, slide5_spec]

    for idx, s in enumerate(slides):
        conn.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                pres_id,
                idx,
                f"Slide {idx + 1}",
                "",
                json.dumps(s),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Successfully seeded Phase 4 Dynamic Engine Deck (ID: {pres_id}) with {len(slides)} slides.")
    return pres_id


if __name__ == "__main__":
    seed_phase4()
