import json

from app.database import get_connection, init_db
from app.spec.models import SlideModel
from scripts.migrate_legacy_content import (
    convert_slide_content,
    migrate_database,
    tokenize_tag,
)


def test_tokenize_metric_with_colons():
    """Verify acceptance test requirement: [metric:Q3: growth:12%:Up]."""
    line = "[metric:Q3: growth:12%:Up]"
    token = tokenize_tag(line)
    assert token is not None
    assert token["type"] == "metric"
    assert token["value"] == "12%"
    assert token["label"] == "Q3: growth"
    assert token["sub"] == "Up"


def test_tokenize_all_five_legacy_tags():
    """Test all five legacy tags: chart, metric, quote, compare, steps."""
    # 1. Chart
    chart_token = tokenize_tag('[chart:bar:{"labels":["2024","2025"],"values":[10,20],"unit":"%"}]')
    assert chart_token["type"] == "chart"
    assert chart_token["kind"] == "bar"
    chart_data = chart_token["data"]
    assert chart_data["values"] == [10, 20]

    # 2. Metric
    metric_token = tokenize_tag("[metric:99.4%:Reliability SLA:Enterprise performance]")
    assert metric_token["type"] == "metric"
    assert metric_token["value"] == "99.4%"
    assert metric_token["label"] == "Reliability SLA"
    assert metric_token["sub"] == "Enterprise performance"

    # 3. Quote (with colon in text)
    quote_token = tokenize_tag("[quote:Note: AI is the electricity:Andrew Ng]")
    assert quote_token["type"] == "quote"
    assert quote_token["text"] == "Note: AI is the electricity"
    assert quote_token["attribution"] == "Andrew Ng"

    # 4. Compare (with colon in title)
    compare_token = tokenize_tag('[compare:Strategic Analysis: 2025:{"Before":["Manual"],"After":["Auto"]}]')
    assert compare_token["type"] == "compare"
    assert compare_token["title"] == "Strategic Analysis: 2025"
    assert "Before" in compare_token["data"]

    # 5. Steps (with json)
    steps_token = tokenize_tag('[steps:Roadmap:{"1":"Plan","2":"Deploy"}]')
    assert steps_token["type"] == "steps"
    assert len(steps_token["items"]) == 2


def test_convert_slide_bullets_only():
    """Slide with bullets only produces valid text block with role body."""
    title = "Key Takeaways"
    content = "- First key finding\n- Second critical insight\n* Third recommendation"
    spec, datasets = convert_slide_content(title, content, 0)

    # Validate against Pydantic
    model = SlideModel.model_validate(spec)
    assert model.layout == "bullets"
    assert len(model.blocks) == 2  # title + body
    assert model.blocks[0].role == "title"
    assert model.blocks[1].role == "body"


def test_convert_slide_empty_content():
    """Empty content produces valid slide spec without crashing."""
    spec, _ = convert_slide_content("Just Title", "", 0)
    model = SlideModel.model_validate(spec)
    assert model.layout == "title"
    assert len(model.blocks) == 1


def test_convert_slide_urdu_text():
    """Urdu (RTL) text is preserved correctly without encoding corruption."""
    urdu_title = "کاروباری حکمت عملی کا جائزہ"
    urdu_content = "- پہلا قدم: مارکیٹ کی تحقیق اور جائزہ\n- دوسرا قدم: نئے گاہکوں کا حصول"
    spec, _ = convert_slide_content(urdu_title, urdu_content, 0)

    SlideModel.model_validate(spec)
    assert urdu_title in str(spec)
    assert "پہلا قدم" in str(spec)


def test_convert_slide_invalid_json():
    """Invalid JSON inside tags falls back gracefully and validates."""
    broken_chart = "[chart:bar:{broken_json_not_quoted]"
    spec, _ = convert_slide_content("Broken Chart", broken_chart, 0)
    model = SlideModel.model_validate(spec)
    assert any(b.type == "chart" for b in model.blocks)


def test_migrate_database_idempotent(tmp_path):
    """Test full database migration on temporary SQLite database."""
    test_db = str(tmp_path / "test_migration.db")
    init_db(test_db)
    con = get_connection(test_db)

    # Insert a legacy presentation with slides
    con.execute("INSERT INTO presentations (id, title) VALUES (1, 'Legacy Deck')")
    con.execute(
        "INSERT INTO slides (presentation_id, slide_order, title, content) VALUES (1, 0, 'Slide 1', '- Bullet 1\n- Bullet 2')"
    )
    con.execute(
        "INSERT INTO slides (presentation_id, slide_order, title, content) VALUES (1, 1, 'Q3 KPI', '[metric:Q3: growth:12%:Up]')"
    )
    con.commit()
    con.close()

    # First migration run
    decks_count, slides_count = migrate_database(test_db)
    assert decks_count == 1
    assert slides_count == 2

    # Verify blocks created for Q3 KPI
    con = get_connection(test_db)
    row = con.execute("SELECT spec FROM slides WHERE slide_order = 1").fetchone()
    assert row["spec"] is not None
    slide_spec = json.loads(row["spec"])
    kpi_block = next((b for b in slide_spec["blocks"] if b["type"] == "kpi"), None)
    assert kpi_block is not None
    assert kpi_block["label"] == "Q3: growth"
    assert kpi_block["value"] == "12%"
    con.close()

    # Second migration run (idempotency check)
    decks_count_2, slides_count_2 = migrate_database(test_db)
    assert decks_count_2 == 0
    assert slides_count_2 == 0
