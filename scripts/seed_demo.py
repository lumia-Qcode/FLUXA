#!/usr/bin/env python3
"""FLUXA - Seed Demonstration Deck for 5-Minute Showcase & Offline Verification.

Creates the comprehensive showcase presentation demonstrating:
1. Executive introduction and theme styling.
2. The 55 -> 74 worked example (editing cell animates chart and counts KPI to 74).
3. The What-If forecast slider (live control driving variable and computed chart/KPI).
4. Sandboxed HTML widget block (Compound interest calculator with postMessage bridge).
5. Comparison: Legacy slide decks vs FLUXA live reactive software.
6. Multi-language / Urdu RTL layout.
7. Execution roadmap with animations and presenter view notes.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db


def seed_demo(db_path: str = "instance/fluxa.db") -> int:
    init_db(db_path)
    conn = get_connection(db_path)

    title = "FLUXA — Reactive Presentation Software"
    existing = conn.execute("SELECT id FROM presentations WHERE title = ?", (title,)).fetchone()

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
                {
                    "key": "projected",
                    "label": "Projected",
                    "type": "number",
                    "expr": "base * growth",
                },
            ],
            "rows": [
                {"quarter": "Q1", "base": 100},
                {"quarter": "Q2", "base": 150},
                {"quarter": "Q3", "base": 200},
                {"quarter": "Q4", "base": 280},
            ],
        },
    }

    variables = {
        "growth": {
            "id": "growth",
            "label": "Forecast Growth Rate",
            "type": "number",
            "value": 1.2,
            "min": 1.0,
            "max": 2.0,
            "step": 0.05,
            "scope": "deck",
        },
        "widget_rate": {
            "id": "widget_rate",
            "label": "Interest Rate",
            "type": "number",
            "value": 7.5,
            "min": 1.0,
            "max": 15.0,
            "step": 0.5,
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
            (
                json.dumps(datasets),
                json.dumps(variables),
                json.dumps(theme),
                json.dumps(settings),
                pres_id,
            ),
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
                "The definitive showcase demonstration deck for FLUXA — presentations as live software.",
                json.dumps(theme),
                json.dumps(datasets),
                json.dumps(variables),
                json.dumps(settings),
            ),
        )
        pres_id = cursor.lastrowid
        conn.commit()

    # 1. Slide 1: Title
    slide1_spec = {
        "id": "demo-s1",
        "order": 0,
        "layout": "title",
        "notes": "Welcome to FLUXA. Slides are live software, not pictures.",
        "blocks": [
            {
                "id": "d-title",
                "type": "text",
                "role": "title",
                "x": 160,
                "y": 280,
                "w": 1600,
                "h": 140,
                "doc": {
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "FLUXA — Reactive Presentation Software"}],
                    }],
                },
                "style": {"fontSize": 64, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-sub",
                "type": "text",
                "role": "subtitle",
                "x": 160,
                "y": 450,
                "w": 1400,
                "h": 100,
                "doc": {
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{
                            "type": "text",
                            "text": "Every other tool produces static pictures. FLUXA slides are live software.",
                        }],
                    }],
                },
                "style": {"fontSize": 24, "color": "#4B5563", "align": "left"},
            },
        ],
    }

    # 2. Slide 2: 55 -> 74 Worked Example
    slide2_spec = {
        "id": "demo-s2",
        "order": 1,
        "layout": "chart-text",
        "notes": "Open the Data tab, change 55 to 74 in the adoption dataset. The chart tweens and KPI counts up.",
        "blocks": [
            {
                "id": "d-s2-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Adoption Velocity: The 55 → 74 Transition"}]}],
                },
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-s2-chart",
                "type": "chart",
                "x": 100,
                "y": 200,
                "w": 1100,
                "h": 760,
                "kind": "bar",
                "dataset": "adoption",
                "xField": "year",
                "series": [{"field": "pct", "label": "Enterprise Adoption (%)", "color": "#2563EB"}],
                "options": {"animateMs": 400},
            },
            {
                "id": "d-s2-kpi",
                "type": "kpi",
                "x": 1260,
                "y": 200,
                "w": 560,
                "h": 360,
                "value": {"$bind": "last(adoption.pct)"},
                "label": "2024 Active Adoption Rate",
                "format": {"suffix": "%"},
            },
            {
                "id": "d-s2-desc",
                "type": "text",
                "x": 1260,
                "y": 600,
                "w": 560,
                "h": 360,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{
                                "type": "text",
                                "text": "Live reactive bindings connect this KPI block and chart bar to row 2 of the adoption dataset.",
                            }],
                        },
                    ],
                },
                "style": {"fontSize": 20, "color": "#4B5563"},
            },
        ],
    }

    # 3. Slide 3: What-If Interactive Revenue Forecast
    slide3_spec = {
        "id": "demo-s3",
        "order": 2,
        "layout": "chart-text",
        "notes": "Drag the growth slider in Try-it or Present mode. The forecast chart and KPI update live.",
        "blocks": [
            {
                "id": "d-s3-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Interactive Revenue Forecast & Sensitivity"}]}],
                },
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-s3-slider",
                "type": "control",
                "x": 100,
                "y": 180,
                "w": 700,
                "h": 100,
                "control": "slider",
                "variable": "growth",
                "label": "Growth Rate Multiplier",
                "min": 1.0,
                "max": 2.0,
                "step": 0.05,
            },
            {
                "id": "d-s3-chart",
                "type": "chart",
                "x": 100,
                "y": 310,
                "w": 1080,
                "h": 650,
                "kind": "column",
                "dataset": "forecast",
                "xField": "quarter",
                "series": [{"field": "projected", "label": "Projected ($M)", "color": "#047857"}],
                "options": {"animateMs": 300},
            },
            {
                "id": "d-s3-kpi",
                "type": "kpi",
                "x": 1240,
                "y": 180,
                "w": 580,
                "h": 360,
                "value": {"$bind": "round(sum(forecast.projected), 1)"},
                "label": "Total Projected Revenue",
                "format": {"prefix": "$", "suffix": "M"},
            },
        ],
    }

    # 4. Slide 4: Sandboxed HTML Widget Block
    calculator_html = """<div style="font-family:sans-serif; padding:20px; text-align:center;">
  <h3 style="margin-top:0; color:#1E3A8A;">Live Compound Calculator</h3>
  <div style="font-size:36px; font-weight:700; color:#2563EB; margin:16px 0;" id="result">$18,450</div>
  <p style="color:#6B7280; font-size:14px;">Calculated live via fluxa.on("change") postMessage bridge</p>
</div>
<script>
  function compute(rate) {
    var p = 10000;
    var r = (rate || 7.5) / 100;
    var a = Math.round(p * Math.pow(1 + r, 8));
    document.getElementById("result").innerText = "$" + a.toLocaleString();
  }
  if (window.fluxa) {
    fluxa.on("change", function(vars) { compute(vars.widget_rate); });
    compute(fluxa.get("widget_rate"));
  } else { compute(7.5); }
</script>"""

    slide4_spec = {
        "id": "demo-s4",
        "order": 3,
        "layout": "blank",
        "notes": "This HTML widget runs in a strict CSP sandbox with bidirectional variable sync.",
        "blocks": [
            {
                "id": "d-s4-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Sandboxed HTML/JS Widget Block"}]}],
                },
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-s4-widget",
                "type": "html",
                "x": 100,
                "y": 200,
                "w": 900,
                "h": 650,
                "html": calculator_html,
            },
            {
                "id": "d-s4-ctrl",
                "type": "control",
                "x": 1060,
                "y": 200,
                "w": 760,
                "h": 120,
                "control": "slider",
                "variable": "widget_rate",
                "label": "Annual Yield Rate (%)",
                "min": 1.0,
                "max": 15.0,
                "step": 0.5,
            },
        ],
    }

    # 5. Slide 5: Comparison
    slide5_spec = {
        "id": "demo-s5",
        "order": 4,
        "layout": "comparison",
        "notes": "Comparison slide demonstrating structured cards and clean typography.",
        "blocks": [
            {
                "id": "d-s5-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Architectural Comparison"}]}],
                },
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-s5-comp",
                "type": "comparison",
                "x": 100,
                "y": 200,
                "w": 1720,
                "h": 700,
                "leftTitle": "Legacy Presentations",
                "leftItems": [
                    "Static pre-rendered pictures",
                    "Detached numbers disconnected from data",
                    "Disruptive modal confirmation dialogs",
                    "Generic purple gradients and AI slop",
                ],
                "rightTitle": "FLUXA Reactive Software",
                "rightItems": [
                    "Live reactive software canvas",
                    "Real-time animated dataset tweens",
                    "Non-blocking undo toasts",
                    "Quiet instrument design system",
                ],
            },
        ],
    }

    # 6. Slide 6: Multi-language & Urdu RTL
    slide6_spec = {
        "id": "demo-s6",
        "order": 5,
        "layout": "bullets",
        "notes": "FLUXA natively supports right-to-left scripts including Urdu with correct optical sizing.",
        "blocks": [
            {
                "id": "d-s6-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 100,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "اردو زبان اور کثیر لسانی معاونت"}]}],
                },
                "style": {"fontSize": 54, "align": "right"},
            },
            {
                "id": "d-s6-bullets",
                "type": "text",
                "x": 100,
                "y": 220,
                "w": 1720,
                "h": 600,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "bulletList",
                            "content": [
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "دائیں سے بائیں لکھنے کا مکمل اور خودکار نظام"}]}]},
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "خطاطی اور الفاظ کے تناسب کی درست ہم آہنگی"}]}]},
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "کثیر لسانی پریزنٹیشن اور خودکار ترجمہ کی صلاحیت"}]}]},
                            ],
                        }
                    ],
                },
                "style": {"fontSize": 32, "align": "right", "lineHeight": 1.7},
            },
        ],
    }

    # 7. Slide 7: Roadmap
    slide7_spec = {
        "id": "demo-s7",
        "order": 6,
        "layout": "timeline",
        "notes": "Final slide: export options across PowerPoint, Standalone HTML, and PDF.",
        "blocks": [
            {
                "id": "d-s7-title",
                "type": "text",
                "role": "title",
                "x": 100,
                "y": 60,
                "w": 1720,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Platform Velocity & Delivery Roadmap"}]}],
                },
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "d-s7-steps",
                "type": "steps",
                "x": 100,
                "y": 220,
                "w": 1720,
                "h": 600,
                "steps": [
                    {"step": "1", "title": "Core Engine", "desc": "AST expression parser and reactive graph"},
                    {"step": "2", "title": "Quiet Design", "desc": "Neutral tokens and 3-panel responsive editor"},
                    {"step": "3", "title": "AI Compiler", "desc": "Multi-provider assistant with undoable atomic ops"},
                    {"step": "4", "title": "Open Export", "desc": "Native PowerPoint, standalone offline HTML & share links"},
                ],
            },
        ],
    }

    demo_slides = [
        ("FLUXA — Reactive Presentation Software", slide1_spec),
        ("Adoption Velocity: The 55 → 74 Transition", slide2_spec),
        ("Interactive Revenue Forecast & Sensitivity", slide3_spec),
        ("Sandboxed HTML/JS Widget Block", slide4_spec),
        ("Architectural Comparison", slide5_spec),
        ("اردو زبان اور کثیر لسانی معاونت", slide6_spec),
        ("Platform Velocity & Delivery Roadmap", slide7_spec),
    ]

    for order, (stitle, spec) in enumerate(demo_slides):
        conn.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                pres_id,
                order,
                stitle,
                f"Demo Slide {order + 1}: {stitle}",
                json.dumps(spec),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Successfully seeded demo deck (id={pres_id}) with {len(demo_slides)} slides.")
    return pres_id


if __name__ == "__main__":
    seed_demo()
