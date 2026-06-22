// public/disp-mega/ のメガシンカ表示アイコンを生成し、src/megaIcons.js（JP名→アイコンキーの対応）を書き出す。
// 仕組みは build-disp-icons.mjs と同じ: WikiDexのメガアイコン(128x128 透過PNG)を実機ギャラリー背景(GAL)に合成して64x64へ縮小。
// 素材: メガシンカ アイコン 1.zip / 2.zip を _work/mega/ に展開しておくこと（Mega-<英名>[_X/_Y]_icono_Champions.png）。
// 実行: node scripts/build-mega-icons.mjs --write   （プロジェクトルートから）
import { decodePNG, encodePNG } from "./png-codec.mjs";
import fs from "node:fs";

const GAL = [46, 44, 125], WRITE = process.argv.includes("--write");
const SRC = "_work/mega";

// 合成＋2x2縮小（build-disp-icons.mjs と同一）
function comp(d){const o=new Uint8Array(64*64*3);for(let y=0;y<64;y++)for(let x=0;x<64;x++){let R=0,G=0,B=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const sx=x*2+dx,sy=y*2+dy,p=(sy*128+sx)*4,a=d[p+3]/255;R+=d[p]*a+GAL[0]*(1-a);G+=d[p+1]*a+GAL[1]*(1-a);B+=d[p+2]*a+GAL[2]*(1-a);}const q=(y*64+x)*3;o[q]=R/4;o[q+1]=G/4;o[q+2]=B/4;}return o;}
function comp64rgba(d){const c=comp(d);const o=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++){o[i*4]=c[i*3];o[i*4+1]=c[i*3+1];o[i*4+2]=c[i*3+2];o[i*4+3]=255;}return o;}

// JP メガ名 → アイコン素材の英名ベース（_icono_Champions.png を除いた部分）。
// 標準メガはfetch-showdown-data.mjsのFORME_JA_NAMESと一致確認済み、Champions独自メガは英名で対応。
const MEGA = {
  "アブソル(メガ)":"Mega-Absol","ウツボット(メガ)":"Mega-Victreebel","エアームド(メガ)":"Mega-Skarmory",
  "エルレイド(メガ)":"Mega-Gallade","エンブオー(メガ)":"Mega-Emboar","オニゴーリ(メガ)":"Mega-Glalie",
  "オーダイル(メガ)":"Mega-Feraligatr","カイリュー(メガ)":"Mega-Dragonite","カイロス(メガ)":"Mega-Pinsir",
  "カエンジシ(メガ)":"Mega-Pyroar","カメックス(メガ)":"Mega-Blastoise","カラマネロ(メガ)":"Mega-Malamar",
  "ガブリアス(メガ)":"Mega-Garchomp","ガメノデス(メガ)":"Mega-Barbaracle","ガルーラ(メガ)":"Mega-Kangaskhan",
  "キラフロル(メガ)":"Mega-Glimmora","ギャラドス(メガ)":"Mega-Gyarados","クチート(メガ)":"Mega-Mawile",
  "ケケンカニ(メガ)":"Mega-Crabominable","ゲッコウガ(メガ)":"Mega-Greninja","ゲンガー(メガ)":"Mega-Gengar",
  "ゴルーグ(メガ)":"Mega-Golurk","サメハダー(メガ)":"Mega-Sharpedo","サーナイト(メガ)":"Mega-Gardevoir",
  "シビルドン(メガ)":"Mega-Eelektross","シャンデラ(メガ)":"Mega-Chandelure","ジジーロン(メガ)":"Mega-Drampa",
  "ジュカイン(メガ)":"Mega-Sceptile","ジュペッタ(メガ)":"Mega-Banette","スコヴィラン(メガ)":"Mega-Scovillain",
  "スターミー(メガ)":"Mega-Starmie","スピアー(メガ)":"Mega-Beedrill","ズルズキン(メガ)":"Mega-Scrafty",
  "タイレーツ(メガ)":"Mega-Falinks","タブンネ(メガ)":"Mega-Audino","チャーレム(メガ)":"Mega-Medicham",
  "チリーン(メガ)":"Mega-Chimecho","チルタリス(メガ)":"Mega-Altaria","デンリュウ(メガ)":"Mega-Ampharos",
  "ドラミドロ(メガ)":"Mega-Dragalge","ドリュウズ(メガ)":"Mega-Excadrill","ニャオニクス♀(メガ)":"Mega-Meowstic",
  "ニャオニクス♂(メガ)":"Mega-Meowstic","ハガネール(メガ)":"Mega-Steelix","ハッサム(メガ)":"Mega-Scizor",
  "バクーダ(メガ)":"Mega-Camerupt","バシャーモ(メガ)":"Mega-Blaziken","バンギラス(メガ)":"Mega-Tyranitar",
  "ピクシー(メガ)":"Mega-Clefable","ピジョット(メガ)":"Mega-Pidgeot","フシギバナ(メガ)":"Mega-Venusaur",
  "フラエッテ(メガ)":"Mega-Floette","フーディン(メガ)":"Mega-Alakazam","ブリガロン(メガ)":"Mega-Chesnaught",
  "プテラ(メガ)":"Mega-Aerodactyl","ヘラクロス(メガ)":"Mega-Heracross","ヘルガー(メガ)":"Mega-Houndoom",
  "ペンドラー(メガ)":"Mega-Scolipede","ボスゴドラ(メガ)":"Mega-Aggron","マフォクシー(メガ)":"Mega-Delphox",
  "ミミロップ(メガ)":"Mega-Lopunny","ムクホーク(メガ)":"Mega-Staraptor","メガニウム(メガ)":"Mega-Meganium",
  "メタグロス(メガ)":"Mega-Metagross","ヤドラン(メガ)":"Mega-Slowbro","ヤミラミ(メガ)":"Mega-Sableye",
  "ユキノオー(メガ)":"Mega-Abomasnow","ユキメノコ(メガ)":"Mega-Froslass","ライチュウ(メガX)":"Mega-Raichu_X",
  "ライチュウ(メガY)":"Mega-Raichu_Y","ライボルト(メガ)":"Mega-Manectric","ラグラージ(メガ)":"Mega-Swampert",
  "リザードン(メガX)":"Mega-Charizard_X","リザードン(メガY)":"Mega-Charizard_Y","ルカリオ(メガ)":"Mega-Lucario",
  "ルチャブル(メガ)":"Mega-Hawlucha",
};

// 検証: POKEMON_DATA の全メガ名が網羅されているか／素材PNGが存在するか
const pd = fs.readFileSync("src/pokedex-data.js", "utf8");
const dataMegas = [...pd.matchAll(/"name": "([^"]*\(メガ[^"]*\))"/g)].map(m => m[1]);
const missingInMap = dataMegas.filter(n => !(n in MEGA));
const extraInMap = Object.keys(MEGA).filter(n => !dataMegas.includes(n));
const missingFile = [...new Set(Object.values(MEGA))].filter(b => !fs.existsSync(`${SRC}/${b}_icono_Champions.png`));
console.log(`data megas: ${dataMegas.length}, map entries: ${Object.keys(MEGA).length}`);
if (missingInMap.length) console.log("!! POKEMON_DATAにあるがMEGA未定義:", missingInMap.join(", "));
if (extraInMap.length) console.log("!! MEGAにあるがPOKEMON_DATA未収録:", extraInMap.join(", "));
if (missingFile.length) console.log("!! 素材PNG不在:", missingFile.join(", "));
if (missingInMap.length || missingFile.length) { console.log("中止: 不整合あり"); process.exit(1); }

// キー = "Mega-" を除いた英名（ファイル名・公開パスに使用）
const key = b => b.replace(/^Mega-/, "");

if (WRITE) {
  fs.mkdirSync("public/disp-mega", { recursive: true });
  let w = 0;
  for (const b of [...new Set(Object.values(MEGA))]) {
    const rgba = comp64rgba(decodePNG(fs.readFileSync(`${SRC}/${b}_icono_Champions.png`)).data);
    fs.writeFileSync(`public/disp-mega/${key(b)}.png`, encodePNG(64, 64, rgba)); w++;
  }
  // megaIcons.js を書き出し
  const entries = Object.entries(MEGA).map(([jp, b]) => `  ${JSON.stringify(jp)}: ${JSON.stringify(key(b))},`).join("\n");
  const js = `// 自動生成 (scripts/build-mega-icons.mjs): メガシンカ JP名 → アイコンキー。アイコンは public/disp-mega/<キー>.png（64x64）。
// MEGA_FORMS: ベース種名 → そのメガ形態のJP名配列（リザードン→[(メガX),(メガY)]、メタグロス→[(メガ)]）。
export const MEGA_ICON = {
${entries}
};
export const megaIconPath = (name) => MEGA_ICON[name] ? \`/disp-mega/\${MEGA_ICON[name]}.png\` : null;
export const MEGA_FORMS = (() => {
  const m = {};
  for (const k of Object.keys(MEGA_ICON)) { const b = k.replace(/\\(メガ[XY]?\\)$/, ""); (m[b] = m[b] || []).push(k); }
  return m;
})();
`;
  fs.writeFileSync("src/megaIcons.js", js);
  console.log(`WROTE ${w} disp-mega icons + src/megaIcons.js (${Object.keys(MEGA).length} names)`);
} else {
  console.log("OK（検証のみ）。--write で生成。");
}
