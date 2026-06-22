// 持ち物の効果データ。実物アイテム名で登録し、ダメ計では「効果のあるものだけ」「特定タイプの時だけ」反映する。
// チーム登録のアイコン認識(item-templates)が返す名前＝ここのキー名で揃える。

// タイプ強化アイテム: そのタイプの技の威力×1.2（攻撃側）
export const TYPE_BOOST_ITEMS = {
  "シルクのスカーフ": "ノーマル", "もくたん": "ほのお", "しんぴのしずく": "みず", "じしゃく": "でんき",
  "きせきのタネ": "くさ", "とけないこおり": "こおり", "くろおび": "かくとう", "どくバリ": "どく",
  "やわらかいすな": "じめん", "するどいくちばし": "ひこう", "まがったスプーン": "エスパー", "ぎんのこな": "むし",
  "かたいいし": "いわ", "のろいのおふだ": "ゴースト", "りゅうのキバ": "ドラゴン", "くろいメガネ": "あく",
  "メタルコート": "はがね", "ようせいのはね": "フェアリー",
};

// 半減きのみ: そのタイプの「効果抜群」技を受けた時 ×0.5（防御側）。ノーマルは抜群が無いので存在しない。
export const RESIST_BERRIES = {
  "オッカのみ": "ほのお", "イトケのみ": "みず", "ソクノのみ": "でんき", "リンドのみ": "くさ",
  "ヤチェのみ": "こおり", "ヨプのみ": "かくとう", "ビアーのみ": "どく", "シュカのみ": "じめん",
  "バコウのみ": "ひこう", "ウタンのみ": "エスパー", "タンガのみ": "むし", "ヨロギのみ": "いわ",
  "カシブのみ": "ゴースト", "ハバンのみ": "ドラゴン", "ナモのみ": "あく", "ホズのみ": "はがね",
  "ロゼルのみ": "フェアリー",
};

// 攻撃側で威力に効く既存の汎用アイテム（手動選択用）
export const ATK_GENERIC = ["タイプ強化(×1.2)", "いのちのたま", "ちからのハチマキ", "ものしりメガネ", "たつじんのおび", "メトロノーム", "でんきだま"];
export const DEF_GENERIC = ["抜群半減きのみ"];

// その他のきのみ(ダメ計に影響しない＝名前のみ登録)
export const OTHER_BERRIES = ["オボンのみ", "ラムのみ", "フィラのみ", "ウイのみ", "マゴのみ", "バンジのみ", "イアのみ", "チーゴのみ", "ヒメリのみ", "オレンのみ", "モモンのみ", "キーのみ", "クラボのみ", "カゴのみ", "ナナシのみ", "リュガのみ", "カムラのみ", "ヤタピのみ", "ズアのみ", "サンのみ", "スターのみ", "ミクルのみ", "イバンのみ", "ジャポのみ", "レンブのみ", "ナゾのみ", "アッキのみ", "タラプのみ"];
// その他の持ち物(ダメ計に効くものは itemEffect で個別判定、効かないものは(影響なし)表示)
export const MISC_ITEMS = ["きあいのタスキ", "きあいのハチマキ", "こだわりスカーフ", "こだわりハチマキ", "こだわりメガネ", "とつげきチョッキ", "たべのこし", "しんかのきせき", "しろいハーブ", "メンタルハーブ", "ひかりのこな", "おうじゃのしるし", "かいがらのすず", "せんせいのツメ", "ふうせん", "あつぞこブーツ", "だっしゅつボタン", "レッドカード", "ゴツゴツメット", "くろいヘドロ", "しめったいわ", "さらさらいわ", "つめたいいわ", "あついいわ", "ひかりのねんど", "だっしゅつパック", "ぼうじんゴーグル", "とくせいガード", "メトロノーム", "こうかくレンズ", "ピントレンズ"];

// 全持ち物名（OCR候補用）。メガストーンはTeamPanelでpokemonDataから動的生成して結合する。
export const ALL_ITEM_NAMES = [...new Set([
  ...Object.keys(TYPE_BOOST_ITEMS), ...Object.keys(RESIST_BERRIES), ...OTHER_BERRIES, ...MISC_ITEMS,
  "いのちのたま", "でんきだま", "ちからのハチマキ", "ものしりメガネ", "たつじんのおび", "メガストーン(共通)",
])];

// メガストーンか判定（OCRで読んだ実名を「メガストーン(共通)」に寄せる用）
export const isMegaStone = (name) => /ナイト[XY]?$/.test(name || "") || name === "メガストーン(共通)";

// 持ち物のダメ計効果を返す。side: "atk"=攻撃側 / "def"=防御側。
// kind: typeBoost / typeBoostAny / orb / band / glasses / obi / metronome / lightBall / resistBerry / resistBerryAny / none
export function itemEffect(name, side) {
  if (!name || name === "なし") return { kind: "none" };
  if (side === "atk") {
    if (TYPE_BOOST_ITEMS[name]) return { kind: "typeBoost", type: TYPE_BOOST_ITEMS[name] };
    switch (name) {
      case "タイプ強化(×1.2)": return { kind: "typeBoostAny" };
      case "いのちのたま": case "命の珠": return { kind: "orb" }; // 命の珠は旧名（過去に手動選択した登録データの互換）。ゲーム表記＝いのちのたま

      case "ちからのハチマキ": return { kind: "band" };
      case "ものしりメガネ": return { kind: "glasses" };
      case "たつじんのおび": return { kind: "obi" };
      case "メトロノーム": return { kind: "metronome" };
      case "でんきだま": return { kind: "lightBall" };
    }
    return { kind: "none" };
  }
  if (side === "def") {
    if (RESIST_BERRIES[name]) return { kind: "resistBerry", type: RESIST_BERRIES[name] };
    if (name === "抜群半減きのみ") return { kind: "resistBerryAny" };
    return { kind: "none" };
  }
  return { kind: "none" };
}

// ドロップダウン等の表示名。効果が無い側では「(影響なし)」を付ける。
export function itemLabel(name, side) {
  if (!name || name === "なし") return "なし";
  if (isMegaStone(name)) return `${name}（メガ進化）`; // メガ石は識別名のまま＋メガ印（メガ進化はポケモンをメガ形態で選ぶ）
  const e = itemEffect(name, side);
  if (e.kind === "none") return `${name}(影響なし)`;
  if (e.kind === "typeBoost") return `${name}（${e.type}技×1.2）`;
  if (e.kind === "resistBerry") return `${name}（${e.type}抜群×0.5）`;
  return name;
}
