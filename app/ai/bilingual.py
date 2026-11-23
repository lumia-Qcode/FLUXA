"""Bilingual (English + Roman Urdu) detection and system prompt helpers for Fluxa AI."""

import re
from typing import List

# ---------------------------------------------------------------------------
# Roman Urdu markers — common words unique to Roman Urdu (not found in normal English)
# ---------------------------------------------------------------------------
ROMAN_URDU_MARKERS: List[str] = [
    "karo", "kar do", "kar dena", "bara", "chota", "hata", "badal",
    "zyada", "kam", "rang", "wala", "wali", "nahi", "hai", "ho", "mujhe",
    "acha", "theek", "thoda", "bohot", "bilkul", "zaroor", "abhi", "phir",
    "dikhao", "lagao", "hatao", "banao",
    "nayi", "purani", "sab", "kuch", "ye", "woh", "ap", "main",
    "mera", "tera", "hamara", "unka", "kya", "kyun", "kaise", "kab", "kahan",
    "rung", "seedha", "likho", "boldo", "bata", "bado", "chhota", "bhari",
    "pehle", "baad", "phir", "upar", "neeche", "dakhal", "dena", "lena",
    "banana", "chalana", "rokna", "shuru", "khatam",
]

# English words that might appear in Roman Urdu sentences — ignore for scoring
ENGLISH_PASS_THROUGH = {
    "slide", "chart", "graph", "title", "font", "color", "layout",
    "image", "table", "text", "note", "notes", "summary", "header",
    "footer", "background", "bullet", "list", "section", "template",
    "size", "bold", "italic", "align", "add", "remove", "set", "show",
    "hide", "update", "change", "make", "create", "delete",
}

_RU_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(w) for w in ROMAN_URDU_MARKERS) + r')\b',
    re.IGNORECASE
)


def detect_language(text: str) -> str:
    """Detect whether the user message is English, Roman Urdu, or mixed.

    Returns:
        'en'           — clearly English
        'roman_urdu'   — clearly Roman Urdu (Urdu in Latin script)
        'mixed'        — contains both English and Roman Urdu elements
    """
    if not text or not text.strip():
        return "en"

    lower = text.lower()
    matches = _RU_PATTERN.findall(lower)
    hit_count = len(matches)

    if hit_count == 0:
        return "en"

    # Count non-trivial tokens
    tokens = re.findall(r'\b[a-z]+\b', lower)
    non_pass = [t for t in tokens if t not in ENGLISH_PASS_THROUGH]
    total = len(non_pass) if non_pass else 1

    ru_ratio = hit_count / total

    if ru_ratio >= 0.35:
        return "roman_urdu"
    elif ru_ratio >= 0.1:
        return "mixed"
    return "en"


# ---------------------------------------------------------------------------
# System prompt snippets
# ---------------------------------------------------------------------------

ROMAN_URDU_SYSTEM_PROMPT = """
You understand Roman Urdu (Urdu written in Latin script). 

GLOSSARY:
- bara karo / bada karo = enlarge/increase
- chota karo / chota kar do = reduce/shrink
- hata do / hatao = remove/delete
- badal do / badlo = change/update  
- zyada = more/increase
- kam = less/decrease/reduce
- rang = color
- chart / graph = chart
- nayi slide = new slide
- title = title/heading
- slider = slider/range control
- 3D bana do = make it 3D
- aur = and/also
- mujhe chahiye = I want/need
- dikhao = show me
- lagao = add/apply
- banao = make/create
- likho = write
- theek karo = fix/correct
- seedha karo = straighten/align

FEW-SHOT EXAMPLES:
User: "slide 3 ka chart bara karo" → Action: enlarge chart on slide 3
User: "ye title chota kar do" → Action: reduce font size of title on current slide
User: "is slide me ek slider add karo" → Action: add a slider/variable control to this slide
User: "chart ko 3D bana do" → Action: set chart is3D = true on current slide
User: "background ka rang badal do" → Action: change background color
User: "ye bullet hata do" → Action: remove selected bullet point
User: "nayi slide add karo summary ke liye" → Action: add new slide for summary
User: "graph me aur data points lagao" → Action: add more data points to chart
User: "title bold karo" → Action: make title text bold
User: "is deck ko Roman Urdu me translate karo" → Action: translate all slide content to Roman Urdu
User: "slide 2 ka layout badal do" → Action: change layout of slide 2
User: "chart labels English me likho" → Action: set chart labels in English
User: "font size zyada karo" → Action: increase font size
User: "speaker notes me summary add karo" → Action: add summary to speaker notes
User: "ye image hata do aur chart lagao" → Action: remove image, add chart

RULE: First translate the intent to a normalized English action internally, then execute that action.
RULE: Reply in the same language the user used (Roman Urdu → reply in Roman Urdu, English → reply in English).
"""

MIXED_SYSTEM_PROMPT = """
The user may alternate between English and Roman Urdu (Urdu written in Latin script).
Understand commands in both languages. Reply in English unless the message is predominantly Roman Urdu.

KEY ROMAN URDU TERMS:
bara/bada = large/increase | chota = small/reduce | hatao = remove | badal = change
zyada = more | kam = less | rang = color | nayi = new | ye = this | woh = that
dikhao = show | lagao = add | banao = make | theek = fix | seedha = align
"""


def build_bilingual_system_prompt(language: str) -> str:
    """Return the appropriate system prompt snippet for the detected language."""
    if language == "roman_urdu":
        return ROMAN_URDU_SYSTEM_PROMPT
    elif language == "mixed":
        return MIXED_SYSTEM_PROMPT
    return ""
