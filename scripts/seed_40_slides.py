#!/usr/bin/env python3
"""FLUXA - Seed 40-Slide Stress Deck for Performance & Responsiveness Benchmark."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db


def seed_40_slides(db_path: str = "instance/fluxa.db") -> int:
    init_db(db_path)
    conn = get_connection(db_path)

    title = "FLUXA — 40-Slide Performance Benchmark Deck"
    existing = conn.execute("SELECT id FROM presentations WHERE title = ?", (title,)).fetchone()

    theme = {"themeId": "clean-light"}
    settings = {"transition": {"effect": "fade", "duration": 200}, "loop": False}

    if existing:
        pres_id = existing["id"]
        conn.execute("DELETE FROM slides WHERE presentation_id = ?", (pres_id,))
    else:
        cursor = conn.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision)
            VALUES (?, ?, ?, '{}', '{}', ?, 1, 1)
            """,
            (
                title,
                "Benchmark deck containing 40 slides to verify editor virtual rail rendering and performance.",
                json.dumps(theme),
                json.dumps(settings),
            ),
        )
        pres_id = cursor.lastrowid

    layouts = ["title", "bullets", "chart-text", "comparison", "timeline", "two-column"]

    for i in range(40):
        layout = layouts[i % len(layouts)]
        slide_title = f"Benchmark Slide {i + 1}: {layout.replace('-', ' ').title()} Performance Target"

        slide_spec = {
            "id": f"bench-slide-{i + 1}",
            "order": i,
            "layout": layout,
            "notes": f"Speaker notes for slide {i + 1}. Performance benchmark test notes.",
            "blocks": [
                {
                    "id": f"b-title-{i + 1}",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 60,
                    "w": 1720,
                    "h": 90,
                    "doc": {
                        "type": "doc",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": slide_title}],
                        }],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": f"b-content-{i + 1}",
                    "type": "text",
                    "x": 100,
                    "y": 200,
                    "w": 1600,
                    "h": 600,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "bulletList",
                                "content": [
                                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": f"Performance validation item {j + 1} on slide {i + 1}"}]}]}
                                    for j in range(4)
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 24},
                },
            ],
        }

        conn.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                pres_id,
                i,
                slide_title,
                f"Slide {i + 1} content",
                json.dumps(slide_spec),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Successfully seeded 40-slide presentation (id={pres_id}).")
    return pres_id


if __name__ == "__main__":
    seed_40_slides()
