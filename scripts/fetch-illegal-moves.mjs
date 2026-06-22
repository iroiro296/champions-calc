// チャンピオンズで使えない（=M_DATA/STATUS_MOVESに無い）が実在する技の日本語名一覧を生成。
// スキャンで🚫付き技も読めるように、技名照合の追加候補として使う。src/illegal-moves.js へ出力。
import { writeFileSync } from "node:fs";
import { M_DATA } from "../src/pokedex-data.js";
import { STATUS_MOVES } from "../src/statusMoves.js";
const BASE = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master";

function* iter(src) {
  const L = src.split("\n"); let i = 0;
  while (i < L.length) {
    const m = L[i].match(/^\t([a-z0-9]+):\s*\{/);
    if (!m) { i++; continue; }
    let d = 0; const bl = [];
    while (i < L.length) { for (const c of L[i]) { if (c === "{") d++; else if (c === "}") d--; } bl.push(L[i]); i++; if (d === 0) break; }
    yield { id: m[1], block: bl.join("\n") };
  }
}

const movesSrc = await (await fetch(`${BASE}/data/moves.ts`)).text();
const entries = [];
for (const { id, block } of iter(movesSrc)) {
  const nm = block.match(/name:\s*"([^"]+)"/); if (!nm) continue;
  const ns = block.match(/isNonstandard:\s*"([^"]+)"/);
  if (ns && (ns[1] === "CAP" || ns[1] === "Custom")) continue; // 架空(CAP)技は除外。Past/Unobtainable等の実在技は残す
  if (/^(G-Max|Max)\s/.test(nm[1]) || /^Z-/.test(id)) continue; // ダイマックス/Z技は対象外
  entries.push({ id, name: nm[1] });
}
console.log(`moves.ts: ${entries.length}件`);

const legal = new Set([...Object.keys(M_DATA), ...Object.keys(STATUS_MOVES)]);
const slug = (n) => n.toLowerCase().replace(/[''’.]/g, "").replace(/[\s]+/g, "-");
const jaName = async (e) => {
  for (const s of [slug(e.name), e.id]) {
    try { const r = await fetch(`https://pokeapi.co/api/v2/move/${s}`); if (!r.ok) continue; const d = await r.json();
      const ja = d.names.find(n => n.language.name === "ja-Hrkt") || d.names.find(n => n.language.name === "ja"); if (ja) return ja.name; } catch { /* next */ }
  }
  return null;
};

const illegal = new Set(); const miss = []; let done = 0;
const queue = [...entries];
async function worker() {
  while (queue.length) {
    const e = queue.shift(); const ja = await jaName(e);
    if (ja) { if (!legal.has(ja)) illegal.add(ja); }
    else miss.push(e.name);
    if (++done % 80 === 0) console.log(`  ${done}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = [...illegal].sort((a, b) => a.localeCompare(b, "ja"));
console.log(`\n非合法(チャンピオンズ外)技: ${sorted.length}件 / JP名取得失敗: ${miss.length}件`);
const out = `// 自動生成 (scripts/fetch-illegal-moves.mjs)。チャンピオンズで使えない=非合法だが実在する技の日本語名。\n// スキャンの技名照合で「合法候補で外れた枠」を再照合する追加候補。一致したら🚫付きで表示する。\nexport const ILLEGAL_MOVES = ${JSON.stringify(sorted, null, 0).replace(/","/g, '", "')};\n`;
writeFileSync(new URL("../src/illegal-moves.js", import.meta.url), out);
console.log(`src/illegal-moves.js を出力 (${sorted.length}件)`);
