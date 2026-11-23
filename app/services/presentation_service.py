from app.prompts.presentation import (
    PRESENTATION_SYSTEM_PROMPT,
    build_presentation_prompt,
)
from app.services.ai_client import generate_ai_response
from app.services.slide_parser import extract_json


def generate_presentation(
    topic: str,
    slide_count: int = 8,
    audience: str = "General audience",
    language: str = "English",
) -> dict:
    """Generate and validate a presentation plan using AI."""

    prompt = build_presentation_prompt(
        topic=topic,
        slide_count=slide_count,
        audience=audience,
        language=language,
    )

    response = generate_ai_response(
        prompt=prompt,
        system_prompt=PRESENTATION_SYSTEM_PROMPT,
    )

    try:
        presentation = extract_json(response)
    except Exception as error:
        raise ValueError(f"AI returned invalid JSON for the presentation: {error}") from error

    if not isinstance(presentation, dict):
        raise ValueError("Presentation response must be a JSON object.")

    if not isinstance(presentation.get("slides"), list):
        raise ValueError("Presentation response must contain a slides list.")

    slides = presentation["slides"]
    if len(slides) > slide_count:
        presentation["slides"] = slides[:slide_count]

    return presentation
