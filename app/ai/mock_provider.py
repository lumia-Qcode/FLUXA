import uuid
"""Deterministic Mock Provider for tests and offline development per Section 4.5."""

from typing import Any, Dict, List, Tuple

from app.ai.provider import BaseProvider


class MockProvider(BaseProvider):
    """Deterministic, high-speed mock provider for offline operation and automated test suites."""

    @property
    def name(self) -> str:
        return "mock"

    @property
    def is_configured(self) -> bool:
        return True

    def generate_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
    ) -> Dict[str, Any]:
        """Generate a realistic, diverse presentation outline."""
        clean_topic = topic.strip() or "Strategic Overview"
        title = clean_topic[:65]

        # Template layout sequence offering a varied narrative structure
        layout_templates = [
            ("title", "Executive introduction and agenda", "none"),
            ("big-number", "Primary operational impact and key efficiency metric", "kpi"),
            ("chart-text", "Market performance and quarterly growth dynamics", "chart"),
            ("swot", "Strategic evaluation across strengths, weaknesses, opportunities, and threats", "swot"),
            ("two-column", "Core pillars and architectural capabilities", "none"),
            ("timeline", "Implementation roadmap and rollout milestones", "timeline"),
            ("market-size", "Addressable market scope and segment potential", "market-size"),
            ("comparison", "Competitive differentiation and before/after matrix", "comparison"),
            ("quote", "Customer validation and leadership perspective", "quote"),
            ("bullets", "Strategic recommendations and actionable next steps", "none"),
        ]

        slides = []
        for i in range(slide_count):
            tmpl_idx = i % len(layout_templates)
            layout, purpose, visual = layout_templates[tmpl_idx]

            if i == 0:
                slide_title = title
            elif tmpl_idx == 1:
                slide_title = f"Context & Opportunities: {clean_topic[:30]}"
            elif tmpl_idx == 2:
                slide_title = "Performance Indicators & Growth"
            elif tmpl_idx == 3:
                slide_title = "Measurable Impact & Efficiency"
            elif tmpl_idx == 4:
                slide_title = "Strategic Architecture & Pillars"
            elif tmpl_idx == 5:
                slide_title = "Execution Roadmap"
            elif tmpl_idx == 6:
                slide_title = "Options & Comparison Analysis"
            else:
                slide_title = f"Key Takeaways: Slide {i + 1}"

            slides.append(
                {
                    "title": slide_title[:70],
                    "layout": layout,
                    "purpose": purpose,
                    "visual": visual,
                }
            )

        return {
            "title": title,
            "slides": slides,
        }

    def generate_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate rich semantic slide content based on layout."""
        title = outline_item.get("title", "Slide Title")
        layout = outline_item.get("layout", "bullets")
        purpose = outline_item.get("purpose", "")
        topic = deck_context.get("description") or deck_context.get("title") or "Strategic Initiative"

        semantic: Dict[str, Any] = {
            "title": title,
            "layout": layout,
            "notes": f"Speaker notes for {title}. Context: {purpose}.",
        }

        if layout == "title":
            semantic["subtitle"] = (
                deck_context.get("description") or "Strategic Presentation & Findings"
            )
            semantic["bullets"] = []

        elif layout == "chart-text":
            semantic["chart"] = {
                "kind": "bar",
                "title": "Quarterly Momentum",
                "dataset": "momentum_data",
                "xField": "quarter",
                "yField": "score",
                "data": [
                    {"quarter": "Q1", "score": 42},
                    {"quarter": "Q2", "score": 58},
                    {"quarter": "Q3", "score": 74},
                    {"quarter": "Q4", "score": 91},
                ],
            }
            semantic["bullets"] = [
                "Accelerated adoption observed across primary segments",
                "Consistent double-digit expansion throughout consecutive quarters",
                "Projected targets met ahead of scheduled cycle",
            ]

        elif layout == "big-number":
            semantic["kpi"] = {
                "value": 94,
                "label": "Operational Efficiency",
                "delta": "+18% YoY",
            }
            semantic["bullets"] = [
                "Turnaround velocity improved significantly across teams",
                "Eliminated systemic bottlenecks in the core workflow",
            ]

        elif layout == "timeline":
            semantic["timeline"] = {
                "steps": [
                    {
                        "step": "1",
                        "title": "Discovery",
                        "desc": "Audit workflows & align requirements",
                    },
                    {
                        "step": "2",
                        "title": "Execution",
                        "desc": "Roll out core architecture & components",
                    },
                    {
                        "step": "3",
                        "title": "Scaling",
                        "desc": "Expand adoption across organizations",
                    },
                ]
            }
            semantic["bullets"] = [
                "Phase 1: Discovery & Architecture",
                "Phase 2: Core Implementation",
                "Phase 3: Nationwide Rollout",
            ]

        elif layout == "comparison":
            semantic["comparison"] = {
                "leftTitle": "Legacy Process",
                "leftItems": [
                    "Manual slide deck generation",
                    "Static detached figures",
                    "Fragmented revisions",
                ],
                "rightTitle": "FLUXA Reactive",
                "rightItems": [
                    "Live reactive software slides",
                    "Real-time dataset tweens",
                    "Unified deterministic store",
                ],
            }
            semantic["bullets"] = [
                "Legacy: manual, fragmented, static",
                "FLUXA: reactive, connected, instantaneous",
            ]

        elif layout == "quote":
            semantic["quote"] = {
                "text": "Simplicity is about subtracting the obvious and adding the meaningful.",
                "author": "John Maeda",
            }
            semantic["bullets"] = []

        elif layout == "two-column":
            semantic["bullets"] = [
                "Foundation: Robust reactive graph connecting all data nodes",
                "Velocity: Instantaneous interactive recalculation without lag",
                "Security: Whitelisted AST execution keeping slides safe",
                "Clarity: Quiet instrument design prioritizing slide content",
            ]

        elif layout == "swot":
            semantic["swot"] = {
                "strengths": [f"Core competency in {topic[:30]}", "Validated execution framework and high accuracy"],
                "weaknesses": ["Integration complexity across legacy systems", "Staff training and onboarding time curve"],
                "opportunities": [f"Expansion across regional network for {topic[:30]}", "Predictive automation and proactive analytics"],
                "threats": ["Evolving regulatory and governance standards", "Ecosystem fragmentation and data silos"],
            }
            semantic["bullets"] = [
                f"SWOT Matrix: Strategic positioning for {topic[:35]}",
                "Maximizing high-impact strengths while mitigating operational weaknesses",
            ]

        elif layout == "market-size":
            semantic["marketSize"] = {
                "tam": {"value": "$195B", "label": "Total Addressable Market", "sub": f"Global {topic[:30]} industry scope"},
                "sam": {"value": "$52B", "label": "Serviceable Addressable Market", "sub": "Core addressable segment"},
                "som": {"value": "$11.4B", "label": "Serviceable Obtainable Market", "sub": "Immediate obtainable share"},
            }
            semantic["bullets"] = [
                f"TAM / SAM / SOM Market Sizing for {topic[:35]}",
                "Significant addressable headroom with accelerating segment CAGR",
            ]

        elif layout == "funnel":
            semantic["funnel"] = {
                "stages": [
                    {"name": "Stage 1: Discovery", "value": "100%", "pct": "100%", "desc": f"Total candidate population for {topic[:25]}"},
                    {"name": "Stage 2: Validation", "value": "62%", "pct": "62%", "desc": "Evaluated through baseline criteria"},
                    {"name": "Stage 3: Protocol", "value": "34%", "pct": "34%", "desc": "Advanced into active implementation"},
                    {"name": "Stage 4: Impact", "value": "18%", "pct": "18%", "desc": "Achieved sustainable target outcomes"},
                ]
            }
            semantic["bullets"] = [
                f"Multi-tier conversion funnel for {topic[:35]}",
                "High conversion efficiency sustained from screening through execution",
            ]

        else:
            # Standard bullets layout
            semantic["bullets"] = [
                "High-impact execution focused on core business metrics",
                "Seamless integration with existing operational pipelines",
                "Scalable framework designed for rapid future iterations",
            ]

        return semantic

    def chat_ops(
        self,
        message: str,
        current_slide: Dict[str, Any],
        deck_context: Dict[str, Any],
        history: List[Dict[str, Any]] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Produce deterministic assistant responses and ops for user requests."""
        lower_msg = message.lower().strip()
        blocks = current_slide.get("blocks", [])

        # 1. "Make this slide shorter" / "shorten"
        if "shorter" in lower_msg or "shorten" in lower_msg:
            ops = []
            for b in blocks:
                if b.get("type") == "text":
                    props = b.get("props", {})
                    if "bullets" in props and isinstance(props["bullets"], list):
                        # Shorten to 2 concise bullets
                        shortened = [
                            item[:50] + "..." if len(item) > 50 else item
                            for item in props["bullets"][:2]
                        ]
                        ops.append(
                            {
                                "op": "set_block_props",
                                "block_id": b["id"],
                                "props": {"bullets": shortened},
                            }
                        )
                    elif "text" in props and isinstance(props["text"], str):
                        truncated = props["text"][:60].rstrip()
                        ops.append(
                            {
                                "op": "set_block_props",
                                "block_id": b["id"],
                                "props": {"text": truncated},
                            }
                        )
            return (
                "Shortened slide text to focus concisely on core takeaways.",
                ops if ops else [{"op": "set_notes", "notes": "Concise summary notes."}],
            )

        # 2. "Turn these bullets into a timeline" / "timeline"
        if "timeline" in lower_msg:
            # Find body bullets
            body_block = next(
                (b for b in blocks if b.get("role") == "body" or b.get("type") == "text"), None
            )
            bullets = body_block.get("props", {}).get("bullets", []) if body_block else []
            steps = [
                {"step": str(i + 1), "title": f"Phase {i + 1}", "desc": b[:40]}
                for i, b in enumerate(bullets[:4] or ["Initiation", "Development", "Deployment"])
            ]
            ops = [
                {"op": "apply_layout", "layout": "timeline"},
            ]
            if body_block:
                ops.append(
                    {
                        "op": "set_block_props",
                        "block_id": body_block["id"],
                        "props": {
                            "type": "steps",
                            "steps": steps,
                        },
                    }
                )
            return ("Transformed bullets into a progressive timeline sequence.", ops)

        # 3. "Add a compound-interest calculator" / "calculator" / "html" / "widget"
        if "calculator" in lower_msg or "html" in lower_msg or "widget" in lower_msg:
            widget_html = """
<div style="font-family:sans-serif;padding:12px;background:#1e1e24;color:#fff;border-radius:6px;">
  <h4 style="margin:0 0 8px;">Compound Interest Calculator</h4>
  <p style="margin:4px 0;">Principal: $10,000</p>
  <p style="margin:4px 0;">Growth: <span id="out">8%</span></p>
</div>
<script>
  window.fluxa.on('change', function(vars) {
    document.getElementById('out').innerText = (vars.growth || 8) + '%';
  });
</script>"""
            ops = [
                {
                    "op": "add_block",
                    "block": {
                        "id": f"blk-widget-{current_slide.get('id', 'widget')[:6]}",
                        "type": "html",
                        "role": "body",
                        "box": {"x": 200, "y": 260, "w": 1520, "h": 680},
                        "props": {
                            "html": widget_html.strip(),
                            "css": "",
                            "js": "",
                        },
                    },
                }
            ]
            return ("Added interactive compound-interest calculator widget.", ops)

        # 4. "Add a slider" / "slider"
        if "slider" in lower_msg:
            ops = [
                {
                    "op": "add_variable",
                    "variable": {
                        "id": "var_rate",
                        "label": "Growth Rate",
                        "type": "number",
                        "value": 15,
                        "min": 0,
                        "max": 50,
                        "step": 1,
                        "scope": "deck",
                    },
                },
                {
                    "op": "add_block",
                    "block": {
                        "id": f"blk-slider-{current_slide.get('id', 'ctrl')[:6]}",
                        "type": "control",
                        "role": "aside",
                        "box": {"x": 100, "y": 800, "w": 500, "h": 80},
                        "props": {
                            "controlType": "slider",
                            "variableId": "var_rate",
                            "label": "Growth Rate (%)",
                            "min": 0,
                            "max": 50,
                            "step": 1,
                        },
                    },
                },
            ]
            return ("Added reactive growth rate slider bound to variable var_rate.", ops)

        # 5. "Add a chart" / "pie chart" / "donut" / "bar chart" / "3d chart"
        if any(w in lower_msg for w in ["chart", "pie", "donut", "graph", "breakdown", "distribution"]):
            is_pie = any(w in lower_msg for w in ["pie", "donut", "cylinder", "share", "ratio"])
            chart_kind = "donut" if is_pie else "bar"
            chart_title = "Distribution Breakdown" if is_pie else "Key Metrics"
            labels = ["Segment Alpha", "Segment Beta", "Segment Gamma"] if is_pie else ["Q1", "Q2", "Q3", "Q4"]
            values = [45, 35, 20] if is_pie else [40, 65, 80, 95]

            ops = [
                {
                    "op": "add_block",
                    "block": {
                        "id": f"blk-chart-{uuid.uuid4().hex[:6]}",
                        "type": "chart",
                        "kind": chart_kind,
                        "is3D": True,
                        "x": 1000,
                        "y": 220,
                        "w": 820,
                        "h": 680,
                        "box": {"x": 1000, "y": 220, "w": 820, "h": 680},
                        "props": {
                            "kind": chart_kind,
                            "chartType": chart_kind,
                            "is3D": True,
                            "title": chart_title,
                            "labels": labels,
                            "values": values,
                        },
                    },
                }
            ]
            kind_label = "3D Pie/Donut Chart" if is_pie else "3D Bar Chart"
            return (f"Added interactive {kind_label} with distribution data.", ops)

        # 6. "Speaker notes"
        if "notes" in lower_msg:
            ops = [
                {
                    "op": "set_notes",
                    "notes": f"Key talking points: Walk through {current_slide.get('title', 'the slide')} concisely. Emphasize verified outcomes.",
                }
            ]
            return ("Updated speaker notes with strategic talking points.", ops)

        # 6. Default general edit
        ops = [
            {
                "op": "set_notes",
                "notes": f"Action plan: {message.strip()[:60]}",
            }
        ]
        return (
            f"Reviewed {current_slide.get('title', 'current slide')} and prepared requested refinement.",
            ops,
        )
