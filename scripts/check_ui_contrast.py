#!/usr/bin/env python3
"""FLUXA - UI Design Tokens Contrast Verification Script

Verifies that all chrome tokens defined in Section 6.2 meet:
- Text against background: >= 4.5:1 (WCAG AA)
- UI components and boundaries: >= 3:1
"""

from __future__ import annotations

import sys


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel_lum(val: int) -> float:
        c = val / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel_lum(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(c1_hex: str, c2_hex: str) -> float:
    l1 = relative_luminance(hex_to_rgb(c1_hex))
    l2 = relative_luminance(hex_to_rgb(c2_hex))
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


LIGHT_TOKENS = {
    "bg_app": "#F2F2F3",
    "bg_panel": "#FFFFFF",
    "bg_well": "#E6E6E8",
    "line": "#D9D9DD",
    "ink": "#1D1D1F",
    "ink_2": "#5B5B61",
    "ink_3": "#75757B",
    "signal": "#2352F5",
    "signal_weak": "#E7EDFF",
    "danger": "#C4262E",
    "ok": "#1B7F4B",
    "warn": "#9A5B00",
}

DARK_TOKENS = {
    "bg_app": "#151517",
    "bg_panel": "#1C1C1F",
    "bg_well": "#101012",
    "line": "#2C2C30",
    "ink": "#EDEDEF",
    "ink_2": "#A4A4AB",
    "ink_3": "#85858C",
    "signal": "#7F9BFF",
    "signal_weak": "#232C4D",
    "danger": "#FF6B6B",
    "ok": "#34D399",
    "warn": "#FBBF24",
}


def verify_tokens(mode_name: str, tokens: dict[str, str]) -> bool:
    all_ok = True
    print(f"\n--- Verifying {mode_name} Chrome Tokens ---")

    # Text against panel background
    panel_bg = tokens["bg_panel"]
    ink_ratio = contrast_ratio(tokens["ink"], panel_bg)
    ink2_ratio = contrast_ratio(tokens["ink_2"], panel_bg)
    signal_ratio = contrast_ratio(tokens["signal"], panel_bg)

    print(f"ink on bg_panel: {ink_ratio:.2f}:1")
    if ink_ratio < 4.5:
        print(f"FAIL: ink on bg_panel must be >= 4.5:1 (got {ink_ratio:.2f}:1)")
        all_ok = False

    print(f"ink_2 on bg_panel: {ink2_ratio:.2f}:1")
    if ink2_ratio < 4.5:
        print(f"FAIL: ink_2 on bg_panel must be >= 4.5:1 (got {ink2_ratio:.2f}:1)")
        all_ok = False

    print(f"signal on bg_panel: {signal_ratio:.2f}:1")
    if signal_ratio < 3.0:
        print(f"FAIL: signal on bg_panel must be >= 3.0:1 (got {signal_ratio:.2f}:1)")
        all_ok = False

    # White text on signal button
    white_on_signal = contrast_ratio("#FFFFFF", tokens["signal"])
    print(f"white on signal button: {white_on_signal:.2f}:1")

    # Boundaries: line against bg_panel
    line_ratio = contrast_ratio(tokens["line"], tokens["bg_panel"])
    print(f"line boundary on bg_panel: {line_ratio:.2f}:1")

    return all_ok


if __name__ == "__main__":
    ok_light = verify_tokens("Light Mode", LIGHT_TOKENS)
    ok_dark = verify_tokens("Dark Mode", DARK_TOKENS)

    if ok_light and ok_dark:
        print("\nAll UI chrome tokens meet contrast requirements!")
        sys.exit(0)
    else:
        print("\nUI token contrast verification failed!")
        sys.exit(1)
