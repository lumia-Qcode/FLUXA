"""Pick a slide typography pairing from a deck's topic (ids match frontend/src/rendering/typography.ts)."""

import re

PAIRING_IDS = {
    "editorial", "classic-serif", "geometric", "poster", "elegant", "friendly",
    "condensed", "tech", "humanist", "accessible", "urdu",
}

# Checked in order; the first group with a matching word wins.
_RULES = [
    ("tech", r"\b(ai|artificial intelligence|software|cloud|data|cyber|robot\w*|tech\w*|engineering|startup|saas|chip\w*|quantum|blockchain|app|digital|machine learning|llm)\b"),
    ("editorial", r"\b(finance|financial|invest\w*|market\w*|bank\w*|economy|economic\w*|revenue|stock\w*|pitch|brand\w*|sales|business)\b"),
    ("humanist", r"\b(health\w*|medic\w*|patient\w*|wellbeing|mental|climate|sustainab\w*|environment\w*|energy|nutrition|care|ocean\w*|forest\w*)\b"),
    ("elegant", r"\b(history|historical|culture|cultural|art|arts|fashion|luxury|museum|heritage|literature|poetry|music|wine|architecture)\b"),
    ("friendly", r"\b(education|school\w*|student\w*|teach\w*|kids|children|learning|community|volunteer\w*|onboarding|training)\b"),
    ("condensed", r"\b(sport\w*|football|cricket|soccer|olympic\w*|news|election\w*|game\w*|fitness|race|racing)\b"),
    ("classic-serif", r"\b(policy|policies|research|law|legal|government|report|thesis|study|science|scientific|academic)\b"),
    ("poster", r"\b(launch|keynote|vision|manifesto|announcement|campaign|event)\b"),
]


def pick_pairing(topic: str) -> str:
    text = (topic or "").lower()
    if re.search(r"[؀-ۿ]", topic or ""):
        return "urdu"
    for pairing, pattern in _RULES:
        if re.search(pattern, text):
            return pairing
    return "geometric"


def with_pairing(theme: dict, topic: str) -> dict:
    """Return the theme with a topic-based pairing, unless one was already chosen."""
    theme = dict(theme or {})
    if theme.get("fontPairing") not in PAIRING_IDS:
        theme["fontPairing"] = pick_pairing(topic)
    return theme
