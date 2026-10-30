// Map words in example sentences to headwords: exact form, then irregular forms, then inflection rules
// (gated by part of speech), plus hyphenated headwords spanning several tokens ("follow-up", "state-of-the-art").
import { Word, WORDS, TWORDS } from "./words";

export type Tok = { t: string; hits: Word[] }; // t = text; hits = matched headwords (best first); non-word pieces have hits = [] and no tap

const IDX: Record<string, Word> = {}; // the 7010 list: always wins
const TIDX: Record<string, Word> = {}; // words that are only in a topic category: matched after the 7010 list ("running" -> run, then running)
const PHR: Record<string, string[][]> = {}; // first token -> token lists of multi-token headwords
const addTo = (ix: Record<string, Word>, w: Word) => {
  const k = w.w.toLowerCase();
  if (!ix[k]) ix[k] = w;
  if (k.indexOf("-") > 0) {
    const parts = k.split("-");
    (PHR[parts[0]] = PHR[parts[0]] || []).push(parts);
    const joined = parts.join("");
    if (!ix[joined]) ix[joined] = w; // email -> e-mail
  }
};
WORDS.forEach((w: Word) => addTo(IDX, w));
TWORDS.forEach((w: Word) => addTo(TIDX, w));
const headword = (k: string): Word | undefined => IDX[k] || TIDX[k];

const IRR: Record<string, string[]> = {};
("be:was,were,been,is,am,are,being;have:has,had,having;do:does,did,done;go:goes,went,gone;buy:bought;bring:brought;think:thought;teach:taught;catch:caught;fight:fought;seek:sought;" +
  "make:made;take:took,taken;give:gave,given;get:got,gotten;come:came;become:became;see:saw,seen;know:knew,known;say:said,says;tell:told;sell:sold;hold:held;find:found;leave:left;" +
  "keep:kept;sleep:slept;feel:felt;meet:met;send:sent;spend:spent;build:built;lend:lent;lose:lost;mean:meant;pay:paid;lay:laid;stand:stood;understand:understood;win:won;" +
  "write:wrote,written;drive:drove,driven;ride:rode,ridden;rise:rose,risen;arise:arose,arisen;speak:spoke,spoken;break:broke,broken;choose:chose,chosen;freeze:froze,frozen;" +
  "steal:stole,stolen;wake:woke,woken;forget:forgot,forgotten;begin:began,begun;drink:drank,drunk;ring:rang,rung;sing:sang,sung;swim:swam,swum;run:ran;eat:ate,eaten;fall:fell,fallen;" +
  "draw:drew,drawn;grow:grew,grown;throw:threw,thrown;fly:flew,flown,flies;show:shown;wear:wore,worn;tear:tore,torn;bear:bore,borne;swear:swore,sworn;hide:hid,hidden;bite:bit,bitten;" +
  "shake:shook,shaken;forgive:forgave,forgiven;dig:dug;hang:hung;stick:stuck;strike:struck;shine:shone;shoot:shot;sit:sat;light:lit;lead:led;feed:fed;flee:fled;bleed:bled;" +
  "deal:dealt;hear:heard;slide:slid;spin:spun;withdraw:withdrew,withdrawn;undertake:undertook,undertaken;overcome:overcame;undergo:underwent,undergone;oversee:oversaw,overseen;" +
  "mislead:misled;outdo:outdid,outdone;overtake:overtook,overtaken;forbid:forbade,forbidden;foresee:foresaw,foreseen;withhold:withheld;uphold:upheld;" +
  "child:children;person:people;man:men;woman:women;foot:feet;tooth:teeth;mouse:mice;criterion:criteria;phenomenon:phenomena;analysis:analyses;crisis:crises;basis:bases;" +
  "medium:media;datum:data;thesis:theses;good:better,best;well:better,best;bad:worse,worst;far:further,farther,furthest,farthest;many:more,most;much:more,most;little:less,least")
  .split(";")
  .forEach((g: string) => {
    const [base, forms] = g.split(":");
    forms.split(",").forEach((f: string) => (IRR[f] = (IRR[f] || []).concat(base)));
  });

const has = (w: Word, p: string): boolean => w.pos.split("/").indexOf(p) >= 0;
const isV = (w: Word) => has(w, "v.") || has(w, "n."); // nouns too: priced, packaging, detailed
const isNV = (w: Word) => has(w, "n.") || has(w, "v.");
const isA = (w: Word) => has(w, "adj.") || has(w, "adv.");
const CONS = /[bcdfghjklmnpqrstvwxz]$/;

// Candidate base forms for one lowercase token, best first.
function bases(t: string, deep?: boolean): [string, (w: Word) => boolean][] {
  const any = () => true;
  const out: [string, (w: Word) => boolean][] = [[t, any]];
  const pos = /^(.+?)(?:'s|s')$/.exec(t);
  if (pos) (deep ? [[pos[1], any] as [string, (w: Word) => boolean]] : bases(pos[1], true)).forEach((x) => out.push(x)); // building's -> building -> build
  const con = /^(.+?)(?:n't|'re|'ve|'ll|'d|'m)$/.exec(t);
  if (con) out.push([con[1], any]);
  (IRR[t] || []).forEach((b: string) => out.push([b, any]));
  const L = t.length;
  const add = (b: string, ok: (w: Word) => boolean) => {
    if (b.length >= 2) out.push([b, ok]);
  };
  const dbl = (s: string) => (s.length > 2 && s[s.length - 1] === s[s.length - 2] && CONS.test(s) && !/(ss|ll|ff|zz)$/.test(s) ? s.slice(0, -1) : "");
  if (L > 3 && /ies$/.test(t)) add(t.slice(0, -3) + "y", isNV);
  if (L > 3 && /ves$/.test(t)) {
    add(t.slice(0, -3) + "f", isNV);
    add(t.slice(0, -3) + "fe", isNV);
  }
  if (L > 3 && /(s|x|z|ch|sh|o)es$/.test(t)) add(t.slice(0, -2), isNV);
  if (L > 3 && /[^s]s$/.test(t)) add(t.slice(0, -1), isNV);
  if (!deep && L > 5 && /ings$/.test(t)) bases(t.slice(0, -1), true).forEach((x) => out.push(x)); // meetings -> meeting -> meet
  if (L > 4 && /ied$/.test(t)) add(t.slice(0, -3) + "y", isV);
  if (L > 3 && /ed$/.test(t)) {
    const s = t.slice(0, -2);
    add(s, isV);
    if (CONS.test(s) || (L > 5 && /ee$/.test(t.slice(0, -1)))) add(t.slice(0, -1), isV); // approved -> approve, agreed -> agree
    const d = dbl(s);
    if (d) add(d, isV); // stopped -> stop
  }
  if (L > 4 && /ying$/.test(t)) add(t.slice(0, -4) + "ie", isV); // lying -> lie
  if (L > 4 && /ing$/.test(t)) {
    const s = t.slice(0, -3);
    add(s, isV);
    add(s + "e", isV); // making -> make
    const d = dbl(s);
    if (d) add(d, isV); // running -> run
  }
  if (L > 4 && /ier$|iest$/.test(t)) add(t.replace(/iest$|ier$/, "y"), isA);
  if (L > 3 && /er$|est$/.test(t)) {
    const s = t.replace(/est$|er$/, "");
    add(s, isA);
    add(s + "e", isA); // larger -> large
    const d = dbl(s);
    if (d) add(d, isA); // bigger -> big
  }
  return out;
}

export function lookupToken(t: string): Word[] {
  const out: Word[] = [];
  bases(t.toLowerCase().replace(/’/g, "'")).forEach(([b, ok]: [string, (w: Word) => boolean]) => {
    const w = IDX[b];
    if (w && ok(w) && out.indexOf(w) < 0) out.push(w);
  });
  bases(t.toLowerCase().replace(/’/g, "'")).forEach(([b, ok]: [string, (w: Word) => boolean]) => {
    const w = TIDX[b];
    if (w && ok(w) && out.indexOf(w) < 0) out.push(w);
  });
  return out;
}

// Split a sentence into word and non-word pieces, with headword matches for each word.
export function lookupSentence(s: string): Tok[] {
  const parts = s.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/);
  const toks: Tok[] = parts.filter((p: string) => p !== "").map((p: string) => ({ t: p, hits: [] as Word[] }));
  const wordIdx: number[] = [];
  toks.forEach((x: Tok, i: number) => {
    if (/^[A-Za-z]/.test(x.t)) {
      wordIdx.push(i);
      x.hits = lookupToken(x.t);
    }
  });
  // Multi-token headwords: words joined by "-" or a single space, last word may be inflected.
  wordIdx.forEach((ti: number, n: number) => {
    const first = toks[ti].t.toLowerCase();
    (PHR[first] || []).forEach((parts: string[]) => {
      if (n + parts.length > wordIdx.length) return;
      for (let j = 1; j < parts.length; j++) {
        const a = wordIdx[n + j - 1];
        const b = wordIdx[n + j];
        const sep = toks.slice(a + 1, b).map((x: Tok) => x.t).join("");
        if (sep !== "-" && sep !== " ") return;
        const tw = toks[b].t.toLowerCase();
        const okLast = j === parts.length - 1 && bases(tw).some(([bb]: [string, unknown]) => bb === parts[j]);
        if (tw !== parts[j] && !okLast) return;
      }
      const hw = headword(parts.join("-")) || headword(parts.join(""));
      if (!hw) return;
      for (let j = 0; j < parts.length; j++) {
        const x = toks[wordIdx[n + j]];
        if (x.hits.indexOf(hw) < 0) x.hits = [hw].concat(x.hits);
      }
    });
  });
  return toks;
}
