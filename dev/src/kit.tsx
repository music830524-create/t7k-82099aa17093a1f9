import * as React from "react";
export { useState, useEffect, useMemo, useCallback, useRef } from "react";
export type { ReactNode, ChangeEvent, KeyboardEvent } from "react";
type RN = React.ReactNode;

const T = {
  text: { primary: "var(--text)", secondary: "var(--text2)", tertiary: "var(--text3)", success: "var(--ok)", danger: "var(--bad)", accent: "var(--accent)", warning: "var(--warn)" },
  fill: { successSubtle: "var(--okbg)", dangerSubtle: "var(--badbg)" },
  bg: { elevated: "var(--card)", base: "var(--bg)" },
  border: { default: "var(--line)", subtle: "var(--line2)" },
  radius: { md: "8px", lg: "12px", xl: "16px" },
  font: {
    family: "var(--font)",
    heading2: { fontSize: "24px", lineHeight: "32px" },
    heading3: { fontSize: "19px", lineHeight: "26px" },
    body1: { fontSize: "16px", lineHeight: "24px" },
    body2: { fontSize: "14px", lineHeight: "20px" },
    label: { fontSize: "12.5px", lineHeight: "18px" },
  },
  weight: { medium: 500, semibold: 600 },
  dataviz: { categorical: ["var(--accent)", "var(--warn)"] },
};
export function useGrokTheme() {
  return T;
}

export function Page(p: { title: string; summary?: string; width?: string; sources?: string[]; children?: RN }) {
  return (
    <main className="page">
      <header className="ph">
        <h1>{p.title}</h1>
        {p.summary ? <p className="sum">{p.summary}</p> : null}
      </header>
      {p.children}
      {p.sources && p.sources.length ? (
        <footer className="src">
          <div>資料來源</div>
          {p.sources.map((s: string) => {
            const m = /(https?:\/\/\S+)/.exec(s);
            return (
              <div key={s}>
                {m ? (
                  <>
                    {s.replace(m[1], "").trim()}{" "}
                    <a href={m[1]} target="_blank" rel="noopener">{m[1]}</a>
                  </>
                ) : s}
              </div>
            );
          })}
        </footer>
      ) : null}
    </main>
  );
}

export function Section(p: { heading?: string; children?: RN }) {
  return (
    <section className="sec">
      {p.heading ? <h2>{p.heading}</h2> : null}
      {p.children}
    </section>
  );
}

export function Text(p: { children?: RN }) {
  return <p className="txt">{p.children}</p>;
}

export function Metrics(p: { metrics: { value: string; label: string; detail?: string; onClick?: () => void }[] }) {
  return (
    <div className="metrics">
      {p.metrics.map((m) =>
        m.onClick ? (
          <button className="metric tap" key={m.label} onClick={m.onClick} aria-label={m.label + "，點一下查看"}>
            <span className="mv">{m.value}</span>
            <span className="ml">{m.label}</span>
            {m.detail ? <span className="md">{m.detail}</span> : null}
          </button>
        ) : (
          <div className="metric" key={m.label}>
            <div className="mv">{m.value}</div>
            <div className="ml">{m.label}</div>
            {m.detail ? <div className="md">{m.detail}</div> : null}
          </div>
        )
      )}
    </div>
  );
}

export function Segmented(p: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="tablist">
      {p.options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === p.value} className={o.value === p.value ? "on" : ""} onClick={() => p.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tog">
      <input type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.target.checked)} />
      <span className="sw" />
      <span>{p.label}</span>
    </label>
  );
}

export function Input(p: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="inp">
      {p.label ? <span>{p.label}</span> : null}
      <input value={p.value} placeholder={p.placeholder} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => p.onChange(e.target.value)} />
    </label>
  );
}

export function Button(p: { label: string; onClick?: () => void; variant?: string; disabled?: boolean }) {
  return (
    <button className={"btn" + (p.variant === "primary" ? " pri" : "")} onClick={p.onClick} disabled={p.disabled}>
      {p.label}
    </button>
  );
}

type Cell = RN | { text: string; tone?: string };
export function Table(p: { columns: string[]; rows: Cell[][] }) {
  const render = (c: Cell): RN => {
    if (c && typeof c === "object" && !React.isValidElement(c) && "text" in (c as object)) {
      const o = c as { text: string; tone?: string };
      return <span className={"tone-" + (o.tone || "")}>{o.text}</span>;
    }
    return c as RN;
  };
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr>{p.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{render(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout(p: { tone?: string; children?: RN }) {
  return <div className={"callout " + (p.tone || "info")}>{p.children}</div>;
}
