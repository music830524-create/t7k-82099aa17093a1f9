import { D } from "./data";
import { TOPIC_NEW, TOPIC_OV, TOPIC_CATS } from "./topics";

// tk = topic key (word carries a topic-specific meaning/examples); kid = id of the 7010-list word it is based on.
export type Word = { id: number; w: string; pos: string; zh: string; lv: number; tk?: string; kid?: number };

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


// ---- Topic categories (主題分類) ----
export const TOPIC_LV = LEVELS.length; // lv of topic-only words (not in the 7010 list)
const BYW: Record<string, Word> = {};
WORDS.forEach((x: Word) => {
  if (!BYW[x.w.toLowerCase()]) BYW[x.w.toLowerCase()] = x;
});
export const TWORDS: Word[] = TOPIC_NEW.map((t: [string, string, string], i: number) => ({ id: WORDS.length + i, w: t[0], pos: t[1], zh: t[2], lv: TOPIC_LV }));
TWORDS.forEach((x: Word) => {
  BYW[x.w.toLowerCase()] = x;
});
// Topic-specific variants of 7010-list words; own ids so decks can address them, same word string so progress is shared.
const OVW: Word[] = TOPIC_OV.map((o: [string, string, string, string, number], i: number) => ({ id: WORDS.length + TWORDS.length + i, w: o[1], pos: o[2], zh: o[3], lv: WORDS[o[4]].lv, tk: o[0], kid: o[4] }));
const OVBY: Record<string, Word> = {};
OVW.forEach((x: Word) => {
  OVBY[x.tk + ":" + x.w.toLowerCase()] = x;
});
export const POOL: Word[] = WORDS.concat(TWORDS); // every distinct word (progress-bearing)
export const ALLW: Word[] = POOL.concat(OVW); // indexable by id
export type TopicWords = { key: string; emoji: string; name: string; en: string; words: Word[] };
export const TCATS: TopicWords[] = TOPIC_CATS.map((c) => ({
  key: c.key,
  emoji: c.emoji,
  name: c.name,
  en: c.en,
  words: c.items.map((it: string) => {
    const w = it.slice(2).toLowerCase();
    return it[0] === "o" ? OVBY[c.key + ":" + w] : BYW[w];
  }),
}));
// word -> names of the topics that list it (shown in search results and detail sheets)
export const TOPICS_OF: Record<string, string[]> = {};
TCATS.forEach((c: TopicWords) => c.words.forEach((x: Word) => (TOPICS_OF[x.w.toLowerCase()] = (TOPICS_OF[x.w.toLowerCase()] || []).concat(c.name))));
// Chinese meanings used only in topic views, so searching 胃/筷子 finds the word too
export const TOPIC_ZH: Record<string, string> = {};
OVW.forEach((x: Word) => (TOPIC_ZH[x.w.toLowerCase()] = (TOPIC_ZH[x.w.toLowerCase()] || "") + " " + x.zh));
