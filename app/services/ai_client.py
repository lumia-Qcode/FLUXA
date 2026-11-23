import requests

from app.config import Config


def generate_ai_response(prompt: str, system_prompt: str = "") -> str:
    """Generate an AI response using OpenRouter with model fallback."""

    if not Config.OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not configured.")

    url = f"{Config.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"

    headers = {
        "Authorization": f"Bearer {Config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    messages = []

    if system_prompt.strip():
        messages.append(
            {
                "role": "system",
                "content": system_prompt,
            }
        )

    messages.append(
        {
            "role": "user",
            "content": prompt,
        }
    )

    configured = [m for m in [Config.OPENROUTER_MODEL, Config.OPENROUTER_FALLBACK_MODEL] if m]
    default_fallbacks = [
        "minimax/minimax-m3.1-flash:free",
        "openrouter/free",
    ]
    models = []
    for m in configured + default_fallbacks:
        if m and m not in models:
            models.append(m)

    last_error = None

    for model in models:
        if not model:
            continue

        try:
            response = requests.post(
                url,
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": 800,
                },
                timeout=30,
            )

            response.raise_for_status()
            data = response.json()

            choices = data.get("choices", [])
            if not choices:
                continue

            msg = choices[0].get("message", {})
            content = msg.get("content") or msg.get("reasoning") or ""

            if not isinstance(content, str) or not content.strip():
                raise ValueError("The AI model returned an empty response.")

            return content.strip()

        except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as error:
            last_error = error

    raise RuntimeError(f"All configured OpenRouter models failed. Last error: {last_error}")
