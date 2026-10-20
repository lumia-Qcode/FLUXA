"""AI Copilot service for dynamic slide edits, additions, deletions and enhancements."""

import json

from app.database import get_connection
from app.services.prompt_service import send_prompt_for_json

COPILOT_SYSTEM_PROMPT = """
You are FLUXA Copilot, a world-class AI presentation co-author and designer.
The user wants to edit, add, delete, polish, or discuss slides in their presentation.
The user may give instructions in English, Urdu, or Roman Urdu.

Understand the user's intent and return a JSON object with one of the following actions:
- "update_slide": modify an existing slide's title and/or content (e.g. adding stats, expanding points, rephrasing, adding charts).
- "add_slide": add a brand new slide (e.g. conclusion, market analysis, intro, etc.).
- "delete_slide": remove an existing slide by ID.
- "chat": answer questions, provide presentation advice, or brainstorm ideas without modifying slides.

Rich content guidelines:
You can format slide content with:
- Standard bullet points: "- Key insight"
- Charts:
  [chart:bar:{"labels":["2023","2024","2025","2026"],"values":[35,55,75,95],"unit":"%"}]
  [chart:donut:{"labels":["Segment A","Segment B","Segment C"],"values":[50,30,20]}]
- Metrics:
  [metric:88%:Adoption Rate:High customer retention]
- Comparisons:
  [compare:Key Comparison:{"Before":["Manual work","Slow turnaround"],"After":["Automated AI","Instant insights"]}]
- Steps/Timeline:
  [steps:Process Flow:{"1":"Discovery","2":"Design","3":"Launch"}]
- Quotes:
  [quote:Innovation distinguishes between a leader and a follower.:Steve Jobs]

Always end your "reply" politely in the user's language, summarizing the action taken and asking:
"Would you like any further changes or adjustments to your slides?" (or in Roman Urdu: "Kia aap is mein mazeed koi tabdeeli ya naya slide add/edit krna chahtay hain?").

Return strictly JSON with this schema:
{
  "action": "update_slide" | "add_slide" | "delete_slide" | "chat",
  "target_slide_id": <integer slide id or null>,
  "slide_data": {
    "title": "Slide Title",
    "content": "- Bullet 1\\n- Bullet 2\\n[chart:...]"
  },
  "reply": "Your explanation and prompt asking if any further changes are needed."
}
"""


def execute_copilot_command(
    database_path: str, presentation_id: int, message: str, current_slide_id: int = None
) -> dict:
    """Execute conversational AI copilot commands to edit, add, or delete slides."""

    connection = get_connection(database_path)
    try:
        pres_row = connection.execute(
            "SELECT id, title, description FROM presentations WHERE id = ?",
            (presentation_id,),
        ).fetchone()

        if not pres_row:
            raise ValueError("Presentation not found.")

        slide_rows = connection.execute(
            """
            SELECT id, slide_order, title, content
            FROM slides
            WHERE presentation_id = ?
            ORDER BY slide_order ASC, id ASC
            """,
            (presentation_id,),
        ).fetchall()

        slides = [dict(r) for r in slide_rows]
    finally:
        connection.close()

    slides_summary = [
        {
            "id": s["id"],
            "order": s["slide_order"],
            "title": s["title"],
            "content": s["content"][:200],
        }
        for s in slides
    ]

    prompt = f"""
Current Presentation:
Title: {pres_row["title"]}
Description: {pres_row["description"]}
Active Slide ID: {current_slide_id}
Total Slides: {len(slides)}

All Slides in Deck:
{json.dumps(slides_summary, indent=2)}

User Request:
"{message}"

Return JSON matching the schema.
"""

    response_data = send_prompt_for_json(prompt, COPILOT_SYSTEM_PROMPT)

    action = response_data.get("action", "chat")
    reply = response_data.get("reply", "Changes processed. Any further changes?")
    target_id = response_data.get("target_slide_id") or current_slide_id
    slide_data = response_data.get("slide_data") or {}

    connection = get_connection(database_path)
    try:
        if action == "add_slide":
            max_order_row = connection.execute(
                "SELECT COALESCE(MAX(slide_order), 0) AS max_order FROM slides WHERE presentation_id = ?",
                (presentation_id,),
            ).fetchone()
            next_order = (max_order_row["max_order"] if max_order_row else len(slides)) + 1
            new_title = (slide_data.get("title") or "New Slide").strip()
            new_content = (slide_data.get("content") or "- Point 1\n- Point 2").strip()

            connection.execute(
                "INSERT INTO slides (presentation_id, slide_order, title, content) VALUES (?, ?, ?, ?)",
                (presentation_id, next_order, new_title, new_content),
            )
            connection.commit()

        elif action == "update_slide" and target_id:
            up_title = slide_data.get("title")
            up_content = slide_data.get("content")
            fields = []
            vals = []
            if up_title is not None and str(up_title).strip():
                fields.append("title = ?")
                vals.append(str(up_title).strip())
            if up_content is not None:
                fields.append("content = ?")
                vals.append(str(up_content).strip())

            if fields:
                fields.append("updated_at = CURRENT_TIMESTAMP")
                vals.extend([target_id, presentation_id])
                connection.execute(
                    f"UPDATE slides SET {', '.join(fields)} WHERE id = ? AND presentation_id = ?",
                    vals,
                )
                connection.commit()

        elif action == "delete_slide" and target_id:
            connection.execute(
                "DELETE FROM slides WHERE id = ? AND presentation_id = ?",
                (target_id, presentation_id),
            )
            # Reorder remaining slides
            remaining = connection.execute(
                "SELECT id FROM slides WHERE presentation_id = ? ORDER BY slide_order ASC, id ASC",
                (presentation_id,),
            ).fetchall()
            for idx, r in enumerate(remaining, start=1):
                connection.execute(
                    "UPDATE slides SET slide_order = ? WHERE id = ?",
                    (idx, r["id"]),
                )
            connection.commit()

        # Fetch updated presentation
        updated_slides = connection.execute(
            """
            SELECT id, presentation_id, slide_order, title, content, created_at, updated_at
            FROM slides
            WHERE presentation_id = ?
            ORDER BY slide_order ASC, id ASC
            """,
            (presentation_id,),
        ).fetchall()

        pres_data = dict(pres_row)
        pres_data["slides"] = [dict(s) for s in updated_slides]
        pres_data["slide_count"] = len(updated_slides)
    finally:
        connection.close()

    return {
        "reply": reply,
        "action": action,
        "presentation": pres_data,
    }


def ai_enhance_slide(
    database_path: str, presentation_id: int, slide_id: int, instruction: str = ""
) -> dict:
    """Enhance a single slide with deeper insights, metrics, and visual components."""

    connection = get_connection(database_path)
    try:
        slide_row = connection.execute(
            "SELECT id, slide_order, title, content FROM slides WHERE id = ? AND presentation_id = ?",
            (slide_id, presentation_id),
        ).fetchone()

        if not slide_row:
            raise ValueError("Slide not found.")

        slide_dict = dict(slide_row)
    finally:
        connection.close()

    prompt = f"""
Slide Title: {slide_dict["title"]}
Current Content:
{slide_dict["content"]}

User Instruction: {instruction or "Enrich this slide with high-impact key points, metrics, and an optional chart or comparison."}

Return JSON with:
{{
  "title": "Refined Slide Title",
  "content": "- Polished bullet 1\\n- Polished bullet 2\\n[chart:bar:{{\\"labels\\":[\\"A\\",\\"B\\",\\"C\\"],\\"values\\":[40,70,90]}}]\\n[metric:95%:Efficiency:High accuracy]"
}}
"""
    sys_prompt = "You are FLUXA's slide designer. Turn raw slide text into clean, high-impact presentation bullets and charts."
    result = send_prompt_for_json(prompt, sys_prompt)

    new_title = result.get("title", slide_dict["title"]).strip()
    new_content = result.get("content", slide_dict["content"]).strip()

    connection = get_connection(database_path)
    try:
        connection.execute(
            """
            UPDATE slides
            SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND presentation_id = ?
            """,
            (new_title, new_content, slide_id, presentation_id),
        )
        connection.commit()

        updated_row = connection.execute(
            "SELECT id, presentation_id, slide_order, title, content, created_at, updated_at FROM slides WHERE id = ?",
            (slide_id,),
        ).fetchone()
        return dict(updated_row)
    finally:
        connection.close()
