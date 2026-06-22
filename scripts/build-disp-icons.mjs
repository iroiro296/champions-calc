// public/disp/ の表示用アイコン(WikiDex綺麗版)を生成する。判定用 public/sprites/ とは別物。
//   - sprites/ = 実機ギャラリーのスクショ切り出し(判定に忠実だが上下左右にズレあり)。マッチングはこちら。
//   - disp/    = WikiDex公式アイコン(整った枠)。スロットのサムネイル表示はこちら(RecognitionPanel.jsx)。
// 仕組み: 色違いスプライト(sprites/235-447)は色違いzip由来なので、色違いファイルを色違いスプライトに
//   画像一致(同一ソース=near-exact)させ「ファイル名→JP名」を復元(英名表を介さずに対応付け)。通常色ファイルは
//   同じbase名でJP名→index対応。色違い未収録の22匹＋♀フォルム(_hembra)はMANUALで英名対応。全128→64合成。
// 前提(再生成時): 下記zipを展開しておくこと(ユーザーのDownloadsにある):
//   unzip -o -j 通常色1.zip 通常色2.zip -d _work/nc   (WikiDex通常色 284枚)
//   unzip -o -j 色違い1.zip 色違い2.zip -d _work/vc   (WikiDex色違い 261枚)
// 実行: node scripts/build-disp-icons.mjs --write   (プロジェクトルートから)
import { decodePNG, encodePNG } from "./png-codec.mjs";
import fs from "node:fs";

const GAL=[46,44,125], WRITE = process.argv.includes("--write");
const NAMES=[...fs.readFileSync("src/spriteNames.js","utf8").matchAll(/"([^"]+)"/g)].map(m=>m[1]);

function comp(d){const o=new Uint8Array(64*64*3);for(let y=0;y<64;y++)for(let x=0;x<64;x++){let R=0,G=0,B=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const sx=x*2+dx,sy=y*2+dy,p=(sy*128+sx)*4,a=d[p+3]/255;R+=d[p]*a+GAL[0]*(1-a);G+=d[p+1]*a+GAL[1]*(1-a);B+=d[p+2]*a+GAL[2]*(1-a);}const q=(y*64+x)*3;o[q]=R/4;o[q+1]=G/4;o[q+2]=B/4;}return o;}
function comp64rgba(d){const c=comp(d);const o=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++){o[i*4]=c[i*3];o[i*4+1]=c[i*3+1];o[i*4+2]=c[i*3+2];o[i*4+3]=255;}return o;}
function srgb(d){const o=new Uint8Array(64*64*3);for(let i=0;i<64*64;i++){o[i*3]=d[i*4];o[i*3+1]=d[i*4+1];o[i*3+2]=d[i*4+2];}return o;}
function ssd(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return s/(a.length/3);}
const base = f => f.replace(/_icono_Champions(_variocolor)?\.png$/,"");

// ---- 1. anchor: variocolor file -> shiny sprite index -> JP name ----
const vcFiles=fs.readdirSync("_work/vc").filter(x=>x.endsWith(".png")).sort();
const vc=vcFiles.map(f=>({f,base:base(f),rgb:comp(decodePNG(fs.readFileSync("_work/vc/"+f)).data)}));
const base2jp={}; const anchorReport=[];
for(let k=235;k<=447;k++){
  const sp=srgb(decodePNG(fs.readFileSync(`public/sprites/pokemon_${k}.png`)).data);
  let b0=null,b1=1e9,bf=null; for(const v of vc){const d=ssd(sp,v.rgb); if(d<b1){b1=d;bf=v;}}
  // second best for margin
  let s2=1e9; for(const v of vc){if(v===bf)continue;const d=ssd(sp,v.rgb);if(d<s2)s2=d;}
  base2jp[bf.base]=NAMES[k];
  anchorReport.push({k,jp:NAMES[k],base:bf.base,ssd:Math.round(b1),m:Math.round(s2)});
}
const weakAnchor=anchorReport.filter(a=>a.ssd>2000||a.m-a.ssd<500);

// ---- 2. map normal files -> normal index via base2jp ----
const ncFiles=fs.readdirSync("_work/nc").filter(x=>x.endsWith(".png")).sort();
const jp2idx={}; for(let i=0;i<235;i++) if(!(NAMES[i] in jp2idx)) jp2idx[NAMES[i]]=i;
const idxToFile={}; const unusedNc=[];
for(const f of ncFiles){const b=base(f); const jp=base2jp[b]; if(jp==null){unusedNc.push(f);continue;} const idx=jp2idx[jp]; if(idx==null){unusedNc.push(f);continue;} idxToFile[idx]=f;}
// ---- 2ب. 色違い無し22匹＋♀フォルム(=_hembra接尾辞でアンカー外)は英名で手動対応 ----
const MANUAL = {
  56:"Sceptile_icono_Champions.png", 57:"Blaziken_icono_Champions.png", 58:"Swampert_icono_Champions.png",
  62:"Mawile_icono_Champions.png", 76:"Metagross_icono_Champions.png", 80:"Staraptor_icono_Champions.png",
  115:"Musharna_icono_Champions.png", 119:"Scolipede_icono_Champions.png", 122:"Scrafty_icono_Champions.png",
  130:"Eelektross_icono_Champions.png", 144:"Pyroar_icono_Champions.png", 150:"Meowstic_icono_Champions_hembra.png",
  154:"Malamar_icono_Champions.png", 155:"Barbaracle_icono_Champions.png", 156:"Dragalge_icono_Champions.png",
  189:"Oranguru_icono_Champions.png", 190:"Passimian_icono_Champions.png", 200:"Grimmsnarl_icono_Champions.png",
  204:"Falinks_icono_Champions.png", 210:"Basculegion_icono_Champions_hembra.png", 212:"Overqwil_icono_Champions.png",
  227:"Houndstone_icono_Champions.png", 228:"Annihilape_icono_Champions.png", 231:"Gholdengo_icono_Champions.png",
};
const missing=[];
for(const [idx,f] of Object.entries(MANUAL)){ if(!fs.existsSync("_work/nc/"+f)){missing.push(f);continue;} idxToFile[idx]=f; }
if(missing.length) console.log("!! MANUAL FILES MISSING:",missing.join(", "));

const covered=Object.keys(idxToFile).map(Number);
const uncovered=[]; for(let i=0;i<235;i++) if(!(i in idxToFile)) uncovered.push(i);

console.log("anchor pairs:",anchorReport.length,"weak:",weakAnchor.length);
if(weakAnchor.length){console.log("WEAK ANCHORS:");for(const a of weakAnchor)console.log("  ",a.jp,"ssd="+a.ssd,"margin="+(a.m-a.ssd),a.base.slice(0,30));}
console.log("\nnormal covered:",covered.length,"/235  uncovered:",uncovered.length);
console.log("UNCOVERED indices/names:"); console.log(uncovered.map(i=>i+":"+NAMES[i]).join("  "));
console.log("\nUNUSED normal files (",unusedNc.length,"):"); console.log(unusedNc.map(f=>base(f)).join("  "));

if(WRITE){
  fs.mkdirSync("public/disp",{recursive:true});
  let w=0;
  for(const [idx,f] of Object.entries(idxToFile)){
    const rgba=comp64rgba(decodePNG(fs.readFileSync("_work/nc/"+f)).data);
    fs.writeFileSync(`public/disp/pokemon_${String(idx).padStart(3,"0")}.png`, encodePNG(64,64,rgba)); w++;
  }
  // shiny 235-447: copy existing sprites (already wikidex)
  for(let k=235;k<=447;k++) fs.copyFileSync(`public/sprites/pokemon_${k}.png`,`public/disp/pokemon_${k}.png`);
  console.log("\nWROTE",w,"normal +",213,"shiny disp images");
}
fs.writeFileSync("_work/map.json",JSON.stringify({idxToFile,uncovered:uncovered.map(i=>({i,jp:NAMES[i]})),unusedNc:unusedNc.map(base)},null,1));
