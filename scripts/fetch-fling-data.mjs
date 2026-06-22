// なげつける(Fling)の威力テーブルを生成。items.tsからfling威力を抽出→PokeAPIで日本語名取得→src/item-fling.jsへ。
import { writeFileSync } from "node:fs";
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

const itemsSrc = await (await fetch(`${BASE}/data/items.ts`)).text();
const entries = [];
for (const { id, block } of iter(itemsSrc)) {
  const fm = block.match(/fling:\s*\{[^}]*basePower:\s*(\d+)/s);
  if (!fm) continue;
  if (block.match(/isNonstandard:\s*"([^"]+)"/)) continue; // 過去作専用item(化石・メール・ジュエル等)は除外
  const nm = block.match(/name:\s*"([^"]+)"/);
  entries.push({ id, name: nm ? nm[1] : id, power: Number(fm[1]) });
}
console.log(`fling威力あり(現行item): ${entries.length}件`);

const slug = (name) => name.toLowerCase().replace(/[''’.]/g, "").replace(/[\s]+/g, "-");
const jaName = async (e) => {
  for (const s of [slug(e.name), e.id]) {
    try {
      const r = await fetch(`https://pokeapi.co/api/v2/item/${s}`);
      if (!r.ok) continue;
      const d = await r.json();
      const ja = d.names.find(n => n.language.name === "ja-Hrkt") || d.names.find(n => n.language.name === "ja");
      if (ja) return ja.name;
    } catch { /* retry next slug */ }
  }
  return null;
};

// 並列(8)でJP名取得
const map = {}; const miss = [];
let done = 0;
const queue = [...entries];
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    const ja = await jaName(e);
    if (ja) { if (map[ja] == null) map[ja] = e.power; }
    else miss.push(`${e.name}(${e.id})=${e.power}`);
    if (++done % 40 === 0) console.log(`  ${done}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = Object.keys(map).sort((a, b) => a.localeCompare(b, "ja"));
console.log(`\n取得成功: ${sorted.length}件 / 失敗: ${miss.length}件`);
if (miss.length) console.log("失敗:", miss.join(", "));

const body = sorted.map(n => `  "${n}": ${map[n]},`).join("\n");
const out = `// 自動生成 (scripts/fetch-fling-data.mjs)。なげつける(Fling)の持ち物別威力。\nexport const ITEM_FLING = {\n${body}\n};\n`;
writeFileSync(new URL("../src/item-fling.js", import.meta.url), out);
console.log(`\nsrc/item-fling.js を出力 (${sorted.length}件)`);
