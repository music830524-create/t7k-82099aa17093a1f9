import * as React from "react";
import { Word, LEVELS, BANDS, WORDS } from "./words";
import { lookupSentence, lookupToken, Tok } from "./lookup";

type Rec = { s: number; c: number; x: number; box: number; due: number };
type Prog = Record<string, Rec>;
import { KK } from "./kk";
import { ReactNode, ChangeEvent, KeyboardEvent, Page, Section, Text, Metrics, Segmented, Toggle, Input, Button, Table, Callout, useState, useEffect, useMemo, useCallback, useRef, useGrokTheme } from "./kit";

const KK_LIST: string[] = KK.split("|");
const kkOf = (w: Word): string => KK_LIST[w.id] || "";

const LV_COUNT: number[] = LEVELS.map((_: string, i: number) => WORDS.filter((x: Word) => x.lv === i).length);
const UNIT = 100;
const LV_START: number[] = LEVELS.map((_: string, i: number) => WORDS.findIndex((x: Word) => x.lv === i));
const unitCount = (lv: number): number => Math.ceil(LV_COUNT[lv] / UNIT);
const unitOf = (w: Word): number => Math.floor((w.id - LV_START[w.lv]) / UNIT);

// Example sentences live in ex/{lv}-{unit}.json (one file per 100-word unit), fetched on demand.
type Ex = [string, string];
const exChunks: Record<string, Ex[][]> = {};
const exPending: Record<string, Promise<void> | undefined> = {};
const exListeners = new Set<() => void>();
const chunkKey = (lv: number, u: number): string => lv + "-" + u;
function loadChunk(lv: number, u: number): Promise<void> {
  const k = chunkKey(lv, u);
  if (exChunks[k]) return Promise.resolve();
  const p0 = exPending[k];
  if (p0) return p0;
  const p = fetch("ex/" + k + ".json")
    .then((r: Response) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((d: Ex[][]) => {
      exChunks[k] = d;
      exListeners.forEach((f: () => void) => f());
    })
    .catch(() => {
      /* offline and not cached yet */
    })
    .then(() => {
      exPending[k] = undefined;
    });
  exPending[k] = p;
  return p;
}
function examplesOf(w: Word): Ex[] | null {
  const u = unitOf(w);
  const c = exChunks[chunkKey(w.lv, u)];
  if (!c) {
    loadChunk(w.lv, u);
    return null;
  }
  return c[w.id - LV_START[w.lv] - u * UNIT] || [];
}
// Quietly fetch every chunk once so examples work offline (the service worker keeps them).
function warmAllChunks(): void {
  try {
    const c = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (c && c.saveData) return;
  } catch (e) {
    /* ignore */
  }
  const keys: [number, number][] = [];
  LEVELS.forEach((_: string, lv: number) => {
    for (let u = 0; u < unitCount(lv); u++) keys.push([lv, u]);
  });
  let i = 0;
  const next = () => {
    if (i >= keys.length) return;
    const [lv, u] = keys[i++];
    loadChunk(lv, u).then(() => setTimeout(next, 150));
  };
  next();
}
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

// 生字本: words tapped in example sentences that are not in the 7,010 list (separate key; progress format untouched).
type Extra = { w: string; s: string; t: number };
const EXTRA_KEY = "toeic7000_extra_v1";
function cleanExtra(a: unknown): Extra[] {
  if (!Array.isArray(a)) return [];
  return a
    .filter((x: unknown) => x && typeof (x as Extra).w === "string")
    .map((x: unknown) => ({ w: String((x as Extra).w).slice(0, 60), s: String((x as Extra).s || "").slice(0, 400), t: +(x as Extra).t || 0 }));
}
function loadExtra(): Extra[] {
  try {
    return cleanExtra(JSON.parse(window.localStorage.getItem(EXTRA_KEY) || "[]"));
  } catch (e) {
    return [];
  }
}
function saveExtra(a: Extra[]): void {
  try {
    window.localStorage.setItem(EXTRA_KEY, JSON.stringify(a));
  } catch (e) {
    /* ignore */
  }
}
const tokCache: Record<string, Tok[]> = {};
const toksOf = (s: string): Tok[] => tokCache[s] || (tokCache[s] = lookupSentence(s));
type Look = { tok: string; hits: Word[]; i: number; sent: string };

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
  const [, setExTick] = useState<number>(0);
  const [detail, setDetail] = useState<Word | null>(null);
  const [look, setLook] = useState<Look[]>([]);
  const [lookMsg, setLookMsg] = useState<string>("");
  const [extra, setExtra] = useState<Extra[]>([]);
  useEffect(() => {
    const f = () => setExTick((n: number) => n + 1);
    exListeners.add(f);
    const tm = setTimeout(warmAllChunks, 4000);
    return () => {
      exListeners.delete(f);
      clearTimeout(tm);
    };
  }, []);
  const [quizMode, setQuizMode] = useState<string>("en2zh");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [session, setSession] = useState<{ c: number; n: number }>({ c: 0, n: 0 });
  const [query, setQuery] = useState<string>(""); // debounced copy of qIn, drives the home search results
  const [qIn, setQIn] = useState<string>("");
  const [sMsg, setSMsg] = useState<string>("");
  const [sk, setSk] = useState<string>("unf"); // which stat card opened the "set" view: known | unf | due | acc
  const [sTab, setSTab] = useState<string>("list");
  const [sDeck, setSDeck] = useState<number[]>([]);
  const [sPos, setSPos] = useState<number>(0);
  const [sMore, setSMore] = useState<number>(40);
  const sQuizRef = useRef<{ ids: number[]; pos: number }>({ ids: [], pos: 0 });
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
    setExtra(loadExtra());
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
      const json = JSON.stringify({ app: "toeic7000", v: 1, t: Date.now(), p: progRef.current, s: setRef.current, e: extra });
      const code = "T7K1:" + btoa(unescape(encodeURIComponent(json)));
      setBackupOut(code);
      const n = Object.keys(progRef.current).length + " 個字的紀錄" + (extra.length ? "、生字本 " + extra.length + " 個字" : "");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          () => setBackupMsg("已複製進度碼（" + n + "），請貼到備忘錄保存。"),
          () => setBackupMsg("進度碼已產生（" + n + "），請長按下方文字框全選後複製。")
        );
      } else {
        setBackupMsg("進度碼已產生（" + n + "），請長按下方文字框全選後複製。");
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
      const o = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/\s+/g, ""))))) as { app?: string; p?: Prog; s?: { speed?: string; skip?: boolean; last?: Last | null }; e?: unknown };
      if (!o || o.app !== "toeic7000" || !o.p || typeof o.p !== "object") throw new Error("bad");
      const n = Object.keys(o.p).length;
      const ex = Array.isArray(o.e) ? cleanExtra(o.e) : null; // codes made before 生字本 existed have no "e": keep the current list
      if (!window.confirm("要用這個進度碼（" + n + " 個字的紀錄" + (ex ? "、生字本 " + ex.length + " 個字" : "") + "）取代目前的進度嗎？")) return;
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
      if (ex) {
        setExtra(ex);
        saveExtra(ex);
      }
      setRound((r: number) => r + 1);
      setBackupIn("");
      setBackupMsg("已還原 " + n + " 個字的進度" + (ex ? "與生字本 " + ex.length + " 個字" : "") + "。");
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

  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(qIn);
      setSMsg("");
    }, 120);
    return () => window.clearTimeout(id);
  }, [qIn]);

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

  const setOf = (kind: string): Word[] => {
    const p = prog;
    if (kind === "known") return WORDS.filter((x: Word) => p[x.w] && p[x.w].s === 1);
    if (kind === "unf") return WORDS.filter((x: Word) => p[x.w] && p[x.w].s === 2).sort((a: Word, b: Word) => p[b.w].x - p[a.w].x);
    if (kind === "due") return dueWords;
    return WORDS.filter((x: Word) => p[x.w] && p[x.w].x > 0).sort((a: Word, b: Word) => p[b.w].x - p[a.w].x || p[a.w].c - p[b.w].c);
  };
  const setWords: Word[] = useMemo(() => setOf(sk), [sk, prog, dueWords]);

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

  const setStatus = (w: Word, s: number) =>
    update(w.w, (r: Rec) => {
      r.s = s;
      if (s === 2) {
        r.box = 0;
        r.due = Date.now();
      }
      return r;
    });
  const mark = (w: Word, s: number) => {
    setStatus(w, s);
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
    if (view === "set") {
      const rd = sQuizRef.current;
      if (rd.pos >= rd.ids.length) {
        rd.ids = shuffle(setWords.map((x: Word) => x.id));
        rd.pos = 0;
      }
      if (!rd.ids.length) {
        setQuiz(null);
        return;
      }
      const w = WORDS[rd.ids[rd.pos]];
      rd.pos += 1;
      setQuiz(makeQuiz(w, isReview(progRef.current[w.w])));
      return;
    }
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

  const search = useMemo(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();
    if (!q) return { res: [] as Word[], infl: [] as Word[], ext: [] as Extra[], eng: false };
    const eng = /^[A-Za-z][A-Za-z'’-]*$/.test(raw);
    const exact = WORDS.filter((x: Word) => x.w.toLowerCase() === q);
    const starts = WORDS.filter((x: Word) => x.w.toLowerCase() !== q && x.w.toLowerCase().startsWith(q));
    const contains = WORDS.filter((x: Word) => !x.w.toLowerCase().startsWith(q) && (x.w.toLowerCase().includes(q) || x.zh.includes(raw)));
    const res = exact.concat(starts, contains).slice(0, 50);
    const infl = eng && !exact.length ? lookupToken(raw).filter((h: Word) => res.indexOf(h) < 0) : [];
    const ext = extra.filter((x: Extra) => x.w.toLowerCase().includes(q));
    return { res, infl, ext, eng };
  }, [query, extra]);

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

  // Two example sentences with Traditional Chinese; tap a sentence to hear it.
  const exBlock = (w: Word, align?: "center" | "left") => {
    const ex = examplesOf(w);
    return (
      <div className="ex" data-word={w.w} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", textAlign: align === "center" ? "center" : "left" }}>
        {ex === null ? (
          <div style={{ color: t.text.tertiary, fontSize: t.font.label.fontSize }}>例句載入中…</div>
        ) : ex.length === 0 ? null : (
          ex.map((e: Ex, i: number) => (
            <div
              key={i}
              className="ex-item"
              onClick={(ev: React.MouseEvent) => {
                ev.stopPropagation();
                speak(e[0], sp);
              }}
              style={{ cursor: "pointer", padding: "8px 10px", borderRadius: t.radius.lg, background: t.bg.base, border: "1px solid " + t.border.default }}
            >
              <div className="ex-en" style={{ color: t.text.primary, fontSize: t.font.body1.fontSize, lineHeight: 1.6 }}>
                <button className="ex-say" aria-label="播放例句" onClick={(ev: React.MouseEvent) => { ev.stopPropagation(); speak(e[0], sp); }}>🔊</button>
                {toksOf(e[0]).map((x: Tok, j: number) =>
                  /^[A-Za-z]/.test(x.t) ? (
                    <span
                      key={j}
                      className={"tw" + (x.hits.length ? " hit" : "")}
                      data-hw={x.hits.length ? x.hits[0].w : ""}
                      onClick={(ev: React.MouseEvent) => {
                        ev.stopPropagation();
                        setLookMsg("");
                        setLook((st: Look[]) => st.concat({ tok: x.t, hits: x.hits, i: 0, sent: e[0] }));
                      }}
                    >
                      {x.t}
                    </span>
                  ) : (
                    x.t
                  )
                )}
              </div>
              <div className="ex-zh" style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize, lineHeight: 1.45, marginTop: 2 }}>{e[1]}</div>
            </div>
          ))
        )}
      </div>
    );
  };
  const kkEl = (w: Word, size?: string) => {
    const k = kkOf(w);
    return k ? <span className="kk" data-word={w.w} style={size ? { fontSize: size } : undefined}>[{k}]</span> : null;
  };
  const wordCell = (x: Word) => (
    <span key={"wc" + x.id} style={{ display: "inline-flex", flexDirection: "column" }}>
      <span>{x.w + "  " + x.pos}</span>
      {kkEl(x, "13px")}
    </span>
  );
  const wordLink = (x: Word) => (
    <span key={"wl" + x.id} className="wlink" onClick={() => setDetail(x)} style={{ cursor: "pointer", color: t.text.accent }}>
      例句
    </span>
  );
  const wordRow = (x: Word, sub?: string) => (
    <button key={"wr" + x.id} className="srow" data-w={x.w} onClick={() => setDetail(x)}>
      <span className="l">
        <span>
          <span className="w">{x.w}</span> <span className="pos">{x.pos}</span> {kkEl(x, "13px")}
        </span>
        <span className="zh">{x.zh}</span>
        <span className="st">{sub !== undefined ? sub : LEVELS[x.lv] + "・" + statusLabel(x)}</span>
      </span>
    </button>
  );
  const detailSheet = detail ? (
    <div
      className="sheet-bg"
      onClick={() => setDetail(null)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        className="sheet"
        onClick={(ev: React.MouseEvent) => ev.stopPropagation()}
        style={{ background: t.bg.elevated, color: t.text.primary, width: "100%", maxWidth: 640, maxHeight: "80vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom))", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span onClick={() => speak(detail.w, sp)} style={{ fontSize: "26px", fontWeight: t.weight.semibold, cursor: "pointer" }}>{detail.w}</span>
          {kkEl(detail, "17px")}
          <span style={{ color: t.text.secondary }}>{detail.pos}</span>
          <span style={{ color: t.text.primary }}>{detail.zh}</span>
        </div>
        {muted(LEVELS[detail.lv] + "・單元 " + (unitOf(detail) + 1) + "・" + statusLabel(detail) + "・點 🔊 聽例句，點例句中的字可查")}
        {exBlock(detail)}
        {row([
          <Button key="du" variant={prog[detail.w] && prog[detail.w].s === 2 ? undefined : "primary"} disabled={!!prog[detail.w] && prog[detail.w].s === 2} label={prog[detail.w] && prog[detail.w].s === 2 ? "已在不熟" : "加入不熟"} onClick={() => setStatus(detail, 2)} />,
          <Button key="dk" disabled={!!prog[detail.w] && prog[detail.w].s === 1} label={prog[detail.w] && prog[detail.w].s === 1 ? "已認識" : "標為已認識"} onClick={() => setStatus(detail, 1)} />,
          <Button key="dp" label="發音" onClick={() => speak(detail.w, sp)} />,
          <Button key="dg" label="去練習" onClick={() => { const d = detail; setDetail(null); enter(d.lv, unitOf(d)); }} />,
          <Button key="dc" label="關閉" onClick={() => setDetail(null)} />,
        ])}
      </div>
    </div>
  ) : null;

  // Word tapped in an example sentence: a stacked sheet, so 返回 goes back one word and the practice session underneath is untouched.
  const lk = look.length ? look[look.length - 1] : null;
  const back = () => {
    setLookMsg("");
    setLook((st: Look[]) => st.slice(0, -1));
  };
  const closeLook = () => {
    setLookMsg("");
    setLook([]);
  };
  const lookBody = (L: Look) => {
    const w = L.hits.length ? L.hits[Math.min(L.i, L.hits.length - 1)] : null;
    const nav = row([
      <Button key="lb" label={look.length > 1 ? "◀ 返回上一個字" : "◀ 返回"} onClick={back} />,
      ...(look.length > 1 ? [<Button key="lx" label="關閉" onClick={closeLook} />] : []),
    ]);
    const msg = lookMsg ? <div className="lk-msg" style={{ color: t.text.success, fontSize: t.font.body2.fontSize }}>{lookMsg}</div> : null;
    if (!w) {
      const inExtra = extra.some((x: Extra) => x.w.toLowerCase() === L.tok.toLowerCase());
      return (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="lk-word" onClick={() => speak(L.tok, sp)} style={{ fontSize: "26px", fontWeight: t.weight.semibold, cursor: "pointer" }}>{L.tok}</span>
            <span style={{ color: t.text.secondary }}>不在 7000 字庫中</span>
          </div>
          {L.sent ? <div style={{ color: t.text.secondary, fontSize: t.font.body2.fontSize, lineHeight: 1.5 }}>{"例句：" + L.sent}</div> : null}
          {row([
            <Button
              key="ae"
              variant={inExtra ? undefined : "primary"}
              disabled={inExtra}
              label={inExtra ? "已在生字本" : "加入生字本"}
              onClick={() => {
                const next = extra.concat({ w: L.tok, s: L.sent, t: Date.now() });
                setExtra(next);
                saveExtra(next);
                setLookMsg("已加入生字本（首頁可查看）。");
              }}
            />,
            <Button key="sp" label="發音" onClick={() => speak(L.tok, sp)} />,
          ])}
          {msg}
          {nav}
        </>
      );
    }
    const unf = !!prog[w.w] && prog[w.w].s === 2;
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="lk-word" onClick={() => speak(w.w, sp)} style={{ fontSize: "26px", fontWeight: t.weight.semibold, cursor: "pointer" }}>{w.w}</span>
          {kkEl(w, "17px")}
          <span style={{ color: t.text.secondary }}>{w.pos}</span>
          <span style={{ color: t.text.primary }}>{w.zh}</span>
        </div>
        {L.tok.toLowerCase() !== w.w.toLowerCase() ? muted("例句中的「" + L.tok + "」→ 字庫中的 " + w.w) : null}
        {L.hits.length > 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {muted("也可能是：")}
            {L.hits.map((h: Word, k: number) =>
              h === w ? null : (
                <button key={h.id} className="chip" onClick={() => setLook((st: Look[]) => st.slice(0, -1).concat({ ...L, i: k }))}>
                  {h.w}
                </button>
              )
            )}
          </div>
        ) : null}
        {muted(LEVELS[w.lv] + "・單元 " + (unitOf(w) + 1) + "・" + statusLabel(w))}
        {exBlock(w)}
        {row([
          <Button
            key="au"
            variant={unf ? undefined : "primary"}
            disabled={unf}
            label={unf ? "已在不熟" : "加入不熟"}
            onClick={() => {
              setStatus(w, 2);
              setLookMsg("已加入不熟：會出現在錯題本，並排入間隔複習。");
            }}
          />,
          <Button key="sp" label="發音" onClick={() => speak(w.w, sp)} />,
          <Button
            key="go"
            label="去練習"
            onClick={() => {
              closeLook();
              setDetail(null);
              enter(w.lv, unitOf(w));
            }}
          />,
        ])}
        {msg}
        {nav}
      </>
    );
  };
  const lookSheet = lk ? (
    <div
      className="sheet-bg"
      onClick={closeLook}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        className="sheet lk"
        key={look.length}
        onClick={(ev: React.MouseEvent) => ev.stopPropagation()}
        style={{ background: t.bg.elevated, color: t.text.primary, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom))", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {lookBody(lk)}
      </div>
    </div>
  ) : null;

  const card = (w: Word) => {
    examplesOf(w); // start loading before the card is flipped
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
        {kkEl(w, "19px")}
        {flipped ? (
          <>
            <div style={{ color: t.text.primary, fontSize: t.font.heading2.fontSize, lineHeight: t.font.heading2.lineHeight, fontWeight: t.weight.medium }}>{w.zh}</div>
            {exBlock(w)}
          </>
        ) : (
          <div style={{ color: t.text.tertiary, fontSize: t.font.label.fontSize }}>點一下卡片看中文</div>
        )}
      </div>
    );
  };

  const quizBlock = () => {
    if (!quiz) return null;
    const w = quiz.word;
    examplesOf(w);
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
              {w.w} {kkEl(w)}（{w.pos}）{w.zh}
            </div>
            {exBlock(w)}
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

  // The four stat cards on the home screen open this "set" view over just those words.
  const openSet = (kind: string) => {
    if (kind === "acc" && stats.c + stats.x === 0) {
      // no quiz answered yet: go straight to a quiz screen
      enter(last ? last.lv : 0, -1);
      setTab("quiz");
      setQuizMode("en2zh");
      return;
    }
    const words = setOf(kind);
    const ids = shuffle(words.map((x: Word) => x.id));
    setSk(kind);
    setSTab(kind === "unf" ? "card" : kind === "due" ? "quiz" : "list");
    setSDeck(ids);
    setSPos(0);
    setSMore(40);
    setFlipped(false);
    sQuizRef.current = { ids: [], pos: 0 };
    go("set");
    if (kind === "due" && ids.length) {
      sQuizRef.current = { ids: shuffle(ids), pos: 1 };
      setQuiz(makeQuiz(WORDS[sQuizRef.current.ids[0]], true));
    }
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
              wordCell(x),
              x.zh,
              statusLabel(x),
              <span key={x.id} style={{ display: "inline-flex", gap: 12, fontSize: t.font.body1.fontSize }}>
                <span onClick={() => speak(x.w, sp)} style={{ cursor: "pointer", color: t.text.accent }}>發音</span>
                {wordLink(x)}
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
      sources={[
        "單字、中文與大部分例句：kknono668/toeic-vocab-tw（Hugging Face，CC BY-SA 4.0）https://huggingface.co/datasets/kknono668/toeic-vocab-tw",
        "KK 音標：edc026588/toeic-cards（CC BY-SA 4.0，由 CMU Pronouncing Dictionary 轉換，BSD 授權）https://github.com/edc026588/toeic-cards ；本站修正 384 筆（詞性、重音位置），清單見 README",
        "約 3.7% 的例句（資料集缺漏或不含該單字時）為本站自行撰寫補上，並以相同的 CC BY-SA 4.0 授權釋出；說明 https://github.com/music830524-create/t7k-82099aa17093a1f9#readme",
      ]}
    >
      {detailSheet}
      {lookSheet}
      {view === "home" ? (
        <Section heading="搜尋單字">
          <Input label="搜尋單字（英文或中文）" value={qIn} onChange={(v: string) => setQIn(v)} placeholder="例如 invoice、會議、approved" />
          {query.trim() ? (
            <div className="slist" data-q={query.trim()}>
              {search.infl.map((h: Word) => wordRow(h, "「" + query.trim() + "」是 " + h.w + " 的變化形・" + LEVELS[h.lv] + "・" + statusLabel(h)))}
              {search.res.map((x: Word) => wordRow(x))}
              {search.ext.map((x: Extra) => (
                <button key={"ex" + x.t + x.w} className="srow ext" onClick={() => { setLookMsg(""); setLook([{ tok: x.w, hits: [], i: 0, sent: x.s }]); }}>
                  <span className="l">
                    <span className="w">{x.w}</span>
                    <span className="st">{"生字本" + (x.s ? "・" + x.s : "")}</span>
                  </span>
                </button>
              ))}
              {!search.res.length && !search.infl.length && !search.ext.length ? (
                search.eng ? (
                  <div className="srow nomatch">
                    <span className="l">
                      <span className="w">{query.trim()}</span>
                      <span className="st">不在 7000 字庫中</span>
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <Button label="查看／發音" onClick={() => { setLookMsg(""); setLook([{ tok: query.trim(), hits: lookupToken(query.trim()), i: 0, sent: "" }]); }} />
                        <Button
                          variant="primary"
                          label="加入生字本"
                          onClick={() => {
                            const next = extra.concat({ w: query.trim(), s: "", t: Date.now() });
                            setExtra(next);
                            saveExtra(next);
                            setSMsg("已加入生字本。");
                          }}
                        />
                      </span>
                      {sMsg ? <span className="lk-msg" style={{ color: t.text.success, fontSize: t.font.body2.fontSize, marginTop: 6 }}>{sMsg}</span> : null}
                    </span>
                  </div>
                ) : (
                  muted("找不到符合的字。")
                )
              ) : null}
            </div>
          ) : (
            muted("輸入英文（開頭或片段，也可以打 approved、companies 這種變化形）或中文，會立刻列出結果；點一個字看音標、例句，並可加入不熟或標為已認識。")
          )}
          {query.trim() && search.res.length === 50 ? muted("只顯示前 50 筆，打更多字母縮小範圍") : null}
        </Section>
      ) : null}

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
              { value: stats.known.toLocaleString(), label: "已認識", detail: "共 " + WORDS.length.toLocaleString() + " 字", onClick: () => openSet("known") },
              { value: String(stats.unf), label: "不熟", onClick: () => openSet("unf") },
              { value: accuracy, label: "測驗正確率", detail: stats.c + stats.x ? "共答 " + (stats.c + stats.x) + " 題" : "還沒測驗，點進去開始", onClick: () => openSet("acc") },
              { value: String(dueWords.length), label: "今天待複習", onClick: () => openSet("due") },
            ]}
          />
          {muted("點上面的方塊進去複習：已認識、不熟、今天待複習、測驗答錯的字。")}
          {row([<Button key="rv" label={"錯題本（" + reviewWords.length + "）"} onClick={() => go("review")} />])}
          {speedControl}
          {muted("每答一題就自動存檔在這支手機上；畫面會跟著手機切換淺色或深色模式。")}
          {!persist ? <Callout tone="info">這個瀏覽器不允許儲存資料（例如無痕模式），進度只會保留到關閉頁面為止。</Callout> : null}
        </Section>
      ) : null}

      {view === "home" ? (
        <Section heading={"生字本（" + extra.length + "）"}>
          {extra.length ? (
            <Table
              columns={["單字", "例句", ""]}
              rows={extra
                .slice()
                .reverse()
                .map((x: Extra) => [
                  x.w,
                  <span key={"s" + x.t + x.w} style={{ whiteSpace: "normal", color: t.text.secondary }}>{x.s}</span>,
                  <span key={"a" + x.t + x.w} style={{ display: "inline-flex", gap: 12, fontSize: t.font.body1.fontSize }}>
                    <span onClick={() => speak(x.w, sp)} style={{ cursor: "pointer", color: t.text.accent }}>發音</span>
                    <span
                      className="xdel"
                      onClick={() => {
                        if (!window.confirm("從生字本刪除「" + x.w + "」？")) return;
                        const next = extra.filter((y: Extra) => y !== x);
                        setExtra(next);
                        saveExtra(next);
                      }}
                      style={{ cursor: "pointer", color: t.text.danger }}
                    >
                      刪除
                    </span>
                  </span>,
                ])}
            />
          ) : null}
          {muted("例句裡有虛線底線的字在 7,010 字庫中，點一下可查並「加入不熟」；沒有底線的字也能點，可存進這個生字本。")}
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

      {view === "set" ? (
        <Section heading={sk === "known" ? "已認識的字" : sk === "unf" ? "不熟的字" : sk === "due" ? "今天待複習" : "測驗紀錄"}>
          {backHome}
          {muted(
            sk === "known"
              ? "共 " + setWords.length.toLocaleString() + " 字：按過「認識」或測驗連續答對的字。可以用單字卡或測驗再複習，也可以逐字查看。"
              : sk === "unf"
              ? "共 " + setWords.length + " 字：按「不熟」或測驗答錯的字，答錯最多的排前面。單字卡或測驗答對幾次後會自動移出。"
              : sk === "due"
              ? "共 " + setWords.length + " 字今天到期：測驗答對會拉長下次複習的間隔（1、3、7、14、30 天），答錯就從頭開始。"
              : "累計答對 " + stats.c + " 題、答錯 " + stats.x + " 題，正確率 " + accuracy + "。下面是曾經答錯的字（" + setWords.length + "），可以再測驗。"
          )}
          <Segmented
            options={[
              { value: "card", label: "單字卡" },
              { value: "quiz", label: "測驗" },
              { value: "list", label: "清單（" + setWords.length + "）" },
            ]}
            value={sTab}
            onChange={(v: string) => {
              setSTab(v);
              setQuiz(null);
              setFlipped(false);
            }}
          />
          {setWords.length === 0 ? (
            <Text>{sk === "due" ? "今天的複習都完成了 🎉" : sk === "unf" ? "目前沒有不熟的字。" : sk === "known" ? "還沒有標為已認識的字。" : "還沒有答錯的字。"}</Text>
          ) : sTab === "card" ? (
            (() => {
              const sc = sPos < sDeck.length ? WORDS[sDeck[sPos]] : undefined;
              const sNext = () => {
                setSPos((i: number) => i + 1);
                setFlipped(false);
              };
              const reshuffle = () => {
                setSDeck(shuffle(setWords.map((x: Word) => x.id)));
                setSPos(0);
                setFlipped(false);
              };
              return sc ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {muted("第 " + (sPos + 1) + " / " + sDeck.length + " 張")}
                  {card(sc)}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {btn("✓ 認識", () => { setStatus(sc, 1); sNext(); }, { big: true })}
                    {btn("✗ 不熟", () => { setStatus(sc, 2); sNext(); }, { big: true })}
                  </div>
                  {row([
                    <Button key="s" variant="primary" label="發音" onClick={() => speak(sc.w, sp)} />,
                    <Button key="p" label="◀ 上一張" onClick={() => { setSPos((i: number) => Math.max(0, i - 1)); setFlipped(false); }} />,
                    <Button key="n" label="跳過 ▶" onClick={sNext} />,
                    <Button key="r" label="重新洗牌" onClick={reshuffle} />,
                  ])}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Text>這一輪看完了。</Text>
                  {row([<Button key="r" variant="primary" label="再來一輪" onClick={reshuffle} />])}
                </div>
              );
            })()
          ) : sTab === "quiz" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {modeSwitch}
              {quizBlock()}
              {quizControls("開始測驗")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="slist">
                {setWords.slice(0, sMore).map((x: Word) => {
                  const r = prog[x.w];
                  return wordRow(x, LEVELS[x.lv] + "・" + statusLabel(x) + (r && r.c + r.x ? "・答對 " + r.c + "／答錯 " + r.x : ""));
                })}
              </div>
              {setWords.length > sMore ? row([<Button key="m" label={"顯示更多（還有 " + (setWords.length - sMore) + " 字）"} onClick={() => setSMore((n: number) => n + 60)} />]) : null}
            </div>
          )}
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
                columns={["單字", "中文", "答錯", "下次複習", ""]}
                rows={reviewWords.slice(0, 60).map((x: Word) => {
                  const r = prog[x.w];
                  const days = Math.ceil((r.due - now) / DAY);
                  return [wordCell(x), x.zh, String(r.x), r.due <= now ? { text: "今天", tone: "warning" as const } : days + " 天後", wordLink(x)];
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
