"""Copilot ops normalisation (app/ai/copilot_ops.py): ops must land on real blocks and slides."""

from app.ai.copilot_ops import looks_like_edit, normalize_ops, resolve_images, simulate

SLIDE = {
    "id": "slide-12",
    "layout": "image-text",
    "notes": "",
    "blocks": [
        {"id": "blk-title-3f2a91bc", "type": "text", "role": "title", "content": "How neurons signal", "props": {"text": "How neurons signal"}},
        {"id": "blk-body-77aa01cd", "type": "text", "role": "body", "bullets": ["A", "B"], "props": {"bullets": ["A", "B"]}},
        {"id": "blk-media-1234abcd", "type": "image", "role": "media", "assetId": "x.png", "props": {"assetId": "x.png"}},
    ],
}
OTHER = {"id": "slide-13", "notes": "", "blocks": [{"id": "blk-title-99", "type": "text", "role": "title", "content": "Memory"}]}
DECK = [SLIDE, OTHER]


def test_role_names_truncated_ids_and_selection_resolve_to_real_blocks():
    ops, problems = normalize_ops([
        {"op": "set_block_props", "block_id": "title", "props": {"text": "Neural signalling"}},
        {"op": "update_text", "blockId": "blk-body-77aa", "new_text": "One line"},
        {"op": "set_block_props", "props": {"fontSize": 40}},
    ], DECK, SLIDE, selected=["blk-body-77aa01cd"])
    assert problems == []
    assert [o["block_id"] for o in ops] == ["blk-title-3f2a91bc", "blk-body-77aa01cd", "blk-body-77aa01cd"]
    assert ops[1] == {"op": "set_block_props", "block_id": "blk-body-77aa01cd", "props": {"text": "One line"}}


def test_invented_ids_and_unknown_ops_are_reported_not_applied():
    ops, problems = normalize_ops([
        {"op": "set_block_props", "block_id": "blk-made-up-0001", "props": {"text": "x"}},
        {"op": "teleport", "block_id": "title"},
    ], DECK, SLIDE)
    assert ops == []
    assert any("blk-made-up-0001" in p for p in problems) and any("teleport" in p for p in problems)


def test_slide_references_map_to_editor_slide_ids():
    ops, problems = normalize_ops([
        {"op": "set_notes", "slide_id": 2, "notes": "Explain memory"},
        {"op": "add_block", "slide_id": "slide-2", "block": {"type": "text", "content": "x"}},
        {"op": "remove_slide", "slide_id": "slide-99"},
    ], DECK, SLIDE)
    assert ops[0]["slide_id"] == "slide-13" and ops[1]["slide_id"] == "slide-13"
    assert any("slide-99" in p for p in problems)


def test_edits_on_other_slides_count_as_changes_and_no_ops_do_not():
    assert simulate(DECK, [{"op": "set_block_props", "block_id": "blk-title-99", "props": {"text": "Memory systems"}}], "slide-12")
    assert not simulate(DECK, [{"op": "set_block_props", "block_id": "blk-title-3f2a91bc", "props": {"text": "How neurons signal"}}], "slide-12")
    assert not simulate(DECK, [], "slide-12")


def test_edit_requests_are_told_apart_from_questions():
    for msg in ("make the title shorter", "add a chart of these numbers", "title bara karo", "Can you change the image?", "translate this slide to Urdu"):
        assert looks_like_edit(msg), msg
    for msg in ("what does this slide mean?", "why is the sky blue?", "explain synapses"):
        assert not looks_like_edit(msg), msg


def test_set_image_becomes_a_real_credited_image_or_a_reported_miss(monkeypatch):
    import app.ai.image_search as img

    class Finder:
        def __init__(self, *a, **k):
            pass

        def find(self, query, title=""):
            return None if "unicorn" in query else {"url": "https://upload.wikimedia.org/n.png", "alt": "Neuron", "credit": "Image: A, CC BY", "source_page": "p", "license": "CC BY"}

    monkeypatch.setattr(img, "ImageFinder", Finder)
    ops, _ = normalize_ops([{"op": "change_image", "props": {"query": "neuron diagram"}}, {"op": "set_image", "block_id": "media", "props": {"query": "unicorn"}}], DECK, SLIDE)
    problems = resolve_images(ops, "brain")
    assert ops == [{"op": "set_block_props", "block_id": "blk-media-1234abcd", "props": {"assetId": "https://upload.wikimedia.org/n.png", "url": "https://upload.wikimedia.org/n.png", "alt": "Neuron", "credit": "Image: A, CC BY", "sourcePage": "p", "license": "CC BY", "model3d": None, "sketchfab": None}}]
    assert problems == ["no suitable free image was found for 'unicorn'"]
