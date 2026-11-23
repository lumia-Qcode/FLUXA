"""Seed the exact 'How hospitals are adopting AI' board briefing deck from the design PDF."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db


def seed_hospitals_deck(db_path: str = "instance/fluxa.db") -> int:
    init_db(db_path)
    conn = get_connection(db_path)

    title = "How hospitals are adopting AI"
    existing = conn.execute("SELECT id FROM presentations WHERE title = ?", (title,)).fetchone()

    datasets = {
        "adoption": {
            "id": "adoption",
            "name": "Adoption Numbers",
            "source": "user",
            "columns": [
                {"key": "year", "label": "Year", "type": "text"},
                {"key": "adoption", "label": "Adoption, %", "type": "number"},
            ],
            "rows": [
                {"year": "2022", "adoption": 12},
                {"year": "2023", "adoption": 28},
                {"year": "2024", "adoption": 45},
                {"year": "2025", "adoption": 74},
            ],
        },
        "budget": {
            "id": "budget",
            "name": "Where the Budget Goes",
            "source": "user",
            "columns": [
                {"key": "category", "label": "Area", "type": "text"},
                {"key": "share", "label": "Share (%)", "type": "number"},
            ],
            "rows": [
                {"category": "Imaging", "share": 55},
                {"category": "Administration", "share": 30},
                {"category": "Drug discovery", "share": 15},
            ],
        },
    }

    variables = {
        "growth_rate": {
            "id": "growth_rate",
            "label": "Annual Growth Rate",
            "type": "number",
            "value": 1.25,
            "min": 1.0,
            "max": 2.0,
            "step": 0.05,
            "scope": "deck",
        }
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
    else:
        cursor = conn.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1)
            """,
            (
                title,
                "A board briefing on how hospitals are adopting AI. Seven slides, plain language, with one chart I can edit.",
                json.dumps(theme),
                json.dumps(datasets),
                json.dumps(variables),
                json.dumps(settings),
            ),
        )
        pres_id = cursor.lastrowid

    # 1. Slide 1: Title (Dark Navy card)
    slide1_spec = {
        "id": "hosp-s1",
        "order": 0,
        "layout": "title",
        "background": {"type": "color", "value": "#0F172A"},
        "notes": "Executive board briefing on healthcare AI adoption, October 2026.",
        "blocks": [
            {
                "id": "h-s1-title",
                "type": "text",
                "role": "title",
                "x": 160,
                "y": 380,
                "w": 1600,
                "h": 160,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "How hospitals are\nadopting AI"}]}],
                },
                "content": "How hospitals are adopting AI",
                "style": {"fontSize": 64, "fontWeight": 700, "color": "#FFFFFF", "align": "left", "lineHeight": 1.1},
            },
            {
                "id": "h-s1-sub",
                "type": "text",
                "role": "subtitle",
                "x": 160,
                "y": 620,
                "w": 1600,
                "h": 80,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A board briefing, October 2026"}]}],
                },
                "content": "A board briefing, October 2026",
                "style": {"fontSize": 26, "color": "#94A3B8", "align": "left"},
            },
        ],
    }

    # 2. Slide 2: Why now (Bullets + 74% KPI)
    slide2_spec = {
        "id": "hosp-s2",
        "order": 1,
        "layout": "big-number",
        "notes": "Three macro pressures forcing hospital systems into active AI pilots.",
        "blocks": [
            {
                "id": "h-s2-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 100,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Why now"}]}],
                },
                "content": "Why now",
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "h-s2-body",
                "type": "text",
                "role": "body",
                "x": 120,
                "y": 240,
                "w": 960,
                "h": 680,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Clinicians are stretched thin"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Imaging volume keeps climbing"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Administrative cost keeps rising"}]},
                    ],
                },
                "content": "• Clinicians are stretched thin\n• Imaging volume keeps climbing\n• Administrative cost keeps rising",
                "style": {"fontSize": 28, "lineHeight": 2.2, "align": "left"},
            },
            {
                "id": "h-s2-kpi",
                "type": "kpi",
                "role": "kpi",
                "x": 1140,
                "y": 240,
                "w": 660,
                "h": 480,
                "value": {"$bind": "last(adoption.adoption)"},
                "label": "of hospitals are piloting AI, up from 55% a year ago",
                "format": {"suffix": "%"},
                "style": {"align": "left"},
            },
        ],
    }

    # 3. Slide 3: Adoption is accelerating (Bar Chart 2022-2025)
    slide3_spec = {
        "id": "hosp-s3",
        "order": 2,
        "layout": "chart-text",
        "notes": "Share of hospitals piloting AI by year showing massive jump into 2025.",
        "blocks": [
            {
                "id": "h-s3-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Adoption is accelerating"}]}],
                },
                "content": "Adoption is accelerating",
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "h-s3-sub",
                "type": "text",
                "role": "subtitle",
                "x": 120,
                "y": 180,
                "w": 1680,
                "h": 60,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Share of hospitals piloting AI, by year"}]}],
                },
                "content": "Share of hospitals piloting AI, by year",
                "style": {"fontSize": 24, "color": "#64748B", "align": "left"},
            },
            {
                "id": "h-s3-chart",
                "type": "chart",
                "role": "chart",
                "x": 120,
                "y": 260,
                "w": 1680,
                "h": 720,
                "kind": "column",
                "dataset": "adoption",
                "xField": "year",
                "series": [{"field": "adoption", "label": "Adoption, %", "color": "#0D9488"}],
                "options": {"animateMs": 400, "highlightLast": True},
            },
        ],
    }

    # 4. Slide 4: Where the budget goes (Donut chart)
    slide4_spec = {
        "id": "hosp-s4",
        "order": 3,
        "layout": "chart-text",
        "background": {"type": "color", "value": "#0F172A"},
        "notes": "Imaging takes the majority of budget, followed by admin automation.",
        "blocks": [
            {
                "id": "h-s4-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Where the budget goes"}]}],
                },
                "content": "Where the budget goes",
                "style": {"fontSize": 48, "fontWeight": 700, "color": "#FFFFFF", "align": "left"},
            },
            {
                "id": "h-s4-chart",
                "type": "chart",
                "role": "chart",
                "x": 120,
                "y": 240,
                "w": 1100,
                "h": 720,
                "kind": "donut",
                "dataset": "budget",
                "xField": "category",
                "series": [{"field": "share", "label": "Share (%)", "color": "#0D9488"}],
                "options": {"animateMs": 400},
            },
            {
                "id": "h-s4-kpi",
                "type": "kpi",
                "role": "kpi",
                "x": 1280,
                "y": 320,
                "w": 520,
                "h": 400,
                "value": 55,
                "label": "Imaging allocation leads investment",
                "format": {"suffix": "%"},
                "style": {"color": "#FFFFFF"},
            },
        ],
    }

    # 5. Slide 5: Before and after
    slide5_spec = {
        "id": "hosp-s5",
        "order": 4,
        "layout": "two-column",
        "notes": "Direct comparison of hospital operations before and after AI adoption.",
        "blocks": [
            {
                "id": "h-s5-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Before and after"}]}],
                },
                "content": "Before and after",
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "h-s5-col1",
                "type": "text",
                "role": "body",
                "x": 120,
                "y": 240,
                "w": 800,
                "h": 680,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "heading", "content": [{"type": "text", "text": "Before"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Manual triage"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Slow report turnaround"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Notes typed after the visit"}]},
                    ],
                },
                "content": "Before\n\n• Manual triage\n• Slow report turnaround\n• Notes typed after the visit",
                "style": {"fontSize": 26, "lineHeight": 1.8},
            },
            {
                "id": "h-s5-col2",
                "type": "text",
                "role": "aside",
                "x": 1000,
                "y": 240,
                "w": 800,
                "h": 680,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "heading", "content": [{"type": "text", "text": "After"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Assisted triage"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Reports in minutes"}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "Notes drafted during the visit"}]},
                    ],
                },
                "content": "After\n\n• Assisted triage\n• Reports in minutes\n• Notes drafted during the visit",
                "style": {"fontSize": 26, "lineHeight": 1.8},
            },
        ],
    }

    # 6. Slide 6: What we recommend
    slide6_spec = {
        "id": "hosp-s6",
        "order": 5,
        "layout": "bullets",
        "notes": "Key recommendations for hospital executive leadership.",
        "blocks": [
            {
                "id": "h-s6-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "What we recommend"}]}],
                },
                "content": "What we recommend",
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "h-s6-body",
                "type": "text",
                "role": "body",
                "x": 120,
                "y": 240,
                "w": 1680,
                "h": 680,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "1. Prioritize imaging AI pilots with measured turnaround time metrics."}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "2. Deploy ambient documentation in high-volume outpatient clinics."}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "3. Establish an AI clinical governance committee with monthly reviews."}]},
                    ],
                },
                "content": "1. Prioritize imaging AI pilots with measured turnaround time metrics.\n2. Deploy ambient documentation in high-volume outpatient clinics.\n3. Establish an AI clinical governance committee with monthly reviews.",
                "style": {"fontSize": 26, "lineHeight": 2.0},
            },
        ],
    }

    # 7. Slide 7: Next steps
    slide7_spec = {
        "id": "hosp-s7",
        "order": 6,
        "layout": "bullets",
        "notes": "Action items for the upcoming board meeting.",
        "blocks": [
            {
                "id": "h-s7-title",
                "type": "text",
                "role": "title",
                "x": 120,
                "y": 80,
                "w": 1680,
                "h": 90,
                "doc": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Next steps"}]}],
                },
                "content": "Next steps",
                "style": {"fontSize": 48, "fontWeight": 700, "align": "left"},
            },
            {
                "id": "h-s7-body",
                "type": "text",
                "role": "body",
                "x": 120,
                "y": 240,
                "w": 1680,
                "h": 680,
                "doc": {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Finalize vendor selection for imaging triage by Q1."}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Present 90-day pilot KPI telemetry to the board."}]},
                        {"type": "paragraph", "content": [{"type": "text", "text": "• Authorize expansion to cardiology and emergency workflows."}]},
                    ],
                },
                "content": "• Finalize vendor selection for imaging triage by Q1.\n• Present 90-day pilot KPI telemetry to the board.\n• Authorize expansion to cardiology and emergency workflows.",
                "style": {"fontSize": 26, "lineHeight": 2.0},
            },
        ],
    }

    slides = [
        ("How hospitals are adopting AI", slide1_spec),
        ("Why now", slide2_spec),
        ("Adoption is accelerating", slide3_spec),
        ("Where the budget goes", slide4_spec),
        ("Before and after", slide5_spec),
        ("What we recommend", slide6_spec),
        ("Next steps", slide7_spec),
    ]

    for order, (stitle, spec) in enumerate(slides):
        conn.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                pres_id,
                order,
                stitle,
                f"Slide {order + 1}: {stitle}",
                json.dumps(spec),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Successfully seeded '{title}' deck (id={pres_id}) with {len(slides)} slides.")
    return pres_id


if __name__ == "__main__":
    seed_hospitals_deck()
