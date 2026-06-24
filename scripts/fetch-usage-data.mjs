/**
 * Supabase の採用率データ(champions_pokemon_stats)を取得し、ダメ計用に
 *   src/usage-data.js   →  export const MOVE_USAGE / MOVE_USAGE_DOUBLES 等
 * を生成するスクリプト。
 *
 * デフォルト動作: ダブルのみ取得し、既存のシングルデータ(usage-data.js)と合わせて出力。
 * --all フラグを付けるとシングルも再取得する。
 *
 * 実行(PowerShell):
 *   $env:SUPABASE_KEY="<anon public key>"; node scripts/fetch-usage-data.mjs
 *   $env:SUPABASE_KEY="<anon public key>"; node scripts/fetch-usage-data.mjs --all
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { FORME_JA_NAMES } from "./fetch-showdown-data.mjs";
import { M_DATA, POKEMON_DATA } from "../src/pokedex-data.js";
// 既存のシングルデータをそのまま流用（--all 時は後で上書き）
import { MOVE_USAGE as MOVE_USAGE_EXISTING, ABILITY_USAGE as ABILITY_USAGE_EXISTING, MOVE_USAGE_META as MOVE_USAGE_META_EXISTING } from "../src/usage-data.js";

const KEY = process.env.SUPABASE_KEY;
if (!KEY) {
  console.error('環境変数 SUPABASE_KEY が未設定です。\n  $env:SUPABASE_KEY="<anon public key>"; node scripts/fetch-usage-data.mjs');
  process.exit(1);
}

const FETCH_ALL = process.argv.includes("--all");

// 取得対象(レギュ更新時はここを変える)。reg_mb=M-B(最新), reg_m1=M-A。月は最新の月を指定。
const MONTH = "2026-06", REG = "reg_mb";
const SB_BASE = "https://misabaliuftjkqigysvv.supabase.co/rest/v1/champions_pokemon_stats";

// PokeAPI が不安定/ID相違で取れない種の日本語名。全国図鑑番号→名前
const DEX_JA_OVERRIDE = {
  1018: "ブリジュラス", 858: "ブリムオン", 713: "クレベース",
  132: "メタモン", 784: "ジャラランガ", 866: "バリコオル",
  681: "ギルガルド(シールド)", 902: "イダイトウ♂", 964: "イルカマン(ナイーブ)",
  678: "ニャオニクス♂", 711: "パンプジン(普通)", 745: "ルガルガン(まひる)",
};

// region_form スラッグの例外 → 日本語名を直接指定
const FORM_SLUG_OVERRIDE = {
  "meowstic-mega": "ニャオニクス♂(メガ)",
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

function formKey(slug) {
  return slug.replace(/-/g, "").replace(/breed$/, "").replace(/female$/, "f");
}

function pokemonJaName(row) {
  if (row.region_form) return FORM_SLUG_OVERRIDE[row.region_form] ?? FORME_JA_NAMES[formKey(row.region_form)] ?? null;
  if (DEX_JA_OVERRIDE[row.pokemon_id]) return DEX_JA_OVERRIDE[row.pokemon_id];
  return cache.species[row.pokemon_id] ?? null;
}

const M_KEYS = new Set(Object.keys(M_DATA));
const P_NAMES = new Set(POKEMON_DATA.map((p) => p.name));
const A_NAMES = new Set(POKEMON_DATA.flatMap((p) => p.abilities || []));

function processRows(rows, format) {
  const USAGE = {}, ABILITY_USAGE = {};
  const unmappedPoke = [], failedMoveJa = new Set(), failedAbilityJa = new Set();
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
      if (!M_KEYS.has(ja)) continue;
      moves[ja] = mv.usage;
    }
    if (Object.keys(moves).length) {
      USAGE[jaName] = moves;
      mappedPoke++;
      totalMoveEntries += Object.keys(moves).length;
    }
    const abilities = {};
    for (const ab of (row.abilities || [])) {
      const ja = cache.ability[ab.name];
      if (!ja) { failedAbilityJa.add(ab.name); continue; }
      if (!A_NAMES.has(ja)) continue;
      abilities[ja] = ab.usage;
    }
    if (Object.keys(abilities).length) {
      ABILITY_USAGE[jaName] = abilities;
      totalAbilityEntries += Object.keys(abilities).length;
    }
  }

  console.log(`[${format}] マップ成功: ${mappedPoke}匹 / 技${totalMoveEntries}件 / 特性${totalAbilityEntries}件`);
  if (unmappedPoke.length) {
    console.log(`  未マップ ${unmappedPoke.length}件:`);
    for (const u of unmappedPoke) console.log("    - " + u);
  }
  if (failedMoveJa.size) console.log(`  技の日本語名取得失敗: ${[...failedMoveJa].join(", ")}`);
  if (failedAbilityJa.size) console.log(`  特性の日本語名取得失敗: ${[...failedAbilityJa].join(", ")}`);

  return { USAGE, ABILITY_USAGE, mappedPoke };
}

async function fetchFormat(format) {
  const url = `${SB_BASE}?month=eq.${MONTH}&regulation=eq.${REG}&battle_format=eq.${format}&limit=1000`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) {
    console.warn(`[${format}] Supabase取得失敗: ${res.status} ${await res.text()}`);
    return [];
  }
  const rows = await res.json();
  console.log(`[${format}] Supabase: ${rows.length}件取得`);
  return rows;
}

async function main() {
  const formatsToFetch = FETCH_ALL ? ["singles", "doubles"] : ["doubles"];
  console.log(`=== 採用率データ取得 (${MONTH} / ${REG} / ${formatsToFetch.join(", ")}) ===`);
  if (!FETCH_ALL) console.log("  シングルは既存データを維持します (--all で再取得)");

  const fetchedRows = {};
  for (const fmt of formatsToFetch) {
    fetchedRows[fmt] = await fetchFormat(fmt);
  }

  // PokeAPI キャッシュ
  const allRows = Object.values(fetchedRows).flat();
  if (allRows.length) {
    console.log("\nPokeAPI 日本語名を取得中...");
    await warmCache("move", allRows.flatMap((r) => (r.moves || []).map((m) => m.name)));
    await warmCache("species", allRows.filter((r) => !r.region_form).map((r) => r.pokemon_id));
    await warmCache("ability", allRows.flatMap((r) => (r.abilities || []).map((a) => a.name)));
    writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf-8");
  }

  // シングルデータ: --all なら新規取得、それ以外は既存を流用
  let singlesResult, singlesMeta;
  if (FETCH_ALL) {
    singlesResult = processRows(fetchedRows["singles"], "singles");
    const updatedAt = fetchedRows["singles"].map((r) => r.updated_at).filter(Boolean).sort().pop() || null;
    const REG_LABEL = { reg_mb: "M-B", reg_m1: "M-A" };
    singlesMeta = {
      month: MONTH, regulation: REG, regulationLabel: REG_LABEL[REG] || REG, format: "singles",
      updatedAt, fetchedAt: new Date().toISOString(), pokemonCount: singlesResult.mappedPoke,
    };
  } else {
    singlesResult = { USAGE: MOVE_USAGE_EXISTING, ABILITY_USAGE: ABILITY_USAGE_EXISTING };
    singlesMeta = MOVE_USAGE_META_EXISTING;
    console.log(`\n[singles] 既存データを流用: ${singlesMeta.pokemonCount}匹`);
  }

  // ダブルデータ
  const doublesResult = processRows(fetchedRows["doubles"] || [], "doubles");

  console.log("\nメタ情報:", JSON.stringify(singlesMeta));

  // ── 出力 ──
  const fmt = (obj) => Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const out = `// 自動生成: scripts/fetch-usage-data.mjs\n`
    + `// 採用率データ ${MONTH} / ${REG} (Supabase champions_pokemon_stats より, ${new Date().toISOString().slice(0, 10)}取得)\n`
    + `// シングル${singlesMeta.pokemonCount}匹 / ダブル${doublesResult.mappedPoke}匹。値は採用率%。攻撃技(M_DATA収録)＋特性。日本語名 → 採用率。\n`
    + `export const MOVE_USAGE_META = ${JSON.stringify(singlesMeta)};\n\n`
    + `export const MOVE_USAGE = {\n${fmt(singlesResult.USAGE)}\n};\n\n`
    + `export const ABILITY_USAGE = {\n${fmt(singlesResult.ABILITY_USAGE)}\n};\n\n`
    + `export const MOVE_USAGE_DOUBLES = {\n${fmt(doublesResult.USAGE)}\n};\n\n`
    + `export const ABILITY_USAGE_DOUBLES = {\n${fmt(doublesResult.ABILITY_USAGE)}\n};\n`;
  writeFileSync(new URL("../src/usage-data.js", import.meta.url), out, "utf-8");
  console.log("\nsrc/usage-data.js を出力しました");
}

main().catch((e) => { console.error(e); process.exit(1); });
