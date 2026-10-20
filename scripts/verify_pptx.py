"""Script to verify PPTX file integrity per Section 5.6 & Phase 6 prompt."""

import sys
import zipfile

from pptx import Presentation


def verify_pptx_file(pptx_path: str, expected_slides: int = 1) -> dict:
    # 1. Unzip and check package parts
    with zipfile.ZipFile(pptx_path, "r") as z:
        names = z.namelist()
        slides_xml = [n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
        charts_xml = [n for n in names if n.startswith("ppt/charts/chart") and n.endswith(".xml")]
        embeddings = [n for n in names if "embeddings" in n]

        assert len(slides_xml) >= expected_slides, (
            f"Expected at least {expected_slides} slides in zip, found {len(slides_xml)}"
        )

    # 2. Inspect with python-pptx
    prs = Presentation(pptx_path)
    actual_slides = len(prs.slides)
    assert actual_slides >= expected_slides, (
        f"python-pptx found {actual_slides} slides, expected {expected_slides}"
    )

    found_charts = 0
    found_notes = 0
    found_tables = 0

    for slide in prs.slides:
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text:
            found_notes += 1

        for shape in slide.shapes:
            if shape.has_chart:
                found_charts += 1
            if shape.has_table:
                found_tables += 1

    return {
        "status": "valid",
        "slides_count": actual_slides,
        "slides_xml": len(slides_xml),
        "charts_xml": len(charts_xml),
        "found_charts": found_charts,
        "found_notes": found_notes,
        "found_tables": found_tables,
        "embeddings": len(embeddings),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: py verify_pptx.py <path-to-pptx>")
        sys.exit(1)

    result = verify_pptx_file(sys.argv[1])
    print("Verification result:", result)
