import * as React from "react";
import { D } from "./data";
import { ReactNode, ChangeEvent, KeyboardEvent, Page, Section, Text, Metrics, Segmented, Toggle, Input, Button, Table, Callout, useState, useEffect, useMemo, useCallback, useRef, useGrokTheme } from "./kit";

type Word = { id: number; w: string; pos: string; zh: string; lv: number };
type Rec = { s: number; c: number; x: number; box: number; due: number };
type Prog = Record<string, Rec>;

const LEVELS: string[] = ["基礎", "核心", "進階", "高階"];
const BANDS: string[] = ["0–400 分", "400–600 分", "600–780 分", "780–900 分"];
const POS: Record<string, string> = { "1": "n.", "2": "v.", "3": "adj.", "4": "adv.", "5": "prep.", "6": "conj.", "7": "pron.", "8": "其他" };

const WORDS: Word[] = (() => {
  const out: Word[] = [];
  D.join(" ").split("#").forEach((block: string, lv: number) => {
    block.split(" ").forEach((tok: string) => {
      const m = /^([A-Za-z'\-]+)(\d*)(.*)$/.exec(tok.trim());
      if (!m || !m[3]) return;
      const pos = m[2].split("").map((c: string) => POS[c] || "").filter((s: string) => !!s).join("/");
      out.push({ id: out.length, w: m[1], pos, zh: m[3], lv });
    });
  });
  return out;
})();

const LV_COUNT: number[] = LEVELS.map((_: string, i: number) => WORDS.filter((x: Word) => x.lv === i).length);
const UNIT = 100;
const LV_START: number[] = LEVELS.map((_: string, i: number) => WORDS.findIndex((x: Word) => x.lv === i));
const unitCount = (lv: number): number => Math.ceil(LV_COUNT[lv] / UNIT);
const unitOf = (w: Word): number => Math.floor((w.id - LV_START[w.lv]) / UNIT);
type Last = { lv: number; u: number };
const KEY = "toeic7000_progress_v1";
const SET_KEY = "toeic7000_settings_v1";

function loadProg(): Prog {
  try {
    const s = window.localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Prog) : {};
  } catch (e) {
    return {};
  }
}
function saveProg(p: Prog): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch (e) {
    return false;
  }
}

function speak(text: string, rate: number): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const v = synth.getVoices().find((vv: SpeechSynthesisVoice) => vv.lang === "en-US" || vv.lang === "en_US");
    if (v) u.voice = v;
    synth.speak(u);
  } catch (e) {
    /* speech unavailable */
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const DAY = 86400000;
const BOX_DAYS: number[] = [0, 1, 3, 7, 14, 30];
const MIX_EVERY = 4;

function emptyRec(): Rec {
  return { s: 0, c: 0, x: 0, box: 0, due: 0 };
}

function isReview(r: Rec | undefined): boolean {
  return !!r && (r.s === 2 || r.x > 0) && r.box < 5;
}

// Random session order: shuffled pool, with due review words mixed in every few items, no repeats.
function buildDeck(pool: Word[], review: Word[]): number[] {
  const main = shuffle(pool.map((x: Word) => x.id));
  const rev = shuffle(review.map((x: Word) => x.id));
  const seen = new Set<number>();
  const out: number[] = [];
  let mi = 0;
  let ri = 0;
  while (mi < main.length || ri < rev.length) {
    let id = -1;
    if (ri < rev.length && (out.length % MIX_EVERY === MIX_EVERY - 1 || mi >= main.length)) {
      id = rev[ri++];
    } else if (mi < main.length) {
      id = main[mi++];
    }
    if (id >= 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

type Quiz = { word: Word; options: Word[]; picked: number | null; typed: string; checked: boolean; correct: boolean; fromReview: boolean };

export default function App() {
  const t = useGrokTheme();
  const [prog, setProg] = useState<Prog>({});
  const [loaded, setLoaded] = useState<boolean>(false);
  const [persist, setPersist] = useState<boolean>(true);
  const [view, setView] = useState<string>("home");
  const [tab, setTab] = useState<string>("card");
  const [level, setLevel] = useState<string>("0");
  const [unit, setUnit] = useState<number>(-1);
  const [last, setLast] = useState<Last | null>(null);
  const [skipKnown, setSkipKnown] = useState<boolean>(true);
  const [speed, setSpeed] = useState<string>("0.9");
  const [flipped, setFlipped] = useState<boolean>(false);
  const [quizMode, setQuizMode] = useState<string>("en2zh");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [session, setSession] = useState<{ c: number; n: number }>({ c: 0, n: 0 });
  const [query, setQuery] = useState<string>("");
  const [listPage, setListPage] = useState<number>(0);
  const [cardDeck, setCardDeck] = useState<number[]>([]);
  const [cardPos, setCardPos] = useState<number>(0);
  const [quizDeck, setQuizDeck] = useState<number[]>([]);
  const [quizPos, setQuizPos] = useState<number>(0);
  const [round, setRound] = useState<number>(0);
  const progRef = useRef<Prog>({});
  const setRef = useRef<{ speed: string; skip: boolean; last: Last | null }>({ speed: "0.9", skip: true, last: null });
  const [stored, setStored] = useState<string>("");
  const [backupOut, setBackupOut] = useState<string>("");
  const [backupIn, setBackupIn] = useState<string>("");
  const [backupMsg, setBackupMsg] = useState<string>("");

  useEffect(() => {
    const p = loadProg();
    progRef.current = p;
    setProg(p);
    try {
      const s = window.localStorage.getItem(SET_KEY);
      if (s) {
        const o = JSON.parse(s) as { speed?: string; skip?: boolean; last?: Last };
        if (o.last && typeof o.last.lv === "number" && o.last.lv >= 0 && o.last.lv < LEVELS.length) {
          const lu = typeof o.last.u === "number" && o.last.u >= 0 && o.last.u < unitCount(o.last.lv) ? o.last.u : -1;
          setLast({ lv: o.last.lv, u: lu });
        }
        if (o.speed) setSpeed(o.speed);
        if (typeof o.skip === "boolean") setSkipKnown(o.skip);
      }
    } catch (e) {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setRef.current = { speed, skip: skipKnown, last };
    try {
      window.localStorage.setItem(SET_KEY, JSON.stringify({ speed, skip: skipKnown, last }));
    } catch (e) {
      /* ignore */
    }
  }, [speed, skipKnown, last, loaded]);

  // Flush progress whenever the app is hidden or closed, and ask the browser to keep storage.
  useEffect(() => {
    if (!loaded) return;
    const flush = () => {
      saveProg(progRef.current);
      try {
        window.localStorage.setItem(SET_KEY, JSON.stringify(setRef.current));
      } catch (e) {
        /* ignore */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    try {
      const st = navigator.storage;
      if (st && st.persist) {
        st.persisted()
          .then((already: boolean) => (already ? true : st.persist()))
          .then((ok: boolean) => setStored(ok ? "yes" : "no"))
          .catch(() => setStored(""));
      }
    } catch (e) {
      /* ignore */
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [loaded]);

  const makeBackup = () => {
    try {
      const json = JSON.stringify({ app: "toeic7000", v: 1, t: Date.now(), p: progRef.current, s: setRef.current });
      const code = "T7K1:" + btoa(unescape(encodeURIComponent(json)));
      setBackupOut(code);
      const n = Object.keys(progRef.current).length;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          () => setBackupMsg("已複製進度碼（" + n + " 個字的紀錄），請貼到備忘錄保存。"),
          () => setBackupMsg("進度碼已產生（" + n + " 個字的紀錄），請長按下方文字框全選後複製。")
        );
      } else {
        setBackupMsg("進度碼已產生（" + n + " 個字的紀錄），請長按下方文字框全選後複製。");
      }
    } catch (e) {
      setBackupMsg("產生進度碼失敗。");
    }
  };

  const restoreBackup = () => {
    try {
      let raw = backupIn.trim();
      if (!raw) {
        setBackupMsg("請先貼上進度碼。");
        return;
      }
      if (raw.indexOf("T7K1:") === 0) raw = raw.slice(5);
      const o = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/\s+/g, ""))))) as { app?: string; p?: Prog; s?: { speed?: string; skip?: boolean; last?: Last | null } };
      if (!o || o.app !== "toeic7000" || !o.p || typeof o.p !== "object") throw new Error("bad");
      const n = Object.keys(o.p).length;
      if (!window.confirm("要用這個進度碼（" + n + " 個字的紀錄）取代目前的進度嗎？")) return;
      const next: Prog = {};
      Object.keys(o.p).forEach((k: string) => {
        const r = (o.p as Prog)[k];
        if (r && typeof r === "object") next[k] = { s: +r.s || 0, c: +r.c || 0, x: +r.x || 0, box: Math.max(0, Math.min(5, +r.box || 0)), due: +r.due || 0 };
      });
      progRef.current = next;
      setProg(next);
      setPersist(saveProg(next));
      if (o.s) {
        if (o.s.speed) setSpeed(o.s.speed);
        if (typeof o.s.skip === "boolean") setSkipKnown(o.s.skip);
        if (o.s.last && typeof o.s.last.lv === "number" && o.s.last.lv >= 0 && o.s.last.lv < LEVELS.length) setLast(o.s.last);
      }
      setRound((r: number) => r + 1);
      setBackupIn("");
      setBackupMsg("已還原 " + n + " 個字的進度。");
    } catch (e) {
      setBackupMsg("進度碼格式不對，請確認有完整貼上。");
    }
  };

  const update = useCallback((w: string, fn: (r: Rec) => Rec) => {
    setProg((p: Prog) => {
      const next: Prog = { ...p, [w]: fn(p[w] ? { ...p[w] } : emptyRec()) };
      progRef.current = next;
      setPersist(saveProg(next));
      return next;
    });
  }, []);

  const lvFilter = level === "all" ? -1 : parseInt(level, 10);
  const levelAll: Word[] = useMemo(() => (lvFilter < 0 ? WORDS : WORDS.filter((x: Word) => x.lv === lvFilter)), [lvFilter]);
  const levelWords: Word[] = useMemo(
    () => (unit < 0 || lvFilter < 0 ? levelAll : levelAll.slice(unit * UNIT, unit * UNIT + UNIT)),
    [levelAll, unit, lvFilter]
  );

  const now = Date.now();
  const reviewWords: Word[] = useMemo(() => {
    const list = WORDS.filter((x: Word) => isReview(prog[x.w]));
    const score = (x: Word): number => {
      const r = prog[x.w];
      return (r.due <= now ? 100 : 0) + r.x * 3 + (r.s === 2 ? 5 : 0) - r.box * 4 - r.c;
    };
    return list.sort((a: Word, b: Word) => score(b) - score(a));
  }, [prog, now]);
  const dueWords: Word[] = useMemo(() => reviewWords.filter((x: Word) => prog[x.w].due <= now), [reviewWords, prog, now]);

  // Rebuild the random decks when the level, the skip filter or the round changes.
  useEffect(() => {
    if (!loaded) return;
    const p = progRef.current;
    const t0 = Date.now();
    const due = levelWords.filter((x: Word) => isReview(p[x.w]) && p[x.w].due <= t0);
    const pool = levelWords.filter((x: Word) => !(skipKnown && p[x.w] && p[x.w].s === 1) && !isReview(p[x.w]));
    setCardDeck(buildDeck(pool, due));
    setCardPos(0);
    setQuizDeck(buildDeck(levelWords.filter((x: Word) => !isReview(p[x.w])), due));
    setQuizPos(0);
    setFlipped(false);
    setQuiz(null);
  }, [loaded, levelWords, skipKnown, round]);

  const stats = useMemo(() => {
    let known = 0;
    let unf = 0;
    let c = 0;
    let x = 0;
    const perLv: { known: number; learning: number }[] = LEVELS.map(() => ({ known: 0, learning: 0 }));
    const perUnit: number[][] = LEVELS.map((_: string, i: number) => new Array<number>(unitCount(i)).fill(0));
    WORDS.forEach((w: Word) => {
      const r = prog[w.w];
      if (!r) return;
      if (r.s === 1) {
        known += 1;
        perLv[w.lv].known += 1;
        perUnit[w.lv][unitOf(w)] += 1;
      } else {
        perLv[w.lv].learning += 1;
      }
      if (r.s === 2) unf += 1;
    });
    Object.keys(prog).forEach((k: string) => {
      c += prog[k].c;
      x += prog[k].x;
    });
    return { known, unf, c, x, perLv, perUnit };
  }, [prog]);

  const sp = parseFloat(speed);
  const cur: Word | undefined = cardPos < cardDeck.length ? WORDS[cardDeck[cardPos]] : undefined;

  const nextCard = () => {
    setCardPos((i: number) => i + 1);
    setFlipped(false);
  };
  const prevCard = () => {
    setCardPos((i: number) => Math.max(0, i - 1));
    setFlipped(false);
  };

  const mark = (w: Word, s: number) => {
    update(w.w, (r: Rec) => {
      r.s = s;
      if (s === 2) {
        r.box = 0;
        r.due = Date.now();
      }
      return r;
    });
    nextCard();
  };

  const makeQuiz = (word: Word, fromReview: boolean): Quiz => {
    const sameLevel = WORDS.filter((x: Word) => x.lv === word.lv && x.w !== word.w && x.zh !== word.zh);
    const firstPos = word.pos.split("/")[0];
    const samePos = sameLevel.filter((x: Word) => x.pos.split("/")[0] === firstPos);
    const src = samePos.length >= 10 ? samePos : sameLevel;
    const picked: Word[] = [];
    let guard = 0;
    while (picked.length < 3 && guard < 200) {
      guard += 1;
      const cand = src[Math.floor(Math.random() * src.length)];
      if (!picked.some((p: Word) => p.w === cand.w || p.zh === cand.zh)) picked.push(cand);
    }
    return { word, options: shuffle([word, ...picked]), picked: null, typed: "", checked: false, correct: false, fromReview };
  };

  const reviewDeckRef = useRef<{ ids: number[]; pos: number }>({ ids: [], pos: 0 });

  const nextQuiz = () => {
    if (view === "review") {
      const rd = reviewDeckRef.current;
      if (rd.pos >= rd.ids.length) {
        rd.ids = shuffle(reviewWords.map((x: Word) => x.id));
        rd.pos = 0;
      }
      if (!rd.ids.length) return;
      const w = WORDS[rd.ids[rd.pos]];
      rd.pos += 1;
      setQuiz(makeQuiz(w, true));
      return;
    }
    if (!quizDeck.length) return;
    let pos = quizPos;
    if (pos >= quizDeck.length) {
      setRound((r: number) => r + 1);
      return;
    }
    const w = WORDS[quizDeck[pos]];
    pos += 1;
    setQuizPos(pos);
    setQuiz(makeQuiz(w, isReview(progRef.current[w.w])));
  };

  const record = (w: Word, ok: boolean) => {
    update(w.w, (r: Rec) => {
      if (ok) {
        r.c += 1;
        r.box = Math.min(5, r.box + 1);
        r.due = Date.now() + BOX_DAYS[r.box] * DAY;
        if (r.box >= 3 && r.s === 2) r.s = 1;
      } else {
        r.x += 1;
        r.box = 0;
        r.due = Date.now();
        r.s = 2;
      }
      return r;
    });
    setSession((s: { c: number; n: number }) => ({ c: s.c + (ok ? 1 : 0), n: s.n + 1 }));
  };

  const answer = (i: number) => {
    if (!quiz || quiz.checked) return;
    const ok = quiz.options[i].w === quiz.word.w;
    setQuiz({ ...quiz, picked: i, checked: true, correct: ok });
    record(quiz.word, ok);
    speak(quiz.word.w, sp);
  };

  const checkSpell = () => {
    if (!quiz || quiz.checked) return;
    const ok = quiz.typed.trim().toLowerCase() === quiz.word.w.toLowerCase();
    setQuiz({ ...quiz, checked: true, correct: ok });
    record(quiz.word, ok);
    speak(quiz.word.w, sp);
  };

  const searchResults: Word[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = WORDS.filter((x: Word) => x.w.toLowerCase().startsWith(q));
    const contains = WORDS.filter((x: Word) => !x.w.toLowerCase().startsWith(q) && (x.w.toLowerCase().includes(q) || x.zh.includes(query.trim())));
    return starts.concat(contains).slice(0, 50);
  }, [query]);

  const accuracy = stats.c + stats.x ? Math.round((stats.c / (stats.c + stats.x)) * 100) + "%" : "—";

  const statusLabel = (w: Word): string => {
    const r = prog[w.w];
    if (!r) return "未學";
    if (r.s === 1) return "已掌握";
    if (r.s === 2) return "不熟";
    return "學習中";
  };

  const btn = (label: string, onClick: () => void, opts?: { state?: "right" | "wrong" | "dim"; big?: boolean }) => {
    const state = opts && opts.state;
    const border = state === "right" ? t.text.success : state === "wrong" ? t.text.danger : t.border.default;
    const bg = state === "right" ? t.fill.successSubtle : state === "wrong" ? t.fill.dangerSubtle : t.bg.elevated;
    return (
      <button
        key={label}
        onClick={onClick}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          borderRadius: t.radius.lg,
          border: "1px solid " + border,
          background: bg,
          color: t.text.primary,
          fontFamily: t.font.family,
          fontSize: opts && opts.big ? t.font.heading3.fontSize : t.font.body1.fontSize,
          lineHeight: t.font.body1.lineHeight,
          cursor: "pointer",
          opacity: state === "dim" ? 0.55 : 1,
          boxSizing: "border-box",
        }}
      >
        {label}
      </button>
    );
  };

  const tag = (label: string) => (
    <span
      key={label}
      style={{
        border: "1px solid " + t.border.default,
        borderRadius: t.radius.md,
        padding: "2px 8px",
        color: t.text.secondary,
        fontSize: t.font.label.fontSize,
        lineHeight: t.font.label.lineHeight,
      }}
    >
      {label}
    </span>
  );

  const row = (children: ReactNode[]) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>;

  const muted = (s: string) => <span style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize }}>{s}</span>;

  const card = (w: Word) => {
    const r = prog[w.w];
    const isRev = isReview(r);
    return (
      <div
        onClick={() => setFlipped((f: boolean) => !f)}
        style={{
          border: "1px solid " + t.border.default,
          borderRadius: t.radius.xl,
          background: t.bg.elevated,
          padding: "28px 20px",
          minHeight: 230,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          cursor: "pointer",
          gap: 12,
          boxSizing: "border-box",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {[tag(LEVELS[w.lv] + "・" + BANDS[w.lv]), ...(w.pos ? [tag(w.pos)] : []), tag(isRev ? "複習" : statusLabel(w))]}
        </div>
        <div style={{ color: t.text.primary, fontSize: "36px", lineHeight: "44px", fontWeight: t.weight.semibold, wordBreak: "break-word" }}>{w.w}</div>
        {flipped ? (
          <div style={{ color: t.text.primary, fontSize: t.font.heading2.fontSize, lineHeight: t.font.heading2.lineHeight, fontWeight: t.weight.medium }}>{w.zh}</div>
        ) : (
          <div style={{ color: t.text.tertiary, fontSize: t.font.label.fontSize }}>點一下卡片看中文</div>
        )}
      </div>
    );
  };

  const quizBlock = () => {
    if (!quiz) return null;
    const w = quiz.word;
    const prompt = quizMode === "en2zh" ? w.w : w.zh;
    const right = quiz.options.findIndex((o: Word) => o.w === w.w);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ border: "1px solid " + t.border.default, borderRadius: t.radius.xl, background: t.bg.elevated, padding: "22px 18px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {[tag(quizMode === "en2zh" ? "選出中文意思" : quizMode === "zh2en" ? "選出英文單字" : "拼出英文單字"), ...(w.pos ? [tag(w.pos)] : []), tag(LEVELS[w.lv]), ...(quiz.fromReview ? [tag("複習")] : [])]}
          </div>
          <div style={{ color: t.text.primary, fontSize: quizMode === "en2zh" ? "32px" : t.font.heading2.fontSize, lineHeight: "1.35", fontWeight: t.weight.semibold, wordBreak: "break-word" }}>{prompt}</div>
          {quizMode === "spell" ? <div style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize }}>提示：{w.w.length} 個字母，開頭是「{w.w[0]}」</div> : null}
        </div>
        {quizMode === "spell" ? (
          <input
            value={quiz.typed}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="輸入英文後按 Enter"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuiz({ ...quiz, typed: e.target.value })}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                if (quiz.checked) nextQuiz();
                else checkSpell();
              }
            }}
            style={{
              padding: "12px 14px",
              borderRadius: t.radius.lg,
              border: "1px solid " + (quiz.checked ? (quiz.correct ? t.text.success : t.text.danger) : t.border.default),
              background: t.bg.base,
              color: t.text.primary,
              fontFamily: t.font.family,
              fontSize: t.font.heading3.fontSize,
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
            {quiz.options.map((o: Word, i: number) =>
              btn(
                String.fromCharCode(65 + i) + ". " + (quizMode === "en2zh" ? o.zh : o.w),
                () => answer(i),
                quiz.checked ? { state: i === right ? "right" : i === quiz.picked ? "wrong" : "dim" } : undefined
              )
            )}
          </div>
        )}
        {quiz.checked ? (
          <div style={{ border: "1px solid " + t.border.default, borderRadius: t.radius.lg, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: quiz.correct ? t.text.success : t.text.danger, fontWeight: t.weight.semibold }}>{quiz.correct ? "答對了！" : "答錯了，已加入錯題本"}</div>
            <div style={{ color: t.text.primary }}>
              {w.w}（{w.pos}）{w.zh}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const quizControls = (startLabel: string) =>
    row([
      <Button key="go" variant="primary" label={quiz ? (quiz.checked ? "下一題 ▶" : "跳過") : startLabel} onClick={nextQuiz} />,
      ...(quiz ? [<Button key="sp" label="發音" onClick={() => speak(quiz.word.w, sp)} />] : []),
      ...(quiz && quizMode === "spell" && !quiz.checked ? [<Button key="ck" label="檢查答案" onClick={checkSpell} />] : []),
    ]);

  const modeSwitch = (
    <Segmented
      options={[
        { value: "en2zh", label: "英 → 中" },
        { value: "zh2en", label: "中 → 英" },
        { value: "spell", label: "拼字" },
      ]}
      value={quizMode}
      onChange={(v: string) => {
        setQuizMode(v);
        setQuiz(null);
      }}
    />
  );

  const bar = (label: string, known: number, learning: number, total: number) => {
    const kp = total ? (known / total) * 100 : 0;
    const lp = total ? (learning / total) * 100 : 0;
    return (
      <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, color: t.text.primary, fontSize: t.font.body2.fontSize }}>
          <span>{label}</span>
          <span style={{ color: t.text.secondary }}>
            已掌握 {known.toLocaleString()}・學習中 {learning.toLocaleString()}・共 {total.toLocaleString()}
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: t.border.subtle, overflow: "hidden", display: "flex" }}>
          <div style={{ width: kp + "%", background: t.dataviz.categorical[0] }} />
          <div style={{ width: lp + "%", background: t.dataviz.categorical[1] }} />
        </div>
      </div>
    );
  };

  const listSrc: Word[] = levelWords.slice(listPage * 100, listPage * 100 + 100);
  const listPages = Math.max(1, Math.ceil(levelWords.length / 100));
  const lvIdx = lvFilter < 0 ? 0 : lvFilter;

  const goTop = () => {
    try {
      window.scrollTo(0, 0);
    } catch (e) {
      // ignore
    }
  };
  const enter = (lv: number, u: number) => {
    setLevel(String(lv));
    setUnit(u);
    setLast({ lv, u });
    setView("level");
    setListPage(0);
    setQuiz(null);
    setSession({ c: 0, n: 0 });
    goTop();
  };
  const go = (v: string) => {
    setView(v);
    setQuiz(null);
    goTop();
  };

  const unitSize = (lv: number, u: number): number => Math.min(UNIT, LV_COUNT[lv] - u * UNIT);
  const unitLabel = (lv: number, u: number): string => LEVELS[lv] + (u < 0 ? "・整級隨機" : "・單元 " + (u + 1));
  const scopeKnown = levelWords.filter((x: Word) => prog[x.w] && prog[x.w].s === 1).length;

  const pbar = (known: number, total: number, h: number) => (
    <div style={{ height: h, borderRadius: h / 2, background: t.border.subtle, overflow: "hidden" }}>
      <div style={{ width: (total ? (known / total) * 100 : 0) + "%", height: "100%", background: t.dataviz.categorical[0] }} />
    </div>
  );

  const tileBase = {
    display: "flex",
    flexDirection: "column" as const,
    textAlign: "left" as const,
    background: t.bg.elevated,
    color: t.text.primary,
    fontFamily: t.font.family,
    cursor: "pointer",
    boxSizing: "border-box" as const,
    width: "100%",
  };

  const levelCard = (i: number) => {
    const total = LV_COUNT[i];
    const k = stats.perLv[i].known;
    return (
      <button
        key={"lv" + i}
        onClick={() => enter(i, -1)}
        style={{ ...tileBase, gap: 10, padding: "20px 18px", borderRadius: t.radius.xl, border: "1px solid " + t.border.default }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "30px", lineHeight: "38px", fontWeight: t.weight.semibold }}>{LEVELS[i]}</span>
          <span style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize }}>{BANDS[i]}</span>
        </div>
        <div style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize }}>{total.toLocaleString() + " 字・" + unitCount(i) + " 個單元"}</div>
        {pbar(k, total, 8)}
        <div style={{ color: t.text.secondary, fontSize: t.font.label.fontSize }}>
          {"已認識 " + k.toLocaleString() + " / " + total.toLocaleString() + "（" + Math.round((k / total) * 100) + "%）"}
        </div>
      </button>
    );
  };

  const unitTile = (lv: number, u: number) => {
    const size = unitSize(lv, u);
    const k = stats.perUnit[lv][u];
    const on = view === "level" && unit === u;
    const first = WORDS[LV_START[lv] + u * UNIT];
    const lastW = WORDS[LV_START[lv] + u * UNIT + size - 1];
    return (
      <button
        key={"u" + u}
        onClick={() => enter(lv, u)}
        style={{
          ...tileBase,
          gap: 6,
          padding: "12px",
          borderRadius: t.radius.lg,
          border: (on ? "2px solid " + t.text.accent : "1px solid " + t.border.default),
        }}
      >
        <span style={{ fontWeight: t.weight.semibold, color: on ? t.text.accent : t.text.primary }}>{"單元 " + (u + 1)}</span>
        <span style={{ color: t.text.secondary, fontSize: t.font.label.fontSize }}>{first.w + " – " + lastW.w}</span>
        {pbar(k, size, 6)}
        <span style={{ color: t.text.secondary, fontSize: t.font.label.fontSize }}>{k + " / " + size}</span>
      </button>
    );
  };

  const backHome = row([<Button key="bh" label="◀ 回首頁" onClick={() => go("home")} />]);

  const speedControl = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {muted("發音速度")}
      <Segmented
        options={[
          { value: "0.6", label: "0.6×" },
          { value: "0.75", label: "0.75×" },
          { value: "0.9", label: "0.9×" },
          { value: "1.1", label: "1.1×" },
        ]}
        value={speed}
        onChange={(v: string) => setSpeed(v)}
      />
    </div>
  );

  const practiceTab = tab === "quiz" ? quizMode : tab;
  const scopeName = unitLabel(lvIdx, unit);

  const practiceBody = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Segmented
        options={[
          { value: "card", label: "單字卡" },
          { value: "en2zh", label: "英 → 中" },
          { value: "zh2en", label: "中 → 英" },
          { value: "spell", label: "拼字" },
          { value: "list", label: "單字表" },
        ]}
        value={practiceTab}
        onChange={(v: string) => {
          if (v === "card" || v === "list") setTab(v);
          else {
            setTab("quiz");
            setQuizMode(v);
          }
          setQuiz(null);
        }}
      />

      {tab === "card" && cur ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {muted("隨機第 " + (cardPos + 1) + " 張・本輪還有 " + (cardDeck.length - cardPos - 1).toLocaleString() + " 張不重複")}
          {card(cur)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {btn("✓ 認識", () => mark(cur, 1), { big: true })}
            {btn("✗ 不熟", () => mark(cur, 2), { big: true })}
          </div>
          {row([
            <Button key="s" variant="primary" label="發音" onClick={() => speak(cur.w, sp)} />,
            <Button key="p" label="◀ 上一張" onClick={prevCard} />,
            <Button key="n" label="跳過 ▶" onClick={nextCard} />,
            <Button key="r" label="重新洗牌" onClick={() => setRound((r: number) => r + 1)} />,
          ])}
          <Toggle label="跳過已認識的字" value={skipKnown} onChange={(v: boolean) => setSkipKnown(v)} />
        </div>
      ) : null}
      {tab === "card" && !cur && loaded ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Text>這個範圍的字這一輪都看完了。按「重新洗牌」再來一輪，或換一個單元。</Text>
          {row([<Button key="r" variant="primary" label="重新洗牌" onClick={() => setRound((r: number) => r + 1)} />])}
          <Toggle label="跳過已認識的字" value={skipKnown} onChange={(v: boolean) => setSkipKnown(v)} />
        </div>
      ) : null}

      {tab === "quiz" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {muted("從「" + scopeName + "」隨機出題，同一輪不重複，每 " + MIX_EVERY + " 題穿插一題到期的複習字。")}
          {quizBlock()}
          {quizControls("開始測驗")}
          {session.n ? muted("這次練習：答對 " + session.c + " / " + session.n + " 題") : null}
        </div>
      ) : null}

      {tab === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Table
            columns={["單字", "中文", "狀態", ""]}
            rows={listSrc.map((x: Word) => [
              x.w + "  " + x.pos,
              x.zh,
              statusLabel(x),
              <span key={x.id} onClick={() => speak(x.w, sp)} style={{ cursor: "pointer", color: t.text.accent, fontSize: t.font.body1.fontSize }}>
                發音
              </span>,
            ])}
          />
          {listPages > 1
            ? row([
                <Button key="lp" label="◀ 上一頁" onClick={() => setListPage((p: number) => Math.max(0, p - 1))} />,
                muted("第 " + (listPage + 1) + " / " + listPages + " 頁"),
                <Button key="ln" label="下一頁 ▶" onClick={() => setListPage((p: number) => Math.min(listPages - 1, p + 1))} />,
              ])
            : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <Page
      title="多益單字練習"
      summary={"共 " + WORDS.length.toLocaleString() + " 個多益單字，分基礎到高階四級，每 100 字一個單元。選級數或單元練習，每次都重新隨機出題，不熟和答錯的字會依間隔複習穿插出現。"}
      width="column"
      sources={["kknono668/toeic-vocab-tw（Hugging Face，CC BY-SA 4.0）https://huggingface.co/datasets/kknono668/toeic-vocab-tw"]}
    >
      {view === "home" ? (
        <Section heading="選擇級數">
          {last
            ? row([<Button key="cont" variant="primary" label={"▶ 繼續上次：" + unitLabel(last.lv, last.u)} onClick={() => enter(last.lv, last.u)} />])
            : <Text>點一個級數進去，每 100 字分成一個單元，可以一個單元一個單元練，也可以整級隨機。</Text>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {LEVELS.map((_: string, i: number) => levelCard(i))}
          </div>
        </Section>
      ) : null}

      {view === "home" ? (
        <Section heading="學習進度">
          <Metrics
            metrics={[
              { value: stats.known.toLocaleString(), label: "已認識", detail: "共 " + WORDS.length.toLocaleString() + " 字" },
              { value: String(stats.unf), label: "不熟" },
              { value: accuracy, label: "測驗正確率", detail: stats.c + stats.x ? "共答 " + (stats.c + stats.x) + " 題" : undefined },
              { value: String(dueWords.length), label: "今天待複習" },
            ]}
          />
          {row([
            <Button key="rv" label={"錯題本（" + reviewWords.length + "）"} onClick={() => go("review")} />,
            <Button key="sr" label="搜尋單字" onClick={() => go("search")} />,
          ])}
          {speedControl}
          {muted("每答一題就自動存檔在這支手機上；畫面會跟著手機切換淺色或深色模式。")}
          {!persist ? <Callout tone="info">這個瀏覽器不允許儲存資料（例如無痕模式），進度只會保留到關閉頁面為止。</Callout> : null}
        </Section>
      ) : null}

      {view === "home" ? (
        <Section heading="備份進度">
          {muted("換手機、換瀏覽器或清除資料前，先匯出進度碼存到備忘錄；之後貼回來就能還原。" + (stored === "yes" ? "（已向瀏覽器申請長期保存資料）" : ""))}
          {row([<Button key="ex" label="匯出進度碼" onClick={makeBackup} />])}
          {backupOut ? (
            <textarea
              readOnly
              value={backupOut}
              onFocus={(e: React.FocusEvent<HTMLTextAreaElement>) => e.target.select()}
              rows={3}
              className="code"
            />
          ) : null}
          <textarea
            value={backupIn}
            placeholder="在這裡貼上進度碼"
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBackupIn(e.target.value)}
            rows={3}
            className="code"
          />
          {row([<Button key="im" label="匯入進度" onClick={restoreBackup} />])}
          {backupMsg ? muted(backupMsg) : null}
        </Section>
      ) : null}

      {view === "level" ? (
        <Section heading={LEVELS[lvIdx] + "（" + BANDS[lvIdx] + "）"}>
          {backHome}
          {muted(LV_COUNT[lvIdx].toLocaleString() + " 字，依字母順序固定分成 " + unitCount(lvIdx) + " 個單元・已認識 " + stats.perLv[lvIdx].known.toLocaleString() + " / " + LV_COUNT[lvIdx].toLocaleString())}
          {pbar(stats.perLv[lvIdx].known, LV_COUNT[lvIdx], 8)}
          <button
            onClick={() => enter(lvIdx, -1)}
            style={{ ...tileBase, gap: 4, padding: "14px", borderRadius: t.radius.lg, border: unit < 0 ? "2px solid " + t.text.accent : "1px solid " + t.border.default }}
          >
            <span style={{ fontWeight: t.weight.semibold, color: unit < 0 ? t.text.accent : t.text.primary }}>整級隨機練習</span>
            <span style={{ color: t.text.secondary, fontSize: t.font.label.fontSize }}>{"全部 " + LV_COUNT[lvIdx].toLocaleString() + " 字一起洗牌"}</span>
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
            {Array.from({ length: unitCount(lvIdx) }, (_: unknown, u: number) => unitTile(lvIdx, u))}
          </div>
        </Section>
      ) : null}

      {view === "level" ? (
        <Section heading={"練習：" + scopeName}>
          {muted("這個範圍 " + levelWords.length.toLocaleString() + " 字，已認識 " + scopeKnown + " 字；每次進來都重新洗牌，不熟和答錯的字會進錯題本。")}
          {practiceBody}
          {speedControl}
        </Section>
      ) : null}

      {view === "search" ? (
        <Section heading="搜尋單字">
          {backHome}
          <Input label="搜尋單字（英文或中文）" value={query} onChange={(v: string) => setQuery(v)} placeholder="例如 invoice、會議" />
          {query.trim() ? (
            <Table
              columns={["單字", "中文", "位置", ""]}
              rows={searchResults.map((x: Word) => [
                x.w + "  " + x.pos,
                x.zh,
                LEVELS[x.lv] + "・單元 " + (unitOf(x) + 1) + "・" + statusLabel(x),
                <span key={x.id} style={{ display: "inline-flex", gap: 12, fontSize: t.font.body1.fontSize }}>
                  <span onClick={() => speak(x.w, sp)} style={{ cursor: "pointer", color: t.text.accent }}>發音</span>
                  <span onClick={() => enter(x.lv, unitOf(x))} style={{ cursor: "pointer", color: t.text.accent }}>去練習</span>
                </span>,
              ])}
            />
          ) : (
            muted("輸入英文或中文，會列出單字所在的級數和單元。")
          )}
          {query.trim() && searchResults.length === 50 ? muted("只顯示前 50 筆，打更多字母縮小範圍") : null}
        </Section>
      ) : null}

      {view === "review" ? (
        <Section heading="錯題本">
          {backHome}
          {reviewWords.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Text>{"錯題本有 " + reviewWords.length + " 個字（不分級數），其中 " + dueWords.length + " 個今天到期。連續答對會拉長下次複習的間隔（1、3、7、14、30 天），答錯就從頭開始。"}</Text>
              {modeSwitch}
              {quizBlock()}
              {quizControls("開始複習")}
              <Table
                columns={["單字", "中文", "答錯", "下次複習"]}
                rows={reviewWords.slice(0, 60).map((x: Word) => {
                  const r = prog[x.w];
                  const days = Math.ceil((r.due - now) / DAY);
                  return [x.w + "  " + x.pos, x.zh, String(r.x), r.due <= now ? { text: "今天", tone: "warning" as const } : days + " 天後"];
                })}
              />
            </div>
          ) : (
            <Text>錯題本目前是空的。單字卡按「不熟」或測驗答錯的字，會自動收進這裡。</Text>
          )}
        </Section>
      ) : null}
    </Page>
  );
}
