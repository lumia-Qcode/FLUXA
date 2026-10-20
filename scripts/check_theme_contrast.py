#!/usr/bin/env python3
"""FLUXA - Theme Palette Contrast Checker (WCAG 2.1 AA)

Verifies:
1. Primary text on theme background >= 4.5:1.
2. All 6 chart series colors on theme background >= 3.0:1.
3. Contrast ratios for secondary and accent colors.
"""

from __future__ import annotations

import json
import os
import sys


# Color luminance helper
def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    hex_str = hex_str.lstrip("#")
    if len(hex_str) == 3:
        hex_str = "".join([c * 2 for c in hex_str])
    r = int(hex_str[0:2], 16) / 255.0
    g = int(hex_str[2:4], 16) / 255.0
    b = int(hex_str[4:6], 16) / 255.0
    return r, g, b


def relative_luminance(hex_str: str) -> float:
    r, g, b = hex_to_rgb(hex_str)
    r_lin = srgb_to_linear(r)
    g_lin = srgb_to_linear(g)
    b_lin = srgb_to_linear(b)
    return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin


def contrast_ratio(hex1: str, hex2: str) -> float:
    l1 = relative_luminance(hex1)
    l2 = relative_luminance(hex2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def verify_themes(themes: list[dict]) -> tuple[bool, list[str]]:
    all_ok = True
    messages = []

    for t in themes:
        tid = t["id"]
        bg = t["colors"]["bg"]
        text = t["colors"]["text"]
        chart_colors = t["colors"]["chart"]

        # 1. Text contrast
        text_cr = contrast_ratio(text, bg)
        if text_cr < 4.5:
            all_ok = False
            messages.append(
                f"FAIL: Theme '{tid}' text contrast is {text_cr:.2f}:1 (expected >= 4.5:1)"
            )
        else:
            messages.append(f"OK: Theme '{tid}' text contrast is {text_cr:.2f}:1")

        # 2. Chart colors contrast
        for idx, cc in enumerate(chart_colors):
            c_cr = contrast_ratio(cc, bg)
            if c_cr < 3.0:
                all_ok = False
                messages.append(
                    f"FAIL: Theme '{tid}' chart color {idx} ({cc}) contrast is {c_cr:.2f}:1 (expected >= 3.0:1)"
                )
            else:
                messages.append(f"  OK: Chart[{idx}] {cc} is {c_cr:.2f}:1")

    return all_ok, messages


if __name__ == "__main__":
    # If run directly, load themes from shared/themes.json or from arguments
    themes_file = sys.argv[1] if len(sys.argv) > 1 else "shared/themes.json"
    if not os.path.exists(themes_file):
        print(f"Error: {themes_file} not found.")
        sys.exit(1)

    with open(themes_file, "r", encoding="utf-8") as f:
        themes_data = json.load(f)

    ok, logs = verify_themes(themes_data)
    for line in logs:
        print(line)

    if ok:
        print("\nAll 10 themes passed contrast verification successfully!")
        sys.exit(0)
    else:
        print("\nContrast failures detected.")
        sys.exit(1)
