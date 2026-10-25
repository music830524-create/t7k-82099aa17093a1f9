import { D } from "./data";

export type Word = { id: number; w: string; pos: string; zh: string; lv: number };

export const LEVELS: string[] = ["基礎", "核心", "進階", "高階"];
export const BANDS: string[] = ["0–400 分", "400–600 分", "600–780 分", "780–900 分"];
export const POS: Record<string, string> = { "1": "n.", "2": "v.", "3": "adj.", "4": "adv.", "5": "prep.", "6": "conj.", "7": "pron.", "8": "其他" };

export const WORDS: Word[] = (() => {
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

