// ダメ計対象外（固定/一撃必殺/カウンター系で計算式に乗らない）だが実在する技を、
// 「実際に覚えるポケモンだけ」チーム登録で選べるよう、Champions learnsets から該当ポケを集めて src/excludedLearnset.js を出力する。
// learnsets.ts は継承込みの全技を各種族に持つので prevo 解決は不要（本家 fetch-showdown-data.mjs と同じ direct 方式）。
// 実行: node scripts/fetch-excluded-learnset.mjs
import { writeFileSync } from "fs";
import { POKEMON_DATA } from "../src/pokedex-data.js";

const BASE = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master";

// 対象技: showdownId → 日本語名（本家 EXCLUDED_MOVES のうち、チャンピオンズに実在する実用技）
const EXCL_JA = {
  counter: "カウンター", mirrorcoat: "ミラーコート", finalgambit: "いのちがけ",
  endeavor: "がむしゃら", superfang: "いかりのまえば",
  horndrill: "つのドリル", guillotine: "ハサミギロチン", sheercold: "ぜったいれいど", fissure: "じわれ",
};

// ===== fetch-showdown-data.mjs から流用（パーサ＋JP名） =====
async function fetchText(url) { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`); return res.text(); }
function* iterEntries(src) {
  const lines = src.split("\n"); let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\t(?:"([^"]+)"|([a-z0-9]+)):\s*\{/);
    if (!m) { i++; continue; }
    const id = m[1] ?? m[2]; let depth = 0; const blockLines = [];
    while (i < lines.length) { const l = lines[i]; for (const ch of l) { if (ch === "{") depth++; else if (ch === "}") depth--; } blockLines.push(l); i++; if (depth === 0) break; }
    yield { id, block: blockLines.join("\n") };
  }
}
function parseLearnsets(src) {
  const result = {};
  for (const { id, block } of iterEntries(src)) {
    if (!block.includes("learnset:")) continue;
    const moves = [...block.matchAll(/^\t\t\t([a-z0-9]+):/gm)].map((m) => m[1]);
    if (moves.length) result[id] = moves;
  }
  return result;
}
function parseLegalPokemon(src) {
  const legal = new Set();
  for (const { id, block } of iterEntries(src)) { if (block.includes('"Past"') || block.includes('"Illegal"') || block.includes('"Future"')) continue; legal.add(id); }
  return legal;
}
async function fetchPokeJaNames(ids, formeMap, batchSize = 6) {
  const map = { ...formeMap };
  const toFetch = ids.filter((id) => !map[id]);
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    await Promise.all(batch.map(async (id) => {
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
        if (!res.ok) return;
        const data = await res.json();
        const ja = data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja-hrkt" || n.language.name === "ja");
        if (ja) map[id] = ja.name;
      } catch {}
    }));
    process.stdout.write(`  ${Math.min(i + batchSize, toFetch.length)}/${toFetch.length}\r`);
  }
  return map;
}
const FORME_JA_NAMES = {
  raichualola: "ライチュウ(アローラ)", ninetalesalola: "キュウコン(アローラ)", arcaninehisui: "ウインディ(ヒスイ)",
  slowbrogalar: "ヤドラン(ガラル)", slowkinggalar: "ヤドキング(ガラル)", samurotthisui: "ダイケンキ(ヒスイ)",
  decidueyehisui: "ジュナイパー(ヒスイ)", zoroarkhisui: "ゾロアーク(ヒスイ)", goodrahisui: "ヌメルゴン(ヒスイ)",
  avalugghisui: "クレベース(ヒスイ)", typhlosionhisui: "バクフーン(ヒスイ)", stunfiskgalar: "マッギョ(ガラル)",
  taurospaldeacombat: "ケンタロス(パルデア単)", taurospaldeablaze: "ケンタロス(パルデア炎)", taurospaldeaaqua: "ケンタロス(パルデア水)",
  venusaurmega: "フシギバナ(メガ)", charizardmegax: "リザードン(メガX)", charizardmegay: "リザードン(メガY)",
  blastoisemega: "カメックス(メガ)", beedrillmega: "スピアー(メガ)", pidgeotmega: "ピジョット(メガ)",
  alakazammega: "フーディン(メガ)", slowbromega: "ヤドラン(メガ)", gengarmega: "ゲンガー(メガ)",
  kangaskhanmega: "ガルーラ(メガ)", pinsirmega: "カイロス(メガ)", gyaradosmega: "ギャラドス(メガ)",
  aerodactylmega: "プテラ(メガ)", ampharosmega: "デンリュウ(メガ)", scizormega: "ハッサム(メガ)",
  heracrossmega: "ヘラクロス(メガ)", houndoommega: "ヘルガー(メガ)", tyranitarmega: "バンギラス(メガ)",
  gardevoirmega: "サーナイト(メガ)", aggronmega: "ボスゴドラ(メガ)", medichammega: "チャーレム(メガ)",
  manectricmega: "ライボルト(メガ)", sharpedomega: "サメハダー(メガ)", cameruptmega: "バクーダ(メガ)",
  altariamega: "チルタリス(メガ)", banettemega: "ジュペッタ(メガ)", absolmega: "アブソル(メガ)",
  glaliemega: "オニゴーリ(メガ)", sableyemega: "ヤミラミ(メガ)", lucariomega: "ルカリオ(メガ)",
  abomasnowmega: "ユキノオー(メガ)", gallademega: "エルレイド(メガ)", starmiemega: "スターミー(メガ)",
  lopunnymega: "ミミロップ(メガ)", floettemega: "フラエッテ(メガ)", meowsticmmega: "ニャオニクス♂(メガ)",
  meowsticfmega: "ニャオニクス♀(メガ)", kommoo: "ジャラランガ", mrrime: "バリコオル",
  meowstic: "ニャオニクス♂", meowsticf: "ニャオニクス♀", basculegion: "イダイトウ♂", basculegionf: "イダイトウ♀",
  aegislash: "ギルガルド(シールド)", aegislashblade: "ギルガルド(ブレード)", gourgeist: "パンプジン(普通)",
  gourgeistsmall: "パンプジン(小)", gourgeistlarge: "パンプジン(大)", gourgeistsuper: "パンプジン(特大)",
  palafin: "イルカマン(ナイーブ)", palafinhero: "イルカマン(マイティ)", lycanroc: "ルガルガン(まひる)",
  lycanrocmidnight: "ルガルガン(まよなか)", lycanrocdusk: "ルガルガン(たそがれ)", floetteeternal: "フラエッテ(えいえん)",
  avalugg: "クレベース", hatterene: "ブリムオン", archaludon: "ブリジュラス", ditto: "メタモン",
  rotom: "ロトム", rotomheat: "ヒートロトム", rotomwash: "ウォッシュロトム", rotomfrost: "フロストロトム",
  rotomfan: "スピンロトム", rotommow: "カットロトム",
};
const EXTRA_FORMS = {
  aegislashblade: "aegislash", gourgeistsmall: "gourgeist", gourgeistlarge: "gourgeist", gourgeistsuper: "gourgeist",
  palafinhero: "palafin", hatterene: "hatterene", archaludon: "archaludon", avalugg: "avalugg",
  floetteeternal: "floetteeternal", meowsticf: "meowsticf", meowsticmmega: "meowstic", floettemega: "floetteeternal",
};

async function main() {
  console.log("learnsets/formats 取得...");
  const [formatsSrc, learnsetsSrc] = await Promise.all([
    fetchText(`${BASE}/data/mods/champions/formats-data.ts`),
    fetchText(`${BASE}/data/mods/champions/learnsets.ts`),
  ]);
  const legalSet = parseLegalPokemon(formatsSrc);
  const learnsets = parseLearnsets(learnsetsSrc);
  // メガ＝ベース継承 / フォルム＝EXTRA_FORMS継承（本家と同じ）
  for (const id of legalSet) { if (learnsets[id]) continue; const m = id.match(/^(.+?)mega[xy]?$/); if (m && learnsets[m[1]]) learnsets[id] = learnsets[m[1]]; }
  for (const [id, base] of Object.entries(EXTRA_FORMS)) { if (!learnsets[id] && learnsets[base]) learnsets[id] = learnsets[base]; }

  const pokemonIds = Object.keys(learnsets).filter((id) => legalSet.has(id) || EXTRA_FORMS[id]);
  // id → 覚えている対象技(showdownId)
  const idExcl = {};
  for (const id of pokemonIds) { const e = (learnsets[id] ?? []).filter((mv) => EXCL_JA[mv]); if (e.length) idExcl[id] = e; }
  const learnerIds = Object.keys(idExcl);
  console.log(`対象技を覚えるポケ: ${learnerIds.length}件 / 日本語名取得...`);

  const pokeJa = await fetchPokeJaNames(learnerIds, FORME_JA_NAMES);
  for (const id of learnerIds) { if (pokeJa[id]) continue; const m = id.match(/^(.+?)mega([xy]?)$/); if (m && pokeJa[m[1]]) pokeJa[id] = `${pokeJa[m[1]]}(メガ${m[2].toUpperCase()})`; }

  // jaName → [日本語技名]（POKEMON_DATAに実在する名前だけ採用）
  const validNames = new Set(POKEMON_DATA.map((p) => p.name));
  const out = {}; const unresolved = []; const notInData = [];
  for (const id of learnerIds) {
    const ja = pokeJa[id];
    if (!ja) { unresolved.push(id); continue; }
    if (!validNames.has(ja)) { notInData.push(`${id}->${ja}`); continue; }
    const moves = [...new Set(idExcl[id].map((mv) => EXCL_JA[mv]))].sort((a, b) => a.localeCompare(b, "ja"));
    out[ja] = [...new Set([...(out[ja] || []), ...moves])].sort((a, b) => a.localeCompare(b, "ja"));
  }
  if (unresolved.length) console.log("⚠ 日本語名未解決:", unresolved.join(", "));
  if (notInData.length) console.log("⚠ POKEMON_DATA外(除外):", notInData.join(", "));

  // 技別の収録数を表示（検証用）
  const perMove = {};
  for (const moves of Object.values(out)) for (const mv of moves) perMove[mv] = (perMove[mv] || 0) + 1;
  console.log("収録:", Object.keys(out).length, "匹 /", JSON.stringify(perMove));

  const sortedKeys = Object.keys(out).sort((a, b) => a.localeCompare(b, "ja"));
  const body = sortedKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`).join("\n");
  const js = `// 自動生成 (scripts/fetch-excluded-learnset.mjs)。Champions learnsets 由来。
// ダメ計には出ない（固定/一撃必殺/カウンター系）が実在する技を、実際に覚えるポケモンだけチーム登録で選べるようにする対応表。
// ポケモン名(POKEMON_DATA準拠) → そのポケが覚える対象技の日本語名配列。
export const EXCLUDED_LEARNSET = {
${body}
};
`;
  writeFileSync("src/excludedLearnset.js", js, "utf-8");
  console.log("src/excludedLearnset.js を出力しました");
}
main().catch(console.error);
