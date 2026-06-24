/**
 * Showdown Champions modからポケモンデータを取得し、
 * champions-damage-calc.jsx 用のフォーマット（JS）に変換するスクリプト
 *
 * 実行: node scripts/fetch-showdown-data.mjs
 */

import { writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { YAKKUN_ORDER } from "./yakkun-order.mjs";

const BASE = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master";

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ──────────────────────────────────────────────────────────
// パーサ群
// ──────────────────────────────────────────────────────────

function* iterEntries(src) {
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^\t(?:"([^"]+)"|([a-z0-9]+)):\s*\{/);
    if (!m) { i++; continue; }
    const id = m[1] ?? m[2];
    let depth = 0;
    const blockLines = [];
    while (i < lines.length) {
      const l = lines[i];
      for (const ch of l) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      blockLines.push(l);
      i++;
      if (depth === 0) break;
    }
    yield { id, block: blockLines.join("\n") };
  }
}

function parseMoves(src) {
  const result = {};
  for (const { id, block } of iterEntries(src)) {
    // 過去作技も保持し、フラグだけ立てる（チャンピオンズmodが復活させる場合がある）
    const nonstandard = !!block.match(/\bisNonstandard:\s*"([^"]+)"/);
    const catM = block.match(/\bcategory:\s*"([^"]+)"/);
    if (!catM || catM[1] === "Status") continue;
    const typeM = block.match(/\btype:\s*"([^"]+)"/);
    const pwrM = block.match(/\bbasePower:\s*(\d+)/);
    const nameM = block.match(/\bname:\s*"([^"]+)"/);
    if (!typeM) continue;
    const entry = {
      basePower: pwrM ? Number(pwrM[1]) : 0,
      type: typeM[1],
      category: catM[1],
      name: nameM ? nameM[1] : id,
    };
    if (nonstandard) entry.nonstandard = true;
    const mhM = block.match(/\bmultihit:\s*(?:\[(\d+),\s*(\d+)\]|(\d+))/);
    if (mhM) {
      entry.multihit = mhM[3] ? [Number(mhM[3]), Number(mhM[3])] : [Number(mhM[1]), Number(mhM[2])];
    }
    // 追加効果(secondary)を持つ技＝ちからずく(×1.3)の対象。self補正のみ(オーバーヒート等)は対象外
    if (/\bsecondary:\s*\{/.test(block) || /\bsecondaries:\s*\[/.test(block)) entry.hasSecondary = true;
    result[id] = entry;
  }
  return result;
}

function parseChampionsMoves(src) {
  const overrides = {};
  for (const { id, block } of iterEntries(src)) {
    if (block.match(/\bisNonstandard:\s*"([^"]+)"/)) { overrides[id] = { remove: true }; continue; }
    const obj = {};
    if (block.match(/\bisNonstandard:\s*null/)) obj.enable = true; // 過去作技の復活
    const pwrM = block.match(/\bbasePower:\s*(\d+)/);
    const typeM = block.match(/\btype:\s*"([^"]+)"/);
    const catM = block.match(/\bcategory:\s*"([^"]+)"/);
    if (pwrM) obj.basePower = Number(pwrM[1]);
    if (typeM) obj.type = typeM[1];
    if (catM) obj.category = catM[1];
    overrides[id] = obj;
  }
  return overrides;
}

function parsePokedex(src) {
  const result = {};
  for (const { id, block } of iterEntries(src)) {
    const numM = block.match(/\bnum:\s*(-?\d+)/);
    const typesM = block.match(/\btypes:\s*\[([^\]]*)\]/);
    const bsM = block.match(/\bbaseStats:\s*\{([^}]*)\}/);
    const weightM = block.match(/\bweightkg:\s*([\d.]+)/);
    const abM = block.match(/\babilities:\s*\{([^}]*)\}/);
    if (!numM || !bsM) continue;
    const abilities = abM ? [...abM[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    let types = [];
    if (typesM) types = [...typesM[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const bs = {};
    const bsStr = bsM[1];
    for (const [key, alias] of [["hp","h"],["atk","a"],["def","b"],["spa","c"],["spd","d"],["spe","s"]]) {
      const fm = bsStr.match(new RegExp(`\\b${key}:\\s*(\\d+)`));
      if (fm) bs[alias] = Number(fm[1]);
    }
    result[id] = { num: Number(numM[1]), types, base: bs, weightkg: weightM ? Number(weightM[1]) : 0, abilities };
  }
  return result;
}

function parseLegalPokemon(src) {
  const legal = new Set();
  for (const { id, block } of iterEntries(src)) {
    if (block.includes('"Past"') || block.includes('"Illegal"') || block.includes('"Future"')) continue;
    legal.add(id);
  }
  return legal;
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

// ──────────────────────────────────────────────────────────
// 変換テーブル
// ──────────────────────────────────────────────────────────

const TYPE_EN_JA = {
  Normal:"ノーマル", Fire:"ほのお", Water:"みず", Electric:"でんき",
  Grass:"くさ", Ice:"こおり", Fighting:"かくとう", Poison:"どく",
  Ground:"じめん", Flying:"ひこう", Psychic:"エスパー", Bug:"むし",
  Rock:"いわ", Ghost:"ゴースト", Dragon:"ドラゴン", Dark:"あく",
  Steel:"はがね", Fairy:"フェアリー",
};
const CAT_EN_JA = { Physical:"物理", Special:"特殊" };

function nameToPokeapiId(name) {
  return name.toLowerCase()
    .replace(/['']/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// フォルム違い・地域変種の日本語名ハードコードマッピング
// PokeAPI の /pokemon-species/ はベース種のみを持つため、フォルム名は手動で設定
// （fetch-usage-data.mjs からも import して採用率データのフォルム名解決に使う）
export const FORME_JA_NAMES = {
  // 地域変種（表記はポケモン徹底攻略に準拠）
  raichualola:        "ライチュウ(アローラ)",
  ninetalesalola:     "キュウコン(アローラ)",
  arcaninehisui:      "ウインディ(ヒスイ)",
  slowbrogalar:       "ヤドラン(ガラル)",
  slowkinggalar:      "ヤドキング(ガラル)",
  samurotthisui:      "ダイケンキ(ヒスイ)",
  decidueyehisui:     "ジュナイパー(ヒスイ)",
  zoroarkhisui:       "ゾロアーク(ヒスイ)",
  goodrahisui:        "ヌメルゴン(ヒスイ)",
  avalugghisui:       "クレベース(ヒスイ)",
  typhlosionhisui:    "バクフーン(ヒスイ)",
  stunfiskgalar:      "マッギョ(ガラル)",
  taurospaldeacombat: "ケンタロス(パルデア単)",
  taurospaldeablaze:  "ケンタロス(パルデア炎)",
  taurospaldeaaqua:   "ケンタロス(パルデア水)",
  // メガシンカ
  venusaurmega:       "フシギバナ(メガ)",
  charizardmegax:     "リザードン(メガX)",
  charizardmegay:     "リザードン(メガY)",
  blastoisemega:      "カメックス(メガ)",
  beedrillmega:       "スピアー(メガ)",
  pidgeotmega:        "ピジョット(メガ)",
  alakazammega:       "フーディン(メガ)",
  slowbromega:        "ヤドラン(メガ)",
  gengarmega:         "ゲンガー(メガ)",
  kangaskhanmega:     "ガルーラ(メガ)",
  pinsirmega:         "カイロス(メガ)",
  gyaradosmega:       "ギャラドス(メガ)",
  aerodactylmega:     "プテラ(メガ)",
  ampharosmega:       "デンリュウ(メガ)",
  scizormega:         "ハッサム(メガ)",
  heracrossmega:      "ヘラクロス(メガ)",
  houndoommega:       "ヘルガー(メガ)",
  tyranitarmega:      "バンギラス(メガ)",
  gardevoirmega:      "サーナイト(メガ)",
  aggronmega:         "ボスゴドラ(メガ)",
  medichammega:       "チャーレム(メガ)",
  manectricmega:      "ライボルト(メガ)",
  sharpedomega:       "サメハダー(メガ)",
  cameruptmega:       "バクーダ(メガ)",
  altariamega:        "チルタリス(メガ)",
  banettemega:        "ジュペッタ(メガ)",
  absolmega:          "アブソル(メガ)",
  glaliemega:         "オニゴーリ(メガ)",
  sableyemega:        "ヤミラミ(メガ)",
  lucariomega:        "ルカリオ(メガ)",
  abomasnowmega:      "ユキノオー(メガ)",
  gallademega:        "エルレイド(メガ)",
  starmiemega:        "スターミー(メガ)",
  aerodactylmega:     "プテラ(メガ)",
  lopunnymega:        "ミミロップ(メガ)",
  floettemega:        "フラエッテ(メガ)",
  meowsticmmega:      "ニャオニクス♂(メガ)",
  meowsticfmega:      "ニャオニクス♀(メガ)",
  // PokeAPI IDが異なるため404になる
  kommoo:             "ジャラランガ",
  mrrime:             "バリコオル",
  // 名前にフォルム付記が必要なもの
  meowstic:           "ニャオニクス♂",
  meowsticf:          "ニャオニクス♀",
  basculegion:        "イダイトウ♂",
  basculegionf:       "イダイトウ♀",
  aegislash:          "ギルガルド(シールド)",
  aegislashblade:     "ギルガルド(ブレード)",
  gourgeist:          "パンプジン(普通)",
  gourgeistsmall:     "パンプジン(小)",
  gourgeistlarge:     "パンプジン(大)",
  gourgeistsuper:     "パンプジン(特大)",
  palafin:            "イルカマン(ナイーブ)",
  palafinhero:        "イルカマン(マイティ)",
  lycanroc:           "ルガルガン(まひる)",
  lycanrocmidnight:   "ルガルガン(まよなか)",
  lycanrocdusk:       "ルガルガン(たそがれ)",
  floetteeternal:     "フラエッテ(えいえん)",
  // PokeAPI取得が不安定なためハードコード
  avalugg:            "クレベース",
  hatterene:          "ブリムオン",
  archaludon:         "ブリジュラス",
  ditto:              "メタモン",
  // ロトム変化（yakkun表記）
  rotom:              "ロトム",
  rotomheat:          "ヒートロトム",
  rotomwash:          "ウォッシュロトム",
  rotomfrost:         "フロストロトム",
  rotomfan:           "スピンロトム",
  rotommow:           "カットロトム",
};

// Showdownのlearnsets/legalに無いがゲームには存在するフォルム
// （learnsetをベースから継承して強制収録）
const EXTRA_FORMS = {
  aegislashblade: "aegislash",
  gourgeistsmall: "gourgeist",
  gourgeistlarge: "gourgeist",
  gourgeistsuper: "gourgeist",
  palafinhero:    "palafin",
  // formats-dataのlegal判定から漏れるがyakkun内定リストに存在（learnsetは自前）
  hatterene:      "hatterene",
  archaludon:     "archaludon",
  avalugg:        "avalugg",
  floetteeternal: "floetteeternal",
  meowsticf:      "meowsticf",
  // メガ（learnsetをベースから継承）
  meowsticmmega: "meowstic",
  floettemega:   "floetteeternal",
};

// 除外する技
// 固定ダメージ系・カウンター系・一撃必殺・チャンピオンズで誰も覚えない過去技。
// 「威力が変動するだけ」の技(アシストパワー等)は除外せず VARIABLE_MOVES で代表威力を付けて収録する。
const EXCLUDED_MOVES = new Set([
  // 固定ダメージ・カウンター（標準ダメージ計算式に乗らない）
  "counter", "mirrorcoat", "finalgambit", "endeavor", "superfang",
  // 一撃必殺技
  "horndrill", "guillotine", "sheercold", "fissure",
  // チャンピオンズで誰も覚えない過去作技（収録不要）
  "naturalgift", "return", "frustration", "trumpcard", "wringout", "crushgrip", "magnitude", "hiddenpower",
]);

// 威力が状況で変動する技。代表威力(p)で収録し、計算側で威力を手動調整できるよう va/vh フラグを付ける。
const VARIABLE_MOVES = {
  storedpower: { p: 20,  h: "基礎20＋積みランク合計×20" },
  reversal:    { p: 20,  h: "自分のHPが少ないほど高威力(最大200)" },
  flail:       { p: 20,  h: "自分のHPが少ないほど高威力(最大200)" },
  eruption:    { p: 150, h: "自分のHPが多いほど高威力(最大150)" },
  waterspout:  { p: 150, h: "自分のHPが多いほど高威力(最大150)" },
  gyroball:    { p: 100, h: "自分が遅いほど高威力(最大150)" },
  electroball: { p: 100, h: "自分が速いほど高威力(最大150)" },
  heavyslam:   { p: 120, h: "相手が軽いほど高威力(最大120)" },
  heatcrash:   { p: 120, h: "相手が軽いほど高威力(最大120)" },
  beatup:      { p: 40,  h: "手持ちの数だけ多段(各≈基礎攻撃/10+5)" },
  spitup:      { p: 300, h: "のみこむ回数で100/200/300" },
  fling:       { p: 30,  h: "持ち物依存(例: くろいてっきゅう130)" },
};

// 特殊フラグ技
const SPECIAL_MOVES = {
  lowkick:    { lk: true, p: 0 },
  grassknot:  { lk: true, p: 0 },
  weatherball:{ ws: true },
  bodypress:  { bp: true },
};

// ──────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────

async function fetchMoveJaNames(moveEntriesById, batchSize = 8) {
  const map = {};
  const ids = Object.keys(moveEntriesById);
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all(batch.map(async (showdownId) => {
      const englishName = moveEntriesById[showdownId].name;
      const apiId = nameToPokeapiId(englishName);
      const tryFetch = async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.json();
          return data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja")?.name ?? null;
        } catch { return null; }
      };
      const ja = await tryFetch(`https://pokeapi.co/api/v2/move/${apiId}/`)
              ?? await tryFetch(`https://pokeapi.co/api/v2/move/${showdownId}/`);
      if (ja) map[showdownId] = ja;
    }));
    process.stdout.write(`  ${i + batch.length}/${ids.length}\r`);
  }
  return map;
}

async function fetchPokeJaNames(ids, formeMap, batchSize = 5) {
  const map = { ...formeMap }; // フォルムはハードコードから
  const toFetch = ids.filter((id) => !map[id]);
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    await Promise.all(batch.map(async (id) => {
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
        if (!res.ok) return;
        const data = await res.json();
        const ja = data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja");
        if (ja) map[id] = ja.name;
      } catch {}
    }));
    process.stdout.write(`  ${i + batch.length}/${toFetch.length}\r`);
  }
  return map;
}

// チャンピオンズ新規特性などPokeAPIに無いものの日本語名（Serebii/yakkun準拠）
const ABILITY_JA_OVERRIDES = {
  "Mega Solar": "メガソーラー",
  "Dragon's Skin": "ドラゴンスキン",
  "Dragonscale": "ドラゴンスキン",
  "Piercing Drill": "かんつうドリル",
  "Bursting Habanero": "とびだすハバネロ",
  "Spilling Guts": "とびだすなかみ",
  "Unseen Fist": "ふかしのこぶし",
  "Eelevate": "うなぎのぼり",
  "Fire Mane": "ほのおのたてがみ",
};

async function fetchAbilityJaNames(enNames, batchSize = 8) {
  const map = {};
  const list = [...enNames];
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    await Promise.all(batch.map(async (en) => {
      if (ABILITY_JA_OVERRIDES[en]) { map[en] = ABILITY_JA_OVERRIDES[en]; return; }
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/ability/${nameToPokeapiId(en)}/`);
        if (!res.ok) return;
        const data = await res.json();
        const ja = data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja");
        if (ja) map[en] = ja.name;
      } catch {}
    }));
    process.stdout.write(`  ${Math.min(i + batchSize, list.length)}/${list.length}\r`);
  }
  return map;
}

function weightPower(kg) {
  if (kg < 10) return 20; if (kg < 25) return 40; if (kg < 50) return 60;
  if (kg < 100) return 80; if (kg < 200) return 100; return 120;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────
async function main() {
  console.log("=== Showdownデータ取得 ===");

  console.log("[1/5] formats-data.ts"); const formatsSrc = await fetchText(`${BASE}/data/mods/champions/formats-data.ts`);
  console.log("[2/5] learnsets.ts");    const learnsetsSrc = await fetchText(`${BASE}/data/mods/champions/learnsets.ts`);
  console.log("[3/5] moves.ts");        const movesSrc = await fetchText(`${BASE}/data/moves.ts`);
  console.log("[4/5] champ moves.ts");  const champMovesSrc = await fetchText(`${BASE}/data/mods/champions/moves.ts`);
  console.log("[5/5] pokedex.ts");      const pokedexSrc = await fetchText(`${BASE}/data/pokedex.ts`);

  console.log("\nパース...");
  const legalSet = parseLegalPokemon(formatsSrc);
  const learnsets = parseLearnsets(learnsetsSrc);
  const baseMoves = parseMoves(movesSrc);
  const champOverrides = parseChampionsMoves(champMovesSrc);
  const pokedex = parsePokedex(pokedexSrc);

  console.log(`  参加可能:${legalSet.size}  learnsets:${Object.keys(learnsets).length}  moves:${Object.keys(baseMoves).length}  pokedex:${Object.keys(pokedex).length}`);

  // 技マージ
  const mergedMoves = { ...baseMoves };
  for (const [id, ov] of Object.entries(champOverrides)) {
    if (ov.remove) { delete mergedMoves[id]; continue; }
    if (mergedMoves[id]) {
      const { enable, ...rest } = ov;
      Object.assign(mergedMoves[id], rest);
      if (enable) delete mergedMoves[id].nonstandard;
    }
  }
  // 復活しなかった過去作技は除外
  for (const [id, mv] of Object.entries(mergedMoves)) {
    if (mv.nonstandard) delete mergedMoves[id];
  }

  // メガシンカはlearnsetを持たないためベース種から継承
  for (const id of legalSet) {
    if (learnsets[id]) continue;
    const m = id.match(/^(.+?)mega[xy]?$/);
    if (m && learnsets[m[1]]) learnsets[id] = learnsets[m[1]];
  }
  // フォルム違いの強制収録（learnsetをベースから継承）
  for (const [id, base] of Object.entries(EXTRA_FORMS)) {
    if (!learnsets[id] && learnsets[base]) learnsets[id] = learnsets[base];
  }

  // 使用技収集
  const pokemonIds = Object.keys(learnsets).filter((id) => legalSet.has(id) || EXTRA_FORMS[id]);
  const usedMoveEntries = {};
  for (const pokeid of pokemonIds) {
    for (const mv of learnsets[pokeid] ?? []) {
      if (EXCLUDED_MOVES.has(mv)) continue;
      const special = SPECIAL_MOVES[mv];
      const data = mergedMoves[mv];
      if (!data && !special) continue;
      if (data && !CAT_EN_JA[data.category]) continue;
      if (!usedMoveEntries[mv]) {
        usedMoveEntries[mv] = data ?? { name: mv, basePower: 0, type: "Normal", category: "Physical" };
      }
    }
  }

  console.log(`\n技の日本語名取得 (${Object.keys(usedMoveEntries).length}件)...`);
  const moveJaMap = await fetchMoveJaNames(usedMoveEntries);
  console.log(`\n  → ${Object.keys(moveJaMap).length}件`);

  const missing = Object.keys(usedMoveEntries).filter((id) => !moveJaMap[id]);
  if (missing.length) console.log(`  未取得:`, missing.join(", "));

  console.log(`\nポケモン日本語名取得 (${pokemonIds.length}件)...`);
  const pokeJaMap = await fetchPokeJaNames(pokemonIds, FORME_JA_NAMES);
  // メガの日本語名はベース種名から自動生成（チャンピオンズ新規メガ対応）
  for (const id of pokemonIds) {
    if (pokeJaMap[id]) continue;
    const m = id.match(/^(.+?)mega([xy]?)$/);
    if (m && pokeJaMap[m[1]]) {
      pokeJaMap[id] = `${pokeJaMap[m[1]]}(メガ${m[2].toUpperCase()})`;
    }
  }
  console.log(`\n  → ${Object.keys(pokeJaMap).length}件`);

  const missingPoke = pokemonIds.filter((id) => !pokeJaMap[id]);
  if (missingPoke.length) console.log(`  未取得:`, missingPoke.join(", "));

  // 特性の日本語名取得
  const abilityEnSet = new Set();
  for (const id of pokemonIds) for (const ab of pokedex[id]?.abilities ?? []) abilityEnSet.add(ab);
  console.log(`\n特性の日本語名取得 (${abilityEnSet.size}件)...`);
  const abilityJaMap = await fetchAbilityJaNames(abilityEnSet);
  console.log(`\n  → ${Object.keys(abilityJaMap).length}件`);
  const missingAb = [...abilityEnSet].filter((en) => !abilityJaMap[en]);
  if (missingAb.length) console.log(`  未取得:`, missingAb.join(", "));

  // 技辞書 M を構築
  const M = {};
  for (const [mvId, data] of Object.entries(usedMoveEntries)) {
    const jaName = moveJaMap[mvId];
    if (!jaName) continue;
    const special = SPECIAL_MOVES[mvId];
    const typeJa = TYPE_EN_JA[data.type];
    const catJa = CAT_EN_JA[data.category];
    if (!typeJa || !catJa) continue;
    const variable = VARIABLE_MOVES[mvId];
    const entry = { t: typeJa, c: catJa, p: variable?.p ?? special?.p ?? data.basePower ?? 0 };
    if (special?.lk) entry.lk = true;
    if (special?.ws) entry.ws = true;
    if (special?.bp) entry.bp = true;
    if (variable) { entry.va = 1; entry.vh = variable.h; } // 威力が状況変動する技（計算側で威力を手動調整）
    if (data.multihit) entry.hits = data.multihit;
    if (data.hasSecondary) entry.sf = 1; // 追加効果あり＝ちからずくの対象技
    M[jaName] = entry;
  }

  // POKEMON データを構築
  const POKEMON = [];
  for (const pokeid of pokemonIds) {
    const pdex = pokedex[pokeid];
    if (!pdex) continue;
    const jaName = pokeJaMap[pokeid];
    if (!jaName) continue;
    const typesJa = pdex.types.map((t) => TYPE_EN_JA[t]).filter(Boolean);
    const learnsetJa = [];
    for (const mvId of learnsets[pokeid] ?? []) {
      if (EXCLUDED_MOVES.has(mvId)) continue;
      const jaMove = moveJaMap[mvId];
      if (!jaMove || !M[jaMove]) continue;
      learnsetJa.push(jaMove);
    }
    if (learnsetJa.length === 0 && pokeid !== "ditto") continue; // メタモンは防御側用に収録
    POKEMON.push({
      name: jaName,
      types: typesJa,
      base: pdex.base,
      weightPower: weightPower(pdex.weightkg),
      w: pdex.weightkg, // 重さ(kg)。ヘビーボンバー/ヒートスタンプの威力計算用
      abilities: [...new Set((pdex.abilities ?? []).map((en) => abilityJaMap[en]).filter(Boolean))],
      learnset: learnsetJa,
    });
  }

  // yakkun 50音順リストに従って並び替え（リスト外は末尾）
  const orderIdx = Object.fromEntries(YAKKUN_ORDER.map((n, i) => [n, i]));
  POKEMON.sort((a, b) => (orderIdx[a.name] ?? 9999) - (orderIdx[b.name] ?? 9999));

  console.log(`\n変換完了: ${POKEMON.length}匹, ${Object.keys(M).length}技`);

  const output = `// 自動生成: scripts/fetch-showdown-data.mjs
// Showdown Champions mod データ (${new Date().toISOString().slice(0, 10)})
// ${POKEMON.length}匹 / ${Object.keys(M).length}技
export const M_DATA = ${JSON.stringify(M, null, 2)};

export const POKEMON_DATA = ${JSON.stringify(POKEMON, null, 2)};
`;

  writeFileSync("src/pokedex-data.js", output, "utf-8");
  console.log("src/pokedex-data.js を出力しました");

  // 検証
  const f = Math.floor;
  const hpStat = (base, sp) => f((base * 2 + 31) * 50 / 100) + 60 + sp;
  const stat = (base, sp, nat) => f((f((base * 2 + 31) * 50 / 100) + 5 + sp) * nat);

  console.log("\n=== 検証 ===");
  for (const { name, h, a, expectedHP, expectedA } of [
    { name:"ガブリアス", h:108, a:130, expectedHP:215, expectedA:200 },
    { name:"リザードン", h:78,  a:84  },
    { name:"カイリュー", h:91,  a:134 },
  ]) {
    const p = POKEMON.find((x) => x.name === name);
    if (!p) { console.log(`✗ ${name}: 見つかりません`); continue; }
    const hp = hpStat(p.base.h, 32);
    const atk = stat(p.base.a, 32, 1.1);
    console.log(
      `${name}: 種族値H${p.base.h===h?"✓":"✗"} A${p.base.a===a?"✓":"✗"}`
      + (expectedHP ? `  HP=${hp}${hp===expectedHP?"✓":"✗"}` : "")
      + (expectedA  ? `  A=${atk}${atk===expectedA?"✓":"✗"}` : "")
      + `  技数:${p.learnset.length}`
    );
  }
}

// 直接 `node scripts/fetch-showdown-data.mjs` で実行した時のみ走らせる。
// 他スクリプト(fetch-usage-data.mjs)から FORME_JA_NAMES を import しても生成は走らない。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}
