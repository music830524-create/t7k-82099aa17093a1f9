"""be 動詞 chapter, suffix tables, quiz scoring, and a separate storage key."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "grammar" / "grammar.json").read_text(encoding="utf-8"))
PROG = '{"sentinel":{"s":1,"c":2,"x":3,"box":1,"due":9}}'
EXTRA = '[{"w":"zz","s":"hi","t":1}]'
SIMP = set("这个对会发为门东车语体无时吗说还过问题头书实从与业产种经网现点来们学习开关机电话视频软质历着么后里贝仅于让给动词样进务员单复数应请间谢听见觉兴认识议计划画类别国词")


def _walk(o, acc):
    if isinstance(o, str):
        acc.append(o)
    elif isinstance(o, dict):
        for v in o.values():
            _walk(v, acc)
    elif isinstance(o, list):
        for v in o:
            _walk(v, acc)


def _word(sentence, token):
    start = 0
    while True:
        i = sentence.find(token, start)
        if i < 0:
            return False
        end = i + len(token)
        before = "" if i == 0 else sentence[i - 1]
        after = "" if end >= len(sentence) else sentence[end]
        if not re.match(r"[A-Za-z']", before or " ") and not re.match(r"[A-Za-z']", after or " "):
            # empty before/after: the regex on " " is a letter? space is not a letter.
            if (i == 0 or not re.match(r"[A-Za-z']", sentence[i - 1])) and (end >= len(sentence) or not re.match(r"[A-Za-z']", sentence[end])):
                return True
        start = i + 1
    return False


def test_grammar_source_does_not_touch_vocab_keys():
    src = (ROOT / "dev" / "src" / "grammar.tsx").read_text(encoding="utf-8")
    assert "toeic7000_progress_v1" not in src
    assert "toeic7000_extra_v1" not in src
    assert "toeic7000_grammar_v1" in src
    built = (ROOT / "dev" / "build.sh").read_text(encoding="utf-8")
    assert "grammar/*.json" in built


def test_json_shape_and_answer_keys():
    strings = []
    _walk(DATA, strings)
    bad = sorted({ch for s in strings for ch in s if ch in SIMP})
    assert bad == []
    assert DATA["basics"]["title"] == "零基礎文法"
    assert len(DATA["chapters"]) >= 1
    ch = DATA["chapters"][0]
    assert ch["title"] == "be 動詞"
    assert len(ch["quiz"]) == 10
    for pt in ch["points"]:
        assert len(pt["examples"]) == 5
        for ex in pt["examples"]:
            assert re.search(r"[\u4e00-\u9fff]", ex["zh"])
            for m in ex["marks"]:
                assert _word(ex["en"], m["t"]), (m["t"], ex["en"])
    families = DATA["suffix"]["families"]
    assert 8 <= len(families) <= 10
    ids = [f["id"] for f in families]
    for need in ["success", "create", "care", "avail", "impress", "decide", "differ", "please", "hard"]:
        assert need in ids
    for f in families:
        for key in ("n", "v", "adj", "adv"):
            cell = f["cols"][key]
            if cell["word"]:
                assert cell.get("examples")
                for ex in cell["examples"]:
                    assert re.search(r"[\u4e00-\u9fff]", ex["zh"])
            else:
                assert cell.get("note")
    hard = next(f for f in families if f["id"] == "hard")
    assert "hardly" in hard["note"]
    assert "努力" in hard["note"]
    expected = [
        "be 動詞", "詞性", "一般動詞與 do/does/did", "句型與主詞動詞一致", "名詞與冠詞", "代名詞",
        "現在簡單式 vs 現在進行式", "過去簡單式與過去進行式", "未來式", "現在完成式",
        "助動詞", "被動語態", "不定詞與動名詞", "介係詞", "連接詞", "比較級與最高級",
        "關係代名詞", "分詞形容詞", "假設語氣", "總複習",
    ]
    assert [c["title"] for c in DATA["chapters"][:20]] == expected
    assert [c["no"] for c in DATA["chapters"]] == list(range(1, len(DATA["chapters"]) + 1))
    assert len(DATA["chapters"]) >= 39
    group_ids = {g["id"] for g in DATA["groups"]}
    for ch in DATA["chapters"]:
        assert ch["group"] in group_ids
        assert len(ch["quiz"]) >= 10
        if ch["id"] != "review":
            assert len(ch["points"]) >= 2
        for pt in ch["points"]:
            assert len(pt["examples"]) == 5
            for ex in pt["examples"]:
                assert re.search(r"[\u4e00-\u9fff]", ex["zh"])
                for m in ex.get("marks") or []:
                    assert _word(ex["en"], m["t"]), (ch["id"], m["t"], ex["en"])
        for item in ch["quiz"]:
            assert len(item["options"]) == 4
            assert len(set(item["options"])) == 4
            assert item["options"][item["answer"]] in item["full"]
            assert re.search(r"[\u4e00-\u9fff]", item["explain"])
    for item in ch["quiz"] + DATA["suffix"]["quiz"]:
        assert len(item["options"]) == 4
        assert len(set(item["options"])) == 4
        assert 0 <= item["answer"] < 4
        ans = item["options"][item["answer"]]
        assert ans in item["full"]
        assert re.search(r"[\u4e00-\u9fff]", item["explain"])


def _open_be(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    page.locator("[data-chapter=be]").click()
    page.wait_for_selector("[data-testid=grammar-chapter]")


def _answer(page, quiz, wrong_id):
    for item in quiz:
        card = page.locator('[data-qid="%s"]' % item["id"])
        card.scroll_into_view_if_needed()
        if item["id"] == wrong_id:
            pick = next(i for i in range(4) if i != item["answer"])
        else:
            pick = item["answer"]
        card.locator('.qopt[data-i="%d"]' % pick).click()
    page.get_by_role("button", name="送出答案").click()
    page.wait_for_selector("[data-testid=grammar-score]")


def test_be_chapter_renders(page):
    _open_be(page)
    raw = page.locator("[data-testid=grammar-chapter]").inner_text()
    text = re.sub(r"\s+", " ", re.sub(r"\([a-z]+\.\)", "", raw))
    assert "◀ 回文法練習" in raw
    assert "am / is / are" in text
    assert "was / were" in text
    assert "(v.)" in raw and "(adj.)" in raw and "(n.)" in raw and "(aux.)" in raw
    assert "What is this word mean?" in text
    assert "What does this word mean?" in text
    assert "My wife isn't work." in text
    assert "My wife doesn't work." in text
    assert "I interesting in music." in text
    assert "I'm interested in music." in text
    assert "There is a message on your desk." in text
    assert "There are three applicants" in text
    assert page.locator("[data-testid=quiz-be] .qcard").count() == 10
    sw, cw = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert sw <= cw + 2
    page.get_by_role("button", name="◀ 回文法練習").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    assert page.locator("[data-testid=grammar-chapter]").count() == 0


def test_be_quiz_scores_and_keeps_vocab_storage(page):
    page.evaluate(
        """([prog, extra]) => {
          localStorage.setItem('toeic7000_progress_v1', prog);
          localStorage.setItem('toeic7000_extra_v1', extra);
        }""",
        [PROG, EXTRA],
    )
    _open_be(page)
    # one option only: refuse to score
    page.locator('[data-qid="be-1"] .qopt[data-i="0"]').click()
    page.get_by_role("button", name="送出答案").click()
    assert "還有 9 題" in page.locator("[data-testid=grammar-quiz-msg]").inner_text()
    assert page.locator("[data-testid=grammar-score]").count() == 0

    quiz = DATA["chapters"][0]["quiz"]
    wrong = next(item for item in quiz if item["id"] == "be-6")
    wrong_pick = next(i for i in range(4) if i != wrong["answer"])
    _answer(page, quiz, "be-6")
    score = page.locator("[data-testid=grammar-score]").inner_text()
    assert "這次 9 / 10" in score
    assert "最佳 9 / 10" in score
    reviews = page.locator("[data-testid=wrong-review]")
    assert reviews.count() == 1
    rev = reviews.inner_text()
    assert wrong["full"] in rev
    assert "題目：" + wrong["prompt"] in rev
    for opt in wrong["options"]:
        assert opt in rev
    assert "你的答案：" + wrong["options"][wrong_pick] in rev
    assert "正確答案：" + wrong["options"][wrong["answer"]] in rev
    assert wrong["explain"] in rev

    stored = page.evaluate(
        """() => ({
          p: localStorage.getItem('toeic7000_progress_v1'),
          e: localStorage.getItem('toeic7000_extra_v1'),
          g: localStorage.getItem('toeic7000_grammar_v1')
        })"""
    )
    assert json.loads(stored["p"]) == json.loads(PROG)
    assert json.loads(stored["e"]) == json.loads(EXTRA)
    g = json.loads(stored["g"])
    assert "sentinel" not in stored["g"]
    assert g["chapters"]["be"]["best"] == 9
    assert g["chapters"]["be"]["last"] == 9
    assert g["chapters"]["be"]["wrong"] == [{"id": "be-6", "picked": wrong_pick}]
    assert "suffix" not in g or g.get("suffix") is None

    page.get_by_role("button", name="◀ 回文法練習").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    page.get_by_role("button", name="◀ 回首頁").click()
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    assert "最佳 9 / 10" in page.locator("[data-chapter=be]").inner_text()


def test_hub_lists_every_chapter(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    for ch in DATA["chapters"]:
        card = page.locator('[data-chapter="%s"]' % ch["id"])
        assert card.count() == 1
        assert "尚未測驗" in card.inner_text()
        assert ch["title"] in card.inner_text()
    for name in ["零基礎文法", "詞與句", "時態", "常用句型", "問句與請求", "字尾構詞"]:
        assert page.get_by_role("heading", name=name).count() >= 1
    sw, cw = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert sw <= cw + 2


def test_present_tense_chapter_renders(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    page.locator("[data-chapter=present]").click()
    page.wait_for_selector('[data-testid=grammar-chapter][data-chapter="present"]')
    raw = page.locator("[data-testid=grammar-chapter]").inner_text()
    text = re.sub(r"\s+", " ", re.sub(r"\([a-z]+\.\)", "", raw))
    assert "◀ 回文法練習" in raw
    assert "現在簡單式" in text
    assert "現在進行式" in text
    assert "right now" in text
    assert page.locator("[data-testid=quiz-present] .qcard").count() == 10
    sw, cw = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert sw <= cw + 2
    page.get_by_role("button", name="◀ 回文法練習").click()
    page.wait_for_selector("[data-testid=grammar-hub]")


def test_every_chapter_opens(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    for ch in DATA["chapters"]:
        page.locator('[data-chapter="%s"]' % ch["id"]).click()
        page.wait_for_selector('[data-testid=grammar-chapter][data-chapter="%s"]' % ch["id"])
        assert page.locator('[data-testid="quiz-%s"] .qcard' % ch["id"]).count() == len(ch["quiz"])
        assert page.locator(".gex").count() >= 5
        page.get_by_role("button", name="◀ 回文法練習").click()
        page.wait_for_selector("[data-testid=grammar-hub]")


def test_suffix_tables_and_quiz(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=grammar-hub]")
    page.get_by_test_id("suffix-entry").click()
    page.wait_for_selector("[data-testid=grammar-suffix]")
    text = page.locator("[data-testid=grammar-suffix]").inner_text()
    assert "◀ 回文法練習" in text
    for label in ["名詞", "動詞", "形容詞", "副詞"]:
        assert label in text
    assert "success" in text and "succeed" in text and "successful" in text and "successfully" in text
    assert "creation" in text and "creativity" in text
    assert "availability" in text and "available" in text
    assert "hardly" in text and "努力地" in text
    assert "happy → happily" in text or "happy → happily" in text
    assert "gentle → gently" in text
    assert "basic → basically" in text
    assert page.locator("[data-fam]").count() == len(DATA["suffix"]["families"])
    assert page.locator("[data-testid=quiz-suffix] .qcard").count() == 10
    # no horizontal page scroll on a phone
    sw, cw = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert sw <= cw + 2
    page.get_by_role("button", name="◀ 回文法練習").click()
    page.wait_for_selector("[data-testid=grammar-hub]")


def test_suffix_quiz_review(page):
    page.get_by_test_id("grammar-entry").click()
    page.wait_for_selector("[data-testid=suffix-entry]")
    page.get_by_test_id("suffix-entry").click()
    page.wait_for_selector("[data-testid=quiz-suffix]")
    quiz = DATA["suffix"]["quiz"]
    _answer(page, quiz, "sx-9")
    assert "這次 9 / 10" in page.locator("[data-testid=grammar-score]").inner_text()
    wrong = next(item for item in quiz if item["id"] == "sx-9")
    rev = page.locator("[data-testid=wrong-review]").inner_text()
    assert wrong["full"] in rev
    assert "hardly" in rev
    assert wrong["explain"] in rev
    g = json.loads(page.evaluate("() => localStorage.getItem('toeic7000_grammar_v1')"))
    assert g["suffix"]["best"] == 9
    assert g["suffix"]["wrong"][0]["id"] == "sx-9"
