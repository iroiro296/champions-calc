import { useState, useRef, useEffect } from "react";
import { SPRITE_NAMES } from "./spriteNames.js";
import { SPRITE_TYPES } from "./spriteTypes.js";
import { megaIconPath, MEGA_FORMS } from "./megaIcons.js";

/* ============================================================
   ポケモンチャンピオンズ 選出画面 認識コンポーネント
   - 1920x1080 の選出画面から相手6匹を認識
   - ① アイコン右のタイプアイコンを読み取り候補を絞り込み
   - ② 絞った候補をギャラリースプライトSSDでランク付け
   実機5枚で検証: タイプ読取ほぼ100% + スプライトで6/6一致
   props:
     pokemonData : { 名前: {...} }  ダメ計のポケモン辞書（ドロップダウン用・任意）
     onConfirm   : (names: string[]) => void
   ============================================================ */

// ---- 相手パネル座標（1920x1080） ----
const ROW_YC  = [210, 335, 465, 590, 715, 840]; // 6行のアイコン中心Y
const ICON_CX = 1665;                            // ポケアイコン中心X
const BOX_SIZES = [96, 112, 128];                // スプライト多スケール
const SPR = 64, MARGIN = 10, BIG = SPR + 2 * MARGIN;
const OFF_RANGE = 6, OFF_STEP = 3;
const GAL_BG = [46, 44, 125];
const MIN_OVERLAP = 500;

// ---- タイプアイコン座標 ----
const TYPE_TS = 48;                  // テンプレ解像度
const TYPE_SLOT_X = [1773, 1826];    // 左スロット, 右スロット の中心X
const TYPE_Y_OFF = -24;              // 行中心からのYオフセット
const TYPE_GRAB = 50;                // 画面から切り出す箱px
const TYPE_TH = 12000;               // これ未満ならタイプ確定。明度正規化SSDでの実測(7枚): 実タイプ≤5041(暗色あくが最大)/空スロット≥15212 ＝広いギャップの中央寄り。旧生SSDでは暗色が閾値超で取りこぼしていたのを正規化で圧縮し同閾値で拾えるように

// 利用可能なタイプテンプレ（英ファイル名 ← 日本語タイプ名）。配列なら同タイプの複数テンプレ＝SSD最小採用で取りこぼし対策。
// あく(dark)は暗色×暗背景で低コントラスト＝最も外れやすいので実機4枚を追加(2026-06-20, バンギラス岩単対策)。
const TYPE_FILES = {
  "ノーマル": "normal", "はがね": "steel", "ドラゴン": "dragon", "みず": "water",
  "じめん": "ground", "あく": ["dark", "dark2", "dark3", "dark4", "dark5"], "むし": "bug", "ひこう": "flying",
  "フェアリー": "fairy", "ほのお": "fire", "エスパー": "psychic", "ゴースト": "ghost",
  "くさ": "grass", "こおり": "ice", "でんき": "electric", "かくとう": "fighting",
  "どく": "poison", "いわ": "rock"
};
// 全18タイプ収録済み

// 形状再評価: RGBで僅差の対抗馬だけ、色不変な「前景シルエットのIoU(重なり率)」で再ランク。
// 色違いの色一致でRGBが別ポケに僅差で負ける混線を、形(シルエット)で是正する。
// 色違いを罰しない（本物の色違いも自分の形にIoUが高いので勝てる）。実機の誤認2件(ニンフィア/ゲッコウガ)で検証。
const SHAPE_MARGIN = 3000; // このSSD差以内の対抗馬だけIoUで再評価（3500→3000: イダイトウ♂♀の取り違え防止）

// プレビュー（取り込みフレーム + 読み取り枠の確認用）
const PREV_W = 416, PREV_H = 234;

// ---- スプライトテンプレ読み込み（前景ピクセルのみ） ----
async function loadSpriteTemplates(onProgress) {
  const tmpl = new Array(SPRITE_NAMES.length);
  let done = 0;
  await Promise.all(SPRITE_NAMES.map((_, i) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = SPR; c.height = SPR;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SPR, SPR);
        const d = ctx.getImageData(0, 0, SPR, SPR).data;
        const fx = [], fy = [], fr = [], fg = [], fb = [];
        for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
          const o = (y * SPR + x) * 4;
          const r = d[o], g = d[o+1], b = d[o+2];
          const dr = r-GAL_BG[0], dg = g-GAL_BG[1], db = b-GAL_BG[2];
          if (dr*dr + dg*dg + db*db > 3600) { fx.push(x); fy.push(y); fr.push(r); fg.push(g); fb.push(b); }
        }
        tmpl[i] = { fx: Uint8Array.from(fx), fy: Uint8Array.from(fy),
                    fr: Uint8Array.from(fr), fg: Uint8Array.from(fg), fb: Uint8Array.from(fb), n: fx.length };
        onProgress && onProgress(++done);
        resolve();
      };
      img.onerror = reject;
      img.src = `sprites/pokemon_${String(i).padStart(3, "0")}.png`;
    })
  ));
  return tmpl;
}

// ---- タイプテンプレ読み込み（48x48 RGBA） ----
async function loadTypeTemplates() {
  // 1タイプに複数テンプレ可（配列）。同jpで複数pushし、readTypeのSSD最小採用で一番近いテンプレが当たる。
  const jobs = Object.entries(TYPE_FILES).flatMap(([jp, files]) => (Array.isArray(files) ? files : [files]).map((file) => ({ jp, file })));
  const out = [];
  await Promise.all(jobs.map(({ jp, file }) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = TYPE_TS; c.height = TYPE_TS;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, TYPE_TS, TYPE_TS);
        const data = ctx.getImageData(0, 0, TYPE_TS, TYPE_TS).data;
        // テンプレの明度平均・標準偏差を前計算（読取側の明度/コントラストを合わせる正規化用）
        let s = 0, s2 = 0; const n = TYPE_TS * TYPE_TS;
        for (let i = 0; i < n; i++) { const l = (data[i*4] + data[i*4+1] + data[i*4+2]) / 3; s += l; s2 += l*l; }
        const lumMean = s / n, lumStd = Math.sqrt(Math.max(1, s2/n - lumMean*lumMean));
        out.push({ jp, data, lumMean, lumStd });
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `typeicons/${file}.png`;
    })
  ));
  return out;
}

// ---- 1スロットのタイプ読み取り ----
function readType(mainCtx, scratch, cx, cy, typeTmpl) {
  const sx = scratch.ctx;
  sx.clearRect(0, 0, TYPE_TS, TYPE_TS);
  sx.drawImage(mainCtx.canvas, cx - TYPE_GRAB/2, cy - TYPE_GRAB/2, TYPE_GRAB, TYPE_GRAB, 0, 0, TYPE_TS, TYPE_TS);
  const sd = sx.getImageData(0, 0, TYPE_TS, TYPE_TS).data;
  // 切り出し側の明度平均・標準偏差（1回）。テンプレの明度/コントラストへアフィン整合してから比較する＝
  // キャプチャの明るさ・濃淡差に強くなる（特に あく 等の暗色×暗背景で外れにくく）。色相は全chに同じ変換なので保持。
  let gs = 0, gs2 = 0; const np = TYPE_TS * TYPE_TS;
  for (let i = 0; i < np; i++) { const l = (sd[i*4] + sd[i*4+1] + sd[i*4+2]) / 3; gs += l; gs2 += l*l; }
  const gMean = gs / np, gStd = Math.sqrt(Math.max(1, gs2/np - gMean*gMean));
  let bestJp = null, bestV = Infinity;
  for (const t of typeTmpl) {
    const td = t.data;
    const gain = Math.min(1.8, Math.max(0.6, t.lumStd / gStd)); // コントラスト合わせ（暴れ防止にクランプ）
    const off = t.lumMean;                                       // 明度合わせ: newpix = (pix - gMean)*gain + off
    let best = Infinity;
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
      let sum = 0, cnt = 0;
      for (let y = 0; y < TYPE_TS; y += 2) for (let x = 0; x < TYPE_TS; x += 2) {
        const qx = x+dx, qy = y+dy;
        if (qx < 0 || qx >= TYPE_TS || qy < 0 || qy >= TYPE_TS) continue;
        const o = (qy*TYPE_TS+qx)*4, to = (y*TYPE_TS+x)*4;
        const a = ((sd[o]   - gMean) * gain + off) - td[to];
        const b = ((sd[o+1] - gMean) * gain + off) - td[to+1];
        const c = ((sd[o+2] - gMean) * gain + off) - td[to+2];
        sum += a*a + b*b + c*c; cnt++;
      }
      const v = sum / cnt;
      if (v < best) best = v;
    }
    if (best < bestV) { bestV = best; bestJp = t.jp; }
  }
  return bestV < TYPE_TH ? bestJp : null;
}

// ---- 候補集合に対してスプライトSSD（多スケール・オフセット） ----
function spriteScores(mainCtx, bigCtx, yc, tmpl, candIdx) {
  const scores = {};
  for (const i of candIdx) scores[i] = Infinity;
  for (const box of BOX_SIZES) {
    const pad = Math.round(box * MARGIN / SPR);
    const s = box + 2 * pad;
    bigCtx.clearRect(0, 0, BIG, BIG);
    bigCtx.drawImage(mainCtx.canvas, Math.round(ICON_CX - s/2), Math.round(yc - s/2), s, s, 0, 0, BIG, BIG);
    const bd = bigCtx.getImageData(0, 0, BIG, BIG).data;
    for (const ti of candIdx) {
      const t = tmpl[ti];
      let best = Infinity;
      for (let dy = -OFF_RANGE; dy <= OFF_RANGE; dy += OFF_STEP) {
        for (let dx = -OFF_RANGE; dx <= OFF_RANGE; dx += OFF_STEP) {
          let sum = 0, cnt = 0;
          for (let k = 0; k < t.n; k++) {
            const sx = t.fx[k] + MARGIN + dx, sy = t.fy[k] + MARGIN + dy;
            if (sx < 0 || sx >= BIG || sy < 0 || sy >= BIG) continue;
            const o = (sy * BIG + sx) * 4;
            const a = bd[o]-t.fr[k], b = bd[o+1]-t.fg[k], c = bd[o+2]-t.fb[k];
            sum += a*a + b*b + c*c; cnt++;
          }
          if (cnt < MIN_OVERLAP) continue;
          const v = sum / cnt;
          if (v < best) best = v;
        }
      }
      if (best < scores[ti]) scores[ti] = best;
    }
  }
  return scores;
}

// ---- アイコンの前景シルエットマスク（マゼンタ枠/暗部以外＝ポケモン本体）box=112固定 ----
function buildIconMask(mainCtx, bigCtx, yc) {
  const box = 112, pad = Math.round(box * MARGIN / SPR), s = box + 2 * pad;
  bigCtx.clearRect(0, 0, BIG, BIG);
  bigCtx.drawImage(mainCtx.canvas, Math.round(ICON_CX - s/2), Math.round(yc - s/2), s, s, 0, 0, BIG, BIG);
  const bd = bigCtx.getImageData(0, 0, BIG, BIG).data;
  const m = new Uint8Array(BIG * BIG);
  for (let i = 0; i < BIG * BIG; i++) {
    const r = bd[i*4], g = bd[i*4+1], b = bd[i*4+2];
    const mag = (g < 48 && r > 70 && b < 115 && r > b); // 選出枠のマゼンタ背景
    const drk = (r < 48 && g < 52 && b < 72);           // 暗い縁取り
    m[i] = (mag || drk) ? 0 : 1;
  }
  return m;
}

// ---- 前景シルエットIoU（テンプレ前景マスク vs アイコンマスク、オフセット探索の最大）----
// 色不変な純粋形状指標。RGBが色違いの配色一致で別ポケに僅差負けする混線を、形の重なりで是正する。
function silhouetteIoU(iconMask, t) {
  let best = 0;
  for (let dy = -OFF_RANGE; dy <= OFF_RANGE; dy += OFF_STEP) {
    for (let dx = -OFF_RANGE; dx <= OFF_RANGE; dx += OFF_STEP) {
      let inter = 0, iconN = 0;
      for (let k = 0; k < t.n; k++) {
        const sx = t.fx[k] + MARGIN + dx, sy = t.fy[k] + MARGIN + dy;
        if (sx < 0 || sx >= BIG || sy < 0 || sy >= BIG) continue;
        if (iconMask[sy * BIG + sx]) inter++;
      }
      for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
        const sx = x + MARGIN + dx, sy = y + MARGIN + dy;
        if (sx < 0 || sx >= BIG || sy < 0 || sy >= BIG) continue;
        if (iconMask[sy * BIG + sx]) iconN++;
      }
      const uni = t.n + iconN - inter;
      const v = uni > 0 ? inter / uni : 0;
      if (v > best) best = v;
    }
  }
  return best;
}

// 相手アイコン列(X≈1665)にマゼンタの選出枠背景が十分あるか＝選出画面かの判定。
// 実測: 選出画面で 63〜69% / 非選出(ホーム画面・ステ画面・他ゲーム)で ≤0.2%。これでホーム画面の白をノーマルと誤読する誤爆を弾く。
// 相手アイコン列の「各行」のマゼンタ選出枠率を見て、枠が出ている行数を返す。
// 選出画面は6行とも枠あり(各≥0.5前後)。ホーム/メニュー等の偶発的なマゼンタは特定行だけ→行数で弾ける。
function magentaRowCount(mainCtx, perRowMin) {
  let rows = 0;
  for (const yc of ROW_YC) {
    const d = mainCtx.getImageData(1595, Math.max(0, yc - 70), 145, 141).data;
    let mag = 0, tot = 0;
    for (let i = 0; i < d.length; i += 8) { // 2pxおき
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g < 48 && r > 70 && b < 115 && r > b) mag++;
      tot++;
    }
    if (tot && mag / tot >= perRowMin) rows++;
  }
  return rows;
}

// ---- 6枠まるごと解析 ----
// 選出画面とみなす条件: タイプが読めた行数 と 相手6枠のマゼンタ選出枠が出ている行数（構造で判定＝偶発的マゼンタを弾く）
const DETECT_MIN_ROWS = 4;          // タイプが所定位置に読めた行数(6行中)。色違い/暗色で読み落としもあるので4で許容
const SEL_ROW_MAGENTA = 0.25;       // 1行をマゼンタ枠ありと見なす割合
const SEL_MAGENTA_ROWS_MIN = 5;     // マゼンタ枠が出ている行数(6行中)。選出は6行とも出る→5以上を要求（偶発的マゼンタは特定行だけ→弾ける）

function analyze(srcCanvas, tmpl, typeTmpl, requireDetection = false) {
  const main = document.createElement("canvas");
  main.width = 1920; main.height = 1080;
  const mainCtx = main.getContext("2d", { willReadFrequently: true });
  mainCtx.drawImage(srcCanvas, 0, 0, 1920, 1080);

  const scratchC = document.createElement("canvas");
  scratchC.width = TYPE_TS; scratchC.height = TYPE_TS;
  const scratch = { ctx: scratchC.getContext("2d", { willReadFrequently: true }) };

  const bigC = document.createElement("canvas");
  bigC.width = BIG; bigC.height = BIG;
  const bigCtx = bigC.getContext("2d", { willReadFrequently: true });

  const N = SPRITE_NAMES.length;

  // ① 先に6行ぶんのタイプを読む（軽い）→ 選出画面かどうか判定
  const rowTypes = ROW_YC.map(yc => {
    const types = [];
    if (typeTmpl && typeTmpl.length) {
      for (const slotX of TYPE_SLOT_X) {
        const t = readType(mainCtx, scratch, slotX, yc + TYPE_Y_OFF, typeTmpl);
        if (t && !types.includes(t)) types.push(t);
      }
    }
    return types;
  });
  const detectedRows = rowTypes.filter(t => t.length > 0).length;
  // 選出画面でなければ即終了: ①タイプが所定位置に4行以上 かつ ②相手アイコン列にマゼンタ選出枠がある
  //   （②が無いと、Switchホーム画面の白などをノーマル/いわと誤読して誤爆ロックする）
  if (requireDetection && (detectedRows < DETECT_MIN_ROWS || magentaRowCount(mainCtx, SEL_ROW_MAGENTA) < SEL_MAGENTA_ROWS_MIN)) return null;

  return ROW_YC.map((yc, ri) => {
    const types = rowTypes[ri];
    // ② タイプで候補を絞る
    //    2個読めた=複合確定→両タイプを持つもの（=完全一致、ポケモンは最大2タイプ）。
    //    1個だけ読めた=第2タイプのアイコンを読み落とした可能性があるので複合タイプを除外しない。
    //    （エルレイド[エスパー/かくとう]→エスパー単、ガブリアス[ドラゴン/じめん]→ドラゴン単 と誤認していた原因）
    //    そのタイプを持つ全ポケ（単・複合とも）を候補にし、スプライトSSD＋シルエットで一意に決める。
    let cand = [];
    if (types.length >= 2) {
      for (let i = 0; i < N; i++) if (types.every(t => SPRITE_TYPES[i].includes(t))) cand.push(i);
    } else if (types.length === 1) {
      for (let i = 0; i < N; i++) if (SPRITE_TYPES[i].includes(types[0])) cand.push(i);
    }
    const filtered = types.length > 0 && cand.length > 0 && cand.length < N;
    if (cand.length === 0) cand = Array.from({ length: N }, (_, i) => i);
    // ③ RGB SSDでランク付け → 僅差の対抗馬だけ前景シルエットIoUで再評価して是正
    const sc = spriteScores(mainCtx, bigCtx, yc, tmpl, cand);
    cand.sort((a, b) => sc[a] - sc[b]);
    if (cand.length > 1) {
      const best = sc[cand[0]];
      const contenders = cand.filter(i => sc[i] <= best + SHAPE_MARGIN);
      if (contenders.length > 1) {
        // 形(シルエット)の重なり率が最大の候補を採用。配色一致でRGBが拮抗しても形で正解を拾う。
        const iconMask = buildIconMask(mainCtx, bigCtx, yc);
        const io = {};
        for (const i of contenders) io[i] = silhouetteIoU(iconMask, tmpl[i]);
        contenders.sort((a, b) => io[b] - io[a]);
        const winner = contenders[0], wi = cand.indexOf(winner);
        if (wi > 0) { cand.splice(wi, 1); cand.unshift(winner); }
      }
    }
    const seen = new Set();
    const top = [];
    for (const i of cand) {
      const nm = SPRITE_NAMES[i];
      if (seen.has(nm)) continue;
      seen.add(nm);
      if (top.length < 3) top.push({ idx: i, name: nm, score: Math.round(sc[i]) });
    }
    return { types, filtered, candCount: seen.size, cands: top };
  });
}

const TICK_MS = 1000; // 自動スキャン間隔（解析~62msと軽いので短め。2フレーム確定で約2秒）

const loadObsCfg = () => { try { return JSON.parse(localStorage.getItem("obsCfg") || "{}"); } catch { return {}; } };

export function RecognitionPanel({ pokemonData, onConfirm, onPick, activeName, obs }) {
  const [tmpl, setTmpl] = useState(null);
  const [typeTmpl, setTypeTmpl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [scanState, setScanState] = useState("armed"); // armed(探索中) | locked(確定)
  const [scanMode, setScanMode] = useState("");         // "obs" | "display"
  const [hasPreview, setHasPreview] = useState(false);
  const [scanOpen, setScanOpen] = useState(false); // 「選出画面から相手を認識」(スキャン操作)の開閉。OBS接続で自動スキャンするので既定は畳む
  // OBS接続
  const cfg = loadObsCfg();
  // OBS接続は親(useObs)から共有。接続クライアント/状態/host/port/pass は obs を使う（=マイチームタブと同一接続）。
  // ソース選択は相手認識タブ固有なのでローカル保持。既存コードと同名にマッピングして差分を最小化。
  const { ref: obsRef, connected: obsConnected, busy: obsBusy, error: obsError, setError: setObsError,
          host: obsHost, setHost: setObsHost, port: obsPort, setPort: setObsPort, pass: obsPass, setPass: setObsPass } = obs;
  const [obsSources, setObsSources] = useState([]);
  const [obsSource, setObsSource] = useState(cfg.source || "");
  const fileRef    = useRef(null);
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const timerRef   = useRef(null);
  const scanningRef = useRef(false);
  const previewRef = useRef(null); // 取り込みフレーム表示用 canvas
  // ステートマシン用 ref
  const stateRef  = useRef("armed");
  const sigRef    = useRef("");
  const stableRef = useRef(0);
  const goneRef   = useRef(0);
  const detectCountRef = useRef(0); // 検出継続回数（チラつき時の強制確定用）

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadSpriteTemplates(n => alive && setProgress(n)),
      loadTypeTemplates()
    ]).then(([t, tt]) => { if (alive) { setTmpl(t); setTypeTmpl(tt); } })
      .catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => () => { stopScan(); }, []); // タブ切替時: スキャンは止めるが共有OBS接続は切らない（親が保持）。eslint-disable-line react-hooks/exhaustive-deps

  // slots が変わるたび親へ反映（自動表示・修正・クリアを一元化）
  useEffect(() => {
    if (!onConfirm) return;
    onConfirm(slots ? slots.map(s => s.selected).filter(Boolean) : []);
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyResult(rows) {
    setSlots(rows.map(r => ({ ...r, selected: r.cands[0]?.name || "" })));
  }

  // 取り込んだフレームと読み取り枠をプレビューに描画
  function drawPreview(frameCanvas, detected) {
    const cv = previewRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, PREV_W, PREV_H);
    ctx.drawImage(frameCanvas, 0, 0, PREV_W, PREV_H);
    const sx = PREV_W / 1920, sy = PREV_H / 1080;
    // ポケアイコン読み取り枠（緑）
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = detected ? "#5f5" : "#888";
    for (const yc of ROW_YC) ctx.strokeRect((ICON_CX - 53) * sx, (yc - 53) * sy, 106 * sx, 106 * sy);
    // タイプ読み取り枠（水色）
    ctx.strokeStyle = detected ? "#5cf" : "#666";
    for (const yc of ROW_YC) for (const tx of TYPE_SLOT_X)
      ctx.strokeRect((tx - 25) * sx, (yc + TYPE_Y_OFF - 25) * sy, 50 * sx, 50 * sy);
    setHasPreview(true);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !tmpl) return;
    setBusy(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1920; c.height = 1080;
      c.getContext("2d").drawImage(img, 0, 0, 1920, 1080);
      const rows = analyze(c, tmpl, typeTmpl);
      drawPreview(c, true);
      applyResult(rows);
      URL.revokeObjectURL(url);
      setBusy(false);
    };
    img.src = url;
    e.target.value = "";
  }

  // --- 共通スキャンループ（grabFrame: async () => 1920x1080 canvas|null） ---
  function runScanLoop(grabFrame, mode) {
    scanningRef.current = true;
    setCapturing(true);
    setScanMode(mode);
    rearm();
    const tick = async () => {
      if (!scanningRef.current) return;
      let c = null;
      try { c = await grabFrame(); }
      catch (e) { if (mode === "obs") setObsError(String(e?.message || e)); }
      if (c) {
        if (mode === "obs") setObsError("");
        const rows = analyze(c, tmpl, typeTmpl, true); // 選出画面のみ
        const detected = rows !== null;
        drawPreview(c, detected); // 取り込み内容と読み取り枠を表示
        if (stateRef.current === "armed") {
          if (detected) {
            const sig = rows.map(r => r.cands[0]?.name).join(","); // 名前ベース（通常/色違いは同名なので安定）
            if (sig === sigRef.current) stableRef.current++;
            else { stableRef.current = 0; sigRef.current = sig; }
            detectCountRef.current++;
            // 2連続一致で確定。チラつく場合も検出4回で強制確定。ここで初めて表示更新＝前の認識は次が確定するまで残る
            if (stableRef.current >= 1 || detectCountRef.current >= 4) {
              applyResult(rows);
              stateRef.current = "locked"; setScanState("locked");
            }
          } else { sigRef.current = ""; stableRef.current = 0; detectCountRef.current = 0; }
        } else { // locked: 上書きせず修正を保持。画面が変わっても前の認識は残し、再探索状態にするだけ
          if (!detected) { goneRef.current++; if (goneRef.current >= 2) rearm(); } // setSlots(null)しない＝次の選出が出るまで表示維持
          else goneRef.current = 0;
        }
      }
      if (scanningRef.current) timerRef.current = setTimeout(tick, TICK_MS);
    };
    tick();
  }

  function rearm() {
    stateRef.current = "armed"; setScanState("armed");
    sigRef.current = ""; stableRef.current = 0; goneRef.current = 0; detectCountRef.current = 0;
  }
  function manualRescan() { rearm(); setSlots(null); }

  function stopScan() {
    scanningRef.current = false;
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    videoRef.current = null;
    setCapturing(false);
    rearm();
  }

  function dataURLToCanvas(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 1920; c.height = 1080;
        c.getContext("2d").drawImage(img, 0, 0, 1920, 1080);
        resolve(c);
      };
      img.onerror = () => reject(new Error("画像のデコードに失敗しました"));
      img.src = dataURL;
    });
  }

  // --- OBS WebSocket（接続自体は共有の obs。ここはソース一覧取得＝認識タブ固有） ---
  async function loadSources() {
    const client = obsRef.current;
    if (!client?.isOpen()) return;
    try {
      // 入力ソース一覧を取得（映像キャプチャデバイス等）。選んだソースは表示中のシーンに関係なく直接スクショする。
      const inputs = ((await client.request("GetInputList")).inputs || []).map(i => i.inputName);
      const opts = inputs.map(s => ({ value: s, label: s }));
      setObsSources(opts);
      setObsSource(prev => (opts.some(o => o.value === prev) ? prev : (opts[0]?.value || "")));
    } catch (e) { setObsError(String(e?.message || e)); }
  }
  async function connectOBS() { try { await obs.connect(); } catch {} } // ソースは下の effect で取得

  function disconnectOBS() {
    if (scanningRef.current) stopScan();
    obs.disconnect();
    setObsSources([]);
  }

  // 共有OBSの接続状態に追従: 繋がったら（自タブ/マイチームタブどちらの接続でも）ソース一覧を取得。切れたらスキャン停止＋一覧クリア。
  useEffect(() => {
    if (obsConnected) { if (obsSources.length === 0) loadSources(); }
    else { if (scanningRef.current) stopScan(); setObsSources([]); }
  }, [obsConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startDisplayScan() {
    if (!tmpl) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080, frameRate: 1 }, audio: false
      });
      streamRef.current = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      videoRef.current = video;
      stream.getVideoTracks()[0].addEventListener("ended", stopScan);
      runScanLoop(async () => {
        if (!videoRef.current) return null;
        const c = document.createElement("canvas");
        c.width = 1920; c.height = 1080;
        c.getContext("2d").drawImage(videoRef.current, 0, 0, 1920, 1080);
        return c;
      }, "display");
    } catch (err) {
      if (err.name !== "NotAllowedError") console.error(err);
    }
  }

  function startObsScan() {
    if (!tmpl || !obsRef.current || !obsSource) return;
    localStorage.setItem("obsCfg", JSON.stringify({ host: obsHost, port: obsPort, pass: obsPass, source: obsSource }));
    runScanLoop(async () => {
      const client = obsRef.current;
      // OBSで別のシーンを表示中でも、選んだソース名で直接スクショする（GetSourceScreenshotはシーンでも入力ソースでも名前で撮れる＝
      // アクティブなシーンに依存しない）。__PROGRAM__ のときだけ「現在の番組シーン」を解決して撮る。
      const sourceName = obsSource === "__PROGRAM__"
        ? (await client.request("GetCurrentProgramScene")).currentProgramSceneName
        : obsSource;
      const shot = await client.request("GetSourceScreenshot", { sourceName, imageFormat: "jpg", imageWidth: 1920, imageHeight: 1080 });
      return await dataURLToCanvas(shot.imageData);
    }, "obs");
  }

  const loadDone = tmpl !== null;
  const total = SPRITE_NAMES.length;
  const distinctCount = new Set(SPRITE_NAMES).size;
  const shinyCount = total - distinctCount;

  // OBS接続＆ソース選択＆テンプレ読込が揃ったら、ボタンを押さずとも自動でスキャン開始。
  // （別タブで接続→このタブに来た時も、マウント時にここが走って自動スキャンになる＝タブ間で接続/スキャンが連動）
  useEffect(() => {
    if (obsConnected && obsSource && loadDone && !scanningRef.current) startObsScan();
  }, [obsConnected, obsSource, loadDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // 敵チーム＝認識結果の一覧（各行: 通常アイコン＋メガ/フォルムアイコン＋名前＋検出タイプ。クリックで右側へセット）
  const slotsList = slots ? (
    <div style={{ display: "grid", gap: 6 }}>
      {slots.map((slot, i) => {
        const dispIdx = slot.selected ? SPRITE_NAMES.indexOf(slot.selected) : -1; // 表示は常に通常色(0-234)。indexOf=最初の出現=通常色
        const isActive = !!slot.selected && slot.selected === activeName;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, background: isActive ? "#2c2c54" : "#23233a", padding: "4px 8px", borderRadius: 8, border: `1px solid ${isActive ? "#5b5be0" : "transparent"}` }}>
            <span style={{ width: 13, flexShrink: 0, opacity: 0.55, fontSize: 11, textAlign: "center" }}>{i+1}</span>
            {/* 表示は綺麗なWikiDex版(/disp/)・常に通常色。判定は実機忠実なギャラリー版(/sprites/)のまま */}
            {dispIdx >= 0 ? (
              <img src={`disp/pokemon_${String(dispIdx).padStart(3, "0")}.png`}
                onClick={() => onPick && slot.selected && onPick(slot.selected)}
                title="クリックで右側にセット"
                width={38} height={38}
                style={{ cursor: onPick ? "pointer" : "default", borderRadius: 6, flexShrink: 0, outline: isActive ? "2px solid #5b5be0" : "2px solid transparent" }} alt="" />
            ) : <span style={{ width: 38, height: 38, flexShrink: 0 }} />}
            {/* メガシンカ可能種は X/Y 両方のメガアイコンも表示。クリックでメガ体として右側にセット。 */}
            {(MEGA_FORMS[slot.selected] || []).map((mn) => (
              <img key={mn} src={megaIconPath(mn)}
                onClick={() => onPick && onPick(mn)}
                title={`${mn} をセット`}
                width={38} height={38}
                style={{ cursor: onPick ? "pointer" : "default", borderRadius: 6, flexShrink: 0, outline: mn === activeName ? "2px solid #5b5be0" : "2px solid transparent" }} alt="" />
            ))}
            {/* 認識した名前(テキスト表示)＋検出タイプ。セットは左のアイコンクリックで行う */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 1 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {slot.selected || "—"}
              </span>
              <span style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.2 }}>
                {slot.types.length ? slot.types.join("/") : "タイプ未検出"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div style={{ fontSize: 11.5, opacity: 0.7, padding: "16px 10px", textAlign: "center", background: "#16162a", border: "1px dashed #2e2e4a", borderRadius: 8 }}>
OBSに接続して選出画面を開くと、ここに相手6匹が自動で表示されます（接続は「🎬 OBS」タブ）
    </div>
  );

  return (
    <div style={{ border: "1px solid #3a3a5a", borderRadius: 12, padding: 16, background: "#1a1a2e", color: "#eee" }}>
      {/* 👹 敵チーム（認識結果＋修正欄） */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#f3a8a8" }}>👹 敵チーム</span>
        <span style={{ fontSize: 11, opacity: 0.65 }}>ドロップ/候補で修正・アイコンクリックで右側へ</span>
      </div>

      {!loadDone && !loadError && (
        <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.7 }}>
          テンプレ読み込み中… {progress}/{total}
          <div style={{ marginTop: 4, height: 4, background: "#333", borderRadius: 2 }}>
            <div style={{ width: `${(progress/total)*100}%`, height: "100%", background: "#5b5be0", borderRadius: 2 }} />
          </div>
        </div>
      )}
      {loadError && (
        <div style={{ color: "#f88", fontSize: 12, marginBottom: 8 }}>
          読み込みエラー。/sprites/ と /typeicons/ を確認してください。
        </div>
      )}

      {slotsList}

      {slots && (
        <p style={{ fontSize: 11.5, color: "#8c93b0", lineHeight: 1.55, margin: "9px 2px 0" }}>
          ※ 認識ミス等がありましたら、お手数ですが <b style={{ color: "#a9c2ff", fontWeight: 700 }}>💬フィードバック</b> タブからご報告ください。
        </p>
      )}

      {/* 📷 選出画面から相手を認識（スキャン操作・折りたたみ） */}
      <details open={scanOpen} onToggle={(e) => setScanOpen(e.currentTarget.open)} style={{ marginTop: 12, borderTop: "1px solid #2e2e4a", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#7fb2f5", userSelect: "none" }}>📷 選出画面から相手を認識（手動操作）</summary>
        <div style={{ height: 8 }} />
      {/* OBS状態だけ表示（接続・設定・ソース選択・プレビューは「🎬 OBS」タブに集約。スキャンは共通のobsCfg.sourceを使う） */}
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: obsConnected ? "#8f8" : "#8a93a8" }}>
        {obsConnected ? "🟢 OBS接続済み（ソース/設定は🎬 OBSタブ）" : "⚪ OBS未接続 —「🎬 OBS」タブで接続してください"}
      </div>

      {/* スキャン操作 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {!capturing ? (
          <>
            <button onClick={startObsScan} disabled={!loadDone || !obsConnected || !obsSource}
              title={!obsConnected ? "先にOBSへ接続してください" : ""}
              style={{ padding: "6px 12px", background: obsConnected ? "#1e3a1e" : "#23233a", color: obsConnected ? "#8f8" : "#777", border: "1px solid #4a6a4a", borderRadius: 6, cursor: obsConnected ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}>
              OBSから自動スキャン
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={!loadDone || busy}
              style={{ padding: "6px 12px", background: "#2a2a4a", color: "#bbf", border: "1px solid #44446a", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              スクショ読み込み
            </button>
          </>
        ) : (
          <>
            <button onClick={stopScan}
              style={{ padding: "6px 12px", background: "#3a1e1e", color: "#f88", border: "1px solid #6a4a4a", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              スキャン停止
            </button>
            <button onClick={manualRescan} title="今の認識を破棄してもう一度探す"
              style={{ padding: "6px 12px", background: "#2a2a4a", color: "#bbf", border: "1px solid #44446a", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              再スキャン
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        {busy      && <span style={{ fontSize: 12, opacity: 0.6 }}>解析中…</span>}
        {capturing && scanState === "armed"  && <span style={{ fontSize: 12, color: "#8f8" }}>● 選出画面を探索中…</span>}
        {capturing && scanState === "locked" && <span style={{ fontSize: 12, color: "#8cf" }}>🔒 認識ロック中（画面が変われば自動で再探索）</span>}
      </div>

      </details>
      {/* 取り込みプレビュー（折り畳みの外＝常時表示。緑=アイコン読取枠 / 水色=タイプ読取枠） */}
      <div style={{ display: (capturing || hasPreview) ? "block" : "none", marginTop: 12 }}>
        <canvas ref={previewRef} width={PREV_W} height={PREV_H}
          style={{ width: "100%", maxWidth: PREV_W, borderRadius: 6, border: "1px solid #3a3a5a", background: "#000", display: "block" }} />
        <div style={{ fontSize: 11, opacity: 0.68, marginTop: 3 }}>
          取り込み内容と読み取り位置（<span style={{ color: "#5f5" }}>緑=ポケアイコン</span> / <span style={{ color: "#5cf" }}>水色=タイプ</span>）。
          相手パネルが枠とズレている／真っ黒なら、ソースや解像度を確認してください。
        </div>
      </div>
    </div>
  );
}
