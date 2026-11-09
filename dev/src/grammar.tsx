import * as React from "react";
import { Button, Callout, Section, Text, useEffect, useRef, useState } from "./kit";

export const GRAMMAR_KEY = "toeic7000_grammar_v1";

type Mark = { t: string; pos: string };
type Ex = { en: string; zh: string; marks?: Mark[]; tag?: string };
type Fix = { bad: string; good: string; zh: string };
type Grid = { columns: string[]; rows: string[][] };
type Point = { id: string; title: string; body: string[]; examples: Ex[]; fixes?: Fix[]; table?: Grid };
type Q = { id: string; prompt: string; full: string; options: string[]; answer: number; explain: string };
type Chapter = {
  id: string;
  emoji?: string;
  title: string;
  en: string;
  blurb: string;
  intro: string[];
  chart?: Grid;
  points: Point[];
  quiz: Q[];
};
type PairItem = { suffix: string; body: string[]; pairs?: string[]; note?: string };
type Group = { id: string; title: string; intro?: string; items: PairItem[] };
type CellEx = { en: string; zh: string };
type Cell = { word: string; examples?: CellEx[]; note?: string };
type Family = { id: string; title: string; note?: string; cols: { n: Cell; v: Cell; adj: Cell; adv: Cell } };
type Suffix = { title: string; blurb: string; intro: string[]; groups: Group[]; families: Family[]; quiz: Q[] };
type Data = { basics: { title: string; intro: string }; chapters: Chapter[]; suffix: Suffix };
type Wrong = { id: string; picked: number };
export type Attempt = { best: number; last: number; n: number; wrong: Wrong[]; at: number };
type Store = { chapters: Record<string, Attempt>; suffix?: Attempt };

const COLS: { k: "n" | "v" | "adj" | "adv"; label: string }[] = [
  { k: "n", label: "名詞" },
  { k: "v", label: "動詞" },
  { k: "adj", label: "形容詞" },
  { k: "adv", label: "副詞" },
];

function loadStore(): Store {
  try {
    const raw = window.localStorage.getItem(GRAMMAR_KEY);
    if (!raw) return { chapters: {} };
    const o = JSON.parse(raw) as Store;
    const chapters = o && o.chapters && typeof o.chapters === "object" ? o.chapters : {};
    return { chapters, suffix: o && o.suffix ? o.suffix : undefined };
  } catch (e) {
    return { chapters: {} };
  }
}

function saveStore(s: Store): void {
  try {
    window.localStorage.setItem(GRAMMAR_KEY, JSON.stringify(s));
  } catch (e) {
    /* private mode */
  }
}

function boundary(ch: string | undefined): boolean {
  return ch === undefined || !/[A-Za-z']/.test(ch);
}

export function Marked(p: { en: string; marks?: Mark[] }) {
  const hits: { s: number; e: number; pos: string }[] = [];
  const taken: [number, number][] = [];
  (p.marks || []).forEach((m) => {
    if (!m || !m.t) return;
    let from = 0;
    while (from < p.en.length) {
      const i = p.en.indexOf(m.t, from);
      if (i < 0) break;
      const end = i + m.t.length;
      const overlap = taken.some(([a, b]) => i < b && end > a);
      if (!overlap && boundary(i === 0 ? undefined : p.en[i - 1]) && boundary(p.en[end])) {
        taken.push([i, end]);
        hits.push({ s: i, e: end, pos: m.pos });
        break;
      }
      from = i + 1;
    }
  });
  hits.sort((a, b) => a.s - b.s);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((h, idx) => {
    if (h.s > cursor) parts.push(p.en.slice(cursor, h.s));
    const pos = h.pos.charAt(0) === "(" ? h.pos : "(" + h.pos + ")";
    parts.push(
      <span key={idx} className="gmk">
        <strong className="gmark">{p.en.slice(h.s, h.e)}</strong>
        <span className="gposi">{pos}</span>
      </span>
    );
    cursor = h.e;
  });
  if (cursor < p.en.length) parts.push(p.en.slice(cursor));
  return <span className="en">{parts}</span>;
}

function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

function Chart(p: { columns: string[]; rows: string[][]; testId?: string }) {
  return (
    <div
      className="gchart"
      data-testid={p.testId}
      style={{ gridTemplateColumns: p.columns.length === 3 ? "1.7fr 0.75fr 0.75fr" : "repeat(" + p.columns.length + ", minmax(0, 1fr))" }}
    >
      {p.columns.map((c) => (
        <div key={"h" + c} className="gh">
          {c}
        </div>
      ))}
      {p.rows.map((r, i) => r.map((c, j) => <div key={i + "-" + j}>{c}</div>))}
    </div>
  );
}

function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ block: "start" });
}

function Review(p: { questions: Q[]; wrong: Wrong[] }) {
  if (!p.wrong.length) return <Callout tone="info">全部答對。這次沒有需要整理的錯題。</Callout>;
  return (
    <div className="grevs" data-testid="wrong-reviews">
      <h3>錯題整理</h3>
      {p.wrong.map((w) => {
        const qi = p.questions.findIndex((x) => x.id === w.id);
        const q = qi >= 0 ? p.questions[qi] : undefined;
        if (!q) return null;
        const yours = q.options[w.picked];
        const right = q.options[q.answer];
        return (
          <div key={w.id} className="grev" data-testid="wrong-review" data-wrong-id={w.id}>
            <div className="grev-h">{"第 " + (qi + 1) + " 題"}</div>
            <div className="full">{"原句：" + q.full}</div>
            <div className="stem">{"題目：" + q.prompt}</div>
            <ul className="gopts">
              {q.options.map((o, i) => (
                <li key={i} data-opt={i} className={i === q.answer ? "is-correct" : i === w.picked ? "is-yours" : ""}>
                  {letter(i) + ". " + o}
                  {i === q.answer ? "（正確答案）" : ""}
                  {i === w.picked && i !== q.answer ? "（你的答案）" : ""}
                </li>
              ))}
            </ul>
            <div className="yours">{"你的答案：" + (yours === undefined ? "（未作答）" : yours)}</div>
            <div className="right">{"正確答案：" + right}</div>
            <div className="explain">{q.explain}</div>
          </div>
        );
      })}
    </div>
  );
}

function Quiz(p: { testId: string; questions: Q[]; saved?: Attempt; onSave: (a: Attempt) => void }) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; wrong: Wrong[] } | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [showSaved, setShowSaved] = useState<boolean>(false);
  const key = p.questions.map((q) => q.id).join("|");
  const topRef = useRef<HTMLDivElement | null>(null);
  const revRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setPicks({});
    setResult(null);
    setMsg("");
    setShowSaved(false);
  }, [key]);
  useEffect(() => {
    if (result && revRef.current) revRef.current.scrollIntoView({ block: "start" });
  }, [result]);
  const missing = p.questions.filter((q) => picks[q.id] === undefined).length;
  const bestNow = result ? Math.max(p.saved ? p.saved.best : 0, result.score) : p.saved ? p.saved.best : 0;
  const submit = () => {
    if (missing) {
      setMsg("請先答完每一題（還有 " + missing + " 題）。");
      return;
    }
    const wrong: Wrong[] = p.questions.filter((q) => picks[q.id] !== q.answer).map((q) => ({ id: q.id, picked: picks[q.id] }));
    const score = p.questions.length - wrong.length;
    const attempt: Attempt = {
      best: Math.max(p.saved ? p.saved.best : 0, score),
      last: score,
      n: p.questions.length,
      wrong,
      at: Date.now(),
    };
    setResult({ score, wrong });
    setMsg("");
    setShowSaved(false);
    p.onSave(attempt);
  };
  const retake = () => {
    setPicks({});
    setResult(null);
    setMsg("");
    setShowSaved(false);
    if (topRef.current) topRef.current.scrollIntoView({ block: "start" });
  };
  const savedWrong = !result && p.saved && p.saved.wrong && p.saved.wrong.length ? p.saved : null;
  return (
    <div className="gquiz" id="grammar-quiz" data-testid={p.testId} ref={topRef}>
      <h3>{"小測驗（" + p.questions.length + " 題）"}</h3>
      <p className="glead">選一個答案。十題都選完再按送出。送出後若有答錯，會看到完整原句、四個選項、正確答案、你選的答案，和中文說明。</p>
      {p.questions.map((q, qi) => (
        <div key={q.id} className="qcard" data-qid={q.id}>
          <div className="qprompt">{qi + 1 + ". " + q.prompt}</div>
          <div className="qopts">
            {q.options.map((o, i) => {
              const on = picks[q.id] === i;
              let cls = "qopt";
              if (result) {
                if (i === q.answer) cls += " good";
                else if (on) cls += " bad";
              } else if (on) cls += " on";
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  data-i={i}
                  disabled={!!result}
                  onClick={() => {
                    if (result) return;
                    setPicks((prev) => ({ ...prev, [q.id]: i }));
                    setMsg("");
                  }}
                >
                  {letter(i) + ". " + o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {msg ? (
        <div className="gmsg" data-testid="grammar-quiz-msg">
          {msg}
        </div>
      ) : null}
      <div className="gactions">
        {result ? <Button label="再測一次" onClick={retake} /> : <Button variant="primary" label="送出答案" onClick={submit} />}
        {savedWrong ? (
          <Button label={showSaved ? "收起上次錯題" : "看上次錯題（" + savedWrong.wrong.length + "）"} onClick={() => setShowSaved((v) => !v)} />
        ) : null}
      </div>
      {result ? (
        <div ref={revRef} data-testid="grammar-result">
          <div className="gscore" data-testid="grammar-score">
            {"這次 " + result.score + " / " + p.questions.length + "（最佳 " + bestNow + " / " + p.questions.length + "）"}
          </div>
          <Review questions={p.questions} wrong={result.wrong} />
        </div>
      ) : null}
      {showSaved && savedWrong ? (
        <div data-testid="saved-review">
          <div className="gscore">{"上次 " + savedWrong.last + " / " + savedWrong.n}</div>
          <Review questions={p.questions} wrong={savedWrong.wrong} />
        </div>
      ) : null}
    </div>
  );
}

function ChapterView(p: { ch: Chapter; saved?: Attempt; onBack: () => void; onSave: (a: Attempt) => void }) {
  return (
    <Section heading={p.ch.title}>
      <div className="gstack" data-testid="grammar-chapter" data-chapter={p.ch.id}>
        <Button label="◀ 回文法練習" onClick={p.onBack} />
        <p className="glead">{p.ch.en}</p>
        {p.saved ? (
          <p className="gbest" data-testid="chapter-best">
            {"最佳 " + p.saved.best + " / " + p.saved.n}
          </p>
        ) : null}
        {p.ch.intro.map((s, i) => (
          <Text key={i}>{s}</Text>
        ))}
        {p.ch.chart ? <Chart testId="grammar-chart" columns={p.ch.chart.columns} rows={p.ch.chart.rows} /> : null}
        <div className="gtoc">
          {p.ch.points.map((pt) => (
            <button key={pt.id} type="button" onClick={() => scrollToId("pt-" + pt.id)}>
              {pt.title}
            </button>
          ))}
          <button type="button" onClick={() => scrollToId("grammar-quiz")}>
            小測驗
          </button>
        </div>
        {p.ch.points.map((pt) => (
          <div key={pt.id} className="gpoint" id={"pt-" + pt.id}>
            <h3>{pt.title}</h3>
            {pt.body.map((s, i) => (
              <p key={i} className="gtxt">
                {s}
              </p>
            ))}
            {pt.table ? <Chart columns={pt.table.columns} rows={pt.table.rows} /> : null}
            {pt.fixes && pt.fixes.length ? (
              <div className="gnote" data-testid="grammar-fixes">
                <div className="gnote-h">容易寫錯</div>
                {pt.fixes.map((f, i) => (
                  <div key={i} className="gfix">
                    <div>
                      <span className="bad">{"✕ " + f.bad}</span>
                    </div>
                    <div>
                      <span className="good">{"✓ " + f.good}</span>
                    </div>
                    <div className="zh">{f.zh}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {pt.examples.map((ex, i) => (
              <div key={i} className="gex">
                {ex.tag ? <div className="gtag">{ex.tag}</div> : null}
                <div className="en">
                  <Marked en={ex.en} marks={ex.marks} />
                </div>
                <div className="zh">{ex.zh}</div>
              </div>
            ))}
          </div>
        ))}
        <Quiz testId={"quiz-" + p.ch.id} questions={p.ch.quiz} saved={p.saved} onSave={p.onSave} />
      </div>
    </Section>
  );
}

function FamilyCard(p: { f: Family }) {
  return (
    <div className="gfam" data-fam={p.f.id}>
      <div className="gfam-name">{p.f.title}</div>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.k}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {COLS.map((c) => (
                <td key={c.k}>{p.f.cols[c.k].word || "—"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="gfam-ex">
        {COLS.map((c) => {
          const cell = p.f.cols[c.k];
          return (
            <div key={c.k} className="gcell" data-col={c.k}>
              <div className="gpos">{c.label}</div>
              <div className="gword">{cell.word || "—"}</div>
              {(cell.examples || []).map((ex, i) => (
                <div key={i} className="gex">
                  <div className="en">{ex.en}</div>
                  <div className="zh">{ex.zh}</div>
                </div>
              ))}
              {cell.note ? <div className="gcell-note">{cell.note}</div> : null}
            </div>
          );
        })}
      </div>
      {p.f.note ? <div className="gnote">{p.f.note}</div> : null}
    </div>
  );
}

function SuffixView(p: { data: Suffix; saved?: Attempt; onBack: () => void; onSave: (a: Attempt) => void }) {
  return (
    <Section heading={p.data.title}>
      <div className="gstack" data-testid="grammar-suffix">
        <Button label="◀ 回文法練習" onClick={p.onBack} />
        {p.saved ? <p className="gbest">{"最佳 " + p.saved.best + " / " + p.saved.n}</p> : null}
        {p.data.intro.map((s, i) => (
          <Text key={i}>{s}</Text>
        ))}
        <div className="gtoc">
          {p.data.groups.map((g) => (
            <button key={g.id} type="button" onClick={() => scrollToId("grp-" + g.id)}>
              {g.title}
            </button>
          ))}
          <button type="button" onClick={() => scrollToId("grammar-families")}>
            詞族表
          </button>
          <button type="button" onClick={() => scrollToId("grammar-quiz")}>
            小測驗
          </button>
        </div>
        {p.data.groups.map((g) => (
          <div key={g.id} className="gpoint" id={"grp-" + g.id}>
            <h3>{g.title}</h3>
            {g.intro ? <p className="gtxt">{g.intro}</p> : null}
            {g.items.map((it) => (
              <div key={it.suffix} className="gsuf">
                <div className="gsuf-h">{it.suffix}</div>
                {it.body.map((s, i) => (
                  <p key={i} className="gtxt">
                    {s}
                  </p>
                ))}
                {it.pairs && it.pairs.length ? (
                  <ul>
                    {it.pairs.map((pair) => (
                      <li key={pair}>{pair}</li>
                    ))}
                  </ul>
                ) : null}
                {it.note ? <div className="gcell-note">{it.note}</div> : null}
              </div>
            ))}
          </div>
        ))}
        <div className="gpoint" id="grammar-families">
          <h3>詞族表</h3>
          <p className="gtxt">同一列是一家人。空的格子代表沒有常用的那個形，不要自己硬加一個字尾。</p>
          {p.data.families.map((f) => (
            <FamilyCard key={f.id} f={f} />
          ))}
        </div>
        <Quiz testId="quiz-suffix" questions={p.data.quiz} saved={p.saved} onSave={p.onSave} />
      </div>
    </Section>
  );
}

function Hub(p: { data: Data; store: Store; onHome: () => void; onChapter: (id: string) => void; onSuffix: () => void }) {
  return (
    <Section heading="文法練習">
      <div className="gstack" data-testid="grammar-hub">
        <Button label="◀ 回首頁" onClick={p.onHome} />
        <Text>課文和小測驗都在裡面。首頁只留這一個入口。</Text>
        <h3 className="gsub">{p.data.basics.title}</h3>
        <p className="glead">{p.data.basics.intro}</p>
        <div className="glist">
          {p.data.chapters.map((ch) => {
            const sv = p.store.chapters[ch.id];
            return (
              <button key={ch.id} type="button" className="tcat" data-chapter={ch.id} onClick={() => p.onChapter(ch.id)}>
                <span className="te">{ch.emoji || "📘"}</span>
                <span className="tn">{ch.title}</span>
                <span className="tc">{ch.blurb}</span>
                <span className="tc">{sv ? "最佳 " + sv.best + " / " + sv.n : "尚未測驗"}</span>
              </button>
            );
          })}
        </div>
        <h3 className="gsub">{p.data.suffix.title}</h3>
        <p className="glead">{p.data.suffix.blurb}</p>
        <button type="button" className="tcat gwide" data-testid="suffix-entry" onClick={p.onSuffix}>
          <span className="te">🔤</span>
          <span className="tn">字尾構詞</span>
          <span className="tc">{p.store.suffix ? "最佳 " + p.store.suffix.best + " / " + p.store.suffix.n : "名詞、形容詞、副詞、動詞"}</span>
        </button>
      </div>
    </Section>
  );
}

export default function GrammarScreen(p: { onHome: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string>("");
  const [store, setStore] = useState<Store>({ chapters: {} });
  const [screen, setScreen] = useState<{ kind: "hub" } | { kind: "chapter"; id: string } | { kind: "suffix" }>({ kind: "hub" });
  useEffect(() => {
    setStore(loadStore());
    let dead = false;
    fetch("grammar/grammar.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j: Data) => {
        if (!dead) setData(j);
      })
      .catch(() => {
        if (!dead) setErr("文法資料載入失敗。請連上網路後重新整理。");
      });
    return () => {
      dead = true;
    };
  }, []);
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch (e) {
      /* ignore */
    }
  }, [screen]);

  const saveChapter = (id: string, a: Attempt) => {
    setStore((prev) => {
      const next: Store = { ...prev, chapters: { ...prev.chapters, [id]: a } };
      saveStore(next);
      return next;
    });
  };
  const saveSuffix = (a: Attempt) => {
    setStore((prev) => {
      const next: Store = { ...prev, suffix: a };
      saveStore(next);
      return next;
    });
  };

  if (err) {
    return (
      <Section heading="文法練習">
        <Button label="◀ 回首頁" onClick={p.onHome} />
        <Callout>{err}</Callout>
      </Section>
    );
  }
  if (!data) {
    return (
      <Section heading="文法練習">
        <Button label="◀ 回首頁" onClick={p.onHome} />
        <Text>載入文法…</Text>
      </Section>
    );
  }
  if (screen.kind === "chapter") {
    const ch = data.chapters.find((c) => c.id === screen.id);
    if (!ch) {
      return (
        <Section heading="文法練習">
          <Button label="◀ 回文法練習" onClick={() => setScreen({ kind: "hub" })} />
          <Text>找不到這一章。</Text>
        </Section>
      );
    }
    return <ChapterView ch={ch} saved={store.chapters[ch.id]} onBack={() => setScreen({ kind: "hub" })} onSave={(a) => saveChapter(ch.id, a)} />;
  }
  if (screen.kind === "suffix") {
    return <SuffixView data={data.suffix} saved={store.suffix} onBack={() => setScreen({ kind: "hub" })} onSave={saveSuffix} />;
  }
  return <Hub data={data} store={store} onHome={p.onHome} onChapter={(id) => setScreen({ kind: "chapter", id })} onSuffix={() => setScreen({ kind: "suffix" })} />;
}
