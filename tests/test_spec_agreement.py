import json
import subprocess

from app.spec.models import DeckModel, SlideModel


def run_zod_validate(spec_type: str, data: dict):
    """Run Zod validation using Node CLI with --experimental-strip-types."""
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "scripts/validate_zod.js"],
        input=json.dumps({"type": spec_type, "data": data}),
        text=True,
        capture_output=True,
    )
    is_ok = proc.returncode == 0
    return is_ok, proc.stdout or proc.stderr


def test_valid_deck_agreement():
    """Verify that a comprehensive deck passes both Pydantic and Zod."""
    deck_fixture = {
        "schemaVersion": 1,
        "title": "Comprehensive Test Deck",
        "themeId": "midnight",
        "themeOverrides": {
            "colors": {
                "bg": "#0B1120",
                "text": "#F8FAFC",
                "primary": "#38BDF8",
                "secondary": "#94A3B8",
                "accent": "#F43F5E",
                "chart": ["#38BDF8", "#818CF8", "#C084FC", "#F472B6", "#FB7185", "#34D399"],
            },
            "fonts": {
                "heading": "IBM Plex Sans",
                "body": "IBM Plex Sans",
            },
        },
        "datasets": {
            "adoption": {
                "id": "adoption",
                "name": "User Adoption",
                "source": "user",
                "columns": [
                    {"key": "year", "label": "Year", "type": "text"},
                    {"key": "pct", "label": "Percent", "type": "number"},
                ],
                "rows": [
                    {"year": "2024", "pct": 45},
                    {"year": "2025", "pct": 74},
                ],
            }
        },
        "variables": {
            "growth": {
                "id": "growth",
                "label": "Annual Growth Rate",
                "type": "number",
                "value": 15.5,
                "min": 0,
                "max": 50,
                "step": 0.5,
                "scope": "deck",
                "resetOnEnter": False,
            }
        },
        "settings": {
            "transition": {"effect": "fade", "duration": 400},
            "loop": False,
        },
    }

    # 1. Pydantic validation
    pydantic_model = DeckModel.model_validate(deck_fixture)
    assert pydantic_model.title == "Comprehensive Test Deck"

    # 2. Zod validation
    zod_ok, zod_out = run_zod_validate("deck", deck_fixture)
    assert zod_ok, f"Zod failed on valid deck: {zod_out}"


def test_all_block_types_agreement():
    """Verify that all block types pass both Pydantic and Zod."""
    slide_fixture = {
        "id": "slide-all-blocks",
        "order": 1,
        "layout": "blank",
        "notes": "Testing all 14 block variants",
        "blocks": [
            {
                "id": "b-text",
                "type": "text",
                "x": 50, "y": 50, "w": 400, "h": 100,
                "role": "title",
                "doc": {"type": "doc", "content": [{"type": "paragraph"}]},
                "style": {"fontSize": 32, "color": "#111827", "align": "left"},
            },
            {
                "id": "b-shape",
                "type": "shape",
                "x": 50, "y": 160, "w": 200, "h": 100,
                "shape": "rect",
                "fill": {"color": "#E0E7FF", "opacity": 0.8},
                "stroke": {"color": "#4F46E5", "width": 2},
                "radius": 8,
            },
            {
                "id": "b-image",
                "type": "image",
                "x": 260, "y": 160, "w": 200, "h": 100,
                "assetId": "asset-test-1",
                "fit": "cover",
            },
            {
                "id": "b-icon",
                "type": "icon",
                "x": 470, "y": 160, "w": 50, "h": 50,
                "name": "BarChart3",
                "color": "#4F46E5",
            },
            {
                "id": "b-chart",
                "type": "chart",
                "x": 50, "y": 280, "w": 500, "h": 300,
                "kind": "bar",
                "dataset": "adoption",
                "xField": "year",
                "series": [{"field": "pct", "label": "Adoption %"}],
                "options": {"unit": "%", "animateMs": 700},
            },
            {
                "id": "b-kpi",
                "type": "kpi",
                "x": 570, "y": 280, "w": 300, "h": 150,
                "label": "Latest Adoption",
                "value": {"$bind": "last(adoption.pct)"},
                "format": {"suffix": "%"},
                "countUp": True,
            },
            {
                "id": "b-table",
                "type": "table",
                "x": 570, "y": 440, "w": 300, "h": 150,
                "dataset": "adoption",
                "style": "striped",
            },
            {
                "id": "b-steps",
                "type": "steps",
                "x": 50, "y": 600, "w": 400, "h": 120,
                "items": [{"title": "Step 1", "body": "Initialize"}],
                "orientation": "h",
            },
            {
                "id": "b-timeline",
                "type": "timeline",
                "x": 460, "y": 600, "w": 400, "h": 120,
                "items": [{"title": "Phase 1", "date": "Q1 2026"}],
                "orientation": "h",
            },
            {
                "id": "b-compare",
                "type": "comparison",
                "x": 50, "y": 740, "w": 400, "h": 150,
                "columns": [{"title": "Before", "items": ["Manual"]}, {"title": "After", "items": ["Live"]}],
            },
            {
                "id": "b-quote",
                "type": "quote",
                "x": 460, "y": 740, "w": 400, "h": 150,
                "text": "Live presentations are the future.",
                "attribution": "Antigravity",
            },
            {
                "id": "b-control",
                "type": "control",
                "x": 50, "y": 900, "w": 350, "h": 60,
                "control": "slider",
                "variable": "growth",
                "label": "Growth Rate",
                "min": 0, "max": 50, "step": 1,
            },
            {
                "id": "b-embed",
                "type": "embed",
                "x": 420, "y": 900, "w": 200, "h": 120,
                "kind": "video",
                "src": "https://example.com/video.mp4",
            },
            {
                "id": "b-html",
                "type": "html",
                "x": 640, "y": 900, "w": 300, "h": 120,
                "code": {"html": "<div>Hi</div>", "css": "div { color: red; }", "js": "console.log('hi');"},
            },
        ],
    }

    # 1. Pydantic validation
    slide_model = SlideModel.model_validate(slide_fixture)
    assert len(slide_model.blocks) == 14

    # 2. Zod validation
    zod_ok, zod_out = run_zod_validate("slide", slide_fixture)
    assert zod_ok, f"Zod failed on slide fixture: {zod_out}"


def test_invalid_spec_rejected_by_both():
    """Verify that invalid specs (e.g. unknown block type, negative dimensions) fail both Pydantic and Zod."""
    bad_block = {
        "id": "bad-block",
        "type": "unknown_quantum_card",  # Invalid type
        "x": 100, "y": 100, "w": 200, "h": 200,
    }

    # Pydantic must reject
    pydantic_failed = False
    try:
        SlideModel.model_validate({
            "id": "s1", "order": 0, "blocks": [bad_block]
        })
    except Exception:
        pydantic_failed = True
    assert pydantic_failed, "Pydantic should reject unknown block type"

    # Zod must reject
    zod_ok, _ = run_zod_validate("slide", {
        "id": "s1", "order": 0, "blocks": [bad_block]
    })
    assert not zod_ok, "Zod should reject unknown block type"
