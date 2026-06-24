/**
 * Supabase の採用率データ(champions_pokemon_stats)を取得し、ダメ計用に
 *   src/usage-data.js   →  export const MOVE_USAGE = { 日本語ポケ名: { 日本語技名: 採用率% } }
 * を生成するスクリプト。
 *
 * - 技スラッグ(earthquake 等)は PokeAPI 形式なので pokeapi.co/move/{slug} で日本語名を取得。
 * - ポケモンは pokemon_id(全国図鑑番号)→ PokeAPI species、フォルムは FORME_JA_NAMES を流用。
 * - 取得した日本語名は生成済み pokedex-data.js(M_DATA/POKEMON_DATA)と照合し、一致した
 *   「攻撃技」のみ採用する(変化技は M_DATA に無いので自然に除外される)。
 * - PokeAPI は scripts/.pokeapi-ja-cache.json にキャッシュ(再実行を速く・APIに優しく)。
 *
 * 実行(PowerShell):
 *   $env:SUPABASE_KEY="<anon public key>"; node scripts/fetch-usage-data.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { FORME_JA_NAMES } from "./fetch-showdown-data.mjs";
import { M_DATA, POKEMON_DATA } from "../src/pokedex-data.js";

const KEY = process.env.SUPABASE_KEY;
if (!KEY) {
  console.error('環境変数 SUPABASE_KEY が未設定です。\n  $env:SUPABASE_KEY="<anon public key>"; node scripts/fetch-usage-data.mjs');
  process.exit(1);
}

// 取得対象(レギュ更新時はここを変える)。reg_mb=M-B(最新), reg_m1=M-A。月は最新の月を指定。
const MONTH = "2026-06", REG = "reg_mb", FORMAT = "singles";
const SB_URL = "https://misabaliuftjkqigysvv.supabase.co/rest/v1/champions_pokemon_stats"
  + `?month=eq.${MONTH}&regulation=eq.${REG}&battle_format=eq.${FORMAT}`;

// PokeAPI が不安定/ID相違で取れない種の日本語名(fetch-showdown-data.mjs と同じ値)。全国図鑑番号→名前
const DEX_JA_OVERRIDE = {
  1018: "ブリジュラス", 858: "ブリムオン", 713: "クレベース",
  132: "メタモン", 784: "ジャラランガ", 866: "バリコオル",
  // ベース(region_form="")だが、アプリは既定フォルム名で持っている多フォルム種
  681: "ギルガルド(シールド)", 902: "イダイトウ♂", 964: "イルカマン(ナイーブ)",
  678: "ニャオニクス♂", 711: "パンプジン(普通)", 745: "ルガルガン(まひる)",
};

// region_form スラッグの例外(FORME_JA_NAMES のキー規則に合わないもの) → 日本語名を直接指定
const FORM_SLUG_OVERRIDE = {
  "meowstic-mega": "ニャオニクス♂(メガ)", // 既定(♂)メガ。FORME_JA_NAMES は meowsticmmega/meowsticfmega 別キー
};

// ── PokeAPI 日本語名キャッシュ ──
const CACHE_PATH = new URL("./.pokeapi-ja-cache.json", import.meta.url);
const cache = existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, "utf-8"))
  : {};
for (const k of ["move", "species", "ability"]) cache[k] ??= {};

async function fetchJa(endpoint, id) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/${endpoint}/${id}/`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja")?.name ?? null;
  } catch { return null; }
}

// 未キャッシュIDだけを並列バッチで取得してキャッシュへ
async function warmCache(kind, ids, batchSize = 8) {
  const store = cache[kind];
  const endpoint = { move: "move", species: "pokemon-species", ability: "ability" }[kind];
  const todo = [...new Set(ids)].filter((id) => !(id in store));
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    await Promise.all(batch.map(async (id) => { store[id] = await fetchJa(endpoint, id); }));
    process.stdout.write(`  ${kind}: ${Math.min(i + batchSize, todo.length)}/${todo.length}\r`);
  }
  if (todo.length) process.stdout.write("\n");
}

// region_form スラッグ → FORME_JA_NAMES のキー(ハイフン除去 + 例外正規化)
function formKey(slug) {
  return slug.replace(/-/g, "").replace(/breed$/, "").replace(/female$/, "f");
}

function pokemonJaName(row) {
  if (row.region_form) return FORM_SLUG_OVERRIDE[row.region_form] ?? FORME_JA_NAMES[formKey(row.region_form)] ?? null;
  if (DEX_JA_OVERRIDE[row.pokemon_id]) return DEX_JA_OVERRIDE[row.pokemon_id];
  return cache.species[row.pokemon_id] ?? null;
}

async function main() {
  console.log(`=== 採用率データ取得 (${MONTH} / ${REG} / ${FORMAT}) ===`);
  const res = await fetch(`${SB_URL}&limit=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) { console.error("Supabase取得失敗:", res.status, await res.text()); process.exit(1); }
  const rows = await res.json();
  console.log(`Supabase: ${rows.length}件取得`);

  // PokeAPI 日本語名をまとめて取得(重複は自動で1回)
  console.log("PokeAPI 日本語名を取得中...");
  await warmCache("move", rows.flatMap((r) => (r.moves || []).map((m) => m.name)));
  await warmCache("species", rows.filter((r) => !r.region_form).map((r) => r.pokemon_id));
  await warmCache("ability", rows.flatMap((r) => (r.abilities || []).map((a) => a.name)));
  writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf-8");

  const M_KEYS = new Set(Object.keys(M_DATA));
  const P_NAMES = new Set(POKEMON_DATA.map((p) => p.name));
  const A_NAMES = new Set(POKEMON_DATA.flatMap((p) => p.abilities || []));

  const USAGE = {};
  const ABILITY_USAGE = {};
  const unmappedPoke = [];
  const failedMoveJa = new Set();
  const failedAbilityJa = new Set();
  let mappedPoke = 0, totalMoveEntries = 0, totalAbilityEntries = 0;

  for (const row of rows) {
    const jaName = pokemonJaName(row);
    if (!jaName || !P_NAMES.has(jaName)) {
      unmappedPoke.push(
        `${row.pokemon_name_ko}(id${row.pokemon_id}${row.region_form ? "/" + row.region_form : ""})`
        + (jaName ? ` → ${jaName}[POKEMON_DATAに無し]` : " → 日本語名取得失敗")
      );
      continue;
    }
    const moves = {};
    for (const mv of (row.moves || [])) {
      const ja = cache.move[mv.name];
      if (!ja) { failedMoveJa.add(mv.name); continue; }
      if (!M_KEYS.has(ja)) continue; // 変化技など、ダメ計の技リストに無いものは除外
      moves[ja] = mv.usage;
    }
    if (Object.keys(moves).length) {
      USAGE[jaName] = moves;
      mappedPoke++;
      totalMoveEntries += Object.keys(moves).length;
    }
    // 特性も同形式で収録（攻守どちらの特性セレクタでも使う）
    const abilities = {};
    for (const ab of (row.abilities || [])) {
      const ja = cache.ability[ab.name];
      if (!ja) { failedAbilityJa.add(ab.name); continue; }
      if (!A_NAMES.has(ja)) continue; // POKEMON_DATA に無い特性名は除外
      abilities[ja] = ab.usage;
    }
    if (Object.keys(abilities).length) {
      ABILITY_USAGE[jaName] = abilities;
      totalAbilityEntries += Object.keys(abilities).length;
    }
  }

  // ── レポート ──
  console.log(`\nマップ成功: ${mappedPoke}匹 / 攻撃技エントリ ${totalMoveEntries}件 / 特性エントリ ${totalAbilityEntries}件`);
  if (unmappedPoke.length) {
    console.log(`\n未マップ ${unmappedPoke.length}件(要オーバーライド確認):`);
    for (const u of unmappedPoke) console.log("  - " + u);
  }
  if (failedMoveJa.size) console.log(`\n技の日本語名取得失敗: ${[...failedMoveJa].join(", ")}`);
  if (failedAbilityJa.size) console.log(`\n特性の日本語名取得失敗: ${[...failedAbilityJa].join(", ")}`);

  // データの基準時刻 = ソースの最終更新(updated_at)の最大値
  const updatedAt = rows.map((r) => r.updated_at).filter(Boolean).sort().pop() || null;
  const REG_LABEL = { reg_mb: "M-B", reg_m1: "M-A" };
  const meta = {
    month: MONTH, regulation: REG, regulationLabel: REG_LABEL[REG] || REG, format: FORMAT,
    updatedAt, fetchedAt: new Date().toISOString(), pokemonCount: mappedPoke,
  };
  console.log("メタ情報:", JSON.stringify(meta));

  // ── 出力(1ポケモン1行で差分を見やすく) ──
  const lines = Object.entries(USAGE).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const abilityLines = Object.entries(ABILITY_USAGE).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const out = `// 自動生成: scripts/fetch-usage-data.mjs\n`
    + `// 採用率データ ${MONTH} / ${REG} / ${FORMAT} (Supabase champions_pokemon_stats より, ${new Date().toISOString().slice(0, 10)}取得)\n`
    + `// ${mappedPoke}匹分。値は採用率%。攻撃技(M_DATA収録)＋特性。日本語名 → 採用率。\n`
    + `export const MOVE_USAGE_META = ${JSON.stringify(meta)};\n\n`
    + `export const MOVE_USAGE = {\n${lines.join(",\n")}\n};\n\n`
    + `export const ABILITY_USAGE = {\n${abilityLines.join(",\n")}\n};\n`;
  writeFileSync(new URL("../src/usage-data.js", import.meta.url), out, "utf-8");
  console.log("\nsrc/usage-data.js を出力しました");
}

main().catch((e) => { console.error(e); process.exit(1); });
