// pokedex-data.js の POKEMON_DATA を yakkun 50音順に並び替える（再取得なし）
import { readFileSync, writeFileSync } from "fs";
import { YAKKUN_ORDER } from "./yakkun-order.mjs";

const path = "src/pokedex-data.js";
const src = readFileSync(path, "utf8");
const m = src.match(/export const POKEMON_DATA = (\[[\s\S]*?\]);\n$/);
if (!m) { console.error("POKEMON_DATA抽出失敗"); process.exit(1); }

const arr = JSON.parse(m[1]);
const idx = Object.fromEntries(YAKKUN_ORDER.map((n, i) => [n, i]));
const notFound = arr.filter((p) => idx[p.name] === undefined).map((p) => p.name);
if (notFound.length) console.log("順序リスト外(末尾に配置):", notFound.join(", "));
arr.sort((a, b) => (idx[a.name] ?? 9999) - (idx[b.name] ?? 9999));

writeFileSync(path, src.replace(m[1], JSON.stringify(arr, null, 2)), "utf8");
console.log(`並び替え完了: ${arr.length}匹 / 先頭: ${arr.slice(0, 3).map((p) => p.name).join(", ")}`);
