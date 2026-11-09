"""Home stays a clean launcher: one 文法練習 card, topics still open and return."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSON = [
    "What does this word mean?",
    "My wife doesn't work.",
    "I'm interested in music.",
    "there is / there are",
    "零基礎文法",
    "字尾構詞",
    "hardly 不是",
    "送出答案",
]


def test_index_keeps_noindex():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'name="robots" content="noindex, nofollow"' in html


def test_one_grammar_card_and_no_lesson(page):
    cards = page.locator("[data-testid=grammar-entry]")
    assert cards.count() == 1
    assert cards.locator(".tn").inner_text().strip() == "文法練習"
    assert page.locator("[data-testid=topics-entry]").count() == 1
    body = page.locator("body").inner_text()
    for bit in LESSON:
        assert bit not in body
    assert page.locator("[data-testid=grammar-hub]").count() == 0
    assert page.locator("[data-testid=grammar-chapter]").count() == 0
    assert page.get_by_placeholder("例如 invoice、會議、approved").count() == 1


def test_topics_still_open_and_return(page):
    page.get_by_test_id("topics-entry").click()
    page.get_by_role("button", name="◀ 回首頁").wait_for()
    assert page.get_by_role("button", name="身體部位").count() == 1
    page.get_by_role("button", name="◀ 回首頁").click()
    page.get_by_test_id("grammar-entry").wait_for()
    assert "零基礎文法" not in page.locator("body").inner_text()


def test_grammar_nav_in_and_back(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    assert page.get_by_role("heading", name="零基礎文法").count() == 1
    assert page.get_by_role("heading", name="字尾構詞").count() == 1
    assert page.locator("[data-chapter=be]").count() == 1
    assert "What does this word mean?" not in page.locator("body").inner_text()
    page.get_by_role("button", name="◀ 回首頁").click()
    page.get_by_test_id("grammar-entry").wait_for()
    assert page.locator("[data-testid=grammar-hub]").count() == 0
    assert "零基礎文法" not in page.locator("body").inner_text()


def test_cards_follow_color_scheme(page):
    page.emulate_media(color_scheme="light")
    light = page.evaluate("() => getComputedStyle(document.querySelector('.tentry')).backgroundColor")
    page.emulate_media(color_scheme="dark")
    dark = page.evaluate("() => getComputedStyle(document.querySelector('.tentry')).backgroundColor")
    assert light != dark
    assert dark != "rgb(255, 255, 255)"


def test_sw_precaches_grammar_json():
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    assert "grammar/grammar.json" in sw
    assert re.search(r"grammar\\/\[a-z0-9_-]\+", sw)
    assert "toeic7000-" in sw
    assert "__VERSION__" not in sw
    data = json.loads((ROOT / "grammar" / "grammar.json").read_text(encoding="utf-8"))
    assert data["chapters"][0]["id"] == "be"
