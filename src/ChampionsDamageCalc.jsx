/* global __APP_VERSION__ */ // vite.config.js の define でビルド時に package.json の version へ置換
import { useState, useMemo, useEffect, useRef } from "react";
import { M_DATA, POKEMON_DATA } from "./pokedex-data.js";
import { MOVE_USAGE, MOVE_USAGE_META, ABILITY_USAGE, MOVE_USAGE_DOUBLES, ABILITY_USAGE_DOUBLES } from "./usage-data.js";
import { FORM_USAGE_BASE } from "./forme-usage-base.js";
import { ITEM_FLING } from "./item-fling.js";
import { RecognitionPanel } from "./RecognitionPanel.jsx";
import { TeamPanel, useMyTeams, iconOf, BoxPanel } from "./TeamPanel.jsx";
import { MEGA_FORMS } from "./megaIcons.js";
import { useObs, obsShot } from "./obsClient.js";
import FeedbackPanel from "./FeedbackPanel.jsx";
import ObsPanel from "./ObsPanel.jsx";
import { itemEffect, itemLabel } from "./item-data.js";

// モーダル背景の誤クローズ防止: 押下と離した両方が「背景そのもの」の時だけ閉じる。
// 入力欄内で押し始めてモーダル外で離す(数値のドラッグ選択など)と、clickが共通祖先＝背景で発火して
// 誤って閉じてしまう。押下位置を記録し、背景上で始まったクリックのみ閉じることで防ぐ。
let _backdropDownOnSelf = false;
const dismissOnBackdrop = (close) => ({
  onMouseDown: (e) => { _backdropDownOnSelf = e.target === e.currentTarget; },
  onClick: (e) => { if (_backdropDownOnSelf && e.target === e.currentTarget) close(); },
});

// 公開直後だけ表示するお知らせバナー。安定したら false にする（または定数とバナーJSXを削除）。
const SHOW_RELEASE_NOTICE = true;

// ===== ポケモンチャンピオンズ仕様 =====
// ・Lv50固定 / 個体値31固定 / 能力ポイント(SP): 1ステ上限32・合計上限66
// ・HP実数値   = floor((種族値*2+31)*50/100) + 60 + SP
// ・他実数値   = floor((floor((種族値*2+31)*50/100) + 5 + SP) * 性格補正)
// ・基礎ダメージ = floor(22 * 威力 * A / D / 50) + 2
// ・補正は 天候→急所→乱数(85~100)→タイプ一致→相性→やけど→壁 の順に毎回切り捨て

const TYPES = ["ノーマル","ほのお","みず","でんき","くさ","こおり","かくとう","どく","じめん","ひこう","エスパー","むし","いわ","ゴースト","ドラゴン","あく","はがね","フェアリー"];

const TYPE_COLOR = {
  ノーマル:"#9FA19F", ほのお:"#E65E33", みず:"#3D8DD6", でんき:"#E5B53A",
  くさ:"#5CA935", こおり:"#6FC8C8", かくとう:"#B23048", どく:"#9550A0",
  じめん:"#B0793A", ひこう:"#7FA7D2", エスパー:"#D6608C", むし:"#9BA52F",
  いわ:"#A8945C", ゴースト:"#6A5A96", ドラゴン:"#5A60C8", あく:"#564C46",
  はがね:"#7E8FA0", フェアリー:"#D873C9",
};

const CHART = {
  ノーマル:{いわ:.5,ゴースト:0,はがね:.5},
  ほのお:{ほのお:.5,みず:.5,くさ:2,こおり:2,むし:2,いわ:.5,ドラゴン:.5,はがね:2},
  みず:{ほのお:2,みず:.5,くさ:.5,じめん:2,いわ:2,ドラゴン:.5},
  でんき:{みず:2,でんき:.5,くさ:.5,じめん:0,ひこう:2,ドラゴン:.5},
  くさ:{ほのお:.5,みず:2,くさ:.5,どく:.5,じめん:2,ひこう:.5,むし:.5,いわ:2,ドラゴン:.5,はがね:.5},
  こおり:{ほのお:.5,みず:.5,くさ:2,こおり:.5,じめん:2,ひこう:2,ドラゴン:2,はがね:.5},
  かくとう:{ノーマル:2,こおり:2,どく:.5,ひこう:.5,エスパー:.5,むし:.5,いわ:2,ゴースト:0,あく:2,はがね:2,フェアリー:.5},
  どく:{くさ:2,どく:.5,じめん:.5,いわ:.5,ゴースト:.5,はがね:0,フェアリー:2},
  じめん:{ほのお:2,でんき:2,くさ:.5,どく:2,ひこう:0,むし:.5,いわ:2,はがね:2},
  ひこう:{でんき:.5,くさ:2,かくとう:2,むし:2,いわ:.5,はがね:.5},
  エスパー:{かくとう:2,どく:2,エスパー:.5,あく:0,はがね:.5},
  むし:{ほのお:.5,くさ:2,かくとう:.5,どく:.5,ひこう:.5,エスパー:2,ゴースト:.5,あく:2,はがね:.5,フェアリー:.5},
  いわ:{ほのお:2,こおり:2,かくとう:.5,じめん:.5,ひこう:2,むし:2,はがね:.5},
  ゴースト:{ノーマル:0,エスパー:2,ゴースト:2,あく:.5},
  ドラゴン:{ドラゴン:2,はがね:.5,フェアリー:0},
  あく:{かくとう:.5,エスパー:2,ゴースト:2,あく:.5,フェアリー:.5},
  はがね:{ほのお:.5,みず:.5,でんき:.5,こおり:2,いわ:2,はがね:.5,フェアリー:2},
  フェアリー:{ほのお:.5,かくとう:2,どく:.5,ドラゴン:2,あく:2,はがね:.5},
};

const M = { ...M_DATA };
// 一撃必殺技は除外（固定ダメージのため計算対象外）
for (const k of ["つのドリル", "ハサミギロチン", "ぜったいれいど", "じわれ"]) delete M[k];
const POKEMON = POKEMON_DATA;

// もちもの: 攻撃側/防御側で有効なものが別。マイチームは和集合で保持し、反映時に各側の有効分だけ適用
const ATK_ITEMS = ["その他", "なし", "タイプ強化(×1.2)", "いのちのたま", "ちからのハチマキ", "ものしりメガネ", "たつじんのおび", "メトロノーム", "でんきだま"];
const DEF_ITEMS = ["その他", "なし", "抜群半減きのみ"];
const ALL_ITEMS = ["その他", "なし", "タイプ強化(×1.2)", "いのちのたま", "ちからのハチマキ", "ものしりメガネ", "たつじんのおび", "メトロノーム", "でんきだま", "抜群半減きのみ"];
const isMega = (p) => /[（(]メガ/.test(p?.name || ""); // メガシンカ(メガストーン保持)＝他の持ち物は持てない
// メガ種の採用率はベース種と技プールが共通 → メガ専用データが無ければ「(メガ)」を外したベース種の採用率を使う
// フォルム違いは技プールが共通 → 既定フォルムの採用率を流用（FORM_USAGE_BASE。TeamPanelと共有）
const usageMapFor = (name, src = MOVE_USAGE) => src[name] || src[FORM_USAGE_BASE[name]] || src[name.replace(/\(メガ[XY]?\)$/, "")] || {};
// 特性の採用率マップ（メガ・フォルム違いはベース/既定フォルムにフォールバック）
const abilityUsageMapFor = (name, src = ABILITY_USAGE) => src[name] || src[FORM_USAGE_BASE[name]] || src[name.replace(/\(メガ[XY]?\)$/, "")] || {};
// イルカマン/ギルガルド: メガと同様にワンボタンでフォルムチェンジ（双方向）
const FORM_SIBLING = {
  "イルカマン(ナイーブ)": "イルカマン(マイティ)",
  "イルカマン(マイティ)": "イルカマン(ナイーブ)",
  "ギルガルド(シールド)": "ギルガルド(ブレード)",
  "ギルガルド(ブレード)": "ギルガルド(シールド)",
};
// 特性を採用率順に並べた [{x, u}] を返す（採用率データの無い特性は末尾・元の順）
const abilityOptions = (poke, abSrc = ABILITY_USAGE) => {
  const u = abilityUsageMapFor(poke.name, abSrc);
  const abils = poke.abilities?.length ? poke.abilities : ["なし"];
  // 特性が1つしかないポケモンは取得データに関わらず必ず100%
  return abils.map((x) => ({ x, u: abils.length === 1 ? 100 : u[x] })).sort((a, b) => (b.u ?? -1) - (a.u ?? -1));
};
// 採用率データの基準時刻を日本時間で整形
const fmtDataTime = (iso) => {
  if (!iso) return "不明";
  try { return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

// ===== 実数値計算 =====
const f = Math.floor;
const hpStat  = (base, sp) => f((base * 2 + 31) * 50 / 100) + 60 + sp;
const stat    = (base, sp, nature) => f((f((base * 2 + 31) * 50 / 100) + 5 + sp) * nature);
const rankMul = (v, r) => (r >= 0 ? f(v * (2 + r) / 2) : f(v * 2 / (2 - r)));
const typeEffect = (moveType, defTypes) => defTypes.reduce((m, t) => m * (CHART[moveType]?.[t] ?? 1), 1);
// きもったま: ノーマル/かくとう技がゴーストにも等倍で当たる（ゴーストの無効0を1扱い）
const typeEffectScrappy = (moveType, defTypes, scrappy) => defTypes.reduce((m, t) => {
  let v = CHART[moveType]?.[t] ?? 1;
  if (scrappy && v === 0 && (moveType === "ノーマル" || moveType === "かくとう") && t === "ゴースト") v = 1;
  return m * v;
}, 1);

function calcRolls(env) {
  const { power, A, D, weatherMul, crit, critMul = 1.5, stab, stabMul = 1.5, eff, burn, wall, wallMul = 0.5, helpingHand, resistBerry, postEffMul = 1, spreadMul = 1, friendGuardMul = 1 } = env;
  const pw = helpingHand ? f(power * 1.5) : power;
  let base = f(22 * pw * A / D / 50) + 2;
  if (spreadMul !== 1) base = f(base * spreadMul); // 範囲技補正（ターゲット補正、乱数より前に適用）
  const rolls = [];
  for (let R = 85; R <= 100; R++) {
    let d = base;
    if (weatherMul !== 1) d = f(d * weatherMul);
    if (crit) d = f(d * critMul);
    d = f(d * R / 100);
    if (stab) d = f(d * stabMul);
    d = f(d * eff);
    if (resistBerry && eff > 1) d = f(d * 0.5); // 抜群半減きのみ
    if (postEffMul !== 1) d = f(d * postEffMul); // 防御側特性などの最終補正
    if (burn) d = f(d * 0.5);
    if (wall && !crit) d = f(d * wallMul); // ダブル: 2/3、シングル: 0.5
    if (friendGuardMul !== 1) d = f(d * friendGuardMul); // フレンドガード ×0.75
    if (eff > 0 && d < 1) d = 1;
    rolls.push(d);
  }
  return rolls;
}

function useDistribution(rolls, hits) {
  let dist = new Map([[0, 1]]);
  for (let h = 0; h < hits; h++) {
    const next = new Map();
    for (const [dmg, p] of dist) for (const r of rolls)
      next.set(dmg + r, (next.get(dmg + r) || 0) + p / 16);
    dist = next;
  }
  return dist;
}

// 各発で威力(ロール集合)が異なる連続技(トリプルアクセル)用: ロール集合の列を順に畳み込む
function convolveVarying(rollSets) {
  let dist = new Map([[0, 1]]);
  for (const rolls of rollSets) {
    const next = new Map();
    for (const [dmg, p] of dist) for (const r of rolls)
      next.set(dmg + r, (next.get(dmg + r) || 0) + p / 16);
    dist = next;
  }
  return dist;
}

// 連続技のヒット数分布（第5世代以降の2〜5回: 35/35/15/15%）。固定回数(min===max)はその回数で確定
function hitCountDist(lo, hi) {
  if (lo === hi) return [[lo, 1]];
  if (lo === 2 && hi === 5) return [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]];
  const p = 1 / (hi - lo + 1), arr = [];
  for (let n = lo; n <= hi; n++) arr.push([n, p]);
  return arr;
}

function koProbability(useDist, hp, n) {
  let dist = new Map([[0, 1]]);
  for (let i = 0; i < n; i++) {
    const next = new Map();
    for (const [dmg, p] of dist) {
      if (dmg >= hp) { next.set(hp, (next.get(hp) || 0) + p); continue; }
      for (const [d2, p2] of useDist) {
        const nd = Math.min(hp, dmg + d2);
        next.set(nd, (next.get(nd) || 0) + p * p2);
      }
    }
    dist = next;
  }
  return dist.get(hp) || 0;
}

function koSummary(useDist, hp, useMin, useMax) {
  if (useMax <= 0) return { label: "ダメージなし", detail: "" };
  const sure = Math.ceil(hp / useMin);
  const lucky = Math.ceil(hp / useMax);
  if (sure === lucky) return { label: `確定${sure}発`, detail: "" };
  if (sure > 12) return { label: `確定${sure}発`, detail: "" };
  for (let n = lucky; n < sure; n++) {
    const p = koProbability(useDist, hp, n);
    if (p > 1e-9) return { label: `乱数${n}発`, detail: `${(p * 100).toFixed(1)}%`, sure };
  }
  return { label: `確定${sure}発`, detail: "" };
}

// 複数の独立したダメージ分布([ [ダメージ,確率], ... ]の配列)を畳み込む。
// 整数ダメージなので同じ合計はマージされ、キー数は合計ダメージの範囲に比例（数件なら軽量）。
function convolveDists(dists) {
  let acc = new Map([[0, 1]]);
  for (const dist of dists) {
    const next = new Map();
    for (const [d1, p1] of acc) for (const [d2, p2] of dist) {
      const k = d1 + d2;
      next.set(k, (next.get(k) || 0) + p1 * p2);
    }
    acc = next;
  }
  return acc;
}

// ===== 特性の効果定義 =====
// 攻撃側: ピンチ時タイプ強化（選択中=発動扱い）
const ABILITY_PINCH = { しんりょく: "くさ", もうか: "ほのお", げきりゅう: "みず", むしのしらせ: "むし" };
// 攻撃側: ノーマル技をタイプ変換して威力×1.2
const ABILITY_SKIN = { フェアリースキン: "フェアリー", スカイスキン: "ひこう", フリーズスキン: "こおり", ドラゴンスキン: "ドラゴン" };
// 攻撃側/防御側: 発動時に天気をセット（あめふらし等）
// 発動チェックで計算上の天気をセット。あめふらし等は「天気を作る」、すなのちから/すなはきは「対応天気にして効果発動」
// サンパワーはここに入れない＝自動特性化。はれの時だけ自動発動（atkAbNoteが付く＝atkAbActive）、他天気/無しで自動オフ、はれ中にオフしようとすると確認モーダル。効果は下のweather==="はれ"判定で乗る
const WEATHER_ABILITY = { あめふらし: "あめ", ひでり: "はれ", すなおこし: "すなあらし", ゆきふらし: "ゆき", すなのちから: "すなあらし", すなはき: "すなあらし" };
// 登場時に天気を「作る」特性だけ（すなのちから/すなはきは天気を作らないので除く）。選択した時点で天気欄を自動でその天気にするのに使う
const WEATHER_SETTER = { あめふらし: "あめ", ひでり: "はれ", すなおこし: "すなあらし", ゆきふらし: "ゆき" };
// てんきや（ポワルン）: 天気でタイプが変わる（すなあらし/なしはノーマルのまま）
const FORECAST_TYPE = { はれ: "ほのお", あめ: "みず", ゆき: "こおり" };
// 攻撃側/防御側: 発動時にフィールドをセット（エレキメイカー＝Electric Surge 等）。発動チェックで計算上のフィールドにする
const TERRAIN_ABILITY = { エレキメイカー: "エレキ", グラスメイカー: "グラス", サイコメイカー: "サイコ", ミストメイカー: "ミスト" };
// 技分類リスト
const BITE_MOVES = new Set(["かみつく", "かみくだく", "ほのおのキバ", "かみなりのキバ", "こおりのキバ", "どくどくのキバ", "サイコファング", "エラがみ", "くらいつく"]);
const PULSE_MOVES = new Set(["みずのはどう", "あくのはどう", "りゅうのはどう", "はどうだん", "だいちのはどう"]);
// 音techn: うるおいボイスでみず化／ぼうおんで無効（攻撃技のみ・状況技は計算対象外）
const SOUND_MOVES = new Set(["ハイパーボイス", "ばくおんぱ", "エコーボイス", "りんしょう", "いびき", "さわぐ", "むしのさざめき", "チャタリング", "スケイルノイズ", "オーバードライブ", "かえんのうた", "ぶきみなじゅもん"]);
const isPunchMove = (name) => name.includes("パンチ") || ["アームハンマー", "スカイアッパー", "グロウパンチ", "ばくれつパンチ", "ぶちかまし", "プラズマフィスト", "ふんどのこぶし"].includes(name);
// 非接触の物理技（物理は基本接触だが、飛び道具・地面・自爆系などは非接触）。かたいツメ/もふもふ/えんかくの接触判定に使用
const NON_CONTACT_PHYSICAL = new Set(["じしん", "じならし", "いわなだれ", "がんせきふうじ", "ストーンエッジ", "ロックブラスト", "がんせきほう", "うちおとす", "タネマシンガン", "タネばくだん", "ミサイルばり", "つららばり", "こおりのつぶて", "つららおとし", "スケイルショット", "ドラゴンアロー", "３ぼんのや", "ダストシュート", "だいばくはつ", "じばく", "フェイント", "メタルバースト", "ボーンラッシュ", "しおづけ", "どくばりセンボン"]);
// 切る技（きれあじで威力×1.5）
const SLICING_MOVES = new Set(["つばめがえし", "エアカッター", "エアスラッシュ", "アクアカッター", "むねんのつるぎ", "ひけん・ちえなみ", "クロスポイズン", "ドゲザン", "リーフブレード", "サイコカッター", "シェルブレード", "せいなるつるぎ", "ソーラーブレード", "がんせきアックス", "シザークロス", "つじぎり"]);
// 先制技（テイルアーマー/じょおうのいげんで無効化）
const PRIORITY_MOVES = new Set(["でんこうせっか", "しんそく", "アクアジェット", "バレットパンチ", "マッハパンチ", "こおりのつぶて", "かげうち", "ふいうち", "ねこだまし", "グラススライダー", "であいがしら", "ジェットパンチ", "アクセルロック", "みずしゅりけん", "フェイント"]);
// 与えたダメージ依存の反動技（すてみで威力×1.2）
const RECOIL_MOVES = new Set(["すてみタックル", "フレアドライブ", "ブレイブバード", "ウッドハンマー", "ワイルドボルト", "ボルテッカー", "ウェーブタックル", "もろはのずつき"]);
// たま・爆弾系の技（ぼうだんで無効）
const BALL_BOMB_MOVES = new Set(["はどうだん", "タネマシンガン", "エナジーボール", "きあいだま", "かふんだんご", "ロックブラスト", "がんせきほう", "タネばくだん", "シャドーボール", "ヘドロばくだん", "ウェザーボール", "でんじほう", "みずあめボム", "くちばしキャノン"]);
// 防御側: タイプ無効化
const ABILITY_IMMUNE = { もらいび: ["ほのお"], ちょすい: ["みず"], よびみず: ["みず"], ちくでん: ["でんき"], ひらいしん: ["でんき"], そうしょく: ["くさ"], ふゆう: ["じめん"], かんそうはだ: ["みず"], うなぎのぼり: ["じめん"], どしょく: ["じめん"] };
// 防御側: 特定タイプのダメージ倍率
const ABILITY_TYPE_MUL = { あついしぼう: { ほのお: 0.5, こおり: 0.5 }, たいねつ: { ほのお: 0.5 }, きよめのしお: { ゴースト: 0.5 }, すいほう: { ほのお: 0.5 }, かんそうはだ: { ほのお: 1.25 }, もふもふ: { ほのお: 2 } };

// ===== 状況依存技の効果定義 =====
// auto: 他の入力から自動判定 / toggle: チェックボックスで指定 / count: 数を指定
const COND_MOVES = {
  アクロバット:   { type: "auto",   label: "もちものなしで威力2倍" },
  からげんき:     { type: "toggle", mul: 2, label: "状態異常で威力2倍" },
  ソーラービーム: { type: "auto",   label: "晴れ以外の天気で威力半減" },
  ソーラーブレード:{ type: "auto",  label: "晴れ以外の天気で威力半減" },
  ライジングボルト:{ type: "auto",  label: "エレキフィールドの接地した相手に威力2倍" },
  ワイドフォース: { type: "auto",   label: "サイコフィールドで威力1.5倍" },
  たたりめ:       { type: "toggle", mul: 2,   label: "相手が状態異常" },
  ベノムショック: { type: "toggle", mul: 2,   label: "相手がどく状態" },
  ゆきなだれ:     { type: "toggle", mul: 2,   label: "このターン先に攻撃を受けた" },
  うっぷんばらし: { type: "toggle", mul: 2,   label: "このターン能力を下げられた" },
  やけっぱち:     { type: "toggle", mul: 2,   label: "前のターン技が外れ/失敗/行動不可" },
  じだんだ:       { type: "toggle", mul: 2,   label: "前のターン技が外れ/失敗/行動不可" },
  どくばりセンボン: { type: "toggle", mul: 2,   label: "相手がどく／もうどく状態" },
  ダメおし:       { type: "toggle", mul: 2,   label: "相手がこのターン既にダメージを受けている" },
  ドラゴンダイブ: { type: "toggle", mul: 2,   label: "相手がちいさくなる状態（必中）" },
  のしかかり:     { type: "toggle", mul: 2,   label: "相手がちいさくなる状態（必中）" },
  きまぐレーザー: { type: "toggle", mul: 2,   label: "全集中状態" },
  ひゃっきやこう: { type: "toggle", mul: 2,   label: "相手が状態異常" },
  Ｇのちから:      { type: "toggle", mul: 1.5, label: "じゅうりょく状態" },
  はたきおとす:   { type: "toggle", mul: 1.5, label: "相手がもちものを持っている" },
  しっぺがえし:   { type: "toggle", mul: 2,   label: "相手より後に行動（後攻）" },
  おはかまいり:   { type: "count",  per: 50, max: 3, label: "倒された味方の数" },
};

// レベル＝ダメージの固定ダメージ技。Lv50固定なので50ダメージ固定（A/D・タイプ相性・天気・壁等を一切受けず、無効タイプ相手のみ0）
const FIXED_DMG_MOVES = { ナイトヘッド: 50, ちきゅうなげ: 50 };
// ヒット数の上書き（データはmultihit:N=[N,N]固定だが、実際は命中判定で1〜N発の技）
const MOVE_HITS_OVERRIDE = { ネズミざん: [1, 10] };
// ヒットごとに威力が変わる連続技（各発の威力）。トリプルアクセルは20→40→60
const VAR_HIT_POWERS = { トリプルアクセル: [20, 40, 60] };
// 追加で相性を掛け合わせる複合タイプ技（フライングプレス＝かくとう×ひこう）
const MOVE_EXTRA_TYPE = { フライングプレス: "ひこう" };
// フィールドが無いと失敗する技
const TERRAIN_REQUIRED_MOVES = new Set(["アイアンローラー"]);
// 相手の能力ランク変化を無視して計算する技（防御ランクを0扱い）
const IGNORE_DEF_RANK_MOVES = new Set(["せいなるつるぎ", "ＤＤラリアット"]);
// 壁(リフレクター/ひかりのかべ/オーロラベール)を解除して攻撃する技
const WALL_BREAK_MOVES = new Set(["サイコファング", "かわらわり"]);
// メテオビーム/エレクトロビーム: チャージで自分のとくこうが1段階上がる（ボタンでランクに反映）
const SPA_BOOST_MOVES = new Set(["エレクトロビーム", "メテオビーム"]);
// しめりけ（自他問わず）で失敗する爆発技
const EXPLOSION_MOVES = new Set(["だいばくはつ", "じばく", "ミストバースト"]);
// ダブルバトル: 複数対象の範囲技（×0.75補正対象）。allAdjacent / allAdjacentFoes 系
const SPREAD_MOVES = new Set([
  "じしん", "なみのり", "ほうでん", "ヘドロウェーブ", "はなふぶき",
  "ふぶき", "ねっぷう", "エアカッター", "こごえるかぜ", "エレキネット",
  "バークアウト", "みわくのボイス", "ハイパーボイス", "マジカルシャイン",
  "だいばくはつ", "じばく", "ワイドフォース",
]);
// レイジングブル: パルデアケンタロスのフォルムでタイプが変わる（フォルム名→タイプ）
const RAGING_BULL_TYPE = { "ケンタロス(パルデア単)": "かくとう", "ケンタロス(パルデア炎)": "ほのお", "ケンタロス(パルデア水)": "みず" };
// フィールド→タイプ（だいちのはどう・ぎたい等で使用）
const TERRAIN_TO_TYPE = { エレキ: "でんき", グラス: "くさ", サイコ: "エスパー", ミスト: "フェアリー" };

// 威力を状況から自動算出する技。kindごとに専用の入力UIを出す（手動威力入力の代わり）
const VAR_CALC = {
  なげつける:     { kind: "fling" },     // 持ち物別の威力
  きしかいせい:   { kind: "lowhp" },     // 残HPが少ないほど高威力(最大200)
  じたばた:       { kind: "lowhp" },
  ふんか:         { kind: "highhp" },    // 残HPが多いほど高威力(最大150)
  しおふき:       { kind: "highhp" },
  アシストパワー: { kind: "boost" },     // 20＋積みランク×20
  つけあがる:     { kind: "boost" },
  ヘビーボンバー: { kind: "weight" },    // 相手/自分の重さ比(自動)
  ヒートスタンプ: { kind: "weight" },
  はきだす:       { kind: "stockpile" }, // のみこんだ回数×100
  ハードプレス:   { kind: "targethp" },  // 100×相手の残HP割合（最大100）
  ふんどのこぶし: { kind: "ragefist" },  // 50＋受けた攻撃×50（最大350）。てつのこぶしは特性側で×1.2
};
const FLING_ITEMS = Object.keys(ITEM_FLING); // 50音順
// きしかいせい/じたばた: 残HP割合(0〜1)で威力（最大200）
function reversalPower(frac) {
  const g = Math.floor(48 * Math.max(0, Math.min(1, frac)));
  if (g < 2) return 200;
  if (g < 5) return 150;
  if (g < 10) return 100;
  if (g < 17) return 80;
  if (g < 33) return 40;
  return 20;
}
// ヘビーボンバー/ヒートスタンプ: 相手÷自分の重さ比で威力（最大120）
function heavySlamPower(attW, defW) {
  if (!attW || !defW) return 40;
  const r = defW / attW;
  if (r > 0.5) return 40;
  if (r > 1 / 3) return 60;
  if (r > 0.25) return 80;
  if (r > 0.2) return 100;
  return 120;
}
// ヘヴィメタル(重さ2倍)/ライトメタル(重さ半分)。ヘビーボンバー/ヒートスタンプの重さ計算時のみ適用
const weightWithAbility = (w, ab) => ab === "ヘヴィメタル" ? w * 2 : ab === "ライトメタル" ? w * 0.5 : w;

// 採用率が著しく低いと思われる技（オプションで非表示にできる）
const LOW_USAGE_MOVES = new Set([
  // 物理
  "アイアンローラー", "あなをほる", "かかとおとし", "かみつく", "ゴッドバード",
  "シャドーパンチ", "ついばむ", "はたく", "ブレイククロー", "ほしがる",
  // 特殊
  "いびき", "エアカッター", "エレキボール", "さわぐ", "はきだす", "りんしょう",
]);

// ダメージ計算に影響する（実装済みの）特性一覧
const DAMAGE_ABILITIES = new Set([
  ...Object.keys(ABILITY_PINCH), ...Object.keys(ABILITY_SKIN),
  ...Object.keys(ABILITY_IMMUNE), ...Object.keys(ABILITY_TYPE_MUL), ...Object.keys(WEATHER_ABILITY), ...Object.keys(TERRAIN_ABILITY),
  "てきおうりょく", "ちからもち", "ヨガパワー", "はりきり", "こんじょう", "サンパワー", "メガソーラー",
  "ちからずく", "アナライズ", "テクニシャン", "がんじょうあご", "メガランチャー",
  "てつのこぶし", "すいほう", "マルチスケイル", "フィルター", "ハードロック",
  "ファーコート", "ノーてんき", "エアロック", "へんげんじざい", "リベロ", "すなのちから",
  "シェルアーマー", "カブトアーモ", "カブトアーマー",
  "うるおいボイス", "ぼうおん", "かたいツメ", "きれあじ", "えんかく", "おやこあい", "きもったま",
  "スナイパー", "テイルアーマー", "じょおうのいげん", "すてみ", "そうだいしょう", "ほのおのたてがみ",
  "てんきや", "てんねん", "でんきにかえる", "とうそうしん", "はらぺこスイッチ",
  "フェアリーオーラ", "ふしぎなうろこ", "プラス", "マイナス", "ぼうだん", "すりぬけ",
  // ランク変化系（発動段数でランクが変わる: いかく/じしんかじょう等）
  "いかく", "じしんかじょう", "せいぎのこころ", "まけんき", "いかりのつぼ", "ぎゃくじょう", "かちき", "じきゅうりょく", "くだけるよろい",
  "かたやぶり", "スキルリンク", "しめりけ", "ぶきよう", "ぎたい",
]);
// トレースで選べる特性（実装済み全特性＝影響なしは元々含まれない）。五十音順
const TRACEABLE_ABILITIES = [...DAMAGE_ABILITIES].sort((a, b) => a.localeCompare(b, "ja"));

// 確定急所技
const ALWAYS_CRIT_MOVES = new Set(["トリックフラワー", "やまあらし", "こおりのいぶき"]);

// バトル中の状態に依存するため手動でオンオフする特性（それ以外の実装済み特性は状況から自動判定）
const MANUAL_ABILITIES = new Set([
  "げきりゅう", "もうか", "しんりょく", "むしのしらせ", // ピンチ時(HP1/3以下)
  "こんじょう",       // 状態異常時
  "ふしぎなうろこ",   // 状態異常時
  "プラス", "マイナス", // 場に相方
  "アナライズ",       // 後攻時
  ...Object.keys(WEATHER_ABILITY), // 天気特性（発動で天気をセット）
  ...Object.keys(TERRAIN_ABILITY), // フィールド特性（発動でフィールドをセット）
  "でんきにかえる", // 充電状態を発動チェックで指定（でんき技×2）
]);
const isAutoAbility = (a) => DAMAGE_ABILITIES.has(a) && !MANUAL_ABILITIES.has(a);

// ランク変化系特性: 発動すると段階的にランクが変化（押した回数=段階）。対応する側でのみ操作でき、技分類が合う時だけ計算に反映。
// side=この特性を持つ側(UI表示位置), affects=効くランク(atk=攻撃ランク/def=防御ランク), cat=対象わざ分類(phys/spec), dir=1回あたりの段階, label=操作ラベル
const RANK_ABILITIES = {
  いかく:        { side: "def", affects: "atk", cat: "phys", dir: -1, label: "相手のこうげき" },
  じしんかじょう:  { side: "atk", affects: "atk", cat: "phys", dir: +1, label: "こうげき（撃破）" },
  せいぎのこころ:   { side: "atk", affects: "atk", cat: "phys", dir: +1, label: "こうげき（あく技被弾）" },
  まけんき:       { side: "atk", affects: "atk", cat: "phys", dir: +2, label: "こうげき（能力下げられ）" },
  いかりのつぼ:    { side: "atk", affects: "atk", cat: "phys", dir: +6, label: "こうげき（急所被弾で最大）" },
  ぎゃくじょう:     { side: "atk", affects: "atk", cat: "spec", dir: +1, label: "とくこう（HP半減）" },
  かちき:        { side: "atk", affects: "atk", cat: "spec", dir: +2, label: "とくこう（能力下げられ）" },
  じきゅうりょく:   { side: "def", affects: "def", cat: "phys", dir: +1, label: "ぼうぎょ（被弾）" },
  くだけるよろい:   { side: "def", affects: "def", cat: "phys", dir: -1, label: "ぼうぎょ（物理被弾）" },
};

// いかく(威嚇)を受ける側(=こうげき側)の特性。IMMUNE=無効化／REACT=逆に能力が上がる
const INTIMIDATE_IMMUNE = new Set(["きもったま", "せいしんりょく", "どんかん", "マイペース", "クリアボディ", "しろいけむり", "かいりきバサミ", "ミラーアーマー"]);
const INTIMIDATE_REACT = {
  ばんけん:     { delta: +1, desc: "いかくが無効化され、逆にこうげきが1段階上がります" },
  あまのじゃく:  { delta: +1, desc: "あまのじゃくでいかくが反転し、こうげきが1段階上がります" },
  まけんき:     { delta: +1, desc: "まけんきが発動し、差し引きでこうげきが1段階上がります（−1＋2）" },
  かちき:       { delta: +2, desc: "かちきが発動し、とくこうが2段階上がります" },
};

// ===== UI部品 =====
const NATURES = [
  { v: 0.9, label: "▼0.9" },
  { v: 1.0, label: "無1.0" },
  { v: 1.1, label: "▲1.1" },
];

function TypeChip({ t, small }) {
  return <span className="chip" style={{ background: TYPE_COLOR[t], fontSize: small ? 10 : 11 }}>{t}</span>;
}

function SpInput({ label, value, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" min={0} max={32} value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(32, Number(e.target.value) || 0)))} />
      <div className="sp-presets">
        {[0, 16, 32].map((v) => (
          <button key={v} type="button" className={value === v ? "sp-pre on" : "sp-pre"}
            onClick={(e) => { e.preventDefault(); onChange(v); }}>{v}</button>
        ))}
      </div>
    </label>
  );
}

// 推定モーダルの数値入力: 標準スピナーが小さく押しづらいので、大きな −／＋ ボタンで増減（長押しで連続）。
function NumStepper({ value, onChange, min = 0, max = Infinity, placeholder }) {
  const holdRef = useRef(null);
  const upRef = useRef(null);
  const stop = () => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
    if (upRef.current) { upRef.current(); upRef.current = null; }
  };
  useEffect(() => stop, []); // アンマウント時に停止
  // 連打中も最新値から増減するよう関数更新（onChange=setState）。空欄からは＋で下限・−でも下限に収める。
  const step = (d) => onChange((prev) => {
    const n = parseInt(prev, 10);
    const base = isNaN(n) ? (d > 0 ? min - 1 : min) : n;
    return String(Math.max(min, Math.min(max, base + d)));
  });
  const startHold = (d) => {
    stop();
    step(d); // 押した瞬間に1回
    let delay = 380; // 長押し開始までの待ち→以降は加速
    const tick = () => { step(d); delay = Math.max(45, delay * 0.82); holdRef.current = setTimeout(tick, delay); };
    holdRef.current = setTimeout(tick, delay);
    const onUp = () => stop(); // どこで指を離しても止める
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    upRef.current = () => { window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); };
  };
  return (
    <div className="num-step">
      <button type="button" className="num-step-btn" onPointerDown={() => startHold(-1)} aria-label="1減らす（長押しで連続）">−</button>
      <input type="number" inputMode="numeric" step="1" min={min} max={max === Infinity ? undefined : max}
        placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value.replace(/[.,].*$/, ""))} />
      <button type="button" className="num-step-btn" onPointerDown={() => startHold(1)} aria-label="1増やす（長押しで連続）">＋</button>
    </div>
  );
}

function NatureSelect({ value, onChange }) {
  return (
    <div className="seg">
      {NATURES.map((n) => (
        <button key={n.v} className={value === n.v ? "seg-btn on" : "seg-btn"} onClick={() => onChange(n.v)}>{n.label}</button>
      ))}
    </div>
  );
}

function RankSelect({ value, onChange }) {
  // −/＋ ボタンで1ずつ増減（素早さ比較モーダルと同じ操作感）＋ プルダウンで直接選択も可
  return (
    <div className="rank-step">
      <button type="button" className="rank-step-btn" onClick={() => onChange(Math.max(-6, value - 1))} aria-label="ランクを下げる">−</button>
      <select className="rank" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: 13 }, (_, i) => 6 - i).map((r) => (
          <option key={r} value={r}>{r > 0 ? `+${r}` : r}</option>
        ))}
      </select>
      <button type="button" className="rank-step-btn" onClick={() => onChange(Math.min(6, value + 1))} aria-label="ランクを上げる">＋</button>
    </div>
  );
}

// ランク変化系特性: 押すと「ランク欄」へ反映するボタン（押すたびdirぶん変化・±6クランプ）。発動回数表示はやめてランク欄を正にする
function RankAbilityBtn({ ability, onApply, atkRank, defRank }) {
  const ra = RANK_ABILITIES[ability];
  const tr = ra.affects === "atk" ? atkRank : defRank;
  return (
    <button type="button" className="rank-ab-btn" style={{ paddingBottom: 8 }} onClick={() => onApply(ability)}
      title="押すとランク欄に反映（もう一度押すと更に変化）。戻すにはランク欄を直接変更">
      <span>{ra.label}{ra.dir > 0 ? "↑" : "↓"} 発動</span>
      <span className="rank-ab-cur">{ra.affects === "atk" ? "攻撃" : "防御"}ランク {tr > 0 ? `+${tr}` : tr}</span>
    </button>
  );
}

// 選択中ポケモンの種族値（H/A/B/C/D/S＋合計）を1行で表示
function BaseStats({ base }) {
  if (!base) return null;
  const cells = [["H", base.h], ["A", base.a], ["B", base.b], ["C", base.c], ["D", base.d], ["S", base.s]];
  const total = cells.reduce((s, [, v]) => s + (v || 0), 0);
  return (
    <div className="base-stats" title="種族値">
      <span className="bs-label">種族値</span>
      {cells.map(([k, v]) => (
        <span key={k} className="bs-cell"><span className="bs-k">{k}</span><span className="bs-v">{v}</span></span>
      ))}
      <span className="bs-total">計{total}</span>
    </div>
  );
}

// ダメ計の左右に並べるチームのアイコン列（自チーム=左→こうげき側）。クリックで反映。
// groups=メンバーごとの配列[通常, メガ…]。メガ/フォルム違いはベースの右に横並び（敵チーム表示と統一）。
function TeamRail({ title, side, groups, emptyHint, controls }) {
  const railBtn = (it, i) => {
    const icon = iconOf(it.name);
    return (
      <button key={i} className={(it.active ? "rail-icon on" : "rail-icon") + (it.mega ? " rail-mega" : "")} onClick={it.onClick} title={it.name}>
        {icon ? <img src={icon} alt="" /> : <span className="rail-noimg">?</span>}
        <span className="rail-name">{it.label || it.name}</span>
      </button>
    );
  };
  return (
    <aside className={`team-rail ${side}`}>
      <div className="rail-title">{title}</div>
      {controls}
      {(!groups || groups.length === 0)
        ? <div className="rail-empty">{emptyHint}</div>
        : groups.map((group, gi) => {
            const [base, ...megas] = group; // ベースは左、メガ/フォルムはその右（複数あれば縦に積む）
            return (
              <div key={gi} className="rail-group">
                {railBtn(base, 0)}
                {megas.length > 0 && <div className="rail-megas">{megas.map((m, j) => railBtn(m, j + 1))}</div>}
              </div>
            );
          })}
    </aside>
  );
}

// ひらがな↔カタカナ正規化（検索用）
function normalizeKana(str) {
  return str
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();
}

// ローマ字→ひらがな変換（IME切り替え忘れ対策）
const ROMAJI_TABLE = {
  kya:"きゃ",kyu:"きゅ",kyo:"きょ",gya:"ぎゃ",gyu:"ぎゅ",gyo:"ぎょ",
  sha:"しゃ",shu:"しゅ",sho:"しょ",sya:"しゃ",syu:"しゅ",syo:"しょ",
  ja:"じゃ",ju:"じゅ",jo:"じょ",jya:"じゃ",jyu:"じゅ",jyo:"じょ",zya:"じゃ",zyu:"じゅ",zyo:"じょ",
  cha:"ちゃ",chu:"ちゅ",cho:"ちょ",tya:"ちゃ",tyu:"ちゅ",tyo:"ちょ",
  nya:"にゃ",nyu:"にゅ",nyo:"にょ",hya:"ひゃ",hyu:"ひゅ",hyo:"ひょ",
  bya:"びゃ",byu:"びゅ",byo:"びょ",pya:"ぴゃ",pyu:"ぴゅ",pyo:"ぴょ",
  mya:"みゃ",myu:"みゅ",myo:"みょ",rya:"りゃ",ryu:"りゅ",ryo:"りょ",
  fa:"ふぁ",fi:"ふぃ",fe:"ふぇ",fo:"ふぉ",va:"ゔぁ",vi:"ゔぃ",ve:"ゔぇ",vo:"ゔぉ",
  wi:"うぃ",we:"うぇ",she:"しぇ",che:"ちぇ",je:"じぇ",
  ti:"てぃ",di:"でぃ",du:"どぅ",tu:"つ",
  ka:"か",ki:"き",ku:"く",ke:"け",ko:"こ",ga:"が",gi:"ぎ",gu:"ぐ",ge:"げ",go:"ご",
  sa:"さ",si:"し",shi:"し",su:"す",se:"せ",so:"そ",za:"ざ",zi:"じ",ji:"じ",zu:"ず",ze:"ぜ",zo:"ぞ",
  ta:"た",chi:"ち",te:"て",to:"と",da:"だ",de:"で",do:"ど",
  na:"な",ni:"に",nu:"ぬ",ne:"ね",no:"の",
  ha:"は",hi:"ひ",hu:"ふ",fu:"ふ",he:"へ",ho:"ほ",
  ba:"ば",bi:"び",bu:"ぶ",be:"べ",bo:"ぼ",pa:"ぱ",pi:"ぴ",pu:"ぷ",pe:"ぺ",po:"ぽ",
  ma:"ま",mi:"み",mu:"む",me:"め",mo:"も",
  ya:"や",yu:"ゆ",yo:"よ",ra:"ら",ri:"り",ru:"る",re:"れ",ro:"ろ",
  wa:"わ",wo:"を",a:"あ",i:"い",u:"う",e:"え",o:"お",
};
function romajiToHiragana(input) {
  let s = input.toLowerCase(), out = "";
  while (s.length) {
    // 促音: 子音の連続（nn以外）
    if (s.length >= 2 && s[0] === s[1] && "kstpgzdbfrcjhmyw".includes(s[0])) {
      out += "っ"; s = s.slice(1); continue;
    }
    // ん: n + 子音 or 末尾のn/nn
    if (s[0] === "n" && (s.length === 1 || "bcdfghjkmprstwz'n".includes(s[1]))) {
      out += "ん"; s = s.slice(s[1] === "n" || s[1] === "'" ? 2 : 1); continue;
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = s.slice(0, len);
      if (ROMAJI_TABLE[chunk]) { out += ROMAJI_TABLE[chunk]; s = s.slice(len); matched = true; break; }
    }
    if (!matched) { out += s[0]; s = s.slice(1); }
  }
  return out;
}

// ポケモン検索ボックス（部分一致・ひらがな/カタカナ両対応）
function PokemonSearch({ value, onChange, accent }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const current = POKEMON[value];

  const filtered = useMemo(() => {
    if (!query) return POKEMON.map((p, i) => ({ ...p, i }));
    const q = normalizeKana(query);
    const qRomaji = /[a-z]/.test(q) ? romajiToHiragana(q) : null;
    return POKEMON.map((p, i) => ({ ...p, i })).filter((p) => {
      // 接頭辞表記でもヒットさせる:
      // 「アブソル(メガ)」→メガアブソル / 「リザードン(メガX)」→メガリザードンX
      // 「キュウコン(アローラ)」→アローラキュウコン / 「ケンタロス(パルデア炎)」→パルデアケンタロス(炎)
      const keys = [normalizeKana(p.name)];
      const mega = p.name.match(/^(.+)\(メガ([XY]?)\)$/);
      if (mega) keys.push(normalizeKana(`めが${mega[1]}${mega[2]}`));
      const region = p.name.match(/^(.+)\((アローラ|ガラル|ヒスイ|パルデア)([単炎水]?)\)$/);
      if (region) keys.push(normalizeKana(`${region[2]}${region[1]}${region[3]}`));
      // 「ヒートロトム」等は「ロトム」でもヒットさせる
      if (p.name.endsWith("ロトム")) keys.push(normalizeKana("ロトム"));
      return keys.some((k) => k.startsWith(q) || (qRomaji && k.startsWith(qRomaji)));
    });
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 開いたら確実に入力欄へフォーカス（描画完了後に実行）
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const select = (idx) => { onChange(idx); setQuery(""); setOpen(false); inputRef.current?.blur(); };

  return (
    <div className="poke-search" ref={ref}>
      {/* ポケモン名表示欄がそのまま検索入力欄になる（コンボボックス） */}
      <div className="poke-search-display" style={{ borderColor: open ? (accent ?? "#3d8dd6") : "#2c3854", padding: 0 }}>
        <input
          ref={inputRef}
          className="poke-search-name-input"
          value={open ? query : current?.name ?? ""}
          placeholder={current?.name ?? "ポケモンを検索"}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onClick={() => { if (!open) { setQuery(""); setOpen(true); } }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) select(filtered[0].i);
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
        />
        <span className="poke-search-arrow" onClick={() => setOpen((v) => !v)}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="poke-dropdown">
          <div className="poke-list">
            {filtered.length === 0 && <div className="poke-list-empty">見つかりません</div>}
            {filtered.map((p) => (
              <div
                key={p.i}
                className={p.i === value ? "poke-item selected" : "poke-item"}
                onClick={() => select(p.i)}
              >
                <span className="poke-item-name">{p.name}</span>
                <span className="poke-item-types">
                  {p.types.map((t) => (
                    <span key={t} className="chip-mini" style={{ background: TYPE_COLOR[t] }}>{t}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 技検索ボックス（ポケモン検索と同じコンボボックス型）
// 閉じている時は技情報（タイプ・分類・威力）を表示し、クリックで検索入力に切り替わる
function MoveSearch({ moveList, value, onChange, accent, chipType, meta, usage }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return moveList;
    const q = normalizeKana(query);
    const qRomaji = /[a-z]/.test(q) ? romajiToHiragana(q) : null;
    return moveList.filter((m) => {
      const k = normalizeKana(m.name);
      return k.startsWith(q) || (qRomaji && k.startsWith(qRomaji));
    });
  }, [query, moveList]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (name) => { onChange(name); setQuery(""); setOpen(false); };

  return (
    <div className="poke-search" ref={ref}>
      <div className="poke-search-display" style={{ borderColor: open ? (accent ?? "#3d8dd6") : (accent ?? "#2c3854"), padding: 0 }}>
        {open ? (
          <input
            ref={inputRef}
            className="poke-search-name-input"
            style={{ fontWeight: 400 }}
            value={query}
            placeholder={value || "技を検索"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) select(filtered[0].name);
              if (e.key === "Escape") setOpen(false);
            }}
          />
        ) : (
          <div className="move-display" onClick={() => { setQuery(""); setOpen(true); }}>
            {chipType && <TypeChip t={chipType} small />}
            <span className="move-display-name">{value || "技を選択"}</span>
            {usage != null && <span className="move-usage">{usage.toFixed(1)}%</span>}
            {meta && <span className="move-display-meta">{meta}</span>}
          </div>
        )}
        <span className="poke-search-arrow" onClick={() => setOpen((v) => !v)}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="poke-dropdown">
          <div className="poke-list">
            {filtered.length === 0 && <div className="poke-list-empty">見つかりません</div>}
            {filtered.map((m) => (
              <div key={m.name} className={m.name === value ? "poke-item selected" : "poke-item"} onClick={() => select(m.name)}>
                <span className="poke-item-name" style={{ fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
                  {m.name}
                  {m.usage != null && <span className="move-usage">{m.usage.toFixed(1)}%</span>}
                </span>
                <span className="poke-item-types">
                  <span className="chip-mini" style={{ background: TYPE_COLOR[m.t] }}>{m.t}</span>
                  <span className="move-meta-mini">{m.c}{m.lk ? "・相手依存" : ` ${m.p}`}{m.hits ? "・連続" : ""}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// すばやさ補正ブロック（自分・相手で共用）: ランク±＋スカーフ/まひ/2倍特性
function SpdMods({ rank, setRank, scarf, setScarf, para, setPara, boost, setBoost }) {
  return (
    <div className="spd-mods">
      <label className="spd-row"><span>ランク</span>
        <span className="spd-rank">
          <button type="button" onClick={() => setRank((r) => Math.max(-6, r - 1))} aria-label="下げる">−</button>
          <b>{rank > 0 ? "+" + rank : rank}</b>
          <button type="button" onClick={() => setRank((r) => Math.min(6, r + 1))} aria-label="上げる">＋</button>
        </span>
      </label>
      <div className="spd-checks">
        <label><input type="checkbox" checked={scarf} onChange={(e) => setScarf(e.target.checked)} />スカーフ ×1.5</label>
        <label><input type="checkbox" checked={para} onChange={(e) => setPara(e.target.checked)} />まひ ×0.5</label>
        <label><input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} />2倍特性 ×2</label>
      </div>
    </div>
  );
}

// ⚡ すばやさ比較モーダル。自分=登録実数値(入力可)＋補正、相手=最速/準速/無振り/最遅×補正、各パターンで勝敗判定。
function SpeedCompare({ ownName, ownBaseS, ownMember, enemyName, enemyBaseS, stat, onClose }) {
  const regSpd = ownMember ? stat(ownBaseS, ownMember.sp?.s ?? 0, ownMember.nature?.plus === "s" ? 1.1 : ownMember.nature?.minus === "s" ? 0.9 : 1.0) : null;
  const [spd, setSpd] = useState(regSpd ?? ""); // 未登録ポケは空欄（準速を勝手に入れない）
  const [oRank, setORank] = useState(0), [oScarf, setOScarf] = useState(false), [oPara, setOPara] = useState(false), [oBoost, setOBoost] = useState(false);
  const [eRank, setERank] = useState(0), [eScarf, setEScarf] = useState(false), [ePara, setEPara] = useState(false), [eBoost, setEBoost] = useState(false);
  const stageMul = (r) => (r >= 0 ? (2 + r) / 2 : 2 / (2 - r));
  const mod = (base, rank, scarf, para, boost) => { let s = Math.floor(base * stageMul(rank)); if (scarf) s = Math.floor(s * 1.5); if (boost) s = Math.floor(s * 2); if (para) s = Math.floor(s * 0.5); return s; };
  const ownFinal = spd === "" ? null : mod(Number(spd) || 0, oRank, oScarf, oPara, oBoost); // 空欄なら判定しない
  const pats = [["最速", stat(enemyBaseS, 32, 1.1)], ["準速", stat(enemyBaseS, 32, 1.0)], ["無振り", stat(enemyBaseS, 0, 1.0)], ["最遅", stat(enemyBaseS, 0, 0.9)]];
  // 自分の実数値が未入力の時は、相手と同様に最速/準速/無振り/最遅の参考値を出す（種族値から算出）
  const ownPats = [["最速", stat(ownBaseS, 32, 1.1)], ["準速", stat(ownBaseS, 32, 1.0)], ["無振り", stat(ownBaseS, 0, 1.0)], ["最遅", stat(ownBaseS, 0, 0.9)]];
  return (
    <div className="modal-backdrop modal-top" {...dismissOnBackdrop(onClose)}>
      <section className="result modal spd-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="閉じる">✕</button>
        <p className="vs" style={{ marginBottom: 10 }}><b>⚡ すばやさ比較</b>　補正をかけた素早さ実数値で、自分が相手の各振り方を抜けるか判定します</p>
        <div className="spd-cols">
          <div className="spd-side">
            <div className="spd-side-head">自分: {ownName}<span className="spd-src">{regSpd != null ? "（登録値）" : "（未登録：実数値を入力 / 各振り方は下に表示）"}</span></div>
            <label className="spd-row"><span>実数値</span><input type="number" value={spd} onChange={(e) => setSpd(e.target.value)} /></label>
            <SpdMods rank={oRank} setRank={setORank} scarf={oScarf} setScarf={setOScarf} para={oPara} setPara={setOPara} boost={oBoost} setBoost={setOBoost} />
            {spd === "" ? (
              <div className="spd-pats">
                {ownPats.map(([lbl, base]) => (
                  <div className="spd-pat" key={lbl}>
                    <span className="spd-pat-l">{lbl}</span>
                    <span className="spd-pat-v">{mod(base, oRank, oScarf, oPara, oBoost)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="spd-final">最終 <b>{ownFinal}</b></div>
            )}
          </div>
          <div className="spd-side">
            <div className="spd-side-head">相手: {enemyName}</div>
            <SpdMods rank={eRank} setRank={setERank} scarf={eScarf} setScarf={setEScarf} para={ePara} setPara={setEPara} boost={eBoost} setBoost={setEBoost} />
            <div className="spd-pats">
              {pats.map(([lbl, base]) => {
                const v = mod(base, eRank, eScarf, ePara, eBoost);
                const blank = ownFinal == null;
                const win = !blank && ownFinal > v, tie = !blank && ownFinal === v;
                return (
                  <div className="spd-pat" key={lbl}>
                    <span className="spd-pat-l">{lbl}</span>
                    <span className="spd-pat-v">{v}</span>
                    <span className="spd-judge" style={{ background: blank ? "#2a3148" : win ? "#1c3d2e" : tie ? "#3a3422" : "#3a2424", color: blank ? "#8a93a8" : win ? "#7fe0b0" : tie ? "#e6cd78" : "#f0a0a0" }}>{blank ? "—" : win ? "勝" : tie ? "同速" : "負"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ChampionsDamageCalc() {
  const [view, setView] = useState("calc"); // "obs"=OBS接続 / "calc"=ダメージ計算 / "team"=マイチーム登録 / "feedback"
  const [noticeDismissed, setNoticeDismissed] = useState(() => { try { return localStorage.getItem("championsReleaseNoticeDismissed") === "1"; } catch { return false; } });
  const dismissNotice = () => { setNoticeDismissed(true); try { localStorage.setItem("championsReleaseNoticeDismissed", "1"); } catch {} };
  const myTeams = useMyTeams(); // 計算タブのチームバーとマイチームタブで状態を共有（タブ切替でズレない）
  const obs = useObs();         // OBS接続を全タブで共有（接続自体は親=常時マウントなのでタブ切替で切れない）
  // 共通ライブプレビュー: 取得ループを親に1個だけ持つ＝タブを跨いでも死なない。OBSタブとマイチームタブで共有（同じcanvas refを渡す＝表示中の方に描画）。
  // 重要: ここでは既存接続(obs.ref)からのみ撮り、絶対に接続しない(ensureを呼ばない)。切断中は未接続表示。これで「切断直後にプレビューが勝手に繋ぎ直す」事故も起きない。
  const obsPreviewRef = useRef(null);
  const [obsPreviewOn, setObsPreviewOn] = useState(true); // 既定ON＝接続さえすればプレビューが自然に出る
  const [obsPreviewMsg, setObsPreviewMsg] = useState("");
  useEffect(() => {
    if (!(obsPreviewOn && (view === "obs" || view === "team"))) return;
    let alive = true, timer;
    const tick = async () => {
      if (!alive) return;
      const client = obs.ref.current;
      if (client && client.isOpen()) {
        try {
          const f = await obsShot(client, 640, 360, "jpg"); // プレビューは軽いjpgでOK
          if (alive && obsPreviewRef.current) { const cv = obsPreviewRef.current, ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(f, 0, 0, cv.width, cv.height); setObsPreviewMsg(""); }
        } catch (e) { if (alive) setObsPreviewMsg(String(e?.message || e)); }
      } else if (alive) {
        setObsPreviewMsg("OBS未接続（🎬 OBSタブで接続）");
        if (obsPreviewRef.current) { const cv = obsPreviewRef.current, ctx = cv.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height); }
      }
      if (alive) timer = setTimeout(tick, 500);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [obsPreviewOn, view]); // eslint-disable-line react-hooks/exhaustive-deps
  // 攻撃側
  const [atkIdx, setAtkIdx] = useState(0);
  const [moveName, setMoveName] = useState("");
  const [atkSp, setAtkSp] = useState(32);
  const [atkNature, setAtkNature] = useState(1.1);
  const [atkRank, setAtkRank] = useState(0);
  const [crit, setCrit] = useState(false);
  const [burn, setBurn] = useState(false);
  const [helpingHand, setHelpingHand] = useState(false);
  const [hits, setHits] = useState(0); // 0=確率(2〜5回)モード, 1〜5=固定ヒット数
  const [atkItem, setAtkItem] = useState("その他");
  const [metroCount, setMetroCount] = useState(1); // メトロノーム: 同じ技の連続使用回数(1〜6)。威力×(1+0.2×(n-1))最大2.0
  const [atkAbility, setAtkAbility] = useState("なし");
  const [condOn, setCondOn] = useState(false);
  const [condCount, setCondCount] = useState(0);
  const [overlordCount, setOverlordCount] = useState(0); // そうだいしょう: 倒れた味方の数(0-5)
  const [rivalryGender, setRivalryGender] = useState("none"); // とうそうしん: 相手の性別(none/same/opp)
  const [hungerMode, setHungerMode] = useState("full"); // はらぺこスイッチ: full=まんぷく(でんき)/hangry=はらぺき(あく)
  const [proteanType, setProteanType] = useState(""); // へんげんじざい/リベロ: 既に変化済みのタイプ（空=今の技のタイプに変化＝常に一致）。例: 草に変化後あく技を撃つ等
  const [tracedAbility, setTracedAbility] = useState(""); // トレース: コピー/選択した特性（空=未選択）。atkAbilityEffがこれになる
  const [atkAbilityOn, setAtkAbilityOn] = useState(false);
  const [atkAutoOff, setAtkAutoOff] = useState(false); // 自動発動特性をユーザーが手動オフにした
  // 技の手動入力
  const [customOn, setCustomOn] = useState(false);
  const [customType, setCustomType] = useState("ノーマル");
  const [customCat, setCustomCat] = useState("物理");
  const [customPower, setCustomPower] = useState(100);
  const [varPow, setVarPow] = useState(""); // 威力変動技(ジャイロボール等)のユーザー指定威力。""=技の既定威力
  // 威力自動算出技の入力
  const [flingItem, setFlingItem] = useState("くろいてっきゅう"); // なげつける: 投げる持ち物
  const [hpRemain, setHpRemain] = useState(""); // 残りHP実数値
  const [hpMax, setHpMax] = useState("");       // 最大HP実数値
  const [hpPct, setHpPct] = useState(100);      // 残HP％（相手ポケ用）
  const [defHpPct, setDefHpPct] = useState(100); // ハードプレス: 相手(受ける側)の残HP％
  const [rageHits, setRageHits] = useState(0);   // ふんどのこぶし: これまでに受けた攻撃回数(0〜6)
  const [boostCount, setBoostCount] = useState(0);     // アシストパワー/つけあがる: ランク上昇合計
  const [stockpileCount, setStockpileCount] = useState(1); // はきだす: のみこんだ回数(1-3)

  // 防御側
  const [defIdx, setDefIdx] = useState(Math.min(2, POKEMON.length - 1));
  const [hpSp, setHpSp] = useState(0); // 防御側(相手)HPのSP既定。相手の努力値は不明なので0スタート（攻撃側atkSpは32のまま）
  const [bSp, setBSp] = useState(0);
  const [dSp, setDSp] = useState(0);
  const [bNature, setBNature] = useState(1.0);
  const [dNature, setDNature] = useState(1.0);
  const [defRank, setDefRank] = useState(0);
  const [wall, setWall] = useState(false);
  const [weatherSel, setWeather] = useState("なし");
  const [terrain, setTerrain] = useState("なし");
  const [defItem, setDefItem] = useState("その他");
  const [defAbility, setDefAbility] = useState("なし");
  const [defAbilityOn, setDefAbilityOn] = useState(false);
  const [defAutoOff, setDefAutoOff] = useState(false);
  const [confirmOff, setConfirmOff] = useState(null); // 自動特性オフ確認モーダル { side:"atk"|"def", ability }
  const [warnModal, setWarnModal] = useState(null); // 警告/確認モーダル { kind:"info"|"confirm", title, msg, applyDelta? }
  const [fxParticles, setFxParticles] = useState("あり");
  const [optsOpen, setOptsOpen] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false); // 下部固定の結果ドックで乱数表・補正タグを開く
  const [atkOnRight, setAtkOnRight] = useState(false); // 攻守交代: trueで攻撃側パネルを右に（左=防御）
  const [logOpen, setLogOpen] = useState(false); // 合算ログのパネル開閉
  const [dmgLog, setDmgLog] = useState([]); // 合算ログ: {id,label,dist,min,max,hp,checked,fixed}
  const [fixedDmg, setFixedDmg] = useState(""); // 固定ダメージ手動入力
  const [includeCurrent, setIncludeCurrent] = useState(true); // 合算に「今計算している結果」を含める
  const [isDouble, setIsDouble] = useState(false);           // シングル/ダブルバトルモード
  const [singleTarget, setSingleTarget] = useState(false);    // 範囲技をシングルターゲットで計算
  const [friendGuard, setFriendGuard] = useState(false);      // フレンドガード（ダブルのみ）
  const [fairyAuraDouble, setFairyAuraDouble] = useState(false); // 味方のフェアリーオーラ（ダブルのみ）
  // バトルモードに応じた採用率データ
  const currentMoveUsage = isDouble ? MOVE_USAGE_DOUBLES : MOVE_USAGE;
  const currentAbilityUsage = isDouble ? ABILITY_USAGE_DOUBLES : ABILITY_USAGE;
  // ダメ計タブの自チームはシングル/ダブルで別管理
  const railTeams  = isDouble ? myTeams.teamsD  : myTeams.teams;
  const railNames  = isDouble ? myTeams.namesD  : myTeams.names;
  const railActive = isDouble ? myTeams.activeD : myTeams.active;
  const setRailActive = isDouble ? myTeams.setActiveD : myTeams.setActive;
  const [sandTurns, setSandTurns] = useState("1"); // 砂のターン数
  const [statusTurns, setStatusTurns] = useState("1"); // 状態異常のターン数
  const [hideLowUsage, setHideLowUsage] = useState(false);
  const [showLowList, setShowLowList] = useState(false);
  const [showInference, setShowInference] = useState(false);
  const [recognizedTeam, setRecognizedTeam] = useState([]);
  const optsRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (optsRef.current && !optsRef.current.contains(e.target)) setOptsOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const attacker = POKEMON[atkIdx];
  const defender = POKEMON[defIdx];
  // すばやさ比較ツール用: ダメ計の左側=自ポケ・右側=相手（攻守交代しても左右は固定）。左ポケが登録済みならその実数値(SP/性格)を使う
  const spdOwn = atkOnRight ? defender : attacker;   // 左パネルのポケ＝自分
  const spdEnemy = atkOnRight ? attacker : defender; // 右パネルのポケ＝相手
  // メガ進化中(spdOwn=「○○(メガ)」)はチームにベース名で登録されているのでベース名でも引く。ownBaseSはメガ後種族値(spdOwn.base.s)が渡るので、登録SP/性格×メガ種族値で実数値が出る
  const spdOwnBase = spdOwn.name.replace(/\(メガ[XY]?\)$/, "");
  const ownMember = (railTeams[railActive] || []).find((m) => m && (m.name === spdOwn.name || m.name === spdOwnBase)) || null;

  // ポケモン変更時: 「影響あり特性の中で採用率が最大」を自動選択（影響なし特性は除く）、発動はオフに戻す
  const defaultAbility = (p) => {
    const usage = abilityUsageMapFor(p.name, currentAbilityUsage);
    const byUsage = (arr) => (arr.length ? [...arr].sort((a, b) => (usage[b] ?? -1) - (usage[a] ?? -1))[0] : null);
    const list = p.abilities || [];
    return byUsage(list.filter((a) => DAMAGE_ABILITIES.has(a))) ?? byUsage(list) ?? "なし";
  };
  // 登録メンバーの特性を反映する時の確定値。登録特性がそのポケの特性リストに無い（メガ適用でベース特性が残る等）なら既定特性へフォールバック。
  // これでマイチーム経由でもリスト選択と同様「常にそのポケの正しい特性」になり、特性チェックボックス等のUIが一致値前提で動く。
  const memberAbility = (poke, ability) => ((poke.abilities || []).includes(ability) ? ability : defaultAbility(poke));
  const applyingMemberRef = useRef(false); // マイチーム適用中は特性の自動リセットを抑止
  useEffect(() => {
    if (applyingMemberRef.current) { applyingMemberRef.current = false; return; }
    setAtkAbility(defaultAbility(attacker)); setAtkAbilityOn(false);
    // 別ポケを選んだ時はSP/性格/ランク/もちもの/戦況トグルも既定に戻す（登録・敵アイコン・攻守交代はガードで抑止される）
    setAtkSp(32); setAtkNature(1.1); setAtkRank(0); setBoostCount(0); setAtkItem("その他");
    setCrit(false); setBurn(false); setHelpingHand(false); setHits(0);
  }, [atkIdx]);
  const applyingDefMemberRef = useRef(false); // マイチーム適用中は防御側特性の自動リセットを抑止
  useEffect(() => {
    if (applyingDefMemberRef.current) { applyingDefMemberRef.current = false; return; }
    setDefAbility(defaultAbility(defender)); setDefAbilityOn(false);
    // 別ポケを選んだ時は防御側のSP/性格/ランク/壁/もちものも既定に戻す
    setHpSp(0); setBSp(0); setDSp(0); setBNature(1.0); setDNature(1.0); setDefRank(0); setWall(false); setDefItem("その他");
  }, [defIdx]);
  // メガシンカは持ち物を持てない＝選んだら「その他」に強制（メガストーンはポケモン名で識別するため「なし」ではなく「その他」）
  useEffect(() => { if (isMega(attacker)) setAtkItem("その他"); }, [atkIdx]);
  useEffect(() => { if (isMega(defender)) setDefItem("その他"); }, [defIdx]);

  // マイチームのメンバーをこうげき側へ反映（技カテゴリで攻撃ステ・性格補正を選択）
  function applyMemberToAttacker(m) {
    const idx = POKEMON.findIndex((p) => p.name === m.name);
    if (idx < 0) return;
    const poke = POKEMON[idx];
    const attackMoves = (m.moves || []).filter((x) => poke.learnset?.includes(x) && M[x]); // 覚えている攻撃技（変化技・未収録技は除く）
    const mv = attackMoves[0];
    const offStat = mv ? (M[mv].c === "物理" ? "a" : "c") : (poke.base.a >= poke.base.c ? "a" : "c");
    const natureMul = m.nature?.plus === offStat ? 1.1 : m.nature?.minus === offStat ? 0.9 : 1.0;
    if (idx !== atkIdx) applyingMemberRef.current = true; // 特性の自動リセットを1回だけ抑止
    setAtkIdx(idx);
    if (mv) setMoveName(mv);
    if (attackMoves.length) setCurMoveHist((prev) => ({ ...prev, [m.name]: attackMoves.slice(0, 8) })); // 覚えている攻撃技を全部「最近使った技」に表示（現モードの履歴へ）
    setAtkSp(m.sp?.[offStat] ?? 0);
    setAtkNature(natureMul);
    setAtkItem(m.item || "その他"); // 実物の持ち物名のまま反映（攻撃に効かない物は欄で(影響なし)表示）
    setAtkAbility(memberAbility(poke, m.ability)); // メガ適用時はベース特性ではなくメガ形態の特性へ補正
    setAtkAbilityOn(false);
    // 戦況トグルは別ポケ＝既定に戻す（idx変更effectを抑止しているのでここで明示的に。ランク/急所/やけど等が前のポケから引き継がれるのを防ぐ）
    setAtkRank(0); setBoostCount(0); setCrit(false); setBurn(false); setHelpingHand(false); setHits(0);
  }

  // マイチームのメンバーをぼうぎょ側へ反映（フルSP配分→HP/ぼうぎょ/とくぼう、性格は各防御ステの倍率）
  function applyMemberToDefender(m) {
    const idx = POKEMON.findIndex((p) => p.name === m.name);
    if (idx < 0) return;
    const poke = POKEMON[idx];
    const nat = (k) => (m.nature?.plus === k ? 1.1 : m.nature?.minus === k ? 0.9 : 1.0);
    if (idx !== defIdx) applyingDefMemberRef.current = true;
    setDefIdx(idx);
    setHpSp(m.sp?.h ?? 0);
    setBSp(m.sp?.b ?? 0);
    setDSp(m.sp?.d ?? 0);
    setBNature(nat("b"));
    setDNature(nat("d"));
    setDefItem(m.item || "その他"); // 実物の持ち物名のまま反映（防御に効かない物は欄で(影響なし)表示）
    setDefAbility(memberAbility(poke, m.ability)); // メガ適用時はベース特性ではなくメガ形態の特性へ補正
    setDefAbilityOn(false);
    // 戦況トグルは別ポケ＝既定に戻す（idx変更effectを抑止しているのでここで明示的に。ランク/壁が前のポケから引き継がれるのを防ぐ）
    setDefRank(0); setWall(false);
  }

  // 自チームは常に左パネル・敵チームは常に右パネルへ（攻守交代で左右パネルが入れ替わっても固定）。左=spdOwn, 右=spdEnemy。
  // 攻守交代で役割が反転しても両側の設定が消えないよう、各パネルに最後に適用したメンバー構成と、攻撃/防御ステのポケ別スナップショットを覚えておく。
  const ownCfgRef = useRef(null);   // 左(自分)に最後に適用したメンバー構成
  const enemyCfgRef = useRef(null); // 右(相手)に最後に適用したメンバー構成
  const atkSnapRef = useRef({});    // pokeIdx→攻撃側ステのスナップショット
  const defSnapRef = useRef({});    // pokeIdx→防御側ステのスナップショット
  const enemySnapRef = useRef({});  // 敵チームのアイコン別状態(pokeIdx→敵の編集内容)。新しい相手チーム認識でクリア＝試合ごとにリセット
  const applyToOwn = (m) => { ownCfgRef.current = m; (atkOnRight ? applyMemberToDefender : applyMemberToAttacker)(m); };
  const applyToEnemy = (m) => { enemyCfgRef.current = m; (atkOnRight ? applyMemberToAttacker : applyMemberToDefender)(m); };
  // 敵アイコン選択: その敵ポケの編集内容をアイコン別(pokeIdx)に保存し、再選択時に復元。試合が変われば(別チーム認識で)クリア＝別個体扱い
  const setEnemyIdx = (idx) => {
    enemyCfgRef.current = null;
    const isAtk = atkOnRight; // 攻守交代中は敵=攻撃側
    const curIdx = isAtk ? atkIdx : defIdx;
    if (idx === curIdx) return; // 同じ敵を選び直しただけ＝何もしない
    enemySnapRef.current[curIdx] = isAtk
      ? { atkSp, atkNature, atkAbility, atkAbilityOn, atkRank, boostCount, atkItem, crit, burn, helpingHand, hits }
      : { hpSp, bSp, dSp, bNature, dNature, defAbility, defAbilityOn, defRank, wall, defItem };
    const s = enemySnapRef.current[idx];
    if (isAtk) {
      applyingMemberRef.current = true; setAtkIdx(idx);
      if (s) { setAtkSp(s.atkSp); setAtkNature(s.atkNature); setAtkAbility(s.atkAbility); setAtkAbilityOn(s.atkAbilityOn); setAtkRank(s.atkRank); setBoostCount(s.boostCount); setAtkItem(s.atkItem); setCrit(s.crit); setBurn(s.burn); setHelpingHand(s.helpingHand); setHits(s.hits); }
      else { setAtkSp(32); setAtkNature(1.1); setAtkAbility(defaultAbility(POKEMON[idx])); setAtkAbilityOn(false); setAtkRank(0); setBoostCount(0); setAtkItem("その他"); setCrit(false); setBurn(false); setHelpingHand(false); setHits(0); }
    } else {
      applyingDefMemberRef.current = true; setDefIdx(idx);
      if (s) { setHpSp(s.hpSp); setBSp(s.bSp); setDSp(s.dSp); setBNature(s.bNature); setDNature(s.dNature); setDefAbility(s.defAbility); setDefAbilityOn(s.defAbilityOn); setDefRank(s.defRank); setWall(s.wall); setDefItem(s.defItem); }
      else { setHpSp(0); setBSp(0); setDSp(0); setBNature(1.0); setDNature(1.0); setDefAbility(defaultAbility(POKEMON[idx])); setDefAbilityOn(false); setDefRank(0); setWall(false); setDefItem("その他"); }
    }
  };
  const applyMember = (m, side) => (side === "def" ? applyToEnemy(m) : applyToOwn(m));
  // 敵チーム読み込み(新しい相手を認識)時に、入力した戦闘補正値(ランク/急所/やけど/壁/てだすけ)をリセット。
  // 別ポケを選ぶだけでは保持し、相手チームが変わった時だけクリア＝前の相手の設定を新しい相手に持ち越さない。
  const prevEnemyTeamRef = useRef("");
  useEffect(() => {
    const sig = (recognizedTeam || []).join(",");
    if (!sig || sig === prevEnemyTeamRef.current) return; // 空 or 同じ相手＝何もしない
    prevEnemyTeamRef.current = sig;
    setAtkRank(0); setDefRank(0); setBoostCount(0);
    setCrit(false); setBurn(false); setHelpingHand(false); setWall(false);
    atkSnapRef.current = {}; defSnapRef.current = {}; enemySnapRef.current = {}; // ポケ別スナップ＋敵アイコン別状態を破棄（試合が変われば別個体＝リセット）
  }, [recognizedTeam]); // eslint-disable-line react-hooks/exhaustive-deps
  // 自チームのレール項目: 各メンバーを「通常アイコン＋（メガ石所持時のみ）メガアイコン」に展開。
  // X/Y種は所持ストーン(○○ナイトX/Y)で片方に絞る。判別不可(ナイトのみ等)なら両方。メガはクリックでベース構成のままメガ体として登録(持ち物なし)。
  const ownRailItems = (m) => {
    const base = { name: m.name, active: spdOwn.name === m.name, onClick: () => applyToOwn(m) };
    const forms = MEGA_FORMS[m.name];
    if (!forms || !forms.length || !/ナイト[XY]?$/.test(m.item || "")) return [base]; // メガ石を持つ子だけ
    let shown = forms;
    if (forms.length > 1) { // X/Y種: ストーンのX/Yで絞る（判別できなければ両方）
      const v = /ナイトX$/.test(m.item) ? "X" : /ナイトY$/.test(m.item) ? "Y" : null;
      if (v) shown = forms.filter((f) => f.endsWith(`(メガ${v})`));
    }
    return [base, ...shown.map((mn) => ({
      name: mn, label: (mn.match(/\((メガ[XY]?)\)$/) || [, "メガ"])[1], mega: true,
      active: spdOwn.name === mn, onClick: () => applyToOwn({ ...m, name: mn, item: "なし" }),
    }))];
  };

  // 技変更時に状況指定をリセット。威力変動技なら既定威力をセット
  useEffect(() => { setCondOn(false); setCondCount(0); setVarPow(M[moveName]?.va ? String(M[moveName].p) : ""); }, [moveName]);
  // 特性を変えたら自動発動特性の手動オフを解除（新しい特性はデフォルトでオン）
  useEffect(() => { setAtkAutoOff(false); setProteanType(""); setTracedAbility(""); }, [atkAbility]); // 特性を変えたらへんげんじざいの変化後タイプ・トレースのコピー先もリセット
  useEffect(() => setDefAutoOff(false), [defAbility]);
  // フィールド特性(エレキメイカー等)はポケ選択で自動発動＝フィールド欄と連動（外せばフィールドも解除）
  useEffect(() => { if (TERRAIN_ABILITY[atkAbility]) setAtkAbilityOn(true); }, [atkAbility]);
  useEffect(() => { if (TERRAIN_ABILITY[defAbility]) setDefAbilityOn(true); }, [defAbility]);

  // 自動判定特性は常に計算へ反映（条件は効果処理側で判定）、手動特性はチェックオン時のみ
  const atkAbilityEff = atkAbility === "トレース" ? (tracedAbility || "なし") // トレースはコピー/選択した特性として扱う（常に発動）
    : isAutoAbility(atkAbility) ? (atkAutoOff ? "なし" : atkAbility) : (atkAbilityOn || (atkAbility === "こんじょう" && burn)) ? atkAbility : "なし"; // 自動特性は手動オフ可。こんじょうはやけど中なら自動オン
  const wallEff = wall && atkAbilityEff !== "すりぬけ"; // すりぬけは壁(リフレクター/ひかりのかべ)を無視
  // ダブルバトル専用: 壁倍率/フレンドガード（moveKeyに依存しないものはここで）
  const wallMul = isDouble ? 2732 / 4096 : 0.5;           // ダブル壁 ×2/3 (2732/4096)
  const friendGuardMul = (isDouble && friendGuard) ? 3072 / 4096 : 1; // フレンドガード ×0.75
  const defAbilityRaw = isAutoAbility(defAbility) ? (defAutoOff ? "なし" : defAbility) : defAbilityOn ? defAbility : "なし";
  // フィールド: 発動中のフィールド特性(エレキメイカー等)を優先、無ければ手動選択(terrain)
  const terrainEff = TERRAIN_ABILITY[atkAbilityEff] || TERRAIN_ABILITY[defAbilityRaw] || terrain;
  // かたやぶり(攻撃側): 防御側の特性(ふゆう/あついしぼう/マルチスケイル/フィルター等)をダメージ計算上は無視。天気・オーラ等の場の特性は無視しない
  const moldBreaker = ["かたやぶり", "ターボブレイズ", "テラボルテージ", "きんしのちから"].includes(atkAbilityEff);
  const defAbilityEff = moldBreaker ? "なし" : defAbilityRaw;
  // 天気特性（あめふらし等）が発動中なら計算上の天気をそれにする。手動の天気選択(weatherSel)はフォールバック（かたやぶりは天気を消さない＝raw参照）
  // メガソーラー（メガニウム(メガ)）: 自分が技を使う時だけ実際の天気に関係なく「にほんばれ(はれ)」扱い（天気欄は変えない＝計算上のみ）
  const weather = atkAbilityEff === "メガソーラー" ? "はれ" : (WEATHER_ABILITY[atkAbilityEff] || WEATHER_ABILITY[defAbilityRaw] || weatherSel);
  // 天気を作る特性(ひでり等)を選択した時点で天気欄(weatherSel)をその天気に自動セット（ユーザー要望・フィールド特性がterrainEff経由で自動反映されるのと挙動を揃える）。
  // 選択時のみ＝以降ユーザーが手動で変えても上書きしない（特性を変えるまで再同期しない）。フィールドは欄の値がterrainEffなので別途同期不要。
  useEffect(() => { const w = WEATHER_SETTER[atkAbility] || WEATHER_SETTER[defAbility]; if (w) setWeather(w); }, [atkAbility, defAbility]); // eslint-disable-line react-hooks/exhaustive-deps
  // てんきや: 天気でタイプが変わる（ポワルン）。STAB・相性・タイプ表示に反映
  const atkTypes = (atkAbilityEff === "てんきや" && FORECAST_TYPE[weather]) ? [FORECAST_TYPE[weather]]
    : (atkAbilityEff === "ぎたい" && TERRAIN_TO_TYPE[terrainEff]) ? [TERRAIN_TO_TYPE[terrainEff]] // ぎたい: フィールドに合わせて自身のタイプが変化（STAB・相性・タイプ表示に反映）
    : ((atkAbilityEff === "へんげんじざい" || atkAbilityEff === "リベロ") && proteanType) ? [proteanType] // 変化済みタイプを指定＝そのタイプ固定（技と一致する時だけSTAB）
    : attacker.types;
  const defTypes = (defAbilityRaw === "てんきや" && FORECAST_TYPE[weather]) ? [FORECAST_TYPE[weather]] : defender.types;
  // ランク実効値(atkRankEff/defRankEff)はランク変化特性の発動段数も反映するため、move解決後に算出（下方）

  const moveList = useMemo(() => {
    const usage = usageMapFor(attacker.name, currentMoveUsage);
    const list = attacker.learnset
      .map((n) => ({ name: n, ...M[n], usage: usage[n] }))
      .filter((m) => m.t && !(hideLowUsage && LOW_USAGE_MOVES.has(m.name)));
    // 採用率の高い順に並べる。採用率データの無い技は下にまとめ、その中は五十音順
    list.sort((a, b) => {
      const ua = a.usage ?? -1, ub = b.usage ?? -1;
      if (ua !== ub) return ub - ua;
      return a.name.localeCompare(b.name, "ja");
    });
    return list;
  }, [attacker, hideLowUsage, currentMoveUsage]);

  useEffect(() => {
    if (!moveList.find((m) => m.name === moveName)) setMoveName(moveList[0]?.name ?? "");
  }, [moveList]);

  const [moveHist, setMoveHist] = useState(() => { try { return JSON.parse(localStorage.getItem("championsMoveHist")) || {}; } catch { return {}; } }); // 技の履歴は対戦・再読込を跨いでずっと保持（シングル）
  useEffect(() => { try { localStorage.setItem("championsMoveHist", JSON.stringify(moveHist)); } catch {} }, [moveHist]);
  const [moveHistD, setMoveHistD] = useState(() => { try { return JSON.parse(localStorage.getItem("championsMoveHistD")) || {}; } catch { return {}; } }); // ダブル専用の技履歴（シングルと完全分離）
  useEffect(() => { try { localStorage.setItem("championsMoveHistD", JSON.stringify(moveHistD)); } catch {} }, [moveHistD]);
  // シングル/ダブルで技履歴を切り分け（前モードで使った技が別モードの既定として出るのを防ぐ）
  const curMoveHist = isDouble ? moveHistD : moveHist;
  const setCurMoveHist = isDouble ? setMoveHistD : setMoveHist;

  // 最近選択したポケモンの履歴（攻撃側・防御側それぞれ最新順8匹）
  const [atkPokeHist, setAtkPokeHist] = useState([]);
  const [defPokeHist, setDefPokeHist] = useState([]);
  const pushHist = (set) => (name) =>
    set((prev) => (prev[0] === name ? prev : [name, ...prev.filter((n) => n !== name)].slice(0, 8)));
  useEffect(() => { pushHist(setAtkPokeHist)(POKEMON[atkIdx].name); }, [atkIdx]);
  useEffect(() => { pushHist(setDefPokeHist)(POKEMON[defIdx].name); }, [defIdx]);
  const PokeRecentChips = ({ hist, setHist, onPick }) => hist.length === 0 ? null : (
    <div className="recent-row">
      {hist.map((n) => (
        <span key={n} className="recent-chip">
          <span className="recent-chip-name" onClick={() => { const i = POKEMON.findIndex((p) => p.name === n); if (i >= 0) onPick(i); }}>{n}</span>
          <button className="recent-chip-x" onClick={() => setHist((prev) => prev.filter((x) => x !== n))} aria-label={`${n}を履歴から削除`}>✕</button>
        </span>
      ))}
    </div>
  );

  // 手動入力モード: タイプ/分類/威力を自由に指定
  const move = customOn
    ? { name: "カスタム技", t: customType, c: customCat, p: Math.max(0, Number(customPower) || 0) }
    : M[moveName] ? { name: moveName, ...M[moveName] } : { name: "", t: "ノーマル", c: "物理", p: 0 };
  // 技名依存の効果（キバ技・状況技など）は手動入力時は無効
  const moveKey = customOn ? "" : moveName;
  // ダブル: 範囲技補正（moveKey確定後に判定）
  const isSpread = isDouble && SPREAD_MOVES.has(moveKey) && !singleTarget;
  const spreadMul = isSpread ? 3072 / 4096 : 1; // 範囲技 ×0.75 (3072/4096)
  // 威力を状況から自動算出する技(なげつける/きしかいせい/ふんか/アシストパワー/ヘビーボンバー/はきだす等)
  const varCalc = customOn ? null : VAR_CALC[moveName];
  // HP割合: 自ポケ(左=atkOnRight false)が撃つ時は実数値入力、相手ポケ(右)が撃つ時は％入力
  const hpMode = atkOnRight ? "pct" : "hp";
  const hpFrac = hpMode === "pct"
    ? Math.max(0, Math.min(100, Number(hpPct) || 0)) / 100
    : (Number(hpMax) > 0 ? Math.max(0, Math.min(Number(hpRemain) || 0, Number(hpMax))) / Number(hpMax) : 1);
  // ヘビーボンバー/ヒートスタンプの実効重さ（ヘヴィメタル=2倍/ライトメタル=半分。これらの技の時のみ反映）
  const atkWeightEff = weightWithAbility(attacker.w, atkAbility);
  const defWeightEff = weightWithAbility(defender.w, defAbility);
  let varCalcPower = null;
  if (varCalc) {
    const k = varCalc.kind;
    if (k === "fling") varCalcPower = ITEM_FLING[flingItem] ?? 0;
    else if (k === "boost") varCalcPower = 20 + 20 * Math.max(0, Math.floor(Number(boostCount) || 0));
    else if (k === "stockpile") varCalcPower = 100 * Math.max(1, Math.min(3, Math.floor(Number(stockpileCount) || 1)));
    else if (k === "lowhp") varCalcPower = reversalPower(hpFrac);
    else if (k === "highhp") varCalcPower = Math.max(1, Math.floor(150 * hpFrac));
    else if (k === "targethp") varCalcPower = Math.max(1, Math.min(100, Math.floor(Number(defHpPct) || 0))); // ハードプレス: 100×相手残HP割合
    else if (k === "ragefist") varCalcPower = Math.min(350, 50 + 50 * Math.max(0, Math.min(6, Math.floor(Number(rageHits) || 0)))); // ふんどのこぶし
    else if (k === "weight") varCalcPower = heavySlamPower(atkWeightEff, defWeightEff);
  }
  // VAR_CALC外のva技(ジャイロボール/エレキボール/ふくろだたき)はユーザー指定のvarPowを使う
  const isVarMove = !customOn && !!move.va && !varCalc;
  const moveBaseP = varCalc ? varCalcPower : (isVarMove ? Math.max(0, Number(varPow) || 0) : move.p);
  // 固定ダメージ技(ナイトヘッド等): レベル分=50固定
  const fixedDmgVal = customOn ? undefined : FIXED_DMG_MOVES[moveName];
  const isFixedMove = fixedDmgVal != null;

  let effType = move.t, effPower = moveBaseP;
  const moveHits = MOVE_HITS_OVERRIDE[moveKey] || move.hits; // 連続技のヒット数（ネズミざん等は実際の範囲に上書き）
  if (moveKey === "レイジングブル" && RAGING_BULL_TYPE[attacker.name]) effType = RAGING_BULL_TYPE[attacker.name]; // パルデアケンタロスのフォルムでタイプ変化
  if (move.ws) {
    const map = { はれ: "ほのお", あめ: "みず", すなあらし: "いわ", ゆき: "こおり" };
    if (map[weather]) { effType = map[weather]; effPower = move.p * 2; }
  }
  if (move.lk) effPower = defender.weightPower;

  // フィールド補正（接地＝ひこうタイプでない、で簡易判定）
  let terrainNote = "";
  {
    const atkGrounded = !atkTypes.includes("ひこう");
    const defGrounded = !defTypes.includes("ひこう");
    // だいちのはどう: フィールド中＆接地時、タイプがフィールド属性に変化＋威力2倍（地形×1.3は下の判定で自動加算。ミストは×1.3無し＝仕様通り）
    if (moveKey === "だいちのはどう" && terrainEff !== "なし" && atkGrounded && atkAbility !== "ふゆう") {
      const TP = { グラス: "くさ", ミスト: "フェアリー", エレキ: "でんき", サイコ: "エスパー" }[terrainEff];
      if (TP) { effType = TP; effPower = f(effPower * 2); terrainNote = `だいちのはどう: ${TP}・威力2倍`; }
    }
    if (terrainEff === "エレキ" && effType === "でんき" && atkGrounded) { effPower = f(effPower * 1.3); terrainNote = "エレキ 威力×1.3"; }
    if (terrainEff === "グラス") {
      if (effType === "くさ" && atkGrounded) { effPower = f(effPower * 1.3); terrainNote = "グラス 威力×1.3"; }
      if (["じしん", "じだんだ", "じならし"].includes(moveKey) && defGrounded) { effPower = f(effPower * 0.5); terrainNote = "グラス 威力×0.5"; }
    }
    if (terrainEff === "サイコ" && effType === "エスパー" && atkGrounded) { effPower = f(effPower * 1.3); terrainNote = "サイコ 威力×1.3"; }
    if (terrainEff === "ミスト" && effType === "ドラゴン" && defGrounded) { effPower = f(effPower * 0.5); terrainNote = "ミスト 威力×0.5"; }
  }

  // もちもの: 効果のあるものだけ反映。タイプ強化系/半減きのみは「実物アイテムなら技タイプ一致時のみ」。
  const atkIE = atkAbilityEff === "ぶきよう" ? itemEffect("なし", "atk") : itemEffect(atkItem, "atk"); // ぶきよう: 自分のもちもの効果を無効化
  const defIE = defAbilityEff === "ぶきよう" ? itemEffect("なし", "def") : itemEffect(defItem, "def");
  const effPowerNoItem = effPower; // 威力アイテム/特性補正の前（フィールド・可変技は反映済み）。攻撃力推定の逆算＋技説明の威力表示に使用
  if (atkIE.kind === "typeBoostAny" || (atkIE.kind === "typeBoost" && atkIE.type === effType)) effPower = f(effPower * 1.2); // タイプ強化(×1.2)。実物(もくたん等)は一致タイプのみ
  if (atkIE.kind === "orb") effPower = f(effPower * 1.3); // いのちのたま: ダメージ×1.3（反動は合算欄で）
  if (atkIE.kind === "band" && move.c === "物理") effPower = f(effPower * 1.1); // ちからのハチマキ: 物理技 威力×1.1
  if (atkIE.kind === "glasses" && move.c === "特殊") effPower = f(effPower * 1.1); // ものしりメガネ: 特殊技 威力×1.1
  const metroMul = Math.min(2, 1 + 0.2 * (Math.max(1, metroCount) - 1)); // メトロノーム倍率
  if (atkIE.kind === "metronome") effPower = f(effPower * metroMul); // メトロノーム: 連続使用で威力上昇(最大×2)
  // たつじんのおび(効果抜群×1.2)は eff 確定後に postEffMul で適用（result useMemo 内）
  const lightBall = atkIE.kind === "lightBall" && attacker.name === "ピカチュウ";
  // 半減きのみ: 汎用(抜群半減きのみ)は全タイプ抜群、実物(オッカのみ等)は一致タイプの抜群のみ ×0.5（f内で eff>1 判定）
  const resistBerryActive = defIE.kind === "resistBerryAny" || (defIE.kind === "resistBerry" && defIE.type === effType);

  // 特性（攻撃側）: 威力・タイプ・攻撃実数値・タイプ一致倍率への補正
  const isPhysicalMove = move.c === "物理";
  // 接触判定: 物理技は基本接触（非接触リストを除く）。えんかくで非接触化（相手のもふもふ等の接触補正を受けない）
  const contact = isPhysicalMove && !NON_CONTACT_PHYSICAL.has(moveKey) && atkAbilityEff !== "えんかく";
  let stabMul = 1.5, aAbilityMul = 1, ignoreBurn = false, protean = false, atkAbNote = "";
  {
    const ab = atkAbilityEff;
    const basePow = move.lk ? defender.weightPower : moveBaseP;
    // テクニシャンは状況依存の威力変化を反映した実効基礎威力で判定（持ち物なしアクロバット2倍で55→110なら乗らない）
    const _cd = COND_MOVES[moveKey];
    const techBasePow = basePow
      * (moveKey === "アクロバット" && atkItem === "なし" ? 2 : 1)
      * (moveKey === "からげんき" && (condOn || burn) ? 2 : 1)
      * (_cd?.type === "toggle" && condOn && moveKey !== "からげんき" ? _cd.mul : 1)
      + (_cd?.type === "count" && condCount > 0 ? _cd.per * condCount : 0);
    if (ABILITY_SKIN[ab] && move.t === "ノーマル") { effType = ABILITY_SKIN[ab]; effPower = f(effPower * 1.2); atkAbNote = `${ab}: ${effType}化×1.2`; }
    if (ab === "うるおいボイス" && SOUND_MOVES.has(moveKey)) { effType = "みず"; atkAbNote = "うるおいボイス: 音技をみず化"; }
    if (ABILITY_PINCH[ab] && effType === ABILITY_PINCH[ab]) { effPower = f(effPower * 1.5); atkAbNote = `${ab} 威力×1.5`; }
    if (ab === "てきおうりょく" && atkTypes.includes(effType)) { stabMul = 2; atkAbNote = "てきおうりょく: 一致×2"; } // タイプ一致技のみ効果（不一致技では発動チェックもオフ＝オンにできない）
    if ((ab === "ちからもち" || ab === "ヨガパワー") && isPhysicalMove) { aAbilityMul *= 2; atkAbNote = `${ab}: 攻撃×2`; }
    if (ab === "はりきり" && isPhysicalMove) { aAbilityMul *= 1.5; atkAbNote = "はりきり: 攻撃×1.5"; }
    if (ab === "こんじょう" && isPhysicalMove) { aAbilityMul *= 1.5; ignoreBurn = true; atkAbNote = "こんじょう: 攻撃×1.5・やけど無効"; }
    if (ab === "サンパワー" && !isPhysicalMove && weather === "はれ") { aAbilityMul *= 1.5; atkAbNote = "サンパワー: 特攻×1.5"; }
    if (ab === "メガソーラー") atkAbNote = "メガソーラー: 自分の技はにほんばれ(はれ)扱い"; // 天気はweather=はれに上書き済み。ほのお技×1.5/みず技×0.5・ソーラービーム無溜め等
    if ((ab === "プラス" || ab === "マイナス") && !isPhysicalMove) { aAbilityMul *= 1.5; atkAbNote = `${ab}: 場に相方 特攻×1.5`; }
    if (ab === "ちからずく" && move.sf) { effPower = f(effPower * 1.3); atkAbNote = "ちからずく 威力×1.3"; } // 追加効果(sf)のある技のみ
    if (ab === "アナライズ") { effPower = f(effPower * 1.3); atkAbNote = "アナライズ 威力×1.3"; }
    if (ab === "テクニシャン" && basePow > 0 && techBasePow <= 60) { effPower = f(effPower * 1.5); atkAbNote = "テクニシャン 威力×1.5"; }
    if (ab === "がんじょうあご" && BITE_MOVES.has(moveKey)) { effPower = f(effPower * 1.5); atkAbNote = "がんじょうあご 威力×1.5"; }
    if (ab === "メガランチャー" && PULSE_MOVES.has(moveKey)) { effPower = f(effPower * 1.5); atkAbNote = "メガランチャー 威力×1.5"; }
    if (ab === "てつのこぶし" && isPunchMove(moveKey)) { effPower = f(effPower * 1.2); atkAbNote = "てつのこぶし 威力×1.2"; }
    if (ab === "すいほう" && effType === "みず") { effPower = f(effPower * 2); atkAbNote = "すいほう 威力×2"; }
    if (ab === "もらいび" && effType === "ほのお") { effPower = f(effPower * 1.5); atkAbNote = "もらいび: ほのお技×1.5"; } // 攻撃側もらいび状態
    if (ab === "ぎたい" && terrainEff !== "なし") atkAbNote = `ぎたい: ${TERRAIN_TO_TYPE[terrainEff]}タイプに変化`;
    if (ab === "かたいツメ" && contact) { effPower = f(effPower * 1.3); atkAbNote = "かたいツメ: 直接攻撃 威力×1.3"; }
    if (ab === "きれあじ" && SLICING_MOVES.has(moveKey)) { effPower = f(effPower * 1.5); atkAbNote = "きれあじ: 切る技 威力×1.5"; }
    if (ab === "ほのおのたてがみ" && effType === "ほのお") { effPower = f(effPower * 1.5); atkAbNote = "ほのおのたてがみ: ほのお技 威力×1.5"; }
    if (ab === "でんきにかえる" && effType === "でんき") { effPower = f(effPower * 2); atkAbNote = "でんきにかえる: 充電 でんき技×2"; }
    if (ab === "てんきや" && FORECAST_TYPE[weather]) atkAbNote = `てんきや: ${FORECAST_TYPE[weather]}タイプに変化`;
    if (ab === "てんねん" && defRank !== 0) atkAbNote = "てんねん: 相手の防御ランク補正を無視";
    if (ab === "とうそうしん" && rivalryGender !== "none") { effPower = f(effPower * (rivalryGender === "same" ? 1.25 : 0.75)); atkAbNote = `とうそうしん: ${rivalryGender === "same" ? "同性 威力×1.25" : "異性 威力×0.75"}`; }
    if (ab === "はらぺこスイッチ" && moveKey === "オーラぐるま") { if (hungerMode === "hangry") effType = "あく"; atkAbNote = hungerMode === "hangry" ? "はらぺこスイッチ: はらぺき（オーラぐるま=あく）" : "はらぺこスイッチ: まんぷく（オーラぐるま=でんき）"; }
    if (ab === "えんかく" && defAbilityEff === "もふもふ" && isPhysicalMove && !NON_CONTACT_PHYSICAL.has(moveKey)) atkAbNote = "えんかく: 非接触化（もふもふの接触半減を無効）";
    if (ab === "おやこあい" && !move.hits) atkAbNote = "おやこあい: 2回攻撃（2発目0.25倍）";
    if (ab === "すてみ" && RECOIL_MOVES.has(moveKey)) { effPower = f(effPower * 1.2); atkAbNote = "すてみ: 反動技 威力×1.2"; }
    if (ab === "そうだいしょう" && overlordCount > 0) { const mul = Math.min(1.5, 1 + 0.1 * overlordCount); effPower = f(effPower * mul); atkAbNote = `そうだいしょう: 味方${overlordCount}体ひんし 威力×${mul.toFixed(1)}`; }
    if (ab === "へんげんじざい" || ab === "リベロ") {
      if (proteanType) atkAbNote = `${ab}: ${proteanType}タイプに変化済み（この技は${effType === proteanType ? "タイプ一致" : "不一致＝STABなし"}）`;
      else { protean = true; atkAbNote = `${ab}: ${effType}タイプに変化(常にタイプ一致)`; }
    }
    if (ab === "すなのちから" && weather === "すなあらし" && !["ノーてんき", "エアロック"].includes(defAbilityOn ? defAbility : "なし") && ["じめん", "いわ", "はがね"].includes(effType)) {
      effPower = f(effPower * 1.3); atkAbNote = "すなのちから 威力×1.3";
    }
    if (ab === "かたやぶり" && defAbilityRaw !== "なし") atkAbNote = `かたやぶり: 相手の特性「${defAbilityRaw}」を無視`;
    if (ab === "スキルリンク" && moveHits) atkAbNote = `スキルリンク: 連続技${moveHits[1]}回固定`;
    if (ab === "すりぬけ" && wall) atkAbNote = "すりぬけ: 相手の壁を無視";
    if (ab === "ぶきよう" && atkItem !== "なし") atkAbNote = "ぶきよう: もちもの効果なし";
  }
  // フェアリーオーラ: どちらの側が持っていてもフェアリー技の威力×4/3（防御側が持っていても攻撃側のフェアリー技に乗る）
  if ((atkAbilityEff === "フェアリーオーラ" || defAbilityRaw === "フェアリーオーラ") && effType === "フェアリー") {
    effPower = f(effPower * 4 / 3);
    if (atkAbilityEff === "フェアリーオーラ") atkAbNote = "フェアリーオーラ: フェアリー技×1.33";
  }
  // ダブル: 味方のフェアリーオーラ（個別にスタック）
  if (isDouble && fairyAuraDouble && effType === "フェアリー") {
    effPower = f(effPower * 4 / 3);
  }

  // ランク変化系特性は「ランク欄」へ直接反映する方式に変更（RankAbilityBtn→setAtkRank/setDefRank）。ここは素のランクを使う。てんねんは相手のランク変化を無視
  const atkRankEff = defAbilityEff === "てんねん" ? 0 : atkRank;
  const defRankEff = (atkAbilityEff === "てんねん" || IGNORE_DEF_RANK_MOVES.has(moveKey)) ? 0 : defRank; // てんねん/せいなるつるぎ・DDラリアットは相手の防御ランク変化を無視

  // 状況依存技の効果
  const condDef = COND_MOVES[moveKey];
  let condNote = "";
  if (TERRAIN_REQUIRED_MOVES.has(moveKey) && terrainEff === "なし") condNote = "⚠ フィールドが無いと失敗（このダメージはフィールド有り想定）";
  if (WALL_BREAK_MOVES.has(moveKey) && wall) condNote = "壁(リフレクター/ひかりのかべ/オーロラベール)を無視";
  // しめりけ（自分/相手どちらかが持つ）は爆発技を失敗させる＝ダメージ0扱い
  const dampFail = (atkAbilityEff === "しめりけ" || defAbilityRaw === "しめりけ") && EXPLOSION_MOVES.has(moveKey);
  if (dampFail) condNote = "しめりけで失敗（爆発技は出せない）";
  const polterFail = moveKey === "ポルターガイスト" && defItem === "なし";
  if (polterFail) condNote = "相手の持ち物なし：失敗";
  {
    if (moveKey === "アクロバット" && atkItem === "なし") { effPower = f(effPower * 2); condNote = "もちものなし 威力×2"; }
    if (moveKey === "からげんき" && (condOn || burn)) { effPower = f(effPower * 2); ignoreBurn = burn; condNote = burn ? "状態異常(やけど) 威力×2・攻撃半減なし" : "状態異常 威力×2"; }
    if ((moveKey === "ソーラービーム" || moveKey === "ソーラーブレード") && ["あめ", "すなあらし", "ゆき"].includes(weather)) { effPower = f(effPower * 0.5); condNote = "天気 威力×0.5"; }
    if (moveKey === "ライジングボルト" && terrainEff === "エレキ" && !defTypes.includes("ひこう")) { effPower = f(effPower * 2); condNote = "エレキF 威力×2"; }
    if (moveKey === "ワイドフォース" && terrainEff === "サイコ" && !atkTypes.includes("ひこう")) { effPower = f(effPower * 1.5); condNote = "サイコF 威力×1.5"; }
    if (condDef?.type === "toggle" && condOn && moveKey !== "からげんき") { effPower = f(effPower * condDef.mul); condNote = `${condDef.label} 威力×${condDef.mul}`; }
    if (condDef?.type === "count" && condCount > 0) { effPower = effPower + condDef.per * condCount; condNote = `${condDef.label}${condCount} 威力+${condDef.per * condCount}`; }
  }

  // 急所: 確定急所技は常にオン、シェルアーマー/カブトアーマーは急所無効
  const alwaysCrit = ALWAYS_CRIT_MOVES.has(moveKey);
  const critBlocked = ["シェルアーマー", "カブトアーモ", "カブトアーマー"].includes(defAbilityEff);
  const critEff = critBlocked ? false : (alwaysCrit || crit);

  // ノーてんき/エアロック: 天候の影響を消す
  const noWeather = ["ノーてんき", "エアロック"].includes(atkAbilityEff) || ["ノーてんき", "エアロック"].includes(defAbilityRaw);

  // 自動判定特性の発動状況（チェックボックス表示用）
  const atkAbActive = atkAbNote !== "";
  const defAbActive = (() => {
    const a = defAbilityRaw; // 表示は防御側の実特性ベース（かたやぶりで無視されていても発動状況は出す）
    if (a === "なし") return false;
    if (ABILITY_IMMUNE[a]?.includes(effType)) return true;
    if (a === "ぼうおん" && SOUND_MOVES.has(moveKey)) return true;
    if ((a === "テイルアーマー" || a === "じょおうのいげん") && PRIORITY_MOVES.has(moveKey)) return true;
    if (a === "てんきや" && FORECAST_TYPE[weather]) return true;
    if (a === "てんねん" && atkRank !== 0) return true;
    if (a === "ぼうだん" && BALL_BOMB_MOVES.has(moveKey)) return true;
    if (a === "フェアリーオーラ" && effType === "フェアリー") return true;
    if (a === "マルチスケイル") return true; // デフォでオン（HP満タン想定）
    if (ABILITY_TYPE_MUL[a]?.[effType]) return true;
    if (a === "もふもふ" && contact) return true; // 接触技を半減＝ファーコート同様デフォオン（オフは警告）
    if (a === "ぶきよう" && defItem !== "なし") return true; // 相手のもちもの無効＝もちもの所持時デフォオン
    if ((a === "フィルター" || a === "ハードロック") && typeEffect(effType, defTypes) > 1) return true;
    if (a === "ファーコート" && isPhysicalMove) return true;
    if ((a === "ノーてんき" || a === "エアロック") && weather !== "なし") return true;
    return false;
  })();

  const isPhysical = move.c === "物理";
  // サイコショック系: 特殊技だが相手の「防御」でダメージ計算する
  const defPhys = isPhysical || ["サイコショック", "サイコブレイク", "しんぴのつるぎ"].includes(moveKey);
  // イカサマ: 相手（防御側）の攻撃実数値で計算（SP/性格/ランク入力は相手の攻撃の値として使う）
  const foulPlay = moveKey === "イカサマ";
  const isMulti = !!moveHits;
  const accent = TYPE_COLOR[effType];

  const result = useMemo(() => {
    const aKey = move.bp ? "b" : isPhysical ? "a" : "c";
    let A = stat((foulPlay ? defender : attacker).base[aKey], atkSp, atkNature); // イカサマは相手の攻撃を参照
    A = rankMul(A, critEff && atkRankEff < 0 ? 0 : atkRankEff);
    if (lightBall) A = f(A * 2); // でんきだま: ピカチュウのA/C2倍
    if (aAbilityMul !== 1) A = f(A * aAbilityMul); // ちからもち・はりきり等

    const dBase = defPhys ? defender.base.b : defender.base.d;
    const dSpVal = defPhys ? bSp : dSp;
    const dNat = defPhys ? bNature : dNature;
    let D = stat(dBase, dSpVal, dNat);
    if (!noWeather && weather === "すなあらし" && !defPhys && defTypes.includes("いわ")) D = f(D * 1.5);
    if (!noWeather && weather === "ゆき" && defPhys && defTypes.includes("こおり")) D = f(D * 1.5);
    if (defAbilityEff === "ファーコート" && defPhys) D = f(D * 2);
    if (defAbilityEff === "ふしぎなうろこ" && defPhys) D = f(D * 1.5);
    D = rankMul(D, critEff && defRankEff > 0 ? 0 : defRankEff);

    const HP = hpStat(defender.base.h, hpSp);

    let weatherMul = 1;
    if (!noWeather) {
      if (weather === "はれ") weatherMul = effType === "ほのお" ? 1.5 : effType === "みず" ? 0.5 : 1;
      if (weather === "あめ") weatherMul = effType === "みず" ? 1.5 : effType === "ほのお" ? 0.5 : 1;
    }

    const stab = protean || atkTypes.includes(effType);
    let eff = typeEffectScrappy(effType, defTypes, atkAbilityEff === "きもったま");
    if (moveKey === "フリーズドライ" && defTypes.includes("みず")) eff *= 4; // フリーズドライ: みずにも抜群（こおり×みず 0.5→2）
    if (dampFail) eff = 0; // しめりけ: 爆発技は失敗（無効化）
    if (polterFail) eff = 0; // ポルターガイスト: 相手の持ち物なし→失敗
    if (ABILITY_IMMUNE[defAbilityEff]?.includes(effType) || (defAbilityEff === "ぼうおん" && SOUND_MOVES.has(moveKey)) || ((defAbilityEff === "テイルアーマー" || defAbilityEff === "じょおうのいげん") && PRIORITY_MOVES.has(moveKey)) || (defAbilityEff === "ぼうだん" && BALL_BOMB_MOVES.has(moveKey))) eff = 0; // もらいび・ふゆう等

    if (MOVE_EXTRA_TYPE[moveKey]) eff *= typeEffectScrappy(MOVE_EXTRA_TYPE[moveKey], defTypes, atkAbilityEff === "きもったま"); // フライングプレス: かくとう×ひこうの複合相性

    // 固定ダメージ技(ナイトヘッド/ちきゅうなげ): レベル=50ダメージ固定。無効(eff=0)タイプのみ0、他補正は一切受けない
    if (isFixedMove) {
      const dmg = eff === 0 ? 0 : fixedDmgVal;
      const dist = new Map([[dmg, 1]]);
      return {
        A, D, HP, rolls: [dmg], nHits: 1, hitLabel: "1", useMin: dmg, useMax: dmg, stab: false, eff,
        parentalBond: false, useDist: dist, minPct: (dmg / HP) * 100, maxPct: (dmg / HP) * 100,
        ko: koSummary(dist, HP, dmg, dmg),
      };
    }

    // 防御側特性のダメージ倍率
    let postEffMul = ABILITY_TYPE_MUL[defAbilityEff]?.[effType] ?? 1;
    if (defAbilityEff === "もふもふ" && contact) postEffMul *= 0.5; // もふもふ: 接触技を半減（えんかくで無効・ほのお×2は上のmulで処理）
    if (defAbilityEff === "マルチスケイル") postEffMul *= 0.5;
    if ((defAbilityEff === "フィルター" || defAbilityEff === "ハードロック") && eff > 1) postEffMul *= 0.75;
    if (atkIE.kind === "obi" && eff > 1) postEffMul *= 1.2; // たつじんのおび: 効果抜群の技 ×1.2

    const env = {
      power: effPower, A, D, weatherMul, crit: critEff, critMul: atkAbilityEff === "スナイパー" ? 2.25 : 1.5, stab, stabMul, eff,
      burn: burn && isPhysical && !ignoreBurn, wall: wallEff && !WALL_BREAK_MOVES.has(moveKey), wallMul, helpingHand,
      resistBerry: resistBerryActive, postEffMul, spreadMul, friendGuardMul,
    };
    const rolls = calcRolls(env);

    // おやこあい: 2回攻撃（2発目は0.25倍）。各発が独立に乱数を振る。連続技/無効には乗らない
    const parentalBond = atkAbilityEff === "おやこあい" && !isMulti && eff > 0;
    let dispRolls = rolls, nHits, useMin, useMax, useDist;
    if (parentalBond) {
      const rolls2 = calcRolls({
        power: effPower, A, D, weatherMul, crit: critEff, critMul: atkAbilityEff === "スナイパー" ? 2.25 : 1.5, stab, stabMul, eff,
        burn: burn && isPhysical && !ignoreBurn, wall: wallEff, wallMul, helpingHand,
        resistBerry: resistBerryActive, postEffMul: postEffMul * 0.25, spreadMul, friendGuardMul,
      });
      dispRolls = rolls.map((r, i) => r + rolls2[i]); // 表示用: 各乱数で1発目+2発目の合計
      nHits = 2;
      useMin = Math.min(...rolls) + Math.min(...rolls2);
      useMax = Math.max(...rolls) + Math.max(...rolls2);
      useDist = new Map();
      for (const r1 of rolls) for (const r2 of rolls2) useDist.set(r1 + r2, (useDist.get(r1 + r2) || 0) + 1 / 256);
    } else if (isMulti && VAR_HIT_POWERS[moveKey]) {
      // 威力可変連続技(トリプルアクセル 20→40→60): 各発の威力でロールを出し畳み込む。発数は選択(既定=最大)
      const bps = VAR_HIT_POWERS[moveKey];
      nHits = hits >= 1 ? Math.min(hits, bps.length) : bps.length;
      const perHit = bps.slice(0, nHits).map((bp) => calcRolls({ ...env, power: f(bp * effPower / move.p) }));
      useDist = convolveVarying(perHit);
      useMin = perHit.reduce((s, r) => s + Math.min(...r), 0);
      useMax = perHit.reduce((s, r) => s + Math.max(...r), 0);
      dispRolls = rolls.map((_, i) => perHit.reduce((s, r) => s + r[i], 0)); // 表示用: 同位置ロールの各発合計(参考)
    } else if (isMulti) {
      const skillLink = atkAbilityEff === "スキルリンク";
      const lo = moveHits[0], hi = moveHits[1];
      const single = new Map(rolls.reduce((m, r) => (m.set(r, (m.get(r) || 0) + 1 / 16), m), new Map()));
      if (!skillLink && lo !== hi && hits === 0) {
        // 確率モード: ヒット数を確率(2〜5回=35/35/15/15%)で合成。ワンパン率にも反映
        useDist = new Map();
        for (const [n, p] of hitCountDist(lo, hi)) {
          const dn = useDistribution(rolls, n);
          for (const [dmg, pp] of dn) useDist.set(dmg, (useDist.get(dmg) || 0) + p * pp);
        }
        nHits = 0; // 0 = 確率(ランダム)表示マーカー
        useMin = Math.min(...rolls) * lo;
        useMax = Math.max(...rolls) * hi;
      } else {
        nHits = skillLink ? hi : (hits >= 1 ? hits : lo); // スキルリンク=最大固定 / 選択(1〜5) / 既定=最小
        useMin = Math.min(...rolls) * nHits;
        useMax = Math.max(...rolls) * nHits;
        useDist = nHits === 1 ? single : useDistribution(rolls, nHits);
      }
    } else {
      nHits = 1;
      useMin = Math.min(...rolls);
      useMax = Math.max(...rolls);
      useDist = new Map(rolls.reduce((m, r) => (m.set(r, (m.get(r) || 0) + 1 / 16), m), new Map()));
    }

    const hitLabel = !isMulti ? "1" : nHits === 0 ? `${moveHits[0]}〜${moveHits[1]}` : `${nHits}`;
    return {
      A, D, HP, rolls: dispRolls, nHits, hitLabel, useMin, useMax, stab, eff, parentalBond, useDist,
      minPct: (useMin / HP) * 100, maxPct: (useMax / HP) * 100,
      ko: koSummary(useDist, HP, useMin, useMax),
    };
  }, [attacker, defender, move, effType, effPower, isFixedMove, fixedDmgVal, isPhysical, isMulti, hits, atkSp, atkNature, atkRank, crit, burn, helpingHand, hpSp, bSp, dSp, bNature, dNature, defRank, wall, weather, critEff, lightBall, atkItem, defItem, atkAbilityEff, defAbilityEff, stabMul, aAbilityMul, ignoreBurn, protean, proteanType, noWeather, isDouble, singleTarget, friendGuard, fairyAuraDouble]);

  // ===== 逆算: 与ダメ%から相手の(HP SP, 防御SP, 性格)候補を推定 =====
  const [curHpPct, setCurHpPct] = useState("");
  const [healItem, setHealItem] = useState("なし");
  const [excludeDownNat, setExcludeDownNat] = useState(true); // 下降補正(▼0.9)を除外（攻撃/耐久推定で共通・デフォON）
  const inference = useMemo(() => {
    const obs = parseInt(curHpPct, 10);
    if (curHpPct === "" || isNaN(obs) || obs < 0 || obs > 100) return null;
    if (isMulti) return { error: "連続技は逆算非対応です（単発技で計測してください）" };

    // 攻撃側は現在のUI設定をそのまま使用
    const aKey = move.bp ? "b" : isPhysical ? "a" : "c";
    let A = stat((foulPlay ? defender : attacker).base[aKey], atkSp, atkNature); // イカサマは相手の攻撃を参照
    A = rankMul(A, critEff && atkRankEff < 0 ? 0 : atkRankEff);
    if (lightBall) A = f(A * 2);
    if (aAbilityMul !== 1) A = f(A * aAbilityMul);

    const dBase = defPhys ? defender.base.b : defender.base.d;
    let weatherMul = 1;
    if (!noWeather) {
      if (weather === "はれ") weatherMul = effType === "ほのお" ? 1.5 : effType === "みず" ? 0.5 : 1;
      if (weather === "あめ") weatherMul = effType === "みず" ? 1.5 : effType === "ほのお" ? 0.5 : 1;
    }
    const stab = protean || atkTypes.includes(effType);
    let eff = typeEffectScrappy(effType, defTypes, atkAbilityEff === "きもったま");
    if (moveKey === "フリーズドライ" && defTypes.includes("みず")) eff *= 4; // フリーズドライ: みずにも抜群（こおり×みず 0.5→2）
    if (dampFail) eff = 0; // しめりけ: 爆発技は失敗（無効化）
    if (polterFail) eff = 0; // ポルターガイスト: 相手の持ち物なし→失敗
    if (ABILITY_IMMUNE[defAbilityEff]?.includes(effType) || (defAbilityEff === "ぼうおん" && SOUND_MOVES.has(moveKey)) || ((defAbilityEff === "テイルアーマー" || defAbilityEff === "じょおうのいげん") && PRIORITY_MOVES.has(moveKey)) || (defAbilityEff === "ぼうだん" && BALL_BOMB_MOVES.has(moveKey))) eff = 0;
    let postEffMul = ABILITY_TYPE_MUL[defAbilityEff]?.[effType] ?? 1;
    if (defAbilityEff === "もふもふ" && contact) postEffMul *= 0.5; // もふもふ: 接触技を半減（えんかくで無効・ほのお×2は上のmulで処理）
    if (defAbilityEff === "マルチスケイル") postEffMul *= 0.5;
    if ((defAbilityEff === "フィルター" || defAbilityEff === "ハードロック") && eff > 1) postEffMul *= 0.75;

    const SP_STEPS = [0, 32];
    const candidates = [];
    for (const nat of [0.9, 1.0, 1.1]) {
      for (const dsp of SP_STEPS) {
        let D = stat(dBase, dsp, nat);
        if (!noWeather && weather === "すなあらし" && !defPhys && defTypes.includes("いわ")) D = f(D * 1.5);
        if (!noWeather && weather === "ゆき" && defPhys && defTypes.includes("こおり")) D = f(D * 1.5);
        if (defAbilityEff === "ファーコート" && defPhys) D = f(D * 2);
    if (defAbilityEff === "ふしぎなうろこ" && defPhys) D = f(D * 1.5);
        D = rankMul(D, critEff && defRankEff > 0 ? 0 : defRankEff);
        const rolls = calcRolls({
          power: effPower, A, D, weatherMul, crit: critEff, critMul: atkAbilityEff === "スナイパー" ? 2.25 : 1.5, stab, stabMul, eff,
          burn: burn && isPhysical && !ignoreBurn, wall: wallEff, wallMul, helpingHand,
          resistBerry: resistBerryActive, postEffMul, spreadMul, friendGuardMul,
        });
        for (const hsp of SP_STEPS) {
          if (hsp + dsp > 66) continue;
          const HP = hpStat(defender.base.h, hsp);
          // HPバーの減少% = (ダメージ - アイテム回復)/HP。回復量はHP実数値で厳密計算
          const match = rolls.some((r) => {
            let heal = 0;
            if (healItem === "たべのこし") heal = f(HP / 16);
            if (healItem === "オボンのみ") heal = f(HP / 4);
            const drop = Math.max(0, r - heal);
            return Math.min(100, f(drop / HP * 100)) === obs;
          });
          if (match) candidates.push({ nat, dsp, hsp });
        }
      }
    }
    // 高い順にソート（性格→防SP→HP SP）
    candidates.sort((a, b) => b.nat - a.nat || b.dsp - a.dsp || b.hsp - a.hsp);
    return { count: candidates.length, candidates };
  }, [curHpPct, healItem, attacker, defender, move, effType, effPower, isPhysical, isMulti, atkSp, atkNature, atkRank, crit, burn, helpingHand, defRank, wall, weather, critEff, lightBall, defItem, atkAbilityEff, defAbilityEff, stabMul, aAbilityMul, ignoreBurn, protean, proteanType, noWeather, isDouble, singleTarget, friendGuard, fairyAuraDouble]);


  // ポケモン切替・モード切替時: 常にそのモードの採用率1位の技を既定選択（moveListはcurrentMoveUsageでソート済み）。
  // 履歴では上書きしない＝同じポケでも必ず最有力技を表示。過去に使った技は「最近使った技」チップから手動で選べる。
  // isDoubleを依存に含めることでシングル⇔ダブル切替時も各モードの1位に切り替わる＝完全分離。
  useEffect(() => {
    setMoveName(moveList[0]?.name ?? "");
  }, [atkIdx, isDouble]); // eslint-disable-line react-hooks/exhaustive-deps

  // 技を履歴に記録：ユーザーが明示的に選んだ時だけ呼ぶ。デフォで自動選択された技は記録しない＝変更しても履歴に残らない。現モードの履歴へ。
  const recordMove = (name) => {
    if (!attacker.learnset.includes(name)) return;
    setCurMoveHist((prev) => {
      const hist = prev[attacker.name] ?? [];
      if (hist[0] === name) return prev;
      return { ...prev, [attacker.name]: [name, ...hist.filter((n) => n !== name)].slice(0, 8) };
    });
  };

  const removeRecent = (name) => {
    setCurMoveHist((prev) => ({ ...prev, [attacker.name]: (prev[attacker.name] ?? []).filter((n) => n !== name) }));
  };

  // 最近使った技（最新順）。下の全技一覧は従来通りすべて表示する
  const recentMoves = (curMoveHist[attacker.name] ?? []).filter((n) => moveList.some((m) => m.name === n));

  // ===== 合算ログ: 複数のダメージ源を足してワンパン可否を計算（ステロ＋技 / 2体分 / 2ターン分など） =====
  const addToLog = () => {
    if (!result?.useDist) return;
    setDmgLog((prev) => [...prev, {
      id: Date.now() + Math.random(),
      label: `${attacker.name} ${move.name}${isMulti ? `×${result.hitLabel}` : ""}→${defender.name}`,
      dist: [...result.useDist.entries()], min: result.useMin, max: result.useMax, hp: result.HP, checked: true, fixed: false,
    }]);
    setLogOpen(true);
  };
  // 設置技(ステロ/まきびし)・手動: 押した回数分だけ追加
  const addFixedToLog = (value, label, kind = "manual") => {
    const v = Math.max(0, Math.round(value || 0));
    if (!v) return;
    setDmgLog((prev) => [...prev, { id: Date.now() + Math.random(), label, dist: [[v, 1]], min: v, max: v, hp: result?.HP ?? v, checked: true, fixed: true, kind }]);
    setLogOpen(true);
  };
  // 砂・状態異常・いのちのたま: トグル（もう一度押したら消える）。状態異常は排他（別を選ぶと前が消え、同じを押すと消える）
  const toggleChip = (value, label, kind, statusKey = null) => {
    setDmgLog((prev) => {
      const v = Math.max(0, Math.round(value || 0));
      if (kind === "status") {
        const cur = prev.find((e) => e.kind === "status");
        const rest = prev.filter((e) => e.kind !== "status");
        if (cur && cur.statusKey === statusKey) return rest; // 同じ状態異常をもう一度押す→消す
        return v ? [...rest, { id: Date.now() + Math.random(), label, dist: [[v, 1]], min: v, max: v, hp: result?.HP ?? v, checked: true, fixed: true, kind, statusKey }] : rest;
      }
      if (prev.some((e) => e.kind === kind)) return prev.filter((e) => e.kind !== kind); // 既にある(砂/珠)→消す
      return v ? [...prev, { id: Date.now() + Math.random(), label, dist: [[v, 1]], min: v, max: v, hp: result?.HP ?? v, checked: true, fixed: true, kind }] : prev;
    });
    setLogOpen(true);
  };
  const toggleLog = (id) => setDmgLog((prev) => prev.map((e) => (e.id === id ? { ...e, checked: !e.checked } : e)));
  const removeLog = (id) => setDmgLog((prev) => prev.filter((e) => e.id !== id));

  const combined = useMemo(() => {
    const entries = dmgLog.filter((e) => e.checked).map((e) => ({ dist: e.dist, min: e.min, max: e.max, hp: e.hp }));
    // 「今計算している結果」を常に合算対象に含める（チェックで除外可）
    if (includeCurrent && result?.useDist) entries.unshift({ dist: [...result.useDist.entries()], min: result.useMin, max: result.useMax, hp: result.HP });
    if (!entries.length) return null;
    const dist = convolveDists(entries.map((e) => e.dist));
    const min = entries.reduce((s, e) => s + e.min, 0);
    const max = entries.reduce((s, e) => s + e.max, 0);
    const hp = Math.max(...entries.map((e) => e.hp));
    let koP = 0; for (const [d, p] of dist) if (d >= hp) koP += p;
    return { count: entries.length, min, max, hp, koP, pctMin: (min / hp) * 100, pctMax: (max / hp) * 100, hpVaries: entries.some((e) => e.hp !== hp) };
  }, [dmgLog, result, includeCurrent]);
  const sandN = Math.max(1, Math.min(16, Math.floor(Number(sandTurns) || 1))); // 砂ターン数(1〜16)
  const statusN = Math.max(1, Math.min(16, Math.floor(Number(statusTurns) || 1))); // 状態異常ターン数(1〜16)
  const chipGrounded = !defTypes.includes("ひこう") && defAbilityRaw !== "ふゆう"; // まきびしが効く(接地)
  const chipSandImmune = defTypes.some((t) => ["いわ", "じめん", "はがね"].includes(t)); // 砂無効タイプ
  const curStatus = dmgLog.find((e) => e.kind === "status")?.statusKey; // 現在ログにある状態異常(排他ハイライト用)
  const sandOn = dmgLog.some((e) => e.kind === "sand"); // 砂トグルON表示
  const orbOn = dmgLog.some((e) => e.kind === "orb"); // いのちのたまトグルON表示


  // ===== 逆算2: 被ダメ実数値から相手（攻撃側）の攻撃SP・性格を推定 =====
  const [showAtkInference, setShowAtkInference] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false); // ⚡すばやさ比較モーダル
  const [atkInferItem, setAtkInferItem] = useState("unknown"); // 攻撃力推定の持ち物扱い: unknown(なし+タイプ強化を両方)/known(持ち物なしで逆算)/orb(いのちのたま×1.3)
  useEffect(() => { if (isMega(attacker)) setAtkInferItem("known"); }, [atkIdx]); // メガは持ち物不可＝「持ち物判明」を強制オン
  const [exclBandGlasses, setExclBandGlasses] = useState(true); // 攻撃力推定でちからのハチマキ/ものしりメガネ(×1.1)候補を除外（既定オン）
  const [dmgTaken, setDmgTaken] = useState("");
  const atkInference = useMemo(() => {
    const dmg = parseInt(dmgTaken, 10);
    if (dmgTaken === "" || isNaN(dmg) || dmg <= 0) return null;
    if (isMulti) return { error: "連続技は逆算非対応です（単発技で計測してください）" };

    // 防御側（自分）は現在のUI設定をそのまま使用
    const aKey = move.bp ? "b" : isPhysical ? "a" : "c";
    const dBase = defPhys ? defender.base.b : defender.base.d;
    const dSpVal = defPhys ? bSp : dSp;
    const dNat = defPhys ? bNature : dNature;
    let D = stat(dBase, dSpVal, dNat);
    if (!noWeather && weather === "すなあらし" && !defPhys && defTypes.includes("いわ")) D = f(D * 1.5);
    if (!noWeather && weather === "ゆき" && defPhys && defTypes.includes("こおり")) D = f(D * 1.5);
    if (defAbilityEff === "ファーコート" && defPhys) D = f(D * 2);
    if (defAbilityEff === "ふしぎなうろこ" && defPhys) D = f(D * 1.5);
    D = rankMul(D, critEff && defRankEff > 0 ? 0 : defRankEff);

    let weatherMul = 1;
    if (!noWeather) {
      if (weather === "はれ") weatherMul = effType === "ほのお" ? 1.5 : effType === "みず" ? 0.5 : 1;
      if (weather === "あめ") weatherMul = effType === "みず" ? 1.5 : effType === "ほのお" ? 0.5 : 1;
    }
    const stab = protean || atkTypes.includes(effType);
    let eff = typeEffectScrappy(effType, defTypes, atkAbilityEff === "きもったま");
    if (moveKey === "フリーズドライ" && defTypes.includes("みず")) eff *= 4; // フリーズドライ: みずにも抜群（こおり×みず 0.5→2）
    if (dampFail) eff = 0; // しめりけ: 爆発技は失敗（無効化）
    if (polterFail) eff = 0; // ポルターガイスト: 相手の持ち物なし→失敗
    if (ABILITY_IMMUNE[defAbilityEff]?.includes(effType) || (defAbilityEff === "ぼうおん" && SOUND_MOVES.has(moveKey)) || ((defAbilityEff === "テイルアーマー" || defAbilityEff === "じょおうのいげん") && PRIORITY_MOVES.has(moveKey)) || (defAbilityEff === "ぼうだん" && BALL_BOMB_MOVES.has(moveKey))) eff = 0;
    let postEffMul = ABILITY_TYPE_MUL[defAbilityEff]?.[effType] ?? 1;
    if (defAbilityEff === "もふもふ" && contact) postEffMul *= 0.5; // もふもふ: 接触技を半減（えんかくで無効・ほのお×2は上のmulで処理）
    if (defAbilityEff === "マルチスケイル") postEffMul *= 0.5;
    if ((defAbilityEff === "フィルター" || defAbilityEff === "ハードロック") && eff > 1) postEffMul *= 0.75;

    // 指定威力・でんきだま有無で(性格×SP)の候補を逆算
    const estimate = (power, useLightBall) => {
      const cands = [];
      for (const nat of [0.9, 1.0, 1.1]) for (const asp of [0, 32]) {
        let A = stat((foulPlay ? defender : attacker).base[aKey], asp, nat);
        A = rankMul(A, critEff && atkRankEff < 0 ? 0 : atkRankEff);
        if (useLightBall) A = f(A * 2);
        if (aAbilityMul !== 1) A = f(A * aAbilityMul);
        const rolls = calcRolls({
          power, A, D, weatherMul, crit: critEff, critMul: atkAbilityEff === "スナイパー" ? 2.25 : 1.5, stab, stabMul, eff,
          burn: burn && isPhysical && !ignoreBurn, wall: wallEff, wallMul, helpingHand,
          resistBerry: resistBerryActive, postEffMul, spreadMul, friendGuardMul,
        });
        if (rolls.includes(dmg)) cands.push({ nat, asp });
      }
      cands.sort((a, b) => b.nat - a.nat || b.asp - a.asp);
      return cands;
    };

    // 持ち物の扱い: orb=いのちのたま×1.3 / known=威力強化系(タイプ強化×1.2/いのちのたま)ではないと判明=なし＋ハチマキ/メガネ(×1.1, 除外可) / unknown=なし＋タイプ強化＋×1.1。メガは持ち物不可＝known扱い。
    const im = isMega(attacker) ? "known" : atkInferItem;
    let sets;
    if (im === "orb") sets = [{ label: "いのちのたま(×1.3)", item: "いのちのたま", candidates: estimate(f(effPowerNoItem * 1.3), false) }];
    else if (im === "known") sets = [
      { label: "持ち物なし", item: "なし", candidates: estimate(effPowerNoItem, false) },
      ...((!exclBandGlasses && !isMega(attacker)) ? [{ label: `${isPhysical ? "ちからのハチマキ" : "ものしりメガネ"}(×1.1)`, item: isPhysical ? "ちからのハチマキ" : "ものしりメガネ", candidates: estimate(f(effPowerNoItem * 1.1), false) }] : []),
    ];
    else sets = [
      { label: "持ち物なし", item: "なし", candidates: estimate(effPowerNoItem, false) },
      { label: "タイプ強化(×1.2)", item: "タイプ強化(×1.2)", candidates: estimate(f(effPowerNoItem * 1.2), false) },
      // ちからのハチマキ/ものしりメガネ(×1.1)。チェックで除外可
      ...(exclBandGlasses ? [] : [{ label: `${isPhysical ? "ちからのハチマキ" : "ものしりメガネ"}(×1.1)`, item: isPhysical ? "ちからのハチマキ" : "ものしりメガネ", candidates: estimate(f(effPowerNoItem * 1.1), false) }]),
    ];
    return { sets };
  }, [dmgTaken, attacker, defender, move, effType, effPower, effPowerNoItem, atkItem, atkInferItem, exclBandGlasses, isPhysical, isMulti, atkRank, crit, burn, helpingHand, bSp, dSp, bNature, dNature, defRank, wall, weather, critEff, lightBall, defItem, stabMul, aAbilityMul, ignoreBurn, protean, proteanType, noWeather, defAbilityEff, atkAbilityEff, isDouble, singleTarget, friendGuard, fairyAuraDouble]);
  // 攻撃力推定モーダルの持ち物トグル（判明といのちのたまは排他＝単一state）。いのちのたまは外側の持ち物欄と同期
  const toggleInferKnown = () => { setAtkItem("なし"); setAtkInferItem(atkInferItem === "known" ? "unknown" : "known"); }; // 判明=タイプ強化系でない→持ち物なし換算
  const toggleInferOrb = () => { const next = atkInferItem === "orb" ? "unknown" : "orb"; setAtkItem(next === "orb" ? "いのちのたま" : "なし"); setAtkInferItem(next); };

  // 下降補正(▼0.9)を除外。ただし除外すると0件になる＝下降補正でしか一致しない場合は、空表示を避けて下降補正を残す。
  const filterDownNat = (cands) => {
    if (!excludeDownNat) return cands;
    const kept = cands.filter((c) => c.nat !== 0.9);
    return kept.length ? kept : cands;
  };

  const effLabel = result.eff === 0 ? "無効" : result.eff >= 2 ? `効果ばつぐん ×${result.eff}` : result.eff < 1 ? `いまひとつ ×${result.eff}` : "等倍";

  const remainMaxPct = Math.max(0, 100 - result.minPct);
  const remainMinPct = Math.max(0, 100 - result.maxPct);
  const barColor = remainMinPct > 50 ? "#4cd964" : remainMinPct > 20 ? "#f5c542" : "#e8504a";
  // 下のデカい表示・HPバー: 合算ログにチェックがある時は「現在＋登録ダメージの合算」を表示
  const hasCheckedLogs = dmgLog.some((e) => e.checked);
  const showCombined = hasCheckedLogs && !!combined;
  const dispMin = showCombined ? combined.min : result.useMin;
  const dispMax = showCombined ? combined.max : result.useMax;
  const dispPctMin = showCombined ? combined.pctMin : result.minPct;
  const dispPctMax = showCombined ? combined.pctMax : result.maxPct;
  const dispRemainMax = Math.max(0, 100 - dispPctMin);
  const dispRemainMin = Math.max(0, 100 - dispPctMax);
  const dispBarColor = dispRemainMin > 50 ? "#4cd964" : dispRemainMin > 20 ? "#f5c542" : "#e8504a";

  // 攻守交代: ポケモンの左右位置は保ったまま役割(攻撃↔防御)を反転。各ポケの攻撃/防御ステを覚えておき、
  // 反転後に新しい役割へ復元する＝自分のポケを選んだ側と逆の役割に切り替えても SP/性格/持ち物/特性/技を入れ直さずに済む。
  const cfgFor = (idx) => {
    const nm = POKEMON[idx]?.name;
    if (ownCfgRef.current?.name === nm) return ownCfgRef.current;
    if (enemyCfgRef.current?.name === nm) return enemyCfgRef.current;
    return null;
  };
  const swap = () => {
    // 1) 今の攻撃/防御ステをポケ別に保存（往復しても各自の設定が残るように）。持ち物はポケモン固有＝役割でなくポケに付くので、スナップに入れず手順5で左右へ追従させる。
    atkSnapRef.current[atkIdx] = { atkSp, atkNature, atkAbility, atkAbilityOn, moveName, atkRank, boostCount, crit, burn, helpingHand, hits };
    defSnapRef.current[defIdx] = { hpSp, bSp, dSp, bNature, dNature, defAbility, defAbilityOn, defRank, wall };
    const newAtkIdx = defIdx, newDefIdx = atkIdx;
    // 役割交代後の持ち物: 新攻撃(=旧防御のポケ)は旧防御の持ち物、新防御(=旧攻撃のポケ)は旧攻撃の持ち物。今の値を先に退避。
    const carryAtkItem = defItem, carryDefItem = atkItem;
    // 特性も持ち物同様ポケモン固有＝役割交代でそのまま追従（左右は別個体なので各側で保持・混ざらない）
    const carryAtkAbility = defAbility, carryAtkAbilityOn = defAbilityOn, carryDefAbility = atkAbility, carryDefAbilityOn = atkAbilityOn;
    // 2) ポケ位置と役割を交換
    setAtkIdx(newAtkIdx); setDefIdx(newDefIdx); setAtkOnRight((v) => !v);
    // 3) 新しい攻撃側を復元: スナップショット優先→無ければ登録構成から算出→どちらも無ければ既定(idx変更effectが特性をリセット)
    const aSnap = atkSnapRef.current[newAtkIdx];
    if (aSnap) {
      applyingMemberRef.current = true;
      setAtkSp(aSnap.atkSp); setAtkNature(aSnap.atkNature);
      setAtkAbility(aSnap.atkAbility); setAtkAbilityOn(aSnap.atkAbilityOn);
      setAtkRank(aSnap.atkRank ?? 0); setBoostCount(aSnap.boostCount ?? 0); // ランクもポケ別に復元（交代で相手側に引き継がない）
    } else { const c = cfgFor(newAtkIdx); if (c) applyMemberToAttacker(c); else { setAtkSp(32); setAtkNature(1.1); } setAtkRank(0); setBoostCount(0); } // 登録もスナップも無い攻撃側は既定(32/▲)へ。前の攻撃側のSP/性格を相手側に引き継がない
    // 攻撃側の戦況トグル(急所/やけど/てだすけ/連続回数)もポケ別に復元。スナップ無し＝既定に戻し、相手側へ引き継がない。
    setCrit(aSnap?.crit ?? false); setBurn(aSnap?.burn ?? false); setHelpingHand(aSnap?.helpingHand ?? false); setHits(aSnap?.hits ?? 0);
    // 技は攻守交代で引き継がない（左=自チーム/右=敵チームで別個体扱い＝同じポケでも引き継がない）。
    // 別ポケは空にして効果(moveList/履歴)に既定をセットさせる。同じポケはidx不変で効果が発火しないので、既定(最採用技=moveList[0])を直接セット。
    setMoveName(defIdx !== atkIdx ? "" : (moveList[0]?.name ?? ""));
    // 4) 新しい防御側を復元
    const dSnap = defSnapRef.current[newDefIdx];
    if (dSnap) {
      applyingDefMemberRef.current = true;
      setHpSp(dSnap.hpSp); setBSp(dSnap.bSp); setDSp(dSnap.dSp); setBNature(dSnap.bNature);
      setDNature(dSnap.dNature); setDefAbility(dSnap.defAbility); setDefAbilityOn(dSnap.defAbilityOn);
      setDefRank(dSnap.defRank ?? 0); // 防御ランクもポケ別に復元
    } else { const c = cfgFor(newDefIdx); if (c) applyMemberToDefender(c); else { setHpSp(0); setBSp(0); setDSp(0); setBNature(1.0); setDNature(1.0); } setDefRank(0); } // 登録もスナップも無い防御側は既定(SP0/無補正)へ。引き継がない
    setWall(dSnap?.wall ?? false); // 壁(リフレクター/ひかりのかべ)もポケ別に復元＝交代で相手側に引き継がない
    // 5) 持ち物はポケモン固有なので役割交代でそのまま追従（スナップ/登録構成による持ち物上書きより後に最終決定）。メガはidx変更effectが「なし」に戻す。
    setAtkItem(carryAtkItem); setDefItem(carryDefItem);
    // 特性も持ち物と同様に役割交代でポケへ追従。ポケが入れ替わる時はidx変更の特性リセットeffect(両側)を抑止してからcarry値を確定（snap無し側がリセットされる不具合対策）。同種(同idx)はeffect自体が走らないので抑止不要。
    if (atkIdx !== defIdx) { applyingMemberRef.current = true; applyingDefMemberRef.current = true; }
    setAtkAbility(carryAtkAbility); setAtkAbilityOn(carryAtkAbilityOn); setDefAbility(carryDefAbility); setDefAbilityOn(carryDefAbilityOn);
  };
  // ランク変化系特性を押した時、対応するランク欄(atkRank/defRank)へdirぶん反映（±6クランプ）
  const clampRank = (r) => Math.max(-6, Math.min(6, r));
  const applyRankAbility = (ability) => {
    const ra = RANK_ABILITIES[ability];
    if (!ra) return;
    // いかくの対象＝こうげき側。相手特性で無効化/逆効果になる場合は警告モーダルを出す
    if (ability === "いかく") {
      if (INTIMIDATE_IMMUNE.has(atkAbility)) {
        setWarnModal({ kind: "info", title: `特性「${atkAbility}」で いかく は効きません`, msg: "相手のこうげきは下がりません（能力ランク変化なし）。" });
        return;
      }
      const react = INTIMIDATE_REACT[atkAbility];
      if (react) {
        setWarnModal({ kind: "confirm", title: `相手の特性「${atkAbility}」が発動します`, msg: `${react.desc}。いかく を使用しますか？`, applyDelta: react.delta });
        return;
      }
    }
    if (ra.affects === "atk") setAtkRank((r) => clampRank(r + ra.dir));
    else setDefRank((r) => clampRank(r + ra.dir));
  };

  // メガシンカ・フォルムチェンジ: 同名ベースのメガ体/元の姿の選択肢を返す
  const formeOptions = (idx) => {
    const name = POKEMON[idx].name;
    // 「(メガ」で判定（部分一致だと"メガニウム"等メガで始まる名前を誤ってメガ扱いし、ボタン欠落やlabelのnull.matchでクラッシュする）
    const isMega = name.includes("(メガ");
    const base = name.replace(/\(.*\)$/, "");
    const opts = POKEMON
      .map((p, i) => ({ name: p.name, i }))
      .filter(({ name: n, i }) =>
        i !== idx && (isMega ? n === base : n.startsWith(base + "(") && n.includes("(メガ"))
      )
      .map(({ name: n, i }) => ({
        i,
        label: n.includes("(メガ") ? n.match(/\((.*)\)/)[1] + "へ" : "元の姿に戻す",
      }));
    // イルカマン/ギルガルド等のフォルムチェンジ（メガ以外。双方向）
    const sib = FORM_SIBLING[name];
    if (sib) {
      const si = POKEMON.findIndex((p) => p.name === sib);
      if (si >= 0) opts.push({ i: si, label: (sib.match(/\(([^)]+)\)$/) || [, sib])[1] + "へ" });
    }
    return opts;
  };
  const FormeButtons = ({ idx, onChange }) => {
    const opts = formeOptions(idx);
    if (!opts.length) return null;
    return (
      <div className="forme-row">
        {opts.map((o) => (
          <button key={o.i} className="forme-btn" onClick={() => onChange(o.i)}>⟲ {o.label}</button>
        ))}
      </div>
    );
  };

  const atkStatLabel = foulPlay ? "相手のこうげき" : move.bp ? "ぼうぎょ" : isPhysical ? "こうげき" : "とくこう";

  // フィールド: パネル（枠内）の背景色を変える。結果ドック(下のダメージ結果)も同じフィールド色に揃える
  const TERRAIN_PANEL_BG = { エレキ: "#2b2812", グラス: "#17301f", サイコ: "#2c1d33", ミスト: "#282243" };
  const panelBg = TERRAIN_PANEL_BG[terrainEff];
  const dockBg = panelBg; // 結果ドックもフィールド色に
  // 天気/フィールド選択欄の色（一目で分かるように）。フィールドはパネルと同色を流用、天気は天候背景に合わせた色
  const WEATHER_SELECT_BG = { はれ: "#4a3410", あめ: "#16243f", すなあらし: "#34301a", ゆき: "#234556" };
  // 天候: 枠外の背景色も連動（パーティクルと合わせて分かりやすく）
  // 飛沫なしでも天候が判別できるよう、色味をはっきり分ける
  // はれ=オレンジ寄りの金 / あめ=濃紺 / すなあらし=くすんだ黄土 / ゆき=明るい氷青
  const WEATHER_ROOT_BG = {
    はれ: "linear-gradient(180deg, #573a0e 0%, #38280f 35%, #181420 100%)",
    あめ: "linear-gradient(180deg, #0c2152 0%, #0e1a38 50%, #0e1320 100%)",
    すなあらし: "linear-gradient(180deg, #43391f 0%, #322b18 45%, #1a1812 100%)",
    ゆき: "linear-gradient(180deg, #2e5573 0%, #1d3450 45%, #101724 100%)",
  };
  const rootBg = WEATHER_ROOT_BG[weather] ?? "#0e1320";

  // 天候: パーティクルのオーバーレイ（fixedなのでどこを見ていても分かる）
  const particles = useMemo(() => {
    const n = weather === "あめ" ? 75 : weather === "ゆき" ? 60 : weather === "すなあらし" ? 65 : weather === "はれ" ? 20 : 0;
    return Array.from({ length: n }, () => ({
      pos: Math.random() * 100,
      pos2: Math.random() * 100, // 静止表示用のもう一方の座標
      delay: Math.random() * 4,
      dur: 0.7 + Math.random() * (weather === "ゆき" ? 6 : weather === "すなあらし" ? 1.2 : 0.7),
      size: Math.random(),
    }));
  }, [weather]);

  // 天候パーティクル（飛沫）。「なし」の場合は背景色のみで天候を表現
  const WeatherFx = () => {
    if (weather === "なし" || fxParticles === "なし") return null;
    if (weather === "はれ") {
      // ゲーム内の「ひでり」風: 暖色の空気感 + ゆっくり立ち上る光の粒
      return (
        <div className="wfx wfx-sun">
          {particles.map((p, i) => (
            <span key={i} className="mote" style={{ left: `${p.pos}%`, width: 2 + p.size * 4, height: 2 + p.size * 4, animationDelay: `${p.delay * 3}s`, animationDuration: `${9 + p.dur * 6}s` }} />
          ))}
        </div>
      );
    }
    return (
      <div className="wfx">
        {particles.map((p, i) =>
          weather === "あめ" ? (
            <span key={i} className="drop" style={{ left: `${p.pos}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
          ) : weather === "ゆき" ? (
            <span key={i} className="flake" style={{ left: `${p.pos}%`, width: 3 + p.size * 4, height: 3 + p.size * 4, animationDelay: `${p.delay}s`, animationDuration: `${2 + p.dur}s` }} />
          ) : (
            <span key={i} className="sand" style={{ top: `${p.pos}%`, width: 6 + p.size * 14, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
          )
        )}
      </div>
    );
  };
  const innerFx = null; // 天候は常に枠外（全画面）表示

  return (
    <div className="root" style={{ "--accent": accent, background: rootBg }}>
      <WeatherFx />
      <style>{`
        .root{
          --brand:#c084fc; --brand-bg:rgba(192,132,252,.14); --brand-border:rgba(192,132,252,.5);
          min-height:100vh; background:#0e1320; color:#e8ecf4; transition:background .5s;
          font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif;
          padding:10px 14px 168px;
        }
        .wrap{max-width:1500px;margin:0 auto;position:relative;z-index:1}
        /* ブラウザ横長レイアウト: ダメ計の左右にチームのアイコン列 */
        .calc-layout{display:flex;gap:14px;align-items:flex-start}
        .calc-main{flex:1;min-width:0}
        .cond-bar{display:flex;gap:16px;align-items:flex-end;background:#13192a;border:1px solid #232d44;border-radius:10px;padding:8px 12px;margin-bottom:8px}
        .team-rail{flex:0 0 116px;width:116px;position:sticky;top:14px;background:#13192a;border:1px solid #232d44;border-radius:12px;padding:9px 6px;display:flex;flex-direction:column;gap:6px;align-items:stretch}
        .rail-group{display:flex;flex-direction:row;gap:3px;align-items:flex-start;justify-content:center}
        .rail-megas{display:flex;flex-direction:column;gap:3px}
        /* 右側＝相手認識（上）＋敵チーム（下）の列 */
        .right-col{flex:0 0 300px;min-width:0;display:flex;flex-direction:column;gap:10px}
        .right-col .team-rail.right{width:100%;flex:none}
        .recog-details{background:#13192a;border:1px solid #232d44;border-radius:12px;padding:4px 6px 6px}
        .recog-summary{cursor:pointer;font-size:12px;font-weight:700;color:#7fb2f5;padding:6px 4px;user-select:none;list-style:none}
        .recog-summary::-webkit-details-marker{display:none}
        .recog-summary::before{content:"▸ ";font-size:11px}
        .recog-details[open] .recog-summary::before{content:"▾ "}
        @media(max-width:1000px){.right-col{flex:none;width:100%}}
        .rail-title{font-size:11px;font-weight:700;letter-spacing:.02em;text-align:center;line-height:1.25;margin-bottom:2px}
        .team-rail.left .rail-title{color:#ff9b8f}
        .team-rail.right .rail-title{color:#7fb2f5}
        .rail-empty{font-size:11px;color:#7c879c;text-align:center;line-height:1.5}
        .rail-team-ctrl{display:flex;flex-direction:column;gap:5px;margin-bottom:5px}
        .rail-team-sel{width:100%;box-sizing:border-box;background:#0e1320;border:1px solid #2c3854;border-radius:6px;color:#e8ecf4;font-size:11px;padding:4px 5px}
        .rail-edit{width:100%;background:#0e1320;border:1px solid #2c3854;border-radius:6px;color:#9fb2d6;font-size:11px;font-weight:700;padding:5px 0;cursor:pointer}
        .rail-edit:hover{border-color:var(--brand-border);color:#fff}
        .rail-icon{flex:0 0 auto;background:#0e1320;border:1px solid #2c3854;border-radius:8px;padding:5px 3px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:border-color .12s,background .12s}
        .rail-icon:hover{border-color:#3d4f78;background:#161d2e}
        .team-rail.left .rail-icon.on{border-color:#ff7a6b;background:rgba(255,122,107,.14)}
        .team-rail.right .rail-icon.on{border-color:#5b9bf0;background:rgba(91,155,240,.14)}
        .rail-icon img{width:40px;height:40px;display:block}
        .rail-name{font-size:10.5px;color:#c4cede;text-align:center;line-height:1.15;word-break:break-all;max-height:28px;max-width:52px;overflow:hidden}
        .rail-noimg{width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:#5a6478;font-size:14px}
        @media(max-width:1000px){
          .calc-layout{flex-direction:column}
          .team-rail{position:static;width:100%;flex:none;flex-direction:row;flex-wrap:wrap;justify-content:center;gap:8px}
          .team-rail .rail-title{width:100%;margin:0}
          .rail-icon img{width:40px;height:40px}
        }
        .wfx{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
        .panel-fx{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;border-radius:13px}
        .panel,.result{position:relative}
        .panel > *:not(.panel-fx),.result > *:not(.panel-fx){position:relative;z-index:1}
        .wfx-sun{background:radial-gradient(ellipse 120% 50% at 50% -15%, rgba(255,180,90,.28), transparent 70%);animation:sunpulse 5s ease-in-out infinite}
        @keyframes sunpulse{0%,100%{opacity:.8}50%{opacity:1}}
        .mote{position:absolute;top:104%;border-radius:50%;background:rgba(255,215,135,.55);box-shadow:0 0 5px rgba(255,200,100,.65);animation:rise linear infinite}
        @keyframes rise{0%{opacity:0}12%{opacity:.85}85%{opacity:.5}100%{opacity:0;transform:translateY(-108vh)}}
        .drop{position:absolute;top:-8%;width:2.5px;height:22px;border-radius:2px;background:linear-gradient(rgba(140,190,255,0),rgba(150,200,255,.8));animation:fall linear infinite}
        .flake{position:absolute;top:-5%;border-radius:50%;background:rgba(240,248,255,.9);box-shadow:0 0 4px rgba(240,248,255,.6);animation:snowfall linear infinite}
        .sand{position:absolute;left:-8%;height:2.5px;border-radius:2px;background:rgba(224,180,100,.75);animation:sandblow linear infinite}
        @keyframes fall{to{transform:translateY(110vh)}}
        @keyframes snowfall{to{transform:translateY(108vh) translateX(6vw)}}
        @keyframes sandblow{to{transform:translateX(116vw) translateY(8vh)}}
        .panel-fx .drop{animation-name:fallIn}
        .panel-fx .flake{animation-name:snowIn}
        .panel-fx .sand{animation-name:sandIn}
        @keyframes fallIn{from{top:-8%}to{top:108%}}
        @keyframes snowIn{from{top:-6%}to{top:106%;transform:translateX(24px)}}
        @keyframes sandIn{from{left:-10%}to{left:108%;transform:translateY(14px)}}
        header.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
        .opts{position:relative}
        .gear{background:#161d2e;border:1px solid #2c3854;border-radius:8px;color:#c4cede;font-size:15px;padding:5px 9px;cursor:pointer}
        .gear:hover{border-color:#3d4f78;color:#fff}
        .opts-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:200;background:#161d2e;border:1px solid #3d4f78;border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:180px}
        .opts-item{display:flex;flex-direction:column;gap:5px}
        .opts-item + .opts-item{margin-top:10px}
        .link-btn{background:none;border:0;color:#7fa7d2;font-size:11px;cursor:pointer;text-align:left;padding:2px 0;margin-top:4px}
        .link-btn:hover{color:#aecdee}
        .low-list{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;max-width:240px}
        .low-item{font-size:11px;background:#0e1320;border:1px solid #2c3854;border-radius:4px;padding:2px 6px;color:#8fa0bd}
        h1{font-size:20px;font-weight:800;letter-spacing:.04em;margin:0}
        .sub{font-size:11px;color:#7c879c}
        .spec{font-size:11px;color:#7c879c;margin:0 0 6px}
        /* 公開直後のお知らせバナー（SHOW_RELEASE_NOTICEで制御） */
        .release-notice{display:flex;align-items:center;gap:10px;margin:2px 0 10px;padding:7px 12px;background:linear-gradient(90deg,rgba(255,150,60,.17),rgba(255,120,60,.06));border:1px solid rgba(255,150,70,.5);border-left:4px solid #ff8a3c;border-radius:9px}
        .release-notice-icon{font-size:18px;line-height:1;flex:none}
        .release-notice-body{flex:1;margin:0;font-size:12.5px;line-height:1.5;color:#ffe6cb}
        .release-notice-body b{color:#ffd49a;font-size:13px}
        .release-notice-link{background:none;border:0;color:#ffd089;font-weight:800;cursor:pointer;font-size:12.5px;text-decoration:underline;padding:0 1px}
        .release-notice-link:hover{color:#fff}
        .release-notice-x{flex:none;background:none;border:0;color:#caa07a;font-size:14px;cursor:pointer;padding:2px 4px;line-height:1}
        .release-notice-x:hover{color:#fff}
        /* タブ */
        .tabs{display:flex;gap:4px;margin:0 0 8px;border-bottom:1px solid #232d44}
        .tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:#8fa0bd;font-size:13px;font-weight:700;letter-spacing:.04em;padding:9px 16px 10px;cursor:pointer;display:flex;align-items:center;gap:7px;margin-bottom:-1px;transition:color .15s,border-color .15s}
        .tab:hover{color:#c4cede}
        .tab.on{color:var(--brand);border-bottom-color:var(--brand)}
        .tab-badge{font-size:11px;font-weight:700;color:#8fa0bd;background:#0e1320;border:1px solid #2c3854;border-radius:10px;padding:1px 7px;font-variant-numeric:tabular-nums}
        .tab.on .tab-badge{color:var(--brand);border-color:var(--brand-border)}
        /* 計算タブのチームバー */
        .team-bar{background:#13192a;border:1px solid #232d44;border-radius:12px;padding:7px 11px;margin-bottom:8px}
        .team-bar-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .team-bar-label{font-size:12px;font-weight:700;color:#c4cede;letter-spacing:.04em}
        .tb-mini{font-size:11px;opacity:.7;margin-left:3px;font-variant-numeric:tabular-nums}
        .team-bar-manage{margin-left:auto;background:none;border:1px solid #2c3854;border-radius:7px;color:#9fb2d6;font-size:11px;padding:5px 11px;cursor:pointer;white-space:nowrap}
        .team-bar-manage:hover{border-color:var(--brand-border);color:#fff}
        .team-bar-empty{font-size:11px;color:#7c879c;margin-top:8px}
        .team-bar-empty .link-btn{margin:0}
        .team-bar-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
        .team-chip{background:#0e1320;border:1px solid #2c3854;border-radius:8px;color:#d6deec;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;transition:border-color .12s,background .12s}
        .team-chip:hover{border-color:var(--brand-border);background:#161d2e}
        .team-chip.on{border-color:var(--brand);color:#fff;background:var(--brand-bg)}
        /* マイチーム管理タブ */
        .team-view{margin:0}
        .tm-body2{display:flex;gap:18px;align-items:flex-start}
        .tm-side{width:320px;flex:0 0 320px}
        .tm-members{flex:1;min-width:0}
        @media(max-width:860px){.tm-body2{flex-direction:column}.tm-side{width:100%;flex:none}}
        .team-manager{background:#161d2e;border:1px solid #232d44;border-radius:14px;padding:18px}
        .team-manager-head{margin-bottom:14px}
        .team-manager-head h2{font-size:16px;font-weight:800;letter-spacing:.04em;margin:0 0 4px}
        .team-manager-hint{font-size:11px;color:#7c879c;line-height:1.5;display:block}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:680px){.grid{grid-template-columns:1fr}}
        /* 攻撃|中央共通|防御 の3カラム。中央にswap/天気/フィールド。パネルはorderで左右入替 */
        .grid3{display:grid;grid-template-columns:1fr 148px 1fr;gap:14px;align-items:start}
        .grid3 > .center-col{order:2}
        @media(max-width:900px){.grid3{grid-template-columns:1fr}}
        .center-col{display:flex;flex-direction:column;gap:10px;align-self:start;padding-top:30px}
        .atk-dir{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;background:#0f1626;border:1px solid var(--brand-border);border-radius:12px;padding:11px 8px;cursor:pointer;color:inherit}
        .atk-dir:hover{border-color:var(--brand);background:#13203a}
        .atk-dir-row{display:flex;align-items:center;justify-content:center;gap:10px}
        .atk-dir-end{font-size:21px;font-weight:900;color:#56607a;width:28px;text-align:center;transition:color .15s,text-shadow .15s}
        .atk-dir-end.is-atk{color:#ff7a3c;text-shadow:0 0 14px rgba(255,122,60,.55)}
        .atk-dir-arrow{font-size:30px;line-height:1;font-weight:900;color:#ff7a3c;text-shadow:0 0 16px rgba(255,122,60,.6)}
        .atk-dir-swap{font-size:11px;font-weight:700;color:#9fb0c8;letter-spacing:.06em;white-space:nowrap}
        .swap-sub{font-size:11px;color:#9fb2d6}
        .center-field{display:flex;flex-direction:column;gap:4px}
        /* ⚡すばやさ比較（中央列のトリガー＋モーダル） */
        .spd-open-btn{width:100%;padding:9px 6px;border-radius:10px;font-size:12.5px;font-weight:800;letter-spacing:.04em;cursor:pointer;background:#161d2e;color:#9fd0ff;border:1px solid #2c4a6b}
        .spd-open-btn:hover{border-color:#5b9bf0;background:#172339}
        .spd-modal{width:660px;max-width:94vw}
        .spd-modal .vs{font-size:15px;line-height:1.5}
        .spd-modal .vs b{font-size:18px}
        .spd-cols{display:flex;gap:16px}
        @media(max-width:620px){.spd-cols{flex-direction:column}}
        .spd-side{flex:1;min-width:0;background:#0f1626;border:1px solid #232d44;border-radius:10px;padding:14px}
        .spd-side-head{font-size:16px;font-weight:700;color:#cfe0ff;margin-bottom:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .spd-src{color:#6b7794;font-size:12.5px;font-weight:400;margin-left:3px}
        .spd-mods{margin:8px 0}
        .spd-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0}
        .spd-row>span{color:#9aa6bd;font-size:14.5px}
        .spd-row input{width:90px;background:#0e1320;border:1px solid #2c3854;border-radius:6px;color:#eef3ff;font-size:20px;font-weight:700;padding:5px 9px;text-align:right;box-sizing:border-box}
        .spd-rank{display:flex;align-items:center;gap:8px}
        .spd-rank button{width:31px;height:31px;border:1px solid #35506b;background:#23304a;color:#bcd0e6;border-radius:6px;cursor:pointer;font-size:18px;line-height:1;padding:0}
        .spd-rank button:hover{border-color:#5b9bf0}
        .spd-rank b{min-width:34px;text-align:center;color:#eef3ff;font-size:18px}
        .spd-checks{display:flex;flex-direction:column;gap:8px;margin:8px 0}
        .spd-checks label{display:flex;align-items:center;gap:8px;font-size:14.5px;color:#aab2c6;cursor:pointer}
        .spd-checks input{margin:0;cursor:pointer;width:17px;height:17px}
        .spd-final{display:flex;align-items:baseline;justify-content:space-between;font-size:14.5px;color:#9aa6bd;border-top:1px solid #232d44;padding-top:9px;margin-top:8px}
        .spd-final b{font-size:30px;color:#7fd0ff;letter-spacing:-.02em}
        .spd-pats{margin-top:9px;border-top:1px solid #232d44;padding-top:7px}
        .spd-pat{display:flex;align-items:center;gap:10px;margin:8px 0}
        .spd-pat-l{width:48px;font-size:14.5px;color:#9aa6bd;flex-shrink:0}
        .spd-pat-v{flex:1;text-align:right;font-size:23px;font-weight:700;color:#e6edff;letter-spacing:-.02em}
        .spd-judge{padding:4px 12px;border-radius:7px;font-size:15px;font-weight:800;min-width:46px;text-align:center}
        .panel{background:#161d2e;border:1px solid #232d44;border-radius:14px;padding:13px}
        .panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .role{font-size:12px;font-weight:700;letter-spacing:.18em;color:#8fa0bd}
        .role.atk{color:var(--accent)}
        .sp-count{font-size:11px;font-variant-numeric:tabular-nums;color:#7c879c}
        .sp-count.over{color:#e8504a;font-weight:700}
        .poke-search{position:relative;width:100%;margin-bottom:2px;z-index:30}
        .panel > .poke-search{z-index:35} /* 技検索行(30)より上に */
        /* 検索ボックスを含む行はドロップダウンが下の要素に潜らないよう前面へ */
        .panel > *:not(.panel-fx):has(.poke-search){z-index:30}
        .field:has(.poke-search){position:relative;z-index:30}
        .poke-search-display{
          display:flex;justify-content:space-between;align-items:center;
          background:#0e1320;border:1px solid #2c3854;border-radius:8px;
          padding:9px 10px;cursor:pointer;transition:border-color .15s;
        }
        .poke-search-display:hover{border-color:#3d4f78}
        .poke-search-name{font-size:14px;font-weight:700;color:#e8ecf4}
        .poke-search-name-input{flex:1;background:transparent;border:0;outline:none;color:#e8ecf4;font-size:14px;font-weight:700;padding:9px 10px;min-width:0;font-family:inherit}
        .poke-search-name-input::placeholder{color:#5a6478;font-weight:400}
        .poke-search-arrow{font-size:11px;color:#7c879c;padding:9px 10px;cursor:pointer}
        .poke-dropdown{
          position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:100;
          background:#161d2e;border:1px solid #3d4f78;border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden;
        }
        .poke-search-input{
          width:100%;box-sizing:border-box;
          background:#0e1320;border:0;border-bottom:1px solid #232d44;
          color:#e8ecf4;padding:10px 12px;font-size:13px;outline:none;
        }
        .poke-search-input::placeholder{color:#5a6478}
        .poke-list{max-height:240px;overflow-y:auto}
        .poke-list-empty{padding:12px;font-size:12px;color:#7c879c;text-align:center}
        .poke-item{
          display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;cursor:pointer;transition:background .1s;
        }
        .poke-item:hover{background:#1e2840}
        .poke-item.selected{background:#1a2a50}
        .poke-item-name{font-size:13px;font-weight:700;color:#e8ecf4}
        .poke-item-types{display:flex;gap:3px}
        .chip-mini{color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.35)}
        select.move{width:100%;background:#0e1320;color:#e8ecf4;border:1px solid #2c3854;border-radius:8px;padding:9px 10px;font-size:14px;font-weight:400;margin-top:8px}
        .types{display:flex;gap:5px;margin:6px 0 3px}
        .base-stats{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin:3px 0 2px}
        .bs-label{font-size:11px;color:#8a93a8;font-weight:700;margin-right:1px}
        .bs-cell{display:inline-flex;align-items:baseline;gap:2px}
        .bs-k{font-size:11px;color:#8a93a8;font-weight:700}
        .bs-v{font-size:12.5px;color:#e8ecf4;font-weight:700;font-variant-numeric:tabular-nums}
        .bs-total{font-size:11px;color:#9fb2d6;font-weight:700;margin-left:2px}
        .chip{color:#fff;border-radius:4px;padding:2px 8px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.35)}
        .move-info{display:flex;align-items:center;gap:8px;margin-top:8px;background:#0e1320;border:1px solid var(--accent);border-radius:8px;padding:8px 10px}
        .move-info .nm{font-weight:800;flex:1;font-size:14px}
        .move-info .meta{font-size:11px;color:#8fa0bd;font-variant-numeric:tabular-nums}
        .cond-row{margin-top:6px;display:flex;align-items:center;gap:8px}
        .cond-note{font-size:11px;color:#8fa0bd}
        .row{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-top:8px}
        .field{display:flex;flex-direction:column;gap:4px}
        .ability-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .field-label{font-size:11px;color:#8fa0bd;letter-spacing:.06em}
        .field input{width:64px;background:#0e1320;border:1px solid #2c3854;border-radius:7px;color:#e8ecf4;padding:7px 8px;font-size:14px;font-variant-numeric:tabular-nums}
        .field input[type=checkbox]{width:auto;flex:none;margin:0 2px 0 0;padding:0} /* チェックボックスは数値入力の64px幅を継がない（□と文字が離れるのを防ぐ） */
        .sp-presets{display:flex;gap:3px;margin-top:3px}
        .sp-pre{flex:1;background:#0e1320;border:1px solid #2c3854;border-radius:5px;color:#8fa0bd;font-size:11px;padding:3px 0;cursor:pointer;font-variant-numeric:tabular-nums}
        .rank-ab-btn{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%;background:#0e1320;border:1px solid var(--brand-border);border-radius:7px;color:#d6deec;font-size:12px;padding:6px 10px;cursor:pointer;text-align:left}
        .rank-ab-btn:hover{border-color:var(--brand);background:#161d2e;color:#fff}
        .rank-ab-cur{font-size:11px;font-weight:700;color:var(--brand);font-variant-numeric:tabular-nums;white-space:nowrap}
        .sp-pre:hover{border-color:#3d4f78}
        .sp-pre.on{border-color:var(--accent);color:#fff;font-weight:700}
        .forme-row{display:flex;gap:6px;margin-top:6px}
        .forme-btn{background:#0e1320;border:1px solid #2c3854;border-radius:6px;color:#c4cede;font-size:11px;padding:4px 10px;cursor:pointer}
        .forme-btn:hover{border-color:var(--accent);color:#fff}
        .seg{display:flex;border:1px solid #2c3854;border-radius:7px;overflow:hidden}
        .seg-btn{flex:1;background:#0e1320;color:#8fa0bd;border:0;padding:7px 9px;font-size:11px;cursor:pointer;text-align:center;white-space:nowrap}
        .seg-btn.on{background:#2c3854;color:#fff;font-weight:700}
        .hd-seg{border-color:#3a5a8a;border-radius:9px}
        .hd-seg .seg-btn{font-size:13px;padding:8px 18px;color:#9ab8d8}
        .hd-seg .seg-btn.on{background:var(--brand);color:#fff;font-weight:700}
        select.rank,input.rank{background:#0e1320;border:1px solid #2c3854;border-radius:7px;color:#e8ecf4;padding:7px 8px;font-size:13px;box-sizing:border-box}
        .rank-step{display:flex;align-items:center;gap:4px}
        .rank-step-btn{width:28px;height:32px;flex-shrink:0;border:1px solid #2c3854;background:#1a2336;color:#cfe0ff;border-radius:7px;cursor:pointer;font-size:16px;line-height:1;padding:0}
        .rank-step-btn:hover{border-color:var(--brand);background:#1f2a44}
        .checks{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
        .ck{display:flex;align-items:center;gap:6px;font-size:12px;color:#c4cede;cursor:pointer}
        .ck input[type=checkbox]{accent-color:var(--accent);margin:0;flex:none}
        .stat-line{font-size:11px;color:#8fa0bd;margin-top:6px;font-variant-numeric:tabular-nums}
        .stat-line b{color:#e8ecf4;font-size:13px}
        .swap-row{display:flex;justify-content:center;margin:8px 0}
        .swap{background:#161d2e;border:1px solid #2c3854;color:#c4cede;border-radius:999px;padding:7px 18px;font-size:12px;cursor:pointer}
        .swap:hover{border-color:var(--accent);color:#fff}
        .result{background:#161d2e;border:1px solid #232d44;border-radius:14px;padding:14px;margin-top:10px;border-top:3px solid var(--accent)}
        /* 画面下部に最前面で常時固定するダメ計結果ドック */
        .result-dock{position:fixed;left:0;right:0;bottom:0;z-index:400;background:#141b2b;border-top:2px solid var(--accent);box-shadow:0 -10px 30px rgba(0,0,0,.55)}
        .result-dock-inner{box-sizing:border-box;max-width:1500px;margin:0 auto;padding:5px 118px 7px;display:flex;flex-direction:column;gap:3px}
        @media(max-width:1000px){.result-dock-inner{padding-left:16px;padding-right:16px}}
        .dock-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .dock-head .vs{margin:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .dock-toggle{flex-shrink:0;background:#0e1320;border:1px solid #2c3854;border-radius:7px;color:#9fb2d6;font-size:13px;font-weight:700;padding:5px 11px;cursor:pointer;white-space:nowrap}
        .dock-toggle:hover{border-color:var(--brand-border);color:#fff}
        .result-dock .dmg-big{margin:0}
        .result-dock .dmg-num,.result-dock .dmg-pct{font-size:25px}
        .result-dock .ko{font-size:16px}
        .result-dock .ko small{font-size:12px}
        .result-dock .hpbar{margin:2px 0 2px;height:13px}
        .dock-details{border-bottom:1px solid #232d44;padding-bottom:6px;margin-bottom:3px;max-height:42vh;overflow-y:auto}
        .dock-details .meta-tags{margin-top:0;margin-bottom:8px}
        .dock-details .rolls{margin-top:0}
        .dock-head{flex-wrap:wrap}
        .dock-btns{display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap}
        .dock-add{background:var(--brand-bg);border-color:var(--brand-border);color:#fff}
        .dock-log{border-bottom:1px solid #232d44;padding-bottom:9px;margin-bottom:4px;max-height:40vh;overflow-y:auto}
        .dock-log-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:#c4cede;margin-bottom:5px}
        .dock-log-fixed{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11px;color:#8fa0bd}
        .dock-log-fixed button{background:#0e1320;border:1px solid #2c3854;border-radius:5px;color:#c4cede;font-size:11px;padding:3px 8px;cursor:pointer}
        .dock-log-fixed button:hover{border-color:var(--brand-border);color:#fff}
        .dock-log-fixed input{width:62px;background:#0e1320;border:1px solid #2c3854;border-radius:5px;color:#e8ecf4;font-size:11px;padding:3px 6px;font-variant-numeric:tabular-nums}
        .dock-log-clear{margin-left:auto;background:none;border:1px solid #5a3a44;border-radius:5px;color:#d99;font-size:11px;padding:3px 9px;cursor:pointer}
        .dock-log-clear:hover:not(:disabled){background:#3a2530;color:#fff}
        .dock-log-clear:disabled{opacity:.4;cursor:default}
        .dmg-badge{align-self:center;font-size:11px;font-weight:700;color:#cfd8e8;background:var(--brand-bg);border:1px solid var(--brand-border);border-radius:6px;padding:2px 9px}
        .crit-badge{font-size:14px;color:#ffe0a3;background:#5a3414;border-color:#a86d28;letter-spacing:.03em}
        .dock-log-empty{font-size:11px;color:#7c879c;padding:3px 0 2px}
        .dock-log-list{display:flex;flex-direction:column;gap:2px;margin-bottom:5px}
        .dock-log-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#d6deec;background:#0e1320;border:1px solid #232d44;border-radius:6px;padding:3px 8px;cursor:pointer}
        .dock-log-item input[type=checkbox]{margin:0;flex:none}
        .dll-current{border-color:var(--brand-border);background:#10182a}
        .dll-badge{display:inline-block;background:var(--brand-bg);border:1px solid var(--brand-border);color:#cfd8e8;font-size:11px;font-weight:700;border-radius:4px;padding:1px 6px;margin-right:6px}
        .dlf-sep{color:#3a4560;margin:0 1px}
        .dlf-turn{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#8fa0bd}
        .dlf-turn input{width:34px;background:#0e1320;border:1px solid #2c3854;border-radius:5px;color:#e8ecf4;font-size:11px;padding:3px 4px;font-variant-numeric:tabular-nums}
        .dlf-grp{display:inline-flex;align-items:center;gap:4px;padding-left:8px;border-left:1px solid #2c3854}
        .dlf-grp:first-of-type{border-left:0;padding-left:0}
        .dlf-act{border-color:var(--brand) !important;background:var(--brand-bg) !important;color:#fff !important}
        .dlf-seg{display:inline-flex;border:1px solid #2c3854;border-radius:5px;overflow:hidden}
        .dlf-seg button{border:0;border-right:1px solid #2c3854;border-radius:0;background:#0e1320;color:#c4cede;font-size:11px;padding:3px 9px;cursor:pointer}
        .dlf-seg button:hover:not(:disabled){background:#161d2e}
        .dlf-seg button:disabled{opacity:.4;cursor:default}
        .dlf-seg button:last-child{border-right:0}
        .dlf-seg button.dlf-on{background:var(--brand-bg);color:#fff}
        .dll-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .dll-dmg{font-variant-numeric:tabular-nums;color:#aeb8c8;flex-shrink:0}
        .dll-x{background:none;border:0;color:#5a6478;font-size:12px;cursor:pointer;padding:0 2px;flex-shrink:0}
        .dll-x:hover{color:#e8504a}
        .dock-log-sum{font-size:11px;color:#e8ecf4;background:#10182a;border:1px solid var(--brand-border);border-radius:8px;padding:6px 9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dock-log-sum b{font-size:13px}
        .dock-log-sum .dll-ko{font-weight:800;color:var(--brand)}
        .dll-warn{font-size:11px;color:#d99}
        @media(max-width:600px){.result-dock .dmg-num,.result-dock .dmg-pct{font-size:23px}}
        .vs{font-size:13px;color:#c4cede;margin-bottom:12px}
        .vs b{color:#fff}
        .vs .mv{color:var(--accent);font-weight:800}
        .dmg-big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
        .dmg-num{font-size:32px;font-weight:800;letter-spacing:-.01em}
        .dmg-pct{font-size:32px;font-weight:800;letter-spacing:-.01em;color:#8fb8e8}
        .ko{font-size:20px;font-weight:800;margin-left:auto}
        .ko small{font-size:16px;color:#8fa0bd;font-weight:400;margin-left:6px}
        .hpbar{position:relative;height:18px;background:#0a0e18;border:1px solid #2c3854;border-radius:999px;margin:14px 0 6px;overflow:hidden}
        .hp-remain{position:absolute;inset:0 auto 0 0;border-radius:999px;transition:width .25s}
        .hp-band{position:absolute;inset:0 auto 0 0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.22) 0 4px,transparent 4px 8px)}
        .hp-caption{display:flex;justify-content:space-between;font-size:16px;color:#9aa6bd;font-variant-numeric:tabular-nums}
        .meta-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        .tag{font-size:11px;background:#0e1320;border:1px solid #2c3854;border-radius:5px;padding:3px 8px;color:#c4cede}
        .tag.eff2{border-color:#e8504a;color:#ff8a85}
        .tag.eff05{border-color:#3d8dd6;color:#8fc2f0}
        .tag.eff0{border-color:#555;color:#999}
        .move-display{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;min-width:0}
        .move-display-name{font-weight:700;font-size:14px;color:#e8ecf4;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .move-display-meta{font-size:11px;color:#8fa0bd;font-variant-numeric:tabular-nums;white-space:nowrap}
        .move-meta-mini{font-size:11px;color:#8fa0bd;font-variant-numeric:tabular-nums;margin-left:4px}
        .move-usage{font-size:11px;font-weight:700;color:#8fc2f0;background:#13233c;border:1px solid #244468;border-radius:999px;padding:0 6px;font-variant-numeric:tabular-nums;flex:none}
        .recent-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
        .recent-chip{display:inline-flex;align-items:center;background:#0e1320;border:1px solid #2c3854;border-radius:6px;font-size:11px;color:#c4cede;overflow:hidden}
        .recent-chip.on{border-color:var(--accent);color:#fff}
        .recent-chip-name{padding:3px 4px 3px 8px;cursor:pointer}
        .recent-chip-name:hover{color:#fff}
        .recent-chip-x{background:none;border:0;color:#5a6478;font-size:11px;padding:3px 6px;cursor:pointer}
        .recent-chip-x:hover{color:#e8504a}
        .multi-table{margin-top:14px;border:1px solid #232d44;border-radius:8px;overflow:hidden}
        .multi-row{display:grid;grid-template-columns:1.6fr 1fr 1.1fr 1.2fr;gap:6px;padding:7px 12px;font-size:12px;color:#c4cede;font-variant-numeric:tabular-nums;border-bottom:1px solid #1a2236;align-items:center}
        .multi-row:last-child{border-bottom:0}
        .multi-head{font-size:11px;color:#8fa0bd;letter-spacing:.06em;background:#0e1320}
        .rolls{display:grid;grid-template-columns:repeat(16,1fr);gap:4px;margin-top:10px}
        @media(max-width:900px){.rolls{grid-template-columns:repeat(8,1fr)}}
        @media(max-width:520px){.rolls{grid-template-columns:repeat(4,1fr)}}
        .roll{background:#0e1320;border:1px solid #232d44;border-radius:5px;text-align:center;padding:4px 0;font-size:11px;color:#8fa0bd;font-variant-numeric:tabular-nums}
        .roll b{display:block;color:#e8ecf4;font-size:13px}
        .modal-backdrop{position:fixed;inset:0;background:rgba(5,8,16,.7);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal-backdrop.modal-top{align-items:flex-start;padding-top:6vh} /* 推定モーダルは上寄せ＝結果増減でも入力/上下ボタンが動かない */
        .confirm-modal{background:#161d2e;border:1px solid #3d4f78;border-radius:14px;padding:22px 24px;max-width:400px;box-shadow:0 16px 48px rgba(0,0,0,.6)}
        .confirm-title{font-size:15px;font-weight:800;color:#e8ecf4;margin:0 0 10px;letter-spacing:.02em}
        .confirm-msg{font-size:12px;color:#9fb0c8;line-height:1.7;margin:0 0 20px}
        .confirm-msg b{color:#cdd8ea}
        .confirm-actions{display:flex;gap:10px;justify-content:flex-end}
        .confirm-actions button{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #2c3854;transition:background .12s,border-color .12s}
        .confirm-cancel{background:#1e2740;color:#c4cede}
        .confirm-cancel:hover{border-color:#4a5e88}
        .confirm-ok{background:#7e2f3c;color:#ffd9df;border-color:#a13a4a}
        .confirm-ok:hover{background:#943847}
        .modal{position:relative;width:min(640px,94vw);max-height:86vh;overflow-y:auto;border:1px solid #3d4f78;box-shadow:0 16px 48px rgba(0,0,0,.6)}
        .result.modal > .modal-close{position:absolute;top:10px;right:12px;z-index:2;background:none;border:0;color:#8fa0bd;font-size:18px;cursor:pointer;padding:4px}
        .modal-close:hover{color:#fff}
        .modal .infer-table{max-height:46vh}
        .infer-table{margin-top:10px;max-height:46vh;overflow-y:auto;border:1px solid #232d44;border-radius:8px}
        .infer-row{display:grid;justify-items:center;grid-template-columns:1fr 1fr 1.3fr;padding:8px 14px;font-size:14px;color:#c4cede;font-variant-numeric:tabular-nums;border-bottom:1px solid #1a2236}
        .infer-row:last-child{border-bottom:0}
        .infer-click{cursor:pointer}
        .infer-click:hover{background:#1e2840}
        .infer-head{font-size:12.5px;color:#8fa0bd;letter-spacing:.06em;background:#0e1320;position:sticky;top:0}
        /* 推定モーダル内は全体的に文字を大きめに（スピード比較モーダルは除外） */
        .modal:not(.spd-modal) .vs{font-size:14px;line-height:1.65}
        .modal:not(.spd-modal) .stat-line{font-size:13px}
        .modal:not(.spd-modal) .stat-line b{font-size:14.5px}
        .modal:not(.spd-modal) .field-label{font-size:12.5px}
        .modal:not(.spd-modal) .ck{font-size:13.5px}
        .modal:not(.spd-modal){width:min(430px,94vw)} /* 推定モーダルは縦長に（表が左寄せにならずモーダル幅いっぱいに収まる） */
        /* 数値の −／＋ ステッパー（標準スピナーより押しやすい大きめボタン） */
        .num-step{display:inline-flex;align-items:stretch;gap:5px}
        .num-step input{width:64px;text-align:center;font-size:15px}
        .num-step input::-webkit-inner-spin-button,.num-step input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        .num-step input[type=number]{-moz-appearance:textfield;appearance:textfield}
        .num-step-btn{flex:none;width:40px;border:1px solid #35506b;background:#23304a;color:#cfe0ff;border-radius:7px;cursor:pointer;font-size:23px;line-height:1;padding:0;font-weight:700;touch-action:none;user-select:none;-webkit-user-select:none}
        .num-step-btn:hover{border-color:var(--brand);background:#28365280}
        .num-step-btn:active{background:#33456b}
        footer{margin-top:22px;font-size:11px;color:#5a6478;line-height:1.7}
        footer a{color:#7e93b6;text-decoration:underline}
        footer a:hover{color:#aecdee}
      `}</style>

      <div className="wrap">
        <header className="top">
          <h1>ダメージ計算</h1>
          <span className="sub">ポケモンチャンピオンズ仕様 · Lv50固定 / 個体値31固定 / 能力P制</span>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div className="seg hd-seg" style={{ alignSelf:"center" }}>
              <button className={!isDouble ? "seg-btn on" : "seg-btn"} onClick={() => setIsDouble(false)}>シングル</button>
              <button className={isDouble ? "seg-btn on" : "seg-btn"} onClick={() => setIsDouble(true)}>ダブル</button>
            </div>
          <div className="opts" ref={optsRef}>
            <button className="gear" style={{ fontSize:18, padding:"7px 11px" }} onClick={() => setOptsOpen((v) => !v)} aria-label="設定">⚙</button>
            {optsOpen && (
              <div className="opts-menu">
                <div className="opts-item">
                  <span className="field-label">天気エフェクト</span>
                  <div className="seg">
                    {["あり", "なし"].map((m) => (
                      <button key={m} className={fxParticles === m ? "seg-btn on" : "seg-btn"} onClick={() => setFxParticles(m)}>{m}</button>
                    ))}
                  </div>
                </div>
                <div className="opts-item">
                  <label className="ck">
                    <input type="checkbox" checked={hideLowUsage} onChange={(e) => setHideLowUsage(e.target.checked)} />
                    採用率が著しく低いと思われる技を表示しない
                  </label>
                  <button className="link-btn" onClick={() => setShowLowList((v) => !v)}>
                    {showLowList ? "▲ 対象の技を隠す" : `▼ 対象の技を見る（${LOW_USAGE_MOVES.size}件）`}
                  </button>
                  {showLowList && (
                    <div className="low-list">
                      {[...LOW_USAGE_MOVES].map((n) => <span key={n} className="low-item">{n}</span>)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>
        </header>
        <p className="spec">能力ポイント(SP)は 1ステータス上限32・合計上限66。1SP = 実数値+1。チャンピオンズで習得可能な攻撃技を全収録（{POKEMON.length}匹・{Object.keys(M).length}技）。</p>

        {SHOW_RELEASE_NOTICE && !noticeDismissed && (
          <div className="release-notice">
            <span className="release-notice-icon" aria-hidden="true">🚧</span>
            <p className="release-notice-body">
              <b>リリースしたてです！</b> 不具合や不便な点がまだ多いと思います。お気づきの点があれば
              <button type="button" className="release-notice-link" onClick={() => setView("feedback")}>💬 フィードバックタブ</button>
              からお気軽にご報告ください 🙏
            </p>
            <button type="button" className="release-notice-x" onClick={dismissNotice} aria-label="このお知らせを閉じる">✕</button>
          </div>
        )}

        <div className="tabs">
          <button className={view === "obs" ? "tab on" : "tab"} onClick={() => setView("obs")}>🎬 OBS{obs.connected ? " 🟢" : ""}</button>
          <button className={view === "calc" ? "tab on" : "tab"} onClick={() => setView("calc")}>⚔ ダメージ計算</button>
          <button className={view === "team" ? "tab on" : "tab"} onClick={() => setView("team")}>🧩 マイチーム</button>
          <button className={view === "box" ? "tab on" : "tab"} onClick={() => setView("box")}>🖥️ ボックス</button>
          <button className={view === "feedback" ? "tab on" : "tab"} onClick={() => setView("feedback")}>💬 フィードバック</button>
        </div>

        {view === "calc" && (
        <div className="calc-layout">
        <TeamRail title="🧩 自チーム" side="left"
          controls={
            <div className="rail-team-ctrl">
              <select className="rail-team-sel" value={railActive} onChange={(e) => setRailActive(Number(e.target.value))}>
                {railTeams.map((t, i) => <option key={i} value={i}>{(railNames && railNames[i]) || `チーム${i + 1}`}（{t.filter(Boolean).length}）</option>)}
              </select>

            </div>
          }
          groups={railTeams[railActive].filter(Boolean).map(ownRailItems)}
          emptyHint={<><button className="link-btn" style={{ margin: 0 }} onClick={() => setView("team")}>登録</button></>} />
        <div className="calc-main">
        <div className="grid3">
          {/* ===== 攻撃側 ===== */}
          <section className="panel" style={{ order: atkOnRight ? 3 : 1, ...(panelBg ? { background: panelBg } : {}) }}>
            {innerFx}
            <div className="panel-head">
              <span className="role atk">こうげき側</span>
            </div>
            <PokeRecentChips hist={atkPokeHist} setHist={setAtkPokeHist} onPick={setAtkIdx} />
            <PokemonSearch value={atkIdx} onChange={setAtkIdx} accent={accent} />
            <FormeButtons idx={atkIdx} onChange={setAtkIdx} />
            <div className="types">
              {(protean ? [effType] : atkTypes).map((t) => <TypeChip key={t} t={t} />)}
              {(protean || ((atkAbilityEff === "へんげんじざい" || atkAbilityEff === "リベロ") && proteanType)) && <span className="cond-note">← へんげんじざいでタイプ変化</span>}
            </div>
            <BaseStats base={attacker.base} />

            <div className="row" style={{ marginTop: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <span className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  わざ（{moveList.length}件）
                  <label className="ck" style={{ fontSize: 11 }}>
                    <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} />
                    手動入力
                  </label>
                </span>
                {!customOn && recentMoves.length > 0 && (
                  <div className="recent-row">
                    {recentMoves.map((n) => (
                      <span key={n} className={n === moveName ? "recent-chip on" : "recent-chip"}>
                        <span className="recent-chip-name" onClick={() => { setMoveName(n); recordMove(n); }}>{n}</span>
                        <button className="recent-chip-x" onClick={() => removeRecent(n)} aria-label={`${n}を履歴から削除`}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {!customOn && (
                  <MoveSearch
                    moveList={moveList} value={moveName} onChange={(n) => { setMoveName(n); recordMove(n); }} accent={accent}
                    chipType={effType} usage={usageMapFor(attacker.name, currentMoveUsage)[moveName]}
                    meta={isFixedMove ? `${move.c} / 固定${fixedDmgVal}ダメージ` : `${move.c} / 威力${effPowerNoItem}${move.ws && weather !== "なし" ? "（天気で変化）" : ""}${isMulti ? ` ×${result.hitLabel}回` : ""}`}
                  />
                )}
                {isMulti && (
                  <div className="field" style={{ marginTop: 6, alignItems: "flex-start" }}>
                    <span className="field-label">ヒット数</span>
                    {atkAbilityEff === "スキルリンク" ? (
                      <select className="rank" value={moveHits[1]} disabled>
                        <option value={moveHits[1]}>{moveHits[1]}発(スキルリンク確定)</option>
                      </select>
                    ) : (
                      <select className="rank" value={moveHits[0] === moveHits[1] && hits === 0 ? moveHits[0] : hits} onChange={(e) => setHits(Number(e.target.value))}>
                        {moveHits[0] !== moveHits[1] && <option value={0}>{moveHits[0]}〜{moveHits[1]}(確率)</option>}
                        {Array.from({ length: Math.min(moveHits[1], 10) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}発</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>

            {customOn && (
              <div className="row" style={{ marginTop: 6 }}>
                <div className="field">
                  <span className="field-label">タイプ</span>
                  <select className="rank" value={customType} onChange={(e) => setCustomType(e.target.value)}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">分類</span>
                  <div className="seg">
                    {["物理", "特殊"].map((c) => (
                      <button key={c} className={customCat === c ? "seg-btn on" : "seg-btn"} onClick={() => setCustomCat(c)}>{c}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">威力</span>
                  <input type="number" className="rank" style={{ width: 80 }} min={0} max={300} value={customPower}
                    onChange={(e) => setCustomPower(e.target.value)} />
                </div>
              </div>
            )}

            {customOn && (
              <div className="move-info">
                <TypeChip t={effType} small />
                <span className="nm">{move.name}</span>
                <span className="meta">{move.c} / 威力{effPowerNoItem}</span>
              </div>
            )}
            {isDouble && SPREAD_MOVES.has(moveKey) && !customOn && (
              <div className="cond-row">
                <span className="cond-note" style={{ color: "#a0c4ff", fontWeight: 600 }}>範囲技 ×0.75</span>
                <label className="ck">
                  <input type="checkbox" checked={singleTarget} onChange={(e) => setSingleTarget(e.target.checked)} />
                  シングルダメージで計算
                </label>
              </div>
            )}
            {isDouble && effType === "フェアリー" && !customOn && (
              <div className="cond-row">
                <label className="ck">
                  <input type="checkbox" checked={fairyAuraDouble} onChange={(e) => setFairyAuraDouble(e.target.checked)} />
                  フェアリーオーラ（味方） 威力×1.33
                </label>
              </div>
            )}
            {SPA_BOOST_MOVES.has(moveName) && !customOn && (
              <div className="cond-row">
                <button type="button" className="forme-btn" onClick={() => setAtkRank((r) => clampRank(r + 1))}>とくこう+1（チャージで上昇）</button>
                <span className="cond-note">※ 押すとランク欄に反映</span>
              </div>
            )}
            {atkAbility === "バリアフリー" && (
              <div className="cond-row">
                <button type="button" className="forme-btn" onClick={() => setWall(false)}>相手の壁を解除</button>
                <span className="cond-note">※ リフレクター/ひかりのかべ/オーロラベールを消す</span>
              </div>
            )}
            {condDef && (
              <div className="cond-row">
                {condDef.type === "auto" && <span className="cond-note">※ {condDef.label}（自動判定{condNote ? `・適用中` : "・現在未適用"}）</span>}
                {condDef.type === "toggle" && (
                  <label className="ck">
                    <input type="checkbox" checked={condOn} onChange={(e) => setCondOn(e.target.checked)} />
                    {condDef.label}（威力×{condDef.mul}）
                  </label>
                )}
                {condDef.type === "count" && (
                  <div className="ck" style={{ cursor: "default", flexWrap: "wrap" }}>
                    {condDef.label}:
                    <span className="seg">
                      {Array.from({ length: condDef.max + 1 }, (_, i) => (
                        <button key={i} type="button" className={condCount === i ? "seg-btn on" : "seg-btn"} onClick={() => setCondCount(i)}>{i}</button>
                      ))}
                    </span>
                    （威力+{condDef.per}/体）
                  </div>
                )}
              </div>
            )}
            {isVarMove && (
              <div className="cond-row">
                <label className="ck">
                  威力:
                  <input type="number" className="rank" style={{ width: 70 }} min={0} max={300}
                    value={varPow} onChange={(e) => setVarPow(e.target.value)} />
                </label>
                <span className="cond-note">※ {move.vh}</span>
              </div>
            )}
            {varCalc && (
              <div className="cond-row" style={{ flexWrap: "wrap", gap: 8 }}>
                {varCalc.kind === "fling" && (
                  <label className="ck">投げる持ち物:
                    <select className="rank" value={flingItem} onChange={(e) => setFlingItem(e.target.value)}>
                      {FLING_ITEMS.map((it) => <option key={it} value={it}>{it}（威力{ITEM_FLING[it]}）</option>)}
                    </select>
                  </label>
                )}
                {(varCalc.kind === "lowhp" || varCalc.kind === "highhp") && (
                  hpMode === "hp" ? (
                    <label className="ck">自分の残りHP
                      <input type="number" className="rank" style={{ width: 62 }} min={0} value={hpRemain} onChange={(e) => setHpRemain(e.target.value)} />
                      ／最大
                      <input type="number" className="rank" style={{ width: 62 }} min={1} value={hpMax} onChange={(e) => setHpMax(e.target.value)} />
                    </label>
                  ) : (
                    <label className="ck">相手の残HP％
                      <input type="number" className="rank" style={{ width: 62 }} min={0} max={100} value={hpPct} onChange={(e) => setHpPct(e.target.value)} />
                    </label>
                  )
                )}
                {varCalc.kind === "boost" && (
                  <label className="ck">ランク上昇の合計:
                    <input type="number" className="rank" style={{ width: 62 }} min={0} max={20} value={boostCount} onChange={(e) => setBoostCount(e.target.value)} />
                  </label>
                )}
                {varCalc.kind === "stockpile" && (
                  <label className="ck">のみこんだ回数:
                    <select className="rank" value={stockpileCount} onChange={(e) => setStockpileCount(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
                {varCalc.kind === "targethp" && (
                  <label className="ck">相手(受ける側)の残HP％
                    <input type="number" className="rank" style={{ width: 62 }} min={1} max={100} value={defHpPct} onChange={(e) => setDefHpPct(e.target.value)} />
                  </label>
                )}
                {varCalc.kind === "ragefist" && (
                  <label className="ck">これまでに受けた攻撃回数:
                    <input type="number" className="rank" style={{ width: 62 }} min={0} max={6} value={rageHits} onChange={(e) => setRageHits(e.target.value)} />
                  </label>
                )}
                {varCalc.kind === "weight" && (
                  <span className="cond-note">
                    自分 {atkWeightEff}kg{atkWeightEff !== attacker.w ? `(${atkAbility})` : ""} ／ 相手 {defWeightEff}kg{defWeightEff !== defender.w ? `(${defAbility})` : ""}
                  </span>
                )}
                <span className="cond-note">→ 威力 <b style={{ color: "#e8ecf4" }}>{varCalcPower}</b>{varCalc.kind === "weight" ? "（自動）" : ""}</span>
              </div>
            )}
            {isFixedMove && (
              <div className="cond-row">
                <span className="cond-note">※ レベル分の固定{fixedDmgVal}ダメージ（相性・能力・天気・壁の影響なし。無効タイプには0）</span>
              </div>
            )}

            <div className="row">
              <div className="field" style={{ maxWidth: "100%" }}>
                <span className="field-label">特性</span>
                <div className="ability-line">
                <select className="rank" value={atkAbility} onChange={(e) => setAtkAbility(e.target.value)}>
                  {abilityOptions(attacker, currentAbilityUsage).map(({ x, u }) => {
                    const txt = u != null ? `${x} ${u.toFixed(1)}%` : x;
                    return (
                      <option key={x} value={x} style={DAMAGE_ABILITIES.has(x) ? undefined : { textDecoration: "line-through", color: "#5a6478" }}>
                        {DAMAGE_ABILITIES.has(x) ? txt : `${txt}（影響なし）`}
                      </option>
                    );
                  })}
                </select>
              {RANK_ABILITIES[atkAbility]?.side === "atk" ? (
                <RankAbilityBtn ability={atkAbility} onApply={applyRankAbility} atkRank={atkRank} defRank={defRank} />
              ) : RANK_ABILITIES[atkAbility] ? (
                <span className="ck" style={{ paddingBottom: 8, opacity: 0.5 }}>（防御側で発動）</span>
              ) : (
                <label className="ck" style={{ paddingBottom: 8, opacity: (MANUAL_ABILITIES.has(atkAbility) || atkAbActive || atkAutoOff) ? 1 : 0.55 }}
                  title={MANUAL_ABILITIES.has(atkAbility) ? "" : "条件を満たすと自動発動（オフにもできます）"}>
                  <input type="checkbox"
                    checked={atkAbility === "こんじょう" ? (atkAbilityOn || burn) : MANUAL_ABILITIES.has(atkAbility) ? atkAbilityOn : atkAbActive}
                    disabled={MANUAL_ABILITIES.has(atkAbility) ? (atkAbility === "こんじょう" && burn) : (!atkAbActive && !atkAutoOff)}
                    onChange={(e) => {
                      if (MANUAL_ABILITIES.has(atkAbility)) { setAtkAbilityOn(e.target.checked); return; }
                      if (!e.target.checked) setConfirmOff({ side: "atk", ability: atkAbility });
                      else setAtkAutoOff(false);
                    }} />
                  発動{MANUAL_ABILITIES.has(atkAbility) ? "" : atkAutoOff ? "(オフ中)" : "(自動)"}
                </label>
              )}
              {atkAbility === "そうだいしょう" && (
                <label className="ck" style={{ paddingBottom: 8 }}>
                  倒れた味方
                  <select className="rank" value={overlordCount} onChange={(e) => setOverlordCount(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                  体（+10%/体・最大×1.5）
                </label>
              )}
              {atkAbility === "とうそうしん" && (
                <label className="ck" style={{ paddingBottom: 8 }}>
                  相手の性別
                  <select className="rank" value={rivalryGender} onChange={(e) => setRivalryGender(e.target.value)}>
                    <option value="none">不明（×1）</option>
                    <option value="same">同性（×1.25）</option>
                    <option value="opp">異性（×0.75）</option>
                  </select>
                </label>
              )}
              {atkAbility === "はらぺこスイッチ" && (
                <label className="ck" style={{ paddingBottom: 8 }}>
                  モード
                  <select className="rank" value={hungerMode} onChange={(e) => setHungerMode(e.target.value)}>
                    <option value="full">まんぷく（でんき）</option>
                    <option value="hangry">はらぺき（あく）</option>
                  </select>
                </label>
              )}
              {(atkAbility === "へんげんじざい" || atkAbility === "リベロ") && (
                <label className="ck" style={{ paddingBottom: 8 }}>
                  変化後タイプ
                  <select className="rank" value={proteanType} onChange={(e) => setProteanType(e.target.value)}>
                    <option value="">技のタイプ（自動・常に一致）</option>
                    {Object.keys(TYPE_COLOR).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              )}
              {atkAbility === "トレース" && (
                <label className="ck" style={{ paddingBottom: 8, flexWrap: "wrap" }}>
                  コピーした特性
                  <button type="button" className="forme-btn" onClick={() => setTracedAbility(defAbility)}>対面の特性をコピー</button>
                  <select className="rank" value={tracedAbility} onChange={(e) => setTracedAbility(e.target.value)}>
                    <option value="">（未選択）</option>
                    {TRACEABLE_ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              )}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <span className="field-label">もちもの{isMega(attacker) ? "（メガ＝不可）" : ""}</span>
                <select className="rank" value={isMega(attacker) ? "その他" : atkItem} disabled={isMega(attacker)} onChange={(e) => setAtkItem(e.target.value)}>
                  {/* 登録した実物の持ち物（汎用リストに無いもの）を なし の上に表示。攻撃に効かなければ(影響なし) */}
                  {!ATK_ITEMS.includes(atkItem) && <option value={atkItem}>{itemLabel(atkItem, "atk")}</option>}
                  {/* でんきだまはピカチュウの時だけ選択肢に出す（選択中なら不一致防止で出す） */}
                  {ATK_ITEMS.filter((x) => x !== "でんきだま" || attacker.name === "ピカチュウ" || atkItem === "でんきだま").map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              {atkItem === "メトロノーム" && !isMega(attacker) && (
                <div className="field">
                  <span className="field-label">連続使用（×{metroMul.toFixed(1)}）</span>
                  <select className="rank" value={metroCount} onChange={(e) => setMetroCount(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}回目</option>)}
                  </select>
                </div>
              )}
              {/* 攻撃力推定は相手側のポケのみ（攻撃側が右パネル＝敵の時だけ表示。自分の攻撃は逆算不要） */}
              {atkOnRight && (
                <button className="swap" style={{ width: "100%" }} onClick={() => setShowAtkInference(true)}>
                  ⚔ 攻撃力推定
                </button>
              )}
            </div>

            <div className="row">
              <SpInput label={`${atkStatLabel}SP`} value={atkSp} onChange={setAtkSp} />
              <div className="field">
                <span className="field-label">性格補正</span>
                <NatureSelect value={atkNature} onChange={setAtkNature} />
              </div>
              <div className="field">
                <span className="field-label">ランク</span>
                <RankSelect value={atkRank} onChange={setAtkRank} />
              </div>
            </div>

            <div className="checks">
              <label className="ck" style={{ opacity: alwaysCrit || critBlocked ? 0.55 : 1 }}
                title={critBlocked ? "相手のシェルアーマーで急所無効" : alwaysCrit ? "確定急所技" : ""}>
                <input type="checkbox" checked={critEff} disabled={alwaysCrit || critBlocked}
                  onChange={(e) => setCrit(e.target.checked)} />
                急所{alwaysCrit && !critBlocked ? "(確定)" : ""}{critBlocked ? "(無効)" : ""}
              </label>
              <label className="ck" style={{ opacity: isPhysical ? 1 : 0.4 }}>
                <input type="checkbox" checked={burn && isPhysical} disabled={!isPhysical} onChange={(e) => setBurn(e.target.checked)} />やけど
              </label>
              {isDouble && <label className="ck"><input type="checkbox" checked={helpingHand} onChange={(e) => setHelpingHand(e.target.checked)} />てだすけ</label>}
            </div>

            <p className="stat-line">{atkStatLabel}実数値: <b>{result.A}</b>（ランク補正後）</p>
          </section>

          {/* ===== 防御側 ===== */}
          <section className="panel" style={{ order: atkOnRight ? 1 : 3, ...(panelBg ? { background: panelBg } : {}) }}>
            {innerFx}
            <div className="panel-head">
              <span className="role">ぼうぎょ側</span>
            </div>
            <PokeRecentChips hist={defPokeHist} setHist={setDefPokeHist} onPick={setDefIdx} />
            <PokemonSearch value={defIdx} onChange={setDefIdx} />
            <FormeButtons idx={defIdx} onChange={setDefIdx} />
            <div className="types">{defTypes.map((t) => <TypeChip key={t} t={t} />)}</div>
            <BaseStats base={defender.base} />

            <div className="row">
              <div className="field" style={{ maxWidth: "100%" }}>
                <span className="field-label">特性</span>
                <div className="ability-line">
                <select className="rank" value={defAbility} onChange={(e) => setDefAbility(e.target.value)}>
                  {abilityOptions(defender, currentAbilityUsage).map(({ x, u }) => {
                    const txt = u != null ? `${x} ${u.toFixed(1)}%` : x;
                    return (
                      <option key={x} value={x} style={DAMAGE_ABILITIES.has(x) ? undefined : { textDecoration: "line-through", color: "#5a6478" }}>
                        {DAMAGE_ABILITIES.has(x) ? txt : `${txt}（影響なし）`}
                      </option>
                    );
                  })}
                </select>
              {RANK_ABILITIES[defAbility]?.side === "def" ? (
                <RankAbilityBtn ability={defAbility} onApply={applyRankAbility} atkRank={atkRank} defRank={defRank} />
              ) : RANK_ABILITIES[defAbility] ? (
                <span className="ck" style={{ paddingBottom: 8, opacity: 0.5 }}>（攻撃側で発動）</span>
              ) : (
                <label className="ck" style={{ paddingBottom: 8, opacity: (MANUAL_ABILITIES.has(defAbility) || defAbActive || defAutoOff) ? 1 : 0.55 }}
                  title={MANUAL_ABILITIES.has(defAbility) ? "" : "条件を満たすと自動発動（オフにもできます）"}>
                  <input type="checkbox"
                    checked={MANUAL_ABILITIES.has(defAbility) ? defAbilityOn : defAbActive}
                    disabled={MANUAL_ABILITIES.has(defAbility) ? false : (!defAbActive && !defAutoOff)}
                    onChange={(e) => {
                      if (MANUAL_ABILITIES.has(defAbility)) { setDefAbilityOn(e.target.checked); return; }
                      if (!e.target.checked) { if (defAbility === "マルチスケイル") setDefAutoOff(true); else setConfirmOff({ side: "def", ability: defAbility }); } // マルチスケイルは警告なしで即オフ
                      else setDefAutoOff(false);
                    }} />
                  発動{MANUAL_ABILITIES.has(defAbility) ? "" : defAutoOff ? "(オフ中)" : "(自動)"}
                </label>
              )}
                </div>
              </div>
            </div>
            <div className="row">
              <div className="field">
                <span className="field-label">もちもの{isMega(defender) ? "（メガ＝不可）" : ""}</span>
                <select className="rank" value={isMega(defender) ? "その他" : defItem} disabled={isMega(defender)} onChange={(e) => setDefItem(e.target.value)}>
                  {/* 登録した実物の持ち物を なし の上に表示。防御に効かなければ(影響なし) */}
                  {!DEF_ITEMS.includes(defItem) && <option value={defItem}>{itemLabel(defItem, "def")}</option>}
                  {DEF_ITEMS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              {/* 耐久力推定は相手側のポケのみ（防御側が右パネル＝敵の時だけ表示。自分の耐久は逆算不要） */}
              {!atkOnRight && (
                <button className="swap" style={{ width: "100%" }} onClick={() => setShowInference(true)}>
                  🛡 耐久力推定
                </button>
              )}
            </div>
            <div className="row">
              <SpInput label="HP SP" value={hpSp} onChange={setHpSp} />
              {defPhys
                ? <SpInput label="ぼうぎょSP" value={bSp} onChange={setBSp} />
                : <SpInput label="とくぼうSP" value={dSp} onChange={setDSp} />}
            </div>
            <div className="row">
              <div className="field">
                <span className="field-label">{defPhys ? "防御" : "特防"} 性格補正</span>
                <NatureSelect value={defPhys ? bNature : dNature} onChange={defPhys ? setBNature : setDNature} />
              </div>
              <div className="field">
                <span className="field-label">ランク</span>
                <RankSelect value={defRank} onChange={setDefRank} />
              </div>
            </div>
            <div className="row">
              <label className="ck" style={{ paddingBottom: 8 }}>
                <input type="checkbox" checked={wall} onChange={(e) => { if (e.target.checked && atkAbilityEff === "すりぬけ") setWarnModal({ kind: "info", title: "すりぬけは壁を無視します", msg: "相手のすりぬけにより、壁（リフレクター／ひかりのかべ）はダメージに影響しません。" }); setWall(e.target.checked); }} />
                壁（{isPhysical ? "リフレクター" : "ひかりのかべ"}）{isDouble ? " ×2/3" : ""}
              </label>
              {isDouble && (
                <label className="ck" style={{ paddingBottom: 8 }}>
                  <input type="checkbox" checked={friendGuard} onChange={(e) => setFriendGuard(e.target.checked)} />
                  フレンドガード
                </label>
              )}
            </div>

            <p className="stat-line">
              HP実数値: <b>{result.HP}</b>　{defPhys ? "防御" : "特防"}実数値: <b>{result.D}</b>（補正後）
            </p>
          </section>
          <div className="center-col">
            <button className="atk-dir" onClick={swap} title="攻守を入れ替える（攻撃↔防御）">
              <span className="atk-dir-row">
                <span className={"atk-dir-end" + (atkOnRight ? "" : " is-atk")}>{atkOnRight ? "防" : "攻"}</span>
                <span className="atk-dir-arrow">{atkOnRight ? "◀" : "▶"}</span>
                <span className={"atk-dir-end" + (atkOnRight ? " is-atk" : "")}>{atkOnRight ? "攻" : "防"}</span>
              </span>
              <span className="atk-dir-swap">⇅ 攻守交代</span>
            </button>
            <label className="center-field"><span className="field-label">天気</span>
              <select className="rank" value={weatherSel} onChange={(e) => setWeather(e.target.value)} style={{ background: WEATHER_SELECT_BG[weatherSel] }}>
                {["なし","はれ","あめ","すなあらし","ゆき"].map((w) => <option key={w} style={{ background: WEATHER_SELECT_BG[w] || "#0e1320", color: "#e8ecf4" }}>{w}</option>)}
              </select>
            </label>
            <label className="center-field"><span className="field-label">フィールド</span>
              <select className="rank" value={terrainEff} onChange={(e) => setTerrain(e.target.value)} style={{ background: TERRAIN_PANEL_BG[terrainEff] }}>
                {["なし","エレキ","グラス","サイコ","ミスト"].map((t) => <option key={t} style={{ background: TERRAIN_PANEL_BG[t] || "#0e1320", color: "#e8ecf4" }}>{t}</option>)}
              </select>
            </label>
            <button className="spd-open-btn" onClick={() => setShowSpeed(true)} title="すばやさ比較を開く">⚡ すばやさ比較</button>
          </div>
        </div>

        {/* ===== 結果（画面下部に最前面で常時固定） ===== */}
        <section className="result-dock" style={dockBg ? { background: dockBg } : undefined}>
          <div className="result-dock-inner">
              <div className="dock-details">
                <div className="meta-tags">
                  <span className={`tag ${result.eff >= 2 ? "eff2" : result.eff === 0 ? "eff0" : result.eff < 1 ? "eff05" : ""}`}>{effLabel}</span>
                  {result.stab && <span className="tag">タイプ一致 ×1.5</span>}
                  {isMulti && <span className="tag">連続 {result.hitLabel}回{atkAbilityEff === "スキルリンク" ? "（スキルリンク確定）" : result.nHits === 0 ? (moveHits[0] === 2 && moveHits[1] === 5 ? "（確率 35/35/15/15%）" : "（確率）") : ""}</span>}
                  {critEff && <span className="tag">急所 ×1.5</span>}
                  {burn && isPhysical && <span className="tag">やけど ×0.5</span>}
                  {wallEff && !critEff && <span className="tag">壁 {isDouble ? "×2/3" : "×0.5"}</span>}
                  {isSpread && <span className="tag">範囲技 ×0.75</span>}
                  {isDouble && friendGuard && <span className="tag">フレンドガード ×0.75</span>}
                  {isDouble && fairyAuraDouble && effType === "フェアリー" && <span className="tag">フェアリーオーラ（味方） ×1.33</span>}
                  {helpingHand && <span className="tag">てだすけ 威力×1.5</span>}
                  {move.bp && <span className="tag">ボディプレス: 自分の防御で計算</span>}
                  {move.lk && <span className="tag">けたぐり/くさむすび: 相手の重さで威力{effPowerNoItem}</span>}
                  {weather !== "なし" && <span className="tag">天気: {weather}</span>}
                  {terrainNote && <span className="tag">フィールド: {terrainNote}</span>}
                  {condNote && <span className="tag">{move.name}: {condNote}</span>}
                  {atkAbNote && <span className="tag">特性: {atkAbNote}</span>}
                  {defAbActive && <span className="tag" style={moldBreaker ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>相手特性: {defAbilityRaw}{moldBreaker ? "（かたやぶりで無視）" : ""}</span>}
                  {atkIE.kind === "typeBoostAny" && <span className="tag">タイプ強化 威力×1.2</span>}
                  {atkIE.kind === "typeBoost" && atkIE.type === effType && <span className="tag">{atkItem} 威力×1.2（{atkIE.type}一致）</span>}
                  {atkIE.kind === "orb" && <span className="tag">いのちのたま ×1.3</span>}
                  {atkIE.kind === "band" && isPhysical && <span className="tag">ちからのハチマキ 威力×1.1</span>}
                  {atkIE.kind === "glasses" && !isPhysical && <span className="tag">ものしりメガネ 威力×1.1</span>}
                  {atkIE.kind === "obi" && result.eff > 1 && <span className="tag">たつじんのおび ×1.2（抜群）</span>}
                  {atkIE.kind === "metronome" && metroMul > 1 && <span className="tag">メトロノーム 威力×{metroMul.toFixed(1)}</span>}
                  {lightBall && <span className="tag">でんきだま: 攻撃×2</span>}
                  {atkIE.kind === "lightBall" && !lightBall && <span className="tag">でんきだま: ピカチュウ以外は無効</span>}
                  {resistBerryActive && result.eff > 1 && <span className="tag">{defIE.kind === "resistBerryAny" ? "抜群半減きのみ" : `${defItem}（${defIE.type}）`} ×0.5（抜群半減）</span>}
                </div>
                {resultExpanded && (
                  <div className="rolls">
                    {result.rolls.map((d, i) => (
                      <div className="roll" key={i}>{85 + i}%<b>{result.parentalBond ? d : result.nHits === 0 ? `${d}/発` : result.nHits > 1 ? `${d}×${result.nHits}` : d}</b></div>
                    ))}
                  </div>
                )}
              </div>
            {logOpen && (
              <div className="dock-log">
                <div className="dock-log-head">
                  <b>合算ログ</b>
                  <span className="dock-log-fixed">固定削り:
                    <span className="dlf-grp">設置
                      <button onClick={() => addFixedToLog(Math.max(1, Math.floor(result.HP * typeEffect("いわ", defTypes) / 8)), "ステロ", "hazard")}>ステロ</button>
                      <button onClick={() => addFixedToLog(chipGrounded ? Math.floor(result.HP / 8) : 0, "撒菱1", "hazard")} title="1枚=1/8">撒菱1</button>
                      <button onClick={() => addFixedToLog(chipGrounded ? Math.floor(result.HP / 6) : 0, "撒菱2", "hazard")} title="2枚=1/6">撒菱2</button>
                      <button onClick={() => addFixedToLog(chipGrounded ? Math.floor(result.HP / 4) : 0, "撒菱3", "hazard")} title="3枚=1/4">撒菱3</button>
                    </span>
                    <span className="dlf-grp">
                      <button className={sandOn ? "dlf-act" : ""} onClick={() => toggleChip(chipSandImmune ? 0 : sandN * Math.floor(result.HP / 16), `砂${sandN}T`, "sand")}>砂</button>
                      <label className="dlf-turn"><input type="number" min={1} max={16} value={sandTurns} onChange={(e) => setSandTurns(e.target.value)} />T</label>
                      <button className={orbOn ? "dlf-act" : ""} onClick={() => toggleChip(Math.max(1, Math.floor(result.HP / 10)), "いのちのたま", "orb")} title="いのちのたまの反動 1/10">珠</button>
                      {defAbility === "ばけのかわ" && <button className={dmgLog.some((e) => e.kind === "disguise") ? "dlf-act" : ""} onClick={() => toggleChip(Math.floor(result.HP / 8), "ばけのかわ(皮)", "disguise")} title="皮が剥がれた時のダメージ 1/8">化けの皮</button>}
                    </span>
                    <span className="dlf-grp">状態異常
                      <span className="dlf-seg">
                        <button className={curStatus === "poison" ? "dlf-on" : ""} onClick={() => toggleChip(statusN * Math.floor(result.HP / 8), `毒${statusN}T`, "status", "poison")}>毒</button>
                        <button className={curStatus === "toxic" ? "dlf-on" : ""} onClick={() => { let s = 0; for (let k = 1; k <= statusN; k++) s += Math.floor(result.HP * k / 16); toggleChip(s, `猛毒${statusN}T`, "status", "toxic"); }}>猛毒</button>
                        <button className={curStatus === "burn" ? "dlf-on" : ""} onClick={() => toggleChip(statusN * Math.floor(result.HP / 16), `やけど${statusN}T`, "status", "burn")}>やけど</button>
                      </span>
                      <label className="dlf-turn"><input type="number" min={1} max={16} value={statusTurns} onChange={(e) => setStatusTurns(e.target.value)} />T</label>
                    </span>
                    <span className="dlf-grp">
                      <input type="number" min={0} value={fixedDmg} onChange={(e) => setFixedDmg(e.target.value)} placeholder="数値" />
                      <button onClick={() => { addFixedToLog(Number(fixedDmg), `固定${fixedDmg}`, "manual"); setFixedDmg(""); }}>追加</button>
                    </span>
                  </span>
                  <button className="dock-log-clear" onClick={() => setDmgLog([])} disabled={dmgLog.length === 0}>全削除</button>
                </div>
                <div className="dock-log-list">
                  <label className="dock-log-item dll-current">
                    <input type="checkbox" checked={includeCurrent} onChange={() => setIncludeCurrent((v) => !v)} />
                    <span className="dll-label"><span className="dll-badge">現在</span>{attacker.name} {move.name}{isMulti ? `×${result.hitLabel}` : ""}→{defender.name}</span>
                    <span className="dll-dmg">{result.useMin}〜{result.useMax}</span>
                  </label>
                  {dmgLog.map((e) => (
                    <label key={e.id} className="dock-log-item">
                      <input type="checkbox" checked={e.checked} onChange={() => toggleLog(e.id)} />
                      <span className="dll-label">{e.label}</span>
                      <span className="dll-dmg">{e.fixed ? e.min : `${e.min}〜${e.max}`}</span>
                      <button className="dll-x" onClick={(ev) => { ev.preventDefault(); removeLog(e.id); }}>✕</button>
                    </label>
                  ))}
                </div>
                {dmgLog.length === 0 && <div className="dock-log-empty">「＋ 合算ログ」で他のダメージ（別ポケ・別の技・固定削り）を追加すると、<b>現在の計算と合算</b>してワンパン可否を判定します。</div>}
                {combined && (
                  <div className="dock-log-sum">
                    <span>合算（{combined.count}件）: <b>{combined.min}〜{combined.max}</b>（{combined.pctMin.toFixed(1)}〜{combined.pctMax.toFixed(1)}%）</span>
                    <span>対象HP {combined.hp}</span>
                    <span className="dll-ko">{combined.min >= combined.hp ? "✓ 確定で落とせる" : combined.max >= combined.hp ? `乱数 ${(combined.koP * 100).toFixed(1)}% で落とせる` : `届かない（最大${combined.max}）`}</span>
                    {combined.hpVaries && <span className="dll-warn">※対象HPが異なるログが混在</span>}
                  </div>
                )}
              </div>
            )}
            <div className="dock-head">
              <p className="vs">
                <b>{attacker.name}</b> の <span className="mv">{move.name}</span>{isMulti ? `（${result.hitLabel}回）` : ""} → <b>{defender.name}</b>
              </p>
              <div className="dock-btns">
                <button className="dock-toggle dock-add" onClick={addToLog}>＋ 合算ログ</button>
                <button className="dock-toggle" onClick={() => setLogOpen((v) => !v)}>合算ログ{dmgLog.length ? ` (${dmgLog.length})` : ""} {logOpen ? "▾" : "▴"}</button>
                <button className="dock-toggle" onClick={() => setResultExpanded((v) => !v)}>{resultExpanded ? "乱数 ▾" : "乱数 ▴"}</button>
              </div>
            </div>
            <div className="dmg-big">
              {showCombined && <span className="dmg-badge">合算{combined.count}件</span>}
              {critEff && <span className="dmg-badge crit-badge">💥 急所{alwaysCrit ? "(確定)" : ""}</span>}
              <span className="dmg-num">{dispMin} 〜 {dispMax}</span>
              <span className="dmg-pct">{dispPctMin.toFixed(1)}% 〜 {dispPctMax.toFixed(1)}%</span>
              <span className="ko" style={{ color: accent }}>
                {showCombined
                  ? (combined.min >= combined.hp ? "確定で落とせる" : combined.max >= combined.hp ? `乱数 ${(combined.koP * 100).toFixed(1)}%` : "落とせない")
                  : result.ko.label}
                {showCombined
                  ? <small>対象HP {combined.hp}{combined.hpVaries ? " ※HP混在" : ""}</small>
                  : (result.ko.detail && <small>KO率 {result.ko.detail}{result.ko.sure ? ` / 確定${result.ko.sure}発` : ""}</small>)}
              </span>
            </div>
            <div className="hpbar" role="img" aria-label={`残りHP ${dispRemainMin.toFixed(1)}%から${dispRemainMax.toFixed(1)}%`}>
              <div className="hp-remain" style={{ width: `${dispRemainMax}%`, background: dispBarColor }} />
              <div className="hp-band" style={{ left: `${dispRemainMin}%`, width: `${Math.max(0, dispRemainMax - dispRemainMin)}%` }} />
            </div>
            <div className="hp-caption">
              <span>残りHP {dispRemainMin.toFixed(1)}% 〜 {dispRemainMax.toFixed(1)}%{showCombined ? "（合算後）" : ""}</span>
              <span>最大HP {showCombined ? combined.hp : result.HP}</span>
            </div>
          </div>
        </section>
        </div>
        <div className="right-col">
          {/* 敵チーム(認識結果＋修正)を上に、スキャン操作(📷選出画面から相手を認識)は中で折りたたみ */}
          <RecognitionPanel
            pokemonData={Object.fromEntries(
              POKEMON
                .filter(p => !p.name.includes("(メガ") && !p.name.includes("(ブレード") && !p.name.includes("(マイティ"))
                .map(p => [p.name, p])
            )}
            onConfirm={setRecognizedTeam}
            onPick={(name) => { const idx = POKEMON.findIndex(p => p.name === name); if (idx >= 0) setEnemyIdx(idx); }}
            activeName={spdEnemy.name}
            obs={obs}
          />
        </div>
        </div>
        )}

        {view === "team" && (
        <div className="team-view">
          <TeamPanel pokemonData={POKEMON} moveData={M} itemOptions={ALL_ITEMS} hpStat={hpStat} stat={stat}
            onApply={applyMember} atkName={spdOwn.name} defName={spdEnemy.name} accent="var(--brand)" obs={obs}
            previewRef={obsPreviewRef} previewOn={obsPreviewOn} setPreviewOn={setObsPreviewOn} previewMsg={obsPreviewMsg}
            teams={myTeams.teams} names={myTeams.names} active={myTeams.active} setActive={myTeams.setActive} setMember={myTeams.setMember} setName={myTeams.setName} setTeam={myTeams.setTeam}
            teamsD={myTeams.teamsD} namesD={myTeams.namesD} activeD={myTeams.activeD} setActiveD={myTeams.setActiveD} setMemberD={myTeams.setMemberD} setNameD={myTeams.setNameD} setTeamD={myTeams.setTeamD}
            side={myTeams.side} setSide={myTeams.setSide}
            boxS={myTeams.boxS} boxD={myTeams.boxD} addToBoxS={myTeams.addToBoxS} addToBoxD={myTeams.addToBoxD}
            isDouble={isDouble} />
        </div>
        )}

        {view === "box" && (
        <div className="team-view">
          <BoxPanel
            boxS={myTeams.boxS} boxD={myTeams.boxD}
            addToBoxS={myTeams.addToBoxS} addToBoxD={myTeams.addToBoxD}
            removeFromBoxS={myTeams.removeFromBoxS} removeFromBoxD={myTeams.removeFromBoxD}
            updateBoxS={myTeams.updateBoxS} updateBoxD={myTeams.updateBoxD}
            pokemonData={POKEMON} moveData={M} itemOptions={ALL_ITEMS} hpStat={hpStat} stat={stat}
            isDouble={isDouble} />
        </div>
        )}

        {view === "obs" && (
        <div className="team-view">
          <ObsPanel obs={obs} previewRef={obsPreviewRef} previewOn={obsPreviewOn} setPreviewOn={setObsPreviewOn} previewMsg={obsPreviewMsg} />
        </div>
        )}

        {view === "feedback" && (
        <div className="team-view">
          <FeedbackPanel version={typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} />
        </div>
        )}

        {/* ===== ⚡すばやさ比較（モーダル） ===== */}
        {showSpeed && <SpeedCompare ownName={spdOwn.name} ownBaseS={spdOwn.base.s} ownMember={ownMember}
          enemyName={spdEnemy.name} enemyBaseS={spdEnemy.base.s} stat={stat} onClose={() => setShowSpeed(false)} />}

        {/* ===== 逆算2: 被ダメ実数値から相手の攻撃を推定（モーダル表示） ===== */}
        {showAtkInference && <div className="modal-backdrop modal-top" {...dismissOnBackdrop(() => setShowAtkInference(false))}>
        <section className="result modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setShowAtkInference(false)} aria-label="閉じる">✕</button>
          <p className="vs" style={{ marginBottom: 8 }}><b>攻撃力推定</b>　{attacker.name}の{move.name}で受けたダメージ（実数値）から、相手の{atkStatLabel}SP・性格補正を逆算します。防御側（自分）のステータスと場の状態は現在の設定を使用</p>
          <div className="row" style={{ marginTop: 0 }}>
            <div className="field">
              <span className="field-label">受けたダメージ（実数値）</span>
              <NumStepper value={dmgTaken} onChange={setDmgTaken} min={1} placeholder="例: 87" />
            </div>
          </div>
          <div className="row" style={{ marginTop: 6, alignItems: "center", gap: 8 }}>
            <span className="field-label">相手の持ち物</span>
            <div className="dlf-seg">
              <button className={(atkInferItem === "known" || isMega(attacker)) ? "dlf-on" : ""} disabled={isMega(attacker)} onClick={toggleInferKnown} title="タイプ強化系の持ち物ではないと判明した場合（いのちのたまであっても）。持ち物なしで逆算し、持ち物欄もなしにします。メガシンカは持ち物不可なので自動でオン">持ち物判明</button>
              <button className={atkInferItem === "orb" ? "dlf-on" : ""} disabled={isMega(attacker)} onClick={toggleInferOrb}>いのちのたま</button>
            </div>
            <span className="cond-note">{atkInferItem === "unknown" ? "不明: なし＋タイプ強化を両方表示" : atkInferItem === "orb" ? "いのちのたま(×1.3)で逆算（持ち物欄もいのちのたまに）" : "威力強化系ではないことが判明"}</span>
          </div>
          <label className="ck" style={{ marginTop: 4, fontSize: 11.5 }}>
            <input type="checkbox" checked={excludeDownNat} onChange={(e) => setExcludeDownNat(e.target.checked)} />
            下降補正(▼0.9)を除外
          </label>
          <p style={{ fontSize: 12, color: "#8a93a8", margin: "3px 0 0", lineHeight: 1.5 }}>※ 下降補正でしか一致しない場合は、除外していても自動で表示します。</p>
          {(atkInferItem === "unknown" || atkInferItem === "known") && !isMega(attacker) && (
            <label className="ck" style={{ marginTop: 2 }}>
              <input type="checkbox" checked={exclBandGlasses} onChange={(e) => setExclBandGlasses(e.target.checked)} />
              ちからのハチマキ&ものしりメガネ(×1.1)を除外
            </label>
          )}
          {atkInference?.error && <p className="stat-line" style={{ color: "#e8504a" }}>{atkInference.error}</p>}
          {atkInference?.sets && atkInference.sets.map((s, si) => {
            const cands = filterDownNat(s.candidates);
            const downOnly = excludeDownNat && cands.some((c) => c.nat === 0.9);
            return (
            <div key={si} style={{ marginTop: 8 }}>
              <p className="stat-line"><b>【{s.label}】</b> 候補 {cands.length}通り（SPは0/32のみ）。クリックで攻撃側に反映。</p>
              {downOnly && <p className="stat-line" style={{ color: "#e0b15a", fontSize: 12.5, margin: "2px 0 0" }}>※下降補正(▼0.9)でしか一致しないため、除外設定でも表示しています。</p>}
              {cands.length > 0 && (
                <div className="infer-table">
                  <div className="infer-row infer-head" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <span>{atkStatLabel}性格</span><span>{atkStatLabel}SP</span>
                  </div>
                  {cands.map((c, i) => (
                    <div className="infer-row infer-click" key={i} style={{ gridTemplateColumns: "1fr 1fr" }} onClick={() => {
                      setAtkSp(c.asp); setAtkNature(c.nat);
                      if (s.item) setAtkItem(s.item);
                      setShowAtkInference(false);
                    }}>
                      <span>{c.nat === 1.1 ? "▲1.1" : c.nat === 0.9 ? "▼0.9" : "無1.0"}</span>
                      <span>{c.asp}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </section>
        </div>}

        {/* ===== 逆算: 与ダメ%から相手の育成を推定（モーダル表示） ===== */}
        {showInference && <div className="modal-backdrop modal-top" {...dismissOnBackdrop(() => setShowInference(false))}>
        <section className="result modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setShowInference(false)} aria-label="閉じる">✕</button>
          <p className="vs" style={{ marginBottom: 8 }}><b>耐久力推定</b>　相手（{defender.name}）のHPバーを減らした%から、HP SP・{defPhys ? "防御" : "特防"}SP・性格補正を逆算します。回復アイテムが発動した場合は選択すると自動補正</p>
          <div className="row" style={{ marginTop: 0 }}>
            <div className="field">
              <span className="field-label">減らしたHP%（整数）</span>
              <NumStepper value={curHpPct} onChange={setCurHpPct} min={0} max={100} placeholder="例: 43" />
            </div>
            <div className="field">
              <span className="field-label">回復アイテム</span>
              <select className="rank" value={healItem} onChange={(e) => setHealItem(e.target.value)}>
                {["なし", "たべのこし", "オボンのみ"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <label className="ck" style={{ paddingBottom: 8, fontSize: 11.5 }}>
              <input type="checkbox" checked={excludeDownNat} onChange={(e) => setExcludeDownNat(e.target.checked)} />
              下降補正(▼0.9)を除外
            </label>
            <p style={{ flexBasis: "100%", fontSize: 12, color: "#8a93a8", margin: "0 0 4px", lineHeight: 1.5 }}>※ 下降補正でしか一致しない場合は、除外していても自動で表示します。</p>
          </div>
          {curHpPct !== "" && healItem !== "なし" && <p className="stat-line">{healItem}の回復分を自動補正して逆算します（回復量は候補のHP実数値ごとに厳密計算）。</p>}
          {inference?.error && <p className="stat-line" style={{ color: "#e8504a" }}>{inference.error}</p>}
          {inference?.candidates && (() => {
            if (inference.candidates.length === 0)
              return <p className="stat-line">一致する組み合わせがありません。攻撃側の設定（SP・性格・ランク等）を確認してください。</p>;
            const dispCands = filterDownNat(inference.candidates);
            const downOnly = excludeDownNat && dispCands.some((c) => c.nat === 0.9);
            return (
              <>
                <p className="stat-line">候補 {dispCands.length}通り（SPは0/32のみで探索 / 攻撃側は現在の設定を仮定）。クリックで防御側に反映。</p>
                {downOnly && <p className="stat-line" style={{ color: "#e0b15a", fontSize: 12.5, margin: "2px 0 0" }}>※下降補正(▼0.9)でしか一致しないため、除外設定でも表示しています。</p>}
                <div className="infer-table">
                  <div className="infer-row infer-head">
                    <span>{defPhys ? "防御" : "特防"}性格</span><span>HP SP</span><span>{defPhys ? "防御" : "特防"}SP</span>
                  </div>
                  {dispCands.map((c, i) => (
                    <div className="infer-row infer-click" key={i} onClick={() => {
                      setHpSp(c.hsp);
                      if (defPhys) { setBSp(c.dsp); setBNature(c.nat); }
                      else { setDSp(c.dsp); setDNature(c.nat); }
                      setShowInference(false); // 反映したら閉じる
                    }}>
                      <span>{c.nat === 1.1 ? "▲1.1" : c.nat === 0.9 ? "▼0.9" : "無1.0"}</span>
                      <span>{c.hsp}</span>
                      <span>{c.dsp}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </section>
        </div>}

        {confirmOff && <div className="modal-backdrop" {...dismissOnBackdrop(() => setConfirmOff(null))}>
          <section className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">特性「{confirmOff.ability}」をオフにしますか？</p>
            <p className="confirm-msg">この特性は条件を満たすと<b>自動で適用されています</b>。オフにすると、この特性の効果が計算に反映されなくなります。</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setConfirmOff(null)}>やめる</button>
              <button className="confirm-ok" onClick={() => { if (confirmOff.side === "atk") setAtkAutoOff(true); else setDefAutoOff(true); setConfirmOff(null); }}>オフにする</button>
            </div>
          </section>
        </div>}

        {warnModal && <div className="modal-backdrop" {...dismissOnBackdrop(() => setWarnModal(null))}>
          <section className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">{warnModal.title}</p>
            <p className="confirm-msg">{warnModal.msg}</p>
            <div className="confirm-actions">
              {warnModal.kind === "confirm" ? (<>
                <button className="confirm-cancel" onClick={() => setWarnModal(null)}>使わない</button>
                <button className="confirm-ok" onClick={() => { setAtkRank((r) => clampRank(r + warnModal.applyDelta)); setWarnModal(null); }}>使う</button>
              </>) : (
                <button className="confirm-ok" onClick={() => setWarnModal(null)}>OK</button>
              )}
            </div>
          </section>
        </div>}

        <footer>
          計算式: HP = floor((種族値×2+31)×50/100)+60+SP ／ 他 = floor((floor((種族値×2+31)×50/100)+5+SP)×性格)<br />
          ダメージ = floor(22×威力×A÷D÷50)+2 に 天気→急所→乱数(85〜100/100の16段階)→一致→相性→やけど→壁 の順で補正（各段階で切り捨て）。連続技は1ヒットごとに乱数を振って合計。<br />
          ステータス・技データは公式ゲーム『Pokémon Champions』に基づきます。習得技は攻撃技のみ・状況依存技は除く。非公式のファンメイドツールです。<br />
          技採用率データ: {MOVE_USAGE_META.regulationLabel}・{isDouble ? "ダブル" : "シングル"} ／ {fmtDataTime(MOVE_USAGE_META.updatedAt)}時点（{(isDouble ? Object.keys(MOVE_USAGE_DOUBLES).length : MOVE_USAGE_META.pokemonCount)}匹分）・データ提供: <a href={`https://pkmnchamps.com/ja/stats?regulation=${MOVE_USAGE_META.regulation}&format=${isDouble ? "doubles" : "singles"}&month=${MOVE_USAGE_META.month}`} target="_blank" rel="noopener noreferrer">PkmnChamps</a>
        </footer>
      </div>
    </div>
  );
}
