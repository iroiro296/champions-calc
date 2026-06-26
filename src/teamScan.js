// チーム編成/ステータス画面(1920x1080)から「右パネルの選択ポケモン」の構成を読む。
// SP=オレンジバー長, 性格=赤(上昇)/シアン(下降)矢印, 技/特性=1文字ずつ切って辞書(全技/全特性)と照合。
// カナテンプレは配信用の champKanaData.js(共有) ＋ localStorage 'champKana'(各自の学習) をマージして使う。
// 実機約50枚で SP/性格=100%、技 423/471・特性 179/197 が読める状態で検証。
import { CHAMP_KANA_PACKED } from "./champKanaData.js";
import { CHAMP_DIGITS_PACKED } from "./champDigitsData.js";
import { CHAMP_DIGITS_NORM } from "./champDigitsNorm.js";

// ---- 右パネル ステータス ----
const STAT_ROWS = [324, 372, 420, 468, 516, 564];
const STAT_KEYS = ["h", "a", "b", "c", "d", "s"];
// SPバー: 実機計測で 左端x1644 〜 満タン(SP32)右端x1786 ＝ 全長142px。X1は満タンを取りこぼさぬよう余裕。
const BAR_X0 = 1644, BAR_X1 = 1792, BAR_FULL_PX = 142, SP_MAX = 32;
const ARROW_X0 = 1512, ARROW_X1 = 1562;
const isOrange = (r, g, b) => r > 175 && g > 85 && g < 190 && b < 120 && (r - b) > 95 && (r - g) > 25;
// SP=1の極細フィル(幅≈4px)は彩度の落ちた暖色(rgb≈170,125,115)で描画され、強いisOrangeを通らない＝0読みになる。
// これはバー左端18px内のスリバー救済専用の緩い判定。空バーの寒色(rgb≈49,54,98 / b>r)は確実に除外する。
const isWarmFill = (r, g, b) => r > 120 && (r - b) > 30 && (r - g) > 20;
// 性格上昇(▲▲)の矢印は純赤ではなく「ローズ/ピンク」(例 rgb(158,62,93)/(133,75,93)/(147,54,78))で描画される。
// 旧条件(r>150 & g<118 & r-g>70 & r-b>40)はこの淡い赤を殆ど弾き、概要ステ画面の小さな▲で検出漏れ(画素3個)していた。
// 緩めて「赤が支配的(r>120, r-g>45, r>b, gは低め)」で拾う。b>25でオレンジSPバー(b≈0でisUp条件に合致)を確実に除外。
const isUp     = (r, g, b) => r > 120 && (r - g) > 45 && r > b && g < 130 && b > 25;
const isDown   = (r, g, b) => g > 135 && b > 155 && (g - r) > 45 && (b - r) > 55;

// ---- 技/特性 行レイアウト ----
const MOVE_ROWS = [640, 700, 760, 819], ABIL_ROW = 890;

// ---- ポケモン名(ヘッダー)用 まるごとテンプレ照合（プロポーショナルなので1文字化しない） ----
const MW = 110, MH = 14, NBYTES = Math.ceil(MW * MH / 8);
const TEXT_THRESH = 130;
const TPL_KEY = "champTextTpl";

let _main, _mctx, _tmp, _tctx;
function ensure() {
  if (_main) return;
  _main = document.createElement("canvas"); _main.width = 1920; _main.height = 1080; _mctx = _main.getContext("2d", { willReadFrequently: true });
  _tmp = document.createElement("canvas"); _tmp.width = MW; _tmp.height = MH; _tctx = _tmp.getContext("2d", { willReadFrequently: true });
}

const b64ToBytes = (s) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const bytesToB64 = (b) => btoa(String.fromCharCode.apply(null, b));

export function loadTextTemplates() {
  try {
    const r = JSON.parse(localStorage.getItem(TPL_KEY)); if (!r) return { w: MW, h: MH, moves: {}, abils: {}, names: {} };
    const dec = (o) => { const m = {}; for (const k in o) m[k] = b64ToBytes(o[k]); return m; };
    return { w: r.w || MW, h: r.h || MH, moves: dec(r.moves || {}), abils: dec(r.abils || {}), names: dec(r.names || {}) };
  } catch { return { w: MW, h: MH, moves: {}, abils: {}, names: {} }; }
}
export function saveTextTemplate(kind, name, bytes) {
  try {
    const r = JSON.parse(localStorage.getItem(TPL_KEY)) || { w: MW, h: MH, moves: {}, abils: {}, names: {} };
    const cat = kind === "ability" ? "abils" : kind === "name" ? "names" : "moves";
    r[cat] = r[cat] || {}; r[cat][name] = bytesToB64(bytes);
    localStorage.setItem(TPL_KEY, JSON.stringify(r));
  } catch {}
}

// 白文字(低彩度・高輝度)の外接矩形（x0,y0,x1,y1,w,h）
function bboxOf(d, yc, xa, xb, thr = 185) {
  // thr=明度しきい値。概要画面は半透明のスロット番号(1〜6)が右下に薄く重なる(明度≤188)ので、純白文字(254)だけ拾う高threで枠汚染を防ぐ。
  const txt = (x, y) => { const o = (y * 1920 + x) * 4; return d[o] > thr && d[o + 1] > thr && d[o + 2] > thr && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 42; };
  // yc±26 窓の各行の白画素数を数え、白行が連続する「ラン(塊)」に分けて、総白画素が最大のラン＝文字本体だけに縦範囲を絞る。
  // 明るい取り込みではセル下端の白い枠線やスロット番号の縁(純白なのでthrでは消せない)が窓に紛れ、bboxが縦横に膨らんで
  // 文字数推定(W/L)が壊れ技が読めなくなっていた。枠線は薄い別ランなので、最大ランに絞れば文字帯だけが残る。
  const yTop = yc - 26, yBot = yc + 26, rc = [];
  for (let y = yTop; y <= yBot; y++) { let c = 0; for (let x = xa; x <= xb; x++) if (txt(x, y)) c++; rc.push(c); }
  let bestSum = 0, bestA = -1, bestB = -1, rs = -1, rsum = 0;
  for (let i = 0; i <= rc.length; i++) {
    const on = i < rc.length && rc[i] >= 2;
    if (on) { if (rs < 0) { rs = i; rsum = 0; } rsum += rc[i]; }
    else if (rs >= 0) { if (rsum > bestSum) { bestSum = rsum; bestA = rs; bestB = i - 1; } rs = -1; }
  }
  if (bestA < 0) return null;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = yTop + bestA; y <= yTop + bestB; y++) for (let x = xa; x <= xb; x++) if (txt(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function normMask(b) {
  _tctx.clearRect(0, 0, MW, MH);
  const W = Math.max(1, Math.min(MW, Math.round(b.w * MH / b.h)));
  _tctx.imageSmoothingEnabled = true;
  _tctx.drawImage(_main, b.x0, b.y0, b.w, b.h, 0, 0, W, MH);
  const dd = _tctx.getImageData(0, 0, MW, MH).data;
  const by = new Uint8Array(NBYTES);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (x < W && (dd[(y * MW + x) * 4] + dd[(y * MW + x) * 4 + 1] + dd[(y * MW + x) * 4 + 2]) / 3 > 140) { const idx = y * MW + x; by[idx >> 3] |= (1 << (idx & 7)); }
  }
  return by;
}
function hamming(a, b) { let h = 0; for (let i = 0; i < NBYTES; i++) { let x = a[i] ^ b[i]; while (x) { h += x & 1; x >>= 1; } } return h; }
function matchTable(bytes, table) { let best = 1e9, bn = null; for (const nm in table) { const h = hamming(bytes, table[nm]); if (h < best) { best = h; bn = nm; } } return { name: bn, dist: best }; }

// ---- カナ1文字OCR＋辞書照合 ----
const KW = 20, KH = 22, KNB = Math.ceil(KW * KH / 8);
// 採用条件: 平均ハミングが小さい(クリーン) か、2位に対して明確に勝っている(辞書照合は正解が必ず大差で勝つ)。
// 描画フレーム差で絶対値は揺れるので、絶対値だけでなく「差」で判定する。該当が辞書に無い時は僅差/全体高値→不採用。
const KANA_AVG_CLEAN = 42;   // これ以下なら無条件採用
const KANA_AVG_SOFT  = 78;   // 大差勝ちならここまで許容(描画フレーム差で絶対値が上振れる)
const KANA_GAP_MIN   = 18;   // 2位平均 − 1位平均（正解が在れば2位は明確に悪い）
const KANA_MARGIN    = 1.35; // 2位平均 ÷ 1位平均
let _kc, _kcx;
function ensureKana() { if (_kc) return; _kc = document.createElement("canvas"); _kc.width = KW; _kc.height = KH; _kcx = _kc.getContext("2d", { willReadFrequently: true }); }

// 配信テンプレ(共有・packed文字列) ＋ localStorage(各自の学習) をマージ。両方を候補に積む。
function parsePacked(s) {
  const out = {}; if (!s) return out;
  for (const part of s.split(";")) { const i = part.indexOf("|"); if (i < 0) continue; out[part.slice(0, i)] = part.slice(i + 1).split(",").filter(Boolean).map(b64ToBytes); }
  return out;
}
export function loadKana() {
  const merged = parsePacked(CHAMP_KANA_PACKED);
  try { const r = JSON.parse(localStorage.getItem("champKana")); if (r && r.kana) for (const ch in r.kana) merged[ch] = (merged[ch] || []).concat(r.kana[ch].map(b64ToBytes)); } catch {}
  return { kana: merged };
}
export function saveKana(ch, bytes) {
  try { const r = JSON.parse(localStorage.getItem("champKana")) || { w: KW, h: KH, kana: {} }; (r.kana[ch] = r.kana[ch] || []).push(bytesToB64(bytes)); if (r.kana[ch].length > 10) r.kana[ch].shift(); localStorage.setItem("champKana", JSON.stringify(r)); } catch {}
}
export function kanaCount() { const k = loadKana().kana; return Object.keys(k).length; }

function cellMaskGrid(gx, y0, y1, pitch, thresh = 150) {
  ensureKana(); _kcx.clearRect(0, 0, KW, KH); _kcx.imageSmoothingEnabled = true;
  _kcx.drawImage(_main, gx, y0, pitch, y1 - y0 + 1, 0, 0, KW, KH);
  const dd = _kcx.getImageData(0, 0, KW, KH).data; const by = new Uint8Array(KNB);
  for (let i = 0; i < KW * KH; i++) if ((dd[i * 4] + dd[i * 4 + 1] + dd[i * 4 + 2]) / 3 > thresh) by[i >> 3] |= (1 << (i & 7));
  return by;
}
const _POP = new Uint8Array(256); for (let _i = 0; _i < 256; _i++) _POP[_i] = (_i & 1) + _POP[_i >> 1]; // バイトのpopcount表（ハミングの内ループ高速化）
const hammingK = (a, b) => { let h = 0; for (let i = 0; i < KNB; i++) h += _POP[a[i] ^ b[i]]; return h; };

// 複数の(原点,送り)候補をまとめて1枚の縦長キャンバスに描画→getImageData1回で全部読む。
// readByDictの原点×送り探索はcombo毎にcellsRow(=readback)していてGPU→CPU転送が律速だった→combo毎readbackを1回に畳んで概要スキャンを大幅高速化。
let _bc, _bcx;
function cellsRowBatch(combos, L, y0, y1, thresh = 150) {
  const RW = KW * L, RH = KH * combos.length;
  if (!_bc) { _bc = document.createElement("canvas"); _bc.width = KW * 12; _bc.height = KH * 180; _bcx = _bc.getContext("2d", { willReadFrequently: true }); }
  if (_bc.width < RW || _bc.height < RH) { _bc.width = Math.max(_bc.width, RW); _bc.height = Math.max(_bc.height, RH); }
  _bcx.imageSmoothingEnabled = true; // キャンバスリサイズで状態が戻るので毎回セット
  _bcx.clearRect(0, 0, RW, RH);
  for (let ci = 0; ci < combos.length; ci++) { const o = combos[ci].origin, p = combos[ci].pitch; for (let i = 0; i < L; i++) _bcx.drawImage(_main, o + i * p, y0, p, y1 - y0 + 1, i * KW, ci * KH, KW, KH); }
  const dd = _bcx.getImageData(0, 0, RW, RH).data, out = [];
  for (let ci = 0; ci < combos.length; ci++) {
    const row = [];
    for (let i = 0; i < L; i++) { const by = new Uint8Array(KNB); for (let y = 0; y < KH; y++) for (let x = 0; x < KW; x++) { const px = ((ci * KH + y) * RW + i * KW + x) * 4; if ((dd[px] + dd[px + 1] + dd[px + 2]) / 3 > thresh) { const idx = y * KW + x; by[idx >> 3] |= (1 << (idx & 7)); } } row.push(by); }
    out.push(row);
  }
  return out;
}

// 候補名(辞書)から最も合う名前を返す。ゲームの技/特性フォントはプロポーショナル(1字送りが≈24.6〜27pxで揺れる)
// ため、固定ピッチだと長い名前ほどセルが字からズレる。実テキスト幅から候補文字数ごとに送りを推定し、原点・送りを
// 微調整して最良アラインメントで照合する。信頼度(平均ハミング)＋2位との差で足切り。
function readByDict(d, yc, xa, xb, candidates, kana, pp) {
  pp = pp || { wlo: 21.5, whi: 28.5, plo: 20, phi: 30, tail: 18 }; // 1字送り/ピッチの想定（既定=ステ画面の大きめ文字。概要画面は小さめなので呼び側で渡す）
  const b = bboxOf(d, yc, xa, xb, pp.thr || 185); if (!b) return { name: null, cells: null }; // pp.thr=高明度で透かし番号を除外（概要画面用）
  const W = b.x1 - b.x0 + 1;
  const dch = (cell, ch) => { const ts = kana[ch]; if (!ts || !ts.length) return null; let mn = 1e9; for (const t of ts) { const h = hammingK(cell, t); if (h < mn) mn = h; } return mn; };
  // テキスト幅から妥当な文字数だけ試す（実測の1字送りは≈24〜26pxなので、末尾字幅も込みで W/L≈21.5〜28.5 に収まる長さのみ）
  const lens = new Set();
  for (const c of candidates) { const L = [...c].length; if (L > 0 && W / L >= pp.wlo && W / L <= pp.whi) lens.add(L); }
  const candAvg = new Map(); let bestAvg = 1e9, bestName = null, bestCells = null;
  for (const L of lens) {
    const lenCands = candidates.filter((c) => [...c].length === L); if (!lenCands.length) continue;
    const center = L > 1 ? (W - pp.tail) / (L - 1) : W; // 末尾字の字幅想定で1字送りを推定
    const ps = pp.ps || 1.2; // ピッチ探索の半幅（既定±1.2＝ステ画面。概要画面は推定が甘いので呼び側で広げる）
    const combos = [];
    for (let origin = b.x0 - (pp.olo || 8); origin <= b.x0 + (pp.ohi || 1); origin++)
      for (let delta = -ps; delta <= ps + 1e-9; delta += 0.4) combos.push({ origin, pitch: Math.max(pp.plo, Math.min(pp.phi, center + delta)) });
    // 中央(原点≈bbox左端・送り≈推定値)に近い順に並べる＝最良アラインメントを早く見つけて以降の早期打ち切りを効かせる（結果は順序非依存で不変）。
    combos.sort((p, q) => (Math.abs(p.origin - b.x0) + Math.abs(p.pitch - center)) - (Math.abs(q.origin - b.x0) + Math.abs(q.pitch - center)));
    const allCells = cellsRowBatch(combos, L, b.y0, b.y1); // 原点×送り全候補を1回のreadbackでまとめてマスク化
    const lenCandsA = lenCands.map((c) => [...c]); // 文字配列を事前展開（combo毎の再spreadを避ける）
    for (let ci = 0; ci < combos.length; ci++) {
      const cells = allCells[ci];
      const cache = cells.map(() => ({}));
      const lim = bestAvg * 1.7 * L; // 早期打ち切り閾値: 現状ベストの1.7倍を超える候補は採用にも2位(差/比ガード)にも絡まない＝結果不変で計算だけ削る
      for (let ck = 0; ck < lenCands.length; ck++) {
        const a = lenCandsA[ck]; let s = 0, ok = true;
        for (let i = 0; i < L; i++) { let v = cache[i][a[i]]; if (v === undefined) { v = dch(cells[i], a[i]); cache[i][a[i]] = v; } if (v === null) { ok = false; break; } s += v; if (s > lim) { ok = false; break; } }
        if (!ok) continue;
        const c = lenCands[ck], avg = s / L;
        if (avg < (candAvg.get(c) ?? 1e9)) candAvg.set(c, avg);
        if (avg < bestAvg) { bestAvg = avg; bestName = c; bestCells = cells; }
      }
    }
  }
  if (!bestName) return { name: null, cells: bestCells, conf: null };
  let secAvg = 1e9; for (const [c, av] of candAvg) if (c !== bestName && av < secAvg) secAvg = av; // 2位は別候補の最良平均
  // 概要画面は文字が小さく描画ブレが大きいので pp.soft で大差勝ち許容上限を引き上げ可。差/比のガードも pp.gap/pp.margin で緩められる
  // （持ち物は「○○のみ」等で似た候補が密集し、小さい文字だと2位が近くなり正解まで弾かれる→持ち物読みだけ緩める。技は誤検出を避け据置）。
  const soft = pp.soft || KANA_AVG_SOFT, gapMin = pp.gap || KANA_GAP_MIN, margin = pp.margin || KANA_MARGIN;
  const accept = bestAvg <= KANA_AVG_CLEAN || (bestAvg <= soft && (secAvg - bestAvg) >= gapMin && secAvg >= bestAvg * margin);
  return { name: accept ? bestName : null, cells: bestCells, conf: +bestAvg.toFixed(1) };
}

// 既に切り出したセル列を「絞り込んだ候補(=特定済みポケモンの特性だけ)」に照合する。
// 全特性照合(readByDict)が小書き仮名のセル混入で外れても、候補が2-3個なら字数差でほぼ一意に当たる。
// 足切りはせず、同字数で最良ハミングの候補を返す（候補が当該ポケの実特性なので、多少ボヤけても正解を拾う）。
export function matchAbilityCells(cells, candidates, kana) {
  if (!cells || !cells.length || !candidates || !candidates.length) return null;
  const N = cells.length;
  const dch = (cell, ch) => { const ts = kana[ch]; if (!ts || !ts.length) return null; let mn = 1e9; for (const t of ts) { const h = hammingK(cell, t); if (h < mn) mn = h; } return mn; };
  let best = 1e15, bn = null;
  for (const cand of candidates) { const a = [...cand]; if (a.length !== N) continue; let s = 0, ok = true; for (let i = 0; i < N; i++) { const dd = dch(cells[i], a[i]); if (dd === null) { ok = false; break; } s += dd; } if (!ok) continue; if (s < best) { best = s; bn = cand; } }
  return bn ? { name: bn, avg: +(best / N).toFixed(1) } : null;
}

// ---- 実数値(147等)の数字OCR：種族値逆算でポケモン特定＋SP厳密化に使う ----
const STAT_NUM = { x0: 1583, x1: 1642, pitch: 14, thresh: 175, right: 1630 }; // 右揃え等幅(右端セル境界1630)、性別/性格矢印(x<1583)は除外
let _digits = null;
function loadDigits() {
  if (_digits) return _digits;
  _digits = {};
  try { for (const part of (CHAMP_DIGITS_PACKED || "").split(";")) { const i = part.indexOf("|"); if (i < 0) continue; _digits[part.slice(0, i)] = part.slice(i + 1).split(",").filter(Boolean).map(b64ToBytes); } } catch {}
  return _digits;
}
let _digitsNorm = null; // 概要画面用の「正規化」digit（位置不変）。readNumber専用。
function loadDigitsNorm() {
  if (_digitsNorm) return _digitsNorm;
  _digitsNorm = {};
  try { for (const part of (CHAMP_DIGITS_NORM || "").split(";")) { const i = part.indexOf("|"); if (i < 0) continue; _digitsNorm[part.slice(0, i)] = part.slice(i + 1).split(",").filter(Boolean).map(b64ToBytes); } } catch {}
  return _digitsNorm;
}
// 1桁を「正規化」マスク化: 領域[rx0..rx1]×[y0..y1]内の白インクのタイトbboxを取り、高さをKHにスケール＋水平中央寄せでKW×KHに描く。
// 桁の位置ブレ("1"が細くセル端に寄る/送り不均一)に不変＝等幅グリッド前提のテンプレ崩れを根治。
function digitNorm(d, rx0, rx1, y0, y1) {
  let ax0 = 1e9, ax1 = -1, ay0 = 1e9, ay1 = -1;
  for (let py = y0; py <= y1; py++) for (let px = rx0; px <= rx1; px++) { const o = (py * 1920 + px) * 4; if (d[o] > 195 && d[o + 1] > 195 && d[o + 2] > 195 && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 40) { if (px < ax0) ax0 = px; if (px > ax1) ax1 = px; if (py < ay0) ay0 = py; if (py > ay1) ay1 = py; } }
  if (ax1 < 0) return null;
  const bw = ax1 - ax0 + 1, bh = ay1 - ay0 + 1, nw = Math.max(1, Math.min(KW, Math.round(bw * KH / bh)));
  ensureKana(); _kcx.clearRect(0, 0, KW, KH); _kcx.imageSmoothingEnabled = true;
  _kcx.drawImage(_main, ax0, ay0, bw, bh, Math.round((KW - nw) / 2), 0, nw, KH);
  const dd = _kcx.getImageData(0, 0, KW, KH).data, by = new Uint8Array(KNB);
  for (let i = 0; i < KW * KH; i++) if ((dd[i * 4] + dd[i * 4 + 1] + dd[i * 4 + 2]) / 3 > 140) by[i >> 3] |= (1 << (i & 7));
  return by;
}
// 6ステータスの実数値を読む。戻り値 [h,a,b,c,d,s]（読めない要素はnull）
function readStats(d) {
  const dig = loadDigits(); if (!Object.keys(dig).length) return null;
  const dwhite = (x, y) => { const o = (y * 1920 + x) * 4; return d[o] > 200 && d[o + 1] > 200 && d[o + 2] > 200 && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 40; };
  const dch = (cell, ch) => { const ts = dig[ch]; let mn = 1e9; for (const t of ts) { const h = hammingK(cell, t); if (h < mn) mn = h; } return mn; };
  return STAT_ROWS.map((yc) => {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = yc - 24; y <= yc + 24; y++) for (let x = STAT_NUM.x0; x <= STAT_NUM.x1; x++) if (dwhite(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    // 右端1630に固定の等幅グリッド(数字が全部"1"等で細くてもズレない)。Nは左端x0から推定。
    const N = Math.max(1, Math.min(3, Math.round((STAT_NUM.right - x0) / STAT_NUM.pitch)));
    let s = "";
    for (let i = 0; i < N; i++) {
      const cell = cellMaskGrid(STAT_NUM.right - (N - i) * STAT_NUM.pitch, y0, y1, STAT_NUM.pitch, STAT_NUM.thresh);
      let best = 1e9, bn = "";
      for (const ch in dig) { const v = dch(cell, ch); if (v < best) { best = v; bn = ch; } }
      s += bn;
    }
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  });
}

// dicts = { moves:[全技名], abilities:[全特性名], kana? }。戻り値 { pokemon, sp, nature, moves[4], ability, stats[6], unknown[] }
export function scanStatScreen(src, dicts, tpl) {
  ensure();
  _mctx.clearRect(0, 0, 1920, 1080); _mctx.drawImage(src, 0, 0, 1920, 1080);
  const d = _mctx.getImageData(0, 0, 1920, 1080).data;
  const at = (x, y) => { const o = (y * 1920 + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
  dicts = dicts || {};
  const kana = dicts.kana || loadKana().kana;
  const moveCands = dicts.moves || [];
  const moveIllegalCands = dicts.movesIllegal || []; // チャンピオンズ非合法だが実在する技（🚫付き表示用の追加候補）
  const abilCands = dicts.abilities || [];
  tpl = tpl || loadTextTemplates();

  // ポケモン名（ヘッダー・プロポーショナル → まるごと照合。未登録は unknown）
  let pokemon = null; const unknown = [];
  { const pb = bboxOf(d, 147, 1198, 1645); if (pb) { const bytes = normMask(pb); const m = matchTable(bytes, tpl.names || {}); if (m.name && m.dist <= TEXT_THRESH) pokemon = m.name; else unknown.push({ kind: "name", bytes }); } }

  // SP・性格
  const sp = {}; const nature = { plus: null, minus: null };
  STAT_ROWS.forEach((yc, i) => {
    let xr = -1;
    for (let x = BAR_X1; x >= BAR_X0; x--) { let hit = false; for (let y = yc - 9; y <= yc + 9; y++) { const [r, g, b] = at(x, y); if (isOrange(r, g, b)) { hit = true; break; } } if (hit) { xr = x; break; } }
    if (xr >= 0) sp[STAT_KEYS[i]] = Math.max(0, Math.min(SP_MAX, Math.round((xr - BAR_X0) / BAR_FULL_PX * SP_MAX)));
    else {
      // 強orangeが全く無い＝SP0(空) または SP1の極細スリバー(彩度の落ちた暖色)。
      // バー左端18px内で暖色フィルを探し、2列以上連続すれば本物のスリバー＝SP1+として救済(1pxノイズは無視)。
      let cols = 0, rx = -1;
      for (let x = BAR_X0; x <= BAR_X0 + 18; x++) { let hit = false; for (let y = yc - 9; y <= yc + 9; y++) { const [r, g, b] = at(x, y); if (isWarmFill(r, g, b)) { hit = true; break; } } if (hit) { cols++; rx = x; } }
      sp[STAT_KEYS[i]] = cols >= 2 ? Math.max(1, Math.round((rx - BAR_X0) / BAR_FULL_PX * SP_MAX)) : 0;
    }
    let up = 0, dn = 0;
    for (let y = yc - 17; y <= yc + 13; y++) for (let x = ARROW_X0; x <= ARROW_X1; x++) { const [r, g, b] = at(x, y); if (isUp(r, g, b)) up++; if (isDown(r, g, b)) dn++; }
    if (up > 6) nature.plus = STAT_KEYS[i];
    if (dn > 6) nature.minus = STAT_KEYS[i];
  });

  // 技（1文字OCR＋辞書）
  const moves = [];
  MOVE_ROWS.forEach((yc, i) => {
    let r = readByDict(d, yc, 1340, 1655, moveCands, kana); // まず合法技で照合
    if (!r.name && moveIllegalCands.length) { const r2 = readByDict(d, yc, 1340, 1655, moveIllegalCands, kana); if (r2.name) r = r2; } // 外れたら非合法技も試す(🚫)
    if (r.name) moves.push(r.name);
    else { moves.push(null); if (r.cells) unknown.push({ kind: "move", slot: i, cells: r.cells }); }
  });
  // 特性（中央揃え）。abilityCellsは成功/失敗に関わらず常に返す（後でポケモン特性に絞って再照合するため）
  let ability = null, abilityCells = null;
  { const r = readByDict(d, ABIL_ROW, 1560, 1800, abilCands, kana);
    abilityCells = r.cells || null;
    if (r.name) ability = r.name; else if (r.cells) unknown.push({ kind: "ability", cells: r.cells }); }

  // 実数値(種族値逆算用) ※digitテンプレが無ければnull
  const stats = readStats(d);

  return { pokemon, sp, nature, moves, ability, abilityCells, stats, unknown };
}

// ---- チーム編成「概要画面」(2列×3行で6匹一括表示)から読む ----
// 能力タブ: 各セルの 特性/持ち物/技4 を文字OCRで読む（名前は読まずguessで同定）。持ち物がこの画面では文字なのが肝。
// レイアウト(1920x1080実測): 列オフセット800 / 行オフセット218 / 左上セルの名前行Y=297。
const OV = { colX: 800, rowY: 218, nameY0: 297 };
// 画面ごとの縦ズレ自動補正。コーディネート(編成)画面=ズレ0 / ランクマッチ画面は全体が≈+20px下にズレる（同じ画面に見えて微妙に違う）。
// 読み取り枠(bboxOf)は±26pxと広いので、ズレたまま読むと隣の行の文字が枠に入って化ける→各読みをdyだけ下げて枠を本来の文字に合わせ直す。
// 検出は二段階:
//   1. 技列(x677..930)で最大白画素ランを探す（能力タブ用）
//      明るいキャプチャ(HDR等): カードボーダー(密度>150px/行)が最大ランになる→ボーダーモード
//      通常キャプチャ: Move[0]テキスト(密度≤150)が最大ラン→テキストモード
//      ニックネーム対応: 技列はニックネームと無関係。
//   2. 技列に有効ランが無い場合（ステータスタブ等）は名前エリア(x265..460)にフォールバック。
//      名前エリアの重心計算はOCRではなく画素重心のみ→ニックネームの文字種・文字数に非依存。
function ovNameDy(d) {
  const isW2 = (px, py) => { const o = (py * 1920 + px) * 4; return d[o] > 205 && d[o + 1] > 205 && d[o + 2] > 205 && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 42; };
  // ---- 段階1: 技列(x677..930)からdyを検出 ----
  // ステータスタブでは実数値の数字(y≈by+45から始まる)が技列(x740..802等)に重なるため、
  // 数字の上端がby±40窓に染み込んでdy=36等の誤検出になる。dy>25は「実数値テキストの誤検出」と判定し棄却。
  // 有効なdyの実測値は 0(コーディネート) / 19-20(ランクマッチ) のみ。
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const X = c * OV.colX, xa = 677 + X, xb = 930 + X;
    const by = OV.nameY0 + r * OV.rowY + 3; // dy=0でのMove[0]理論Y
    const SEARCH = 40;
    const rc = [];
    for (let py = by - SEARCH; py <= by + SEARCH; py++) { let w = 0; for (let px = xa; px <= xb; px++) if (isW2(px, py)) w++; rc.push(w); }
    let bestSum = 0, bestA = -1, bestB = -1, rs = -1, rsum = 0;
    for (let i = 0; i <= rc.length; i++) { const on = i < rc.length && rc[i] >= 2; if (on) { if (rs < 0) { rs = i; rsum = 0; } rsum += rc[i]; } else if (rs >= 0) { if (rsum > bestSum) { bestSum = rsum; bestA = rs; bestB = i - 1; } rs = -1; } }
    if (bestA < 0 || bestB - bestA < 2) continue; // 3行未満ランは誤検出
    let sum = 0, cnt = 0;
    for (let i = bestA; i <= bestB; i++) { sum += (by - SEARCH + i) * rc[i]; cnt += rc[i]; }
    if (cnt < 20) continue;
    const centerY = Math.round(sum / cnt);
    const density = bestSum / (bestB - bestA + 1); // 1行あたりの白画素数
    // 密度>150=カードボーダー(明るいキャプチャ)。dy=0でのボーダー重心=by-40(実測)
    // 密度≤150=Move[0]テキスト(通常キャプチャ)。dy=0でのテキスト中心=by
    const dy = density > 150 ? centerY - (by - 40) : centerY - by;
    if (Math.abs(dy) > 25) continue; // 大きすぎるdyは実数値テキストの誤検出 → 次セルへ
    return Math.abs(dy) < 6 ? 0 : dy;
  }
  // ---- 段階2: 技列で検出できない場合は名前エリア(x265..460)にフォールバック ----
  // ステータスタブでは技列エリアにUIパネルが重なり検出不可のため名前エリアを使う。
  // 重心計算なのでニックネームでも位置ズレは起きない(文字内容を読んでいない)。
  // 検索上限をby+25に絞る: by+45(実数値1行目)より手前で打ち切り、実数値テキストの重心汚染を防ぐ。
  // ランクマッチのname位置(by+20)は窓内に収まる。
  const isW = (px, py) => { const o = (py * 1920 + px) * 4; return d[o] > 200 && d[o + 1] > 200 && d[o + 2] > 200 && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 40; };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const X = c * OV.colX, xa = 265 + X, xb = 460 + X, by = OV.nameY0 + r * OV.rowY;
    let sum = 0, cnt = 0, rows = 0;
    for (let py = by - 40; py <= by + 32; py++) { let w = 0; for (let px = xa; px <= xb; px++) if (isW(px, py)) w++; if (w >= 4) { sum += py * w; cnt += w; rows++; } }
    if (cnt >= 80 && rows >= 8) { const dy = Math.round(sum / cnt - by); return Math.abs(dy) < 6 ? 0 : dy; }
  }
  return 0;
}
// セル(col 0/1, row 0/1/2)の基準 = nameY0 + row*rowY, x += col*colX。各フィールドの相対オフセット。
export function scanTeamOverviewAbility(src, dicts) {
  ensure();
  _mctx.clearRect(0, 0, 1920, 1080); _mctx.drawImage(src, 0, 0, 1920, 1080);
  const d = _mctx.getImageData(0, 0, 1920, 1080).data;
  dicts = dicts || {};
  const kana = dicts.kana || loadKana().kana;
  const moveCands = dicts.moves || [], moveIllegal = dicts.movesIllegal || [], abilCands = dicts.abilities || [], itemCands = dicts.items || [];
  const OVPP = { wlo: 18, whi: 24, plo: 17, phi: 26, tail: 16, ps: 2.2, olo: 10, ohi: 3, thr: 205, soft: 100 }; // 概要は文字~19-22px/char。thr:205で右下の半透明スロット番号(明度≤188)を除外。soft:100=明るいHDRキャプチャで描画ブレが増える環境にも対応(2位との大差ガードは据置で誤検出は増やさない)
  const OVPP_ITEM = { ...OVPP, gap: 7, margin: 1.12 }; // 持ち物は「○○のみ」等が密集し小文字だと2位が近い。シュカのみ(53.6)vsリュガのみ(62.8)等の正解を弾かないよう差/比のガードを緩める(候補は実物セットで誤りは登録後に目視訂正できる)
  // 1フィールドを読む。微調整付き＝全体dy補正後も残る「名前重心とフィールドの較正差(≈1-4px)」やサブピクセル残差で
  // 境界ぎりぎりの語(みずのはどう等)が落ちるので、yc を ±数px 振って最初に通った所を採る。
  // f=0で通れば即終了＝通常は無コスト。落ちた読みだけ再挑戦。fbは外れた時の再照合候補(技なら非合法技)。
  const tryRead = (yc, xa, xb, cands, pp, fb) => {
    let base = null;
    for (const f of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]) {
      let m = readByDict(d, yc + f, xa, xb, cands, kana, pp);
      if (!m.name && fb && fb.length) { const m2 = readByDict(d, yc + f, xa, xb, fb, kana, pp); if (m2.name) m = m2; }
      if (m.name) return m;
      if (f === 0) base = m; // 0回目のcells(検出失敗バッジ用)を保持
    }
    return base || { name: null, cells: null };
  };
  // セル(r,c)を縦オフセット dy で読む。各フィールドの相対オフセットは固定で、全体を dy だけ下げるだけ＝画面ズレ補正。
  const readCell = (r, c, dy) => {
    const baseY = OV.nameY0 + r * OV.rowY + dy, X = c * OV.colX;
    const ability = tryRead(baseY + 50, 285 + X, 625 + X, abilCands, OVPP).name; // 左フィールドは技列(x~665〜)の手前まで
    const itemRes = tryRead(baseY + 95, 270 + X, 625 + X, itemCands, OVPP_ITEM); // アイコン(左)を避け x270から、技列手前まで
    const item = itemRes.name;
    const itemBlank = !item && !itemRes.cells; // 持ち物欄に白文字が一切無い＝「持ち物なし」。テキストはあるが照合失敗(cellsあり)＝不明、とは区別する
    const moves = []; const unknownMoves = []; const unknownMoveCells = [];
    [3, 50, 95, 138].forEach((off, i) => {
      const m = tryRead(baseY + off, 677 + X, 930 + X, moveCands, OVPP, moveIllegal); // 技テキストは x~682 から。x677起点で1字目を欠けず拾う（タイプアイコンはx672までで色付き＝thr205/低彩度フィルタに乗らない）
      if (m.name) moves.push(m.name); else if (m.cells) { unknownMoves.push(i); unknownMoveCells.push({ idx: i, cells: m.cells }); } // cellsは呼び側でポケモンの技に絞って再照合する用
    });
    return { slot: r * 2 + c, ability: ability || null, item: item || null, itemBlank, moves, undetMoves: unknownMoves.length, undetMoveIdx: unknownMoves, undetMoveCells: unknownMoveCells }; // undetMoveIdx=検出失敗した技の元スロット番号(0-3)＝表示で順番通りに「検出失敗」を出す用。undetMoveCells=失敗技の1文字セル(学習セット絞り込み再照合用)。itemBlank=持ち物欄が空(なし)
  };
  const dy = ovNameDy(d); // 画面ズレを名前の縦位置から検出（コーディネート=0 / ランクマッチ≈+20）
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) cells.push(readCell(r, c, dy));
  cells.dy = dy; // 採用した縦補正量（呼び側のメッセージ用。0=補正なし）
  return cells; // [{slot, ability, item, moves[], undetMoves}] ×6（空セルは ability/item=null, moves=[]）
}

// 右揃えの数字(実数値/SP)を読む。白文字のbboxを取り→桁数N=幅/13→等幅でdigit照合。
// y窓は±16（隣の行は45px離れているので安全）。概要画面の縦ズレ補正後にdyが数px残っても桁が切れないよう少し余裕を持たせる。
function readNumber(d, yc, xa, xb) {
  const isW = (px, py) => { const o = (py * 1920 + px) * 4; return d[o] > 195 && d[o + 1] > 195 && d[o + 2] > 195 && (Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])) < 40; };
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let py = yc - 16; py <= yc + 16; py++) for (let px = xa; px <= xb; px++) if (isW(px, py)) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  if (x1 < 0) return null;
  // 各桁=インク列の「塊」で切る（数字間は空白列で割れる）。塊ごとに digitNorm で位置不変マスク化→正規化テンプレ照合。
  const runs = []; let rs = -1;
  for (let px = x0; px <= x1 + 1; px++) { let ink = 0; if (px <= x1) for (let py = y0; py <= y1; py++) if (isW(px, py)) ink++; const on = ink >= 2; if (on && rs < 0) rs = px; else if (!on && rs >= 0) { runs.push([rs, px - 1]); rs = -1; } }
  const segs = []; for (const r of runs) { const last = segs[segs.length - 1]; if (last && r[0] - last[1] < 3) last[1] = r[1]; else segs.push([r[0], r[1]]); } // 近接(<3px)の塊は同桁として結合
  // プラス補正(性格▲)の右端が実数値の窓に幅1-3pxの極細セグメントとして紛れ込み「桁数>3」でnull化する(素早さ等で頻発)。数字の桁は5px以上なので細いノイズは捨てる。
  const real = segs.filter(([a, b]) => b - a + 1 >= 4);
  const use = real.length ? real : segs;
  if (use.length < 1 || use.length > 3) return null; // 桁数が異常＝読めずnull。SPは数値直読み優先・実数値はguessが許容するので安全
  const dig = loadDigitsNorm(); if (!Object.keys(dig).length) return null;
  let s = "";
  for (const [rx0, rx1] of use) {
    const m = digitNorm(d, rx0, rx1, y0, y1); if (!m) return null;
    let best = 1e9, bn = ""; for (const ch in dig) { let mn = 1e9; for (const t of dig[ch]) { const h = hammingK(m, t); if (h < mn) mn = h; } if (mn < best) { best = mn; bn = ch; } } s += bn;
  }
  const n = parseInt(s, 10); return Number.isFinite(n) ? n : null;
}

// 概要画面 ステータスタブ: 各セルの 実数値/SP/性格 を読む（実数値→ポケ推定、SP/性格→育成）。
// 各セルは6ステを2サブ列(左=HP/A/B・右=C/D/S)×3行で表示。ステ行Y=基準+[45,90,135]。
export function scanTeamOverviewStatus(src) {
  ensure();
  _mctx.clearRect(0, 0, 1920, 1080); _mctx.drawImage(src, 0, 0, 1920, 1080);
  const d = _mctx.getImageData(0, 0, 1920, 1080).data;
  const at = (px, py) => { const o = (py * 1920 + px) * 4; return [d[o], d[o + 1], d[o + 2]]; };
  const KL = ["h", "a", "b"], KR = ["c", "d", "s"];
  // セル(r,c)を縦オフセット dy で読む。全体を dy だけ下げるだけ＝画面ズレ補正。
  const readCell = (r, c, dy) => {
    const baseY = OV.nameY0 + r * OV.rowY + dy, X = c * OV.colX;
    const stats = {}, sp = {}, nature = { plus: null, minus: null };
    const upS = {}, dnS = {}; // 各ステの▲(赤)/▼(青)画素数。即断せず全ステ集計後にペアで確定する
    // 性格矢印(▲▲赤/▼▼青)はラベルと実数値の間に出る。塊判定はせず素直に画素数で数える。
    const arrowScore = (xa, xb, yc, key) => { let up = 0, dn = 0; for (let py = yc - 14; py <= yc + 12; py++) for (let px = xa; px <= xb; px++) { const [rr, gg, bb] = at(px, py); if (isUp(rr, gg, bb)) up++; if (isDown(rr, gg, bb)) dn++; } upS[key] = up; dnS[key] = dn; };
    [45, 90, 135].forEach((off, j) => {
      const yc = baseY + off, kL = KL[j], kR = KR[j];
      stats[kL] = readNumber(d, yc, 388 + X, 458 + X); sp[kL] = readNumber(d, yc, 478 + X, 542 + X); // 左SPは2桁(32等)が右端x536まで伸びる＝旧532では「2」が切れて37等に化けた→542まで拾う(次列アイコンはx570)
      stats[kR] = readNumber(d, yc, 740 + X, 802 + X); sp[kR] = readNumber(d, yc, 844 + X, 904 + X);
      if (kL !== "h") arrowScore(348 + X, 388 + X, yc, kL); // HPは性格対象外。アイコン(更に左)は外す
      arrowScore(692 + X, 740 + X, yc, kR);
    });
    // 性格補正の確定: ▲最大ステ=上昇 / ▼最大ステ=下降。
    // 仕様上「上昇だけ/下降だけ」は絶対に無い(必ずペア or 無補正)。よって一方でも明確(>TH)なら性格補正あり＝両方確定。
    // 弱く出た側もargmaxで相方として救済するが、ノイズ誤割当を防ぐためFLOOR超のみ採用。両方ともTH以下なら無補正(まじめ等)。
    const TH = 5, FLOOR = 2;
    const argmax = (S) => { let bk = null, bv = -1; for (const k in S) if (S[k] > bv) { bv = S[k]; bk = k; } return { k: bk, v: bv }; };
    const up = argmax(upS), dn = argmax(dnS);
    if (up.v > TH || dn.v > TH) { if (up.v > FLOOR) nature.plus = up.k; if (dn.v > FLOOR) nature.minus = dn.k; }
    return { slot: r * 2 + c, stats, sp, nature }; // stats/sp は {h,a,b,c,d,s}
  };
  const dy = ovNameDy(d); // 画面ズレを名前の縦位置から検出（能力タブと共通。名前は両タブに在る）
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) cells.push(readCell(r, c, dy));
  cells.dy = dy; // 採用した縦補正量（呼び側のメッセージ用。0=補正なし）
  return cells;
}

// 手動確定時の学習：unknownの cells(1文字ずつ) を確定名でカナ辞書に追記。
export function learnCells(cells, name) {
  const chars = [...name]; if (!cells || cells.length !== chars.length) return false;
  chars.forEach((ch, i) => saveKana(ch, cells[i]));
  return true;
}
