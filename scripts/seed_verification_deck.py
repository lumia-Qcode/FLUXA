#!/usr/bin/env python3
"""FLUXA - Seed Verification Deck (Phase 2)

Creates a comprehensive presentation containing all 12 layouts,
various block types (charts, KPIs, quotes, comparisons, timelines, controls),
and edge-case fixtures (very long text for text-fit, Urdu RTL text).
"""

from __future__ import annotations

import json
import os
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_connection, init_db
from app.spec.models import SlideModel


def seed_deck(db_path: str = "instance/fluxa.db") -> int:
    init_db(db_path)
    conn = get_connection(db_path)

    # Check if a verification deck already exists
    existing = conn.execute(
        "SELECT id FROM presentations WHERE title = 'Phase 2 Verification Deck'"
    ).fetchone()

    if existing:
        pres_id = existing["id"]
        # Clear existing slides in this deck to reseed cleanly
        conn.execute("DELETE FROM slides WHERE presentation_id = ?", (pres_id,))
        conn.commit()
    else:
        cursor = conn.execute(
            """
            INSERT INTO presentations (title, description, theme, datasets, variables, settings, schema_version, revision)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1)
            """,
            (
                "Phase 2 Verification Deck",
                "Automated test fixture covering all 12 layouts, 10 themes, text-fit, and RTL support.",
                json.dumps({"themeId": "clean-light"}),
                json.dumps(
                    {
                        "ds_growth": {
                            "id": "ds_growth",
                            "name": "Quarterly Revenue",
                            "source": "user",
                            "columns": [
                                {"key": "quarter", "label": "Quarter", "type": "text"},
                                {"key": "revenue", "label": "Revenue ($M)", "type": "number"},
                            ],
                            "rows": [
                                {"quarter": "Q1 2025", "revenue": 14.2},
                                {"quarter": "Q2 2025", "revenue": 19.8},
                                {"quarter": "Q3 2025", "revenue": 28.5},
                                {"quarter": "Q4 2025", "revenue": 42.1},
                            ],
                        }
                    }
                ),
                json.dumps(
                    {
                        "activeTab": {
                            "id": "activeTab",
                            "label": "Selected Metric",
                            "type": "choice",
                            "value": "revenue",
                            "options": ["revenue", "margin", "users"],
                            "scope": "deck",
                        }
                    }
                ),
                json.dumps({"transition": {"effect": "fade", "duration": 300}, "loop": False}),
            ),
        )
        pres_id = cursor.lastrowid
        conn.commit()

    # Define all 14 test slides
    slides_data = [
        # 1. Title layout
        {
            "title": "FLUXA Architecture & Presentation Core",
            "layout": "title",
            "blocks": [
                {
                    "id": "s1-title",
                    "type": "text",
                    "role": "title",
                    "x": 160,
                    "y": 320,
                    "w": 1600,
                    "h": 200,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "FLUXA Architecture"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 64, "fontWeight": 700, "align": "center"},
                },
                {
                    "id": "s1-subtitle",
                    "type": "text",
                    "role": "subtitle",
                    "x": 260,
                    "y": 540,
                    "w": 1400,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Unified reactive slide software engine with zero layout distortion.",
                                    }
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 26, "fontWeight": 400, "align": "center"},
                },
                {
                    "id": "s1-footer",
                    "type": "text",
                    "role": "footer",
                    "x": 400,
                    "y": 840,
                    "w": 1120,
                    "h": 80,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "Confidential • October 2026"}
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 16, "align": "center", "color": "#6B7280"},
                },
            ],
        },
        # 2. Section layout
        {
            "title": "Section: Core Capabilities",
            "layout": "section",
            "blocks": [
                {
                    "id": "s2-sub",
                    "type": "text",
                    "role": "subtitle",
                    "x": 200,
                    "y": 360,
                    "w": 1520,
                    "h": 60,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {"type": "paragraph", "content": [{"type": "text", "text": "PART 01"}]}
                        ],
                    },
                    "style": {"fontSize": 20, "fontWeight": 600, "letterSpacing": "0.1em"},
                },
                {
                    "id": "s2-title",
                    "type": "text",
                    "role": "title",
                    "x": 200,
                    "y": 440,
                    "w": 1520,
                    "h": 220,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "Rendering Core & Layout System"}
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 56, "fontWeight": 700},
                },
            ],
        },
        # 3. Bullets layout
        {
            "title": "System Guarantees",
            "layout": "bullets",
            "blocks": [
                {
                    "id": "s3-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "System Guarantees"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s3-body",
                    "type": "text",
                    "role": "body",
                    "x": 100,
                    "y": 240,
                    "w": 1720,
                    "h": 720,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "bulletList",
                                "content": [
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "Unified 1920×1080 stage scaled via CSS transform for identical rendering across all viewports.",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "Present mode mounts to document.body via React portal, completely isolating it from transformed ancestors.",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "Strict accessible contrast standards: text ≥ 4.5:1, chart palettes ≥ 3:1.",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "Dynamic text fitting prevents overflow and clipping across all screen sizes.",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 24, "lineHeight": 1.7},
                },
            ],
        },
        # 4. Two-Column layout
        {
            "title": "Architectural Comparison",
            "layout": "two-column",
            "blocks": [
                {
                    "id": "s4-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Architectural Comparison"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s4-col1",
                    "type": "text",
                    "role": "body",
                    "x": 100,
                    "y": 240,
                    "w": 820,
                    "h": 720,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "heading",
                                "content": [{"type": "text", "text": "Traditional Slides"}],
                            },
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Static pixel snapshots, disconnected data tables, brittle copy-pasting, and non-responsive viewing modes.",
                                    }
                                ],
                            },
                        ],
                    },
                    "style": {"fontSize": 22, "lineHeight": 1.6},
                },
                {
                    "id": "s4-col2",
                    "type": "text",
                    "role": "aside",
                    "x": 1000,
                    "y": 240,
                    "w": 820,
                    "h": 720,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "heading",
                                "content": [{"type": "text", "text": "FLUXA Reactive Software"}],
                            },
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Live computable state, interactive controls, programmatic tween transitions, and resilient accessible markup.",
                                    }
                                ],
                            },
                        ],
                    },
                    "style": {"fontSize": 22, "lineHeight": 1.6},
                },
            ],
        },
        # 5. Big-Number (KPI) layout
        {
            "title": "Platform Reliability & Scale",
            "layout": "big-number",
            "blocks": [
                {
                    "id": "s5-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Enterprise Performance"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s5-kpi",
                    "type": "kpi",
                    "role": "kpi",
                    "x": 100,
                    "y": 240,
                    "w": 900,
                    "h": 450,
                    "value": "99.98%",
                    "label": "Global Uptime SLA",
                    "delta": 0.4,
                },
                {
                    "id": "s5-body",
                    "type": "text",
                    "role": "body",
                    "x": 1060,
                    "y": 260,
                    "w": 760,
                    "h": 680,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Our multi-region distributed rendering edge delivers sub-30ms time to first interactive frame on every continent.",
                                    }
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 22, "lineHeight": 1.6},
                },
            ],
        },
        # 6. Chart-Text layout
        {
            "title": "Revenue Acceleration",
            "layout": "chart-text",
            "blocks": [
                {
                    "id": "s6-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Quarterly Performance"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s6-body",
                    "type": "text",
                    "role": "body",
                    "x": 100,
                    "y": 240,
                    "w": 680,
                    "h": 720,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Revenue growth accelerated across Q1–Q4 driven by enterprise adoption and automated AI workflow subscriptions.",
                                    }
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 22, "lineHeight": 1.6},
                },
                {
                    "id": "s6-chart",
                    "type": "chart",
                    "role": "chart",
                    "x": 840,
                    "y": 240,
                    "w": 980,
                    "h": 720,
                    "kind": "bar",
                    "dataset": "ds_growth",
                    "xField": "quarter",
                    "series": [{"field": "revenue", "label": "Revenue ($M)"}],
                },
            ],
        },
        # 7. Image-Text layout
        {
            "title": "Visual Framing & Media",
            "layout": "image-text",
            "blocks": [
                {
                    "id": "s7-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Visual Framing"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s7-media",
                    "type": "shape",
                    "role": "media",
                    "x": 100,
                    "y": 240,
                    "w": 880,
                    "h": 720,
                    "shape": "rect",
                    "fill": {"color": "#E5E7EB"},
                    "stroke": {"color": "#9CA3AF", "width": 2},
                    "radius": 12,
                },
                {
                    "id": "s7-body",
                    "type": "text",
                    "role": "body",
                    "x": 1040,
                    "y": 240,
                    "w": 780,
                    "h": 720,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Media slots accommodate responsive imagery, vector diagrams, and custom visual assets with preserved aspect ratios.",
                                    }
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 22, "lineHeight": 1.6},
                },
            ],
        },
        # 8. Quote layout
        {
            "title": "Guiding Philosophy",
            "layout": "quote",
            "blocks": [
                {
                    "id": "s8-quote",
                    "type": "quote",
                    "role": "body",
                    "x": 200,
                    "y": 280,
                    "w": 1520,
                    "h": 480,
                    "text": "Simplicity is about subtracting the obvious and adding the meaningful.",
                    "attribution": "John Maeda, The Laws of Simplicity",
                }
            ],
        },
        # 9. Timeline layout
        {
            "title": "Execution Roadmap",
            "layout": "timeline",
            "blocks": [
                {
                    "id": "s9-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Execution Roadmap"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s9-timeline",
                    "type": "timeline",
                    "role": "body",
                    "x": 100,
                    "y": 260,
                    "w": 1720,
                    "h": 680,
                    "orientation": "h",
                    "items": [
                        {"title": "Phase 1: Spec & Schema", "date": "Q1", "status": "done"},
                        {"title": "Phase 2: Rendering Core", "date": "Q2", "status": "active"},
                        {"title": "Phase 3: Editor Experience", "date": "Q3", "status": "pending"},
                        {"title": "Phase 4: Copilot AI", "date": "Q4", "status": "pending"},
                    ],
                },
            ],
        },
        # 10. Comparison layout
        {
            "title": "Feature Matrix",
            "layout": "comparison",
            "blocks": [
                {
                    "id": "s10-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Comparative Architecture"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s10-compare",
                    "type": "comparison",
                    "role": "body",
                    "x": 100,
                    "y": 260,
                    "w": 1720,
                    "h": 680,
                    "columns": [
                        {
                            "title": "Legacy Slide Decks",
                            "items": [
                                "Manual copy-paste charts",
                                "Fixed viewport deformation",
                                "Trapped CSS transform bugs",
                            ],
                        },
                        {
                            "title": "FLUXA Software Engine",
                            "items": [
                                "Direct dataset binding",
                                "Uniform CSS transform letterboxing",
                                "Pure document.body portal present mode",
                            ],
                        },
                    ],
                },
            ],
        },
        # 11. Full-Bleed layout
        {
            "title": "Full Bleed Atmosphere",
            "layout": "full-bleed",
            "blocks": [
                {
                    "id": "s11-media",
                    "type": "shape",
                    "role": "media",
                    "x": 0,
                    "y": 0,
                    "w": 1920,
                    "h": 1080,
                    "shape": "rect",
                    "fill": {"color": "#1E293B"},
                },
                {
                    "id": "s11-title",
                    "type": "text",
                    "role": "title",
                    "x": 120,
                    "y": 780,
                    "w": 1680,
                    "h": 180,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Full Bleed Immersion"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 54, "fontWeight": 700, "color": "#F8FAFC"},
                },
            ],
        },
        # 12. Blank layout with interactive controls
        {
            "title": "Interactive Controls Stage",
            "layout": "blank",
            "blocks": [
                {
                    "id": "s12-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "Interactive Parameter Controls"}
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s12-slider",
                    "type": "control",
                    "x": 100,
                    "y": 280,
                    "w": 700,
                    "h": 100,
                    "control": "slider",
                    "label": "Annual Growth Rate (%)",
                    "min": 0,
                    "max": 100,
                    "step": 5,
                    "variable": "growthRate",
                },
                {
                    "id": "s12-toggle",
                    "type": "control",
                    "x": 100,
                    "y": 440,
                    "w": 700,
                    "h": 80,
                    "control": "toggle",
                    "label": "Include AI Estimate Projections",
                    "variable": "includeProjections",
                },
            ],
        },
        # 13. Text-Fit Fixture: very long narrative in constrained box
        {
            "title": "Text Fit Dynamic Scaling",
            "layout": "bullets",
            "blocks": [
                {
                    "id": "s13-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Dynamic Text Fit Engine"}],
                            }
                        ],
                    },
                    "style": {"fontSize": 44, "fontWeight": 700},
                },
                {
                    "id": "s13-long-text",
                    "type": "text",
                    "role": "body",
                    "x": 100,
                    "y": 240,
                    "w": 1720,
                    "h": 400,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": (
                                            "In software-based presentation design, text blocks must never overflow their containing boundaries. "
                                            "When authors enter extensive executive summaries or detailed analytical justifications, "
                                            "the rendering pipeline dynamically measures scroll height against available box height and downscales the font size proportionally. "
                                            "This mathematical guarantee eliminates unsightly scrollbars, clipped descenders, and layout breaks across desktop, tablet, and mobile displays. "
                                            "Furthermore, by adhering to a calibrated minimum font threshold, readability is preserved while maintaining visual hierarchy. "
                                            "Every block computes its own bounding constraint within the logical 1920x1080 stage before the viewport scale transform is applied, "
                                            "ensuring that pixel densities and line wraps are identical whether viewed in the local editor or across remote presentation portals."
                                        ),
                                    }
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 32, "lineHeight": 1.6},
                },
            ],
        },
        # 14. RTL Urdu Text Fixture
        {
            "title": "Urdu RTL Typography Support",
            "layout": "bullets",
            "blocks": [
                {
                    "id": "s14-title",
                    "type": "text",
                    "role": "title",
                    "x": 100,
                    "y": 80,
                    "w": 1720,
                    "h": 120,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "مصنوعی ذہانت اور جدید ٹیکنالوجی"}
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 48, "fontWeight": 700, "align": "right"},
                },
                {
                    "id": "s14-urdu-body",
                    "type": "text",
                    "role": "body",
                    "x": 100,
                    "y": 240,
                    "w": 1720,
                    "h": 680,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "bulletList",
                                "content": [
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "فلکسا جدید ترین پریزنٹیشن سافٹ ویئر ہے جو خودکار ڈیزائن اور ڈیٹا کی طاقت فراہم کرتا ہے۔",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "دائیں سے بائیں (RTL) زبانوں کے لیے مکمل ہم آہنگی اور خوبصورت خطاطی کا نظام۔",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                    {
                                        "type": "listItem",
                                        "content": [
                                            {
                                                "type": "paragraph",
                                                "content": [
                                                    {
                                                        "type": "text",
                                                        "text": "تمام سکرینوں پر بغیر کسی کٹاؤ یا خرابی کے یکساں اور معیاری نمائش۔",
                                                    }
                                                ],
                                            }
                                        ],
                                    },
                                ],
                            }
                        ],
                    },
                    "style": {"fontSize": 26, "lineHeight": 1.8, "align": "right"},
                },
            ],
        },
    ]

    for order, slide_info in enumerate(slides_data):
        slide_spec = {
            "id": f"vslide-{order + 1}",
            "order": order,
            "layout": slide_info["layout"],
            "blocks": slide_info["blocks"],
            "notes": f"Verification slide {order + 1}",
            "transition": {"effect": "fade", "duration": 300},
        }

        # Validate with Pydantic
        SlideModel.model_validate(slide_spec)

        conn.execute(
            """
            INSERT INTO slides (presentation_id, slide_order, title, content, spec)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                pres_id,
                order,
                slide_info["title"],
                f"Content for slide {order + 1}",
                json.dumps(slide_spec),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Successfully seeded Verification Deck with ID {pres_id} ({len(slides_data)} slides)")
    return pres_id


if __name__ == "__main__":
    seed_deck()
