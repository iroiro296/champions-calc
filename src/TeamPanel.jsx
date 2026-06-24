import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { SPRITE_NAMES } from "./spriteNames.js";
import { megaIconPath } from "./megaIcons.js";
import { EXCLUDED_LEARNSET } from "./excludedLearnset.js";
import { scanStatScreen, saveTextTemplate, loadKana, learnCells, matchAbilityCells, scanTeamOverviewAbility, scanTeamOverviewStatus } from "./teamScan.js";
import { STATUS_MOVES } from "./statusMoves.js";
import { ILLEGAL_MOVES } from "./illegal-moves.js";
import { ALL_ITEM_NAMES } from "./item-data.js";
import { MOVE_USAGE } from "./usage-data.js";
import { obsShot } from "./obsClient.js"; // OBS 1フレーム撮影（プレビュー/相手認識と共通。png=可逆でOCR用、jpgは軽いプレビュー用）

const ILLEGAL_SET = new Set(ILLEGAL_MOVES); // チャンピオンズ非合法技（読めても🚫付きで表示）
// 技の採用率マップ（ダメ計と同じ MOVE_USAGE。メガは「(メガ)」を外してベース種にフォールバック）
const moveUsageFor = (name) => MOVE_USAGE[name] || MOVE_USAGE[name.replace(/\(メガ[XY]?\)$/, "")] || {};
// ダメ計には出ない（固定ダメージ/一撃必殺/カウンター系で計算式に乗らない）が、ゲームでは使える実在技。
// どのポケが覚えるかは excludedLearnset.js（Champions learnset由来）。この集合は ILLEGAL_SET に入っていても🚫表示しないための判定に使う。
const CALC_EXCLUDED_SET = new Set(Object.values(EXCLUDED_LEARNSET).flat());

/* マイチーム登録（3チーム×6匹）。各メンバーはフル構成（性格・SP配分H/A/B/C/D/S・もちもの・特性・技最大4）を保持。
   クリックで onApply(member) を呼び、親がこうげき側へ反映（技カテゴリで攻撃SPと性格補正を選ぶ）。localStorage永続化。 */

const STAT_KEYS = ["h", "a", "b", "c", "d", "s"];
const STAT_LABEL = { h: "HP", a: "こうげき", b: "ぼうぎょ", c: "とくこう", d: "とくぼう", s: "すばやさ" };
const STAT_SHORT = { h: "HP", a: "攻撃", b: "防御", c: "特攻", d: "特防", s: "素早さ" };
const NATURE_STATS = ["a", "b", "c", "d", "s"]; // HPは性格補正の対象外
const SP_MAX = 32, SP_TOTAL = 66, NUM_TEAMS = 18, TEAM_SIZE = 6, KEY = "championsMyTeams";

const emptyTeams = () => Array.from({ length: NUM_TEAMS }, () => Array(TEAM_SIZE).fill(null));
function loadState() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r && Array.isArray(r.teams)) {
      // 旧データ(3チーム等)はNUM_TEAMSまで空チームでパディング、各チームもTEAM_SIZEに揃える
      const teams = r.teams.slice(0, NUM_TEAMS).map((t) => { const a = (t || []).slice(0, TEAM_SIZE); while (a.length < TEAM_SIZE) a.push(null); return a; });
      while (teams.length < NUM_TEAMS) teams.push(Array(TEAM_SIZE).fill(null));
      const names = Array.from({ length: NUM_TEAMS }, (_, i) => (Array.isArray(r.names) && typeof r.names[i] === "string") ? r.names[i] : "");
      return { teams, names, active: Math.min(Math.max(0, r.active || 0), NUM_TEAMS - 1) };
    }
  } catch {}
  return { teams: emptyTeams(), names: Array(NUM_TEAMS).fill(""), active: 0 };
}
export const iconOf = (name) => { const i = SPRITE_NAMES.indexOf(name); return i >= 0 ? `disp/pokemon_${String(i).padStart(3, "0")}.png` : megaIconPath(name); }; // メガ形態は通常スプライトに無いので disp-mega から引く

const overlay = { position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalBox = { background: "#23233a", border: "1px solid #44446a", borderRadius: 10, padding: 14, width: 360, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", color: "#eee" };
const sel = { flex: 1, padding: "3px 6px", background: "#1a1a2e", color: "#eee", border: "1px solid #44446a", borderRadius: 6, fontSize: 13 };
const selSm = { ...sel, flex: "none", fontSize: 12, padding: "2px 4px" };
const numInp = { background: "#23233a", color: "#eee", border: "1px solid #3a3a5a", borderRadius: 4, fontSize: 12, padding: "1px 3px", boxSizing: "border-box" };
const btn = { padding: "5px 14px", borderRadius: 6, border: "none", color: "#fff", cursor: "pointer", fontSize: 13 };
const miniBtn = { width: 24, height: 24, lineHeight: "22px", fontSize: 13, padding: 0, borderRadius: 5, border: "none", background: "#000000aa", color: "#ccd", cursor: "pointer" };
// 並び替え▲▼ボタン（flex中央寄せで三角を綺麗に・box-sizing差で崩れないよう固定サイズ）
const moveBtn = (enabled) => ({ width: 26, height: 16, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "1px solid #3a4a6a", background: "#23304a", color: "#cfe0ff", borderRadius: 4, fontSize: 9, lineHeight: 1, cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.3 });

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "5px 0" }}>
      <span style={{ width: 70, fontSize: 12, opacity: 0.8, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

// 列幅（ヘッダー見出しとMemberCellで共有してエクセル風に縦を揃える）
const COL_ICON = 40, COL_NAME = 116, COL_ITEM = 124, COL_MOVES = 210, COL_STAT = 46, COL_STAT_GAP = 3, COL_BTN = 36, COL_INNER_GAP = 12, COL_OUTER_GAP = 10;
// 「ステータス(実数値)が読めているか」＝能力タブだけ取り込んだ時は性格無し・SP全0になる（実数値は種族値そのまま）ので、その種族値は表示しない判定。
const memberHasStats = (m) => !!(m && (m.nature?.plus || m.nature?.minus || STAT_KEYS.some((k) => (m.sp?.[k] || 0) > 0)));

// 1ステ分の枠: 実数値(大)＋SPのみ。ラベル(HP等)は全ポケ共通なので各行には出さず、上の見出し行に1回だけ出す。
// 性格補正は実数値の色（上昇=赤/下降=青）＋数字の隣の▲▼で示す。
function StatMini({ value, sp, plus, minus }) {
  const numCol = value == null ? "#5a6276" : plus ? "#ff9eb4" : minus ? "#84bcff" : "#eef3ff";
  const invested = sp > 0;
  return (
    <div style={{ width: COL_STAT, borderRadius: 5, background: invested ? "#1c2542" : "transparent", padding: "2px 0 0" }}>
      <div style={{ fontSize: 18, fontWeight: invested ? 700 : 600, color: numCol, lineHeight: 1.15, whiteSpace: "nowrap", letterSpacing: "-0.3px", textAlign: "center" }}>
        {value == null ? "–" : value}{plus ? <span style={{ fontSize: 10.5 }}>▲</span> : minus ? <span style={{ fontSize: 10.5 }}>▼</span> : ""}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#8ea0c8", lineHeight: 1, height: 15, textAlign: "center" }}>{invested ? sp : ""}</div>
    </div>
  );
}

// エクセル風の列見出し（全ポケ共通の HP/攻/… を1行だけ・MemberCellと同じ列幅で縦を揃える）
function MemberHeader() {
  const lbl = { fontSize: 11.5, color: "#7c879c", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: COL_OUTER_GAP, padding: "0 8px 3px", border: "1px solid transparent" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: COL_INNER_GAP, flex: 1, minWidth: 0 }}>
        <div style={{ width: COL_ICON, flexShrink: 0 }} />
        <div style={{ flex: "0.6 1 " + COL_NAME + "px", minWidth: 104, ...lbl }}>ポケモン / とくせい</div>
        <div style={{ flex: "1 1 " + COL_ITEM + "px", minWidth: 104, ...lbl }}>もちもの</div>
        <div style={{ flex: "1 1 " + COL_MOVES + "px", minWidth: 192, ...lbl }}>わざ</div>
        {/* ステータス見出し（幅は固定で右端。技列が余白を伸縮吸収するのでカードと列が揃う） */}
        <div style={{ display: "flex", gap: COL_STAT_GAP, flexShrink: 0 }}>
          {STAT_KEYS.map((k) => <div key={k} style={{ width: COL_STAT, textAlign: "center", ...lbl, color: "#9aa2b6" }}>{STAT_SHORT[k]}</div>)}
        </div>
      </div>
      <div style={{ width: 26 + COL_OUTER_GAP + 52, flexShrink: 0 }} />{/* カード右の[▲▼]+[✎✕]と同じ幅＝ステ列を揃える（✎✕=24px×2+gap4） */}
    </div>
  );
}

function MemberCell({ member, active, accent, onPick, onEdit, onClear, onScan, onMoveUp, onMoveDown, canUp, canDown, sideLabel, busy, pokemonData, hpStat, stat }) {
  // ゲーム内のチーム表示と同じく1匹=横1行で縦に並べる。横の空きには実数値・もちもの・とくせい・わざを表示
  if (!member) return (
    <div style={{ display: "flex", alignItems: "stretch", borderRadius: 8, border: "1px dashed #44446a", background: "#23233a", overflow: "hidden", minHeight: 52 }}>
      <button onClick={onScan} disabled={busy} title="OBSから取り込んでこの枠に登録（ワンボタン）"
        style={{ flex: 1, border: 0, background: "transparent", color: "#bfe6c8", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "9px 0", textAlign: "left", paddingLeft: 12 }}>📸 取込{busy ? "…" : ""}</button>
      <button onClick={onEdit} title="手動で追加"
        style={{ borderLeft: "1px dashed #44446a", background: "transparent", color: "#778", cursor: "pointer", fontSize: 12, padding: "0 12px" }}>✎ 手動</button>
    </div>
  );
  const icon = iconOf(member.name);
  const poke = pokemonData?.find((p) => p.name === member.name);
  const nat = member.nature || {};
  const natMul = (k) => (nat.plus === k ? 1.1 : nat.minus === k ? 0.9 : 1.0);
  const sp = member.sp || {};
  const real = (k) => (poke?.base ? (k === "h" ? hpStat(poke.base.h, sp[k] || 0) : stat(poke.base[k], sp[k] || 0, natMul(k))) : null);
  const moves = member.moves || [];
  // 検出失敗を「元の技スロット」位置に出す: member.moves=一致技をスロット順に詰めたもの(失敗はスキップ済)＋undetMoveIdx=失敗スロット番号 → 4枠を復元
  const matchedMv = moves.filter(Boolean);
  const failIdx = member.undetMoveIdx || [];
  const moveSlots = [];
  for (let i = 0, mi = 0, K = matchedMv.length + failIdx.length; i < K; i++) moveSlots.push(failIdx.includes(i) ? "__FAIL__" : matchedMv[mi++]);
  const legacyUndet = (!failIdx.length && member.undetMoves > 0) ? member.undetMoves : 0; // 旧データ(位置情報なし)は末尾に件数だけ
  // どのタブを取り込んだか。abRead=能力(持ち物/技)・stRead=ステータス(実数値/SP/性格)。旧データは abRead既定true・stReadは推定。
  const abRead = member.abRead ?? true;
  const stRead = member.stRead ?? memberHasStats(member);
  return (
    <div style={{ borderRadius: 8, border: "1px solid " + (active ? accent : "#2a3148"), background: active ? "#2c2c54" : "#23233a", padding: "5px 8px", display: "flex", alignItems: "center", gap: COL_OUTER_GAP }}>
      <div onClick={onPick} title={`クリックで${sideLabel}側にセット`} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: COL_INNER_GAP, flex: 1, minWidth: 0 }}>
        {icon ? <img src={icon} width={COL_ICON} height={COL_ICON} alt="" style={{ borderRadius: 4, flexShrink: 0 }} /> : <div style={{ width: COL_ICON, height: COL_ICON, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, opacity: 0.5, flexShrink: 0 }}>?</div>}
        {/* ① 名前 ＋ ② 特性（名前の下）。列は余白を分け合って伸縮＝広い画面で名前/持ち物が省略されない */}
        <div style={{ flex: "0.6 1 " + COL_NAME + "px", minWidth: 104, display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.2 }}>
          <span title={member.name} style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.name}</span>
          <span style={{ fontSize: 13, color: "#a6b3cc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>✨ {member.ability || "—"}</span>
        </div>
        {/* ③ 持ち物（能力タブ未取込なら未登録） */}
        <div title={abRead ? member.item : "能力タブを取り込むと反映されます"} style={{ flex: "1 1 " + COL_ITEM + "px", minWidth: 104, fontSize: 13.5, color: "#9aa6bd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🎒 {abRead ? (member.item || "なし") : <span style={{ opacity: 0.5 }}>未登録</span>}</div>
        {/* ④ 技（2個ずつ2段・スラッシュ区切り）。能力タブ未取込なら未登録、検出失敗は元のスロット位置に「検出失敗」 */}
        <div style={{ flex: "1 1 " + COL_MOVES + "px", minWidth: 192, fontSize: 13.5, lineHeight: 1.3, color: "#9aa6bd" }}>
          {!abRead
            ? <div style={{ opacity: 0.5 }}>未登録</div>
            : moveSlots.length === 0
            ? <div style={{ opacity: 0.4 }}>わざ未登録{legacyUndet ? ` ⚠${legacyUndet}` : ""}</div>
            : [[0, 1], [2, 3]].map((pair, ri) => {
                const cells = pair.filter((i) => i < moveSlots.length);
                if (cells.length === 0) return null;
                return (
                  <div key={ri} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cells.map((i, j) => {
                      const mv = moveSlots[i]; const fail = mv === "__FAIL__"; const illegal = !fail && ILLEGAL_SET.has(mv) && !CALC_EXCLUDED_SET.has(mv); // ダメ計対象外の実在技(カウンター等)は🚫にしない
                      return <span key={j} title={fail ? "技名の検出に失敗しました。✎で手動追加してください" : illegal ? "チャンピオンズでは使えない技" : undefined} style={{ color: fail ? "#e8a04a" : illegal ? "#e7a6a6" : undefined, fontWeight: fail ? 700 : undefined }}>{j > 0 ? " / " : ""}{fail ? "⚠検出失敗" : (illegal ? "🚫" : "") + mv}</span>;
                    })}
                    {ri === 1 && legacyUndet > 0 && <span style={{ color: "#e8a04a", fontWeight: 700, fontSize: 12, marginLeft: 6 }} title="技名の検出に失敗しました。✎で手動追加してください">⚠{legacyUndet}</span>}
                  </div>
                );
              })}
        </div>
        {/* ⑤ ステータス（実数値/SP）。未取込でも「ステ列と同じ幅」を確保＝持ち物/技の列位置がズレない（見出しと揃ったまま） */}
        <div style={{ width: STAT_KEYS.length * COL_STAT + (STAT_KEYS.length - 1) * COL_STAT_GAP, flexShrink: 0, display: "flex", gap: COL_STAT_GAP, alignItems: "flex-start", justifyContent: stRead ? "flex-start" : "center" }}>
          {stRead
            ? STAT_KEYS.map((k) => <StatMini key={k} value={real(k)} sp={sp[k] || 0} plus={nat.plus === k} minus={nat.minus === k} />)
            : <span style={{ fontSize: 12.5, color: "#5a6276", whiteSpace: "nowrap", alignSelf: "center" }} title="ステータスタブを取り込むと反映されます">未登録</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        <button onClick={onMoveUp} disabled={!canUp} title="上へ移動" style={moveBtn(canUp)}>▲</button>
        <button onClick={onMoveDown} disabled={!canDown} title="下へ移動" style={moveBtn(canDown)}>▼</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={onEdit} title="編集" style={miniBtn}>✎</button>
        <button onClick={onClear} title="削除" style={miniBtn}>✕</button>
      </div>
    </div>
  );
}

function MemberEditor({ pokemonData, moveData, statusMoves, itemOptions, hpStat, stat, accent, initial, onCancel, onSave }) {
  const names = useMemo(() => pokemonData.map((p) => p.name).sort((a, b) => a.localeCompare(b, "ja")), [pokemonData]);
  const [name, setName] = useState(initial?.name || names[0]);
  const [nature, setNature] = useState(initial?.nature || { plus: null, minus: null });
  const [sp, setSp] = useState(initial?.sp || { h: 0, a: 0, b: 0, c: 0, d: 0, s: 0 });
  const [item, setItem] = useState(initial?.item || "なし");
  const poke = useMemo(() => pokemonData.find((p) => p.name === name) || pokemonData[0], [name, pokemonData]);
  const [ability, setAbility] = useState(initial?.ability || poke.abilities?.[0] || "なし");
  const [moves, setMoves] = useState(() => {
    // 検出失敗したスロットは空けておく（上から詰めない）: initial.moves=一致技をスロット順に詰めたもの＋undetMoveIdx=失敗スロット番号 → 元の並びを復元し、失敗枠は "" に
    const matched = (initial?.moves || []).filter(Boolean);
    const failIdx = initial?.undetMoveIdx || [];
    const a = []; let mi = 0;
    for (let i = 0, K = matched.length + failIdx.length; i < K; i++) a.push(failIdx.includes(i) ? "" : matched[mi++]);
    while (a.length < 4) a.push("");
    return a.slice(0, 4);
  });

  // ポケモンを「ユーザーが実際に変更した時」だけ無効な特性・技を整理。初回マウント(スキャン直後)では消さない
  // ＝スキャンした技/特性は正しいポケモンを選ぶまで保持し選択肢にも出す。prevName比較なのでStrictModeの二重実行でも誤発火しない。
  const prevName = useRef(name);
  useEffect(() => {
    if (prevName.current === name) return;
    prevName.current = name;
    if (!poke.abilities?.includes(ability)) setAbility(poke.abilities?.[0] || "なし");
    setMoves((ms) => ms.map((mv) => (poke.learnset?.includes(mv) ? mv : "")));
  }, [name]); // eslint-disable-line

  const total = STAT_KEYS.reduce((s, k) => s + (sp[k] || 0), 0);
  const natureMul = (k) => (nature.plus === k ? 1.1 : nature.minus === k ? 0.9 : 1.0);
  const setSpStat = (k, v) => {
    v = Math.max(0, Math.min(SP_MAX, v || 0));
    const others = total - (sp[k] || 0);
    if (others + v > SP_TOTAL) v = Math.max(0, SP_TOTAL - others);
    setSp((s) => ({ ...s, [k]: v }));
  };
  const realStat = (k) => (k === "h" ? hpStat(poke.base.h, sp.h) : stat(poke.base[k], sp[k], natureMul(k)));
  const moveUsage = useMemo(() => moveUsageFor(poke.name), [poke]);
  const learnMoves = useMemo(() => {
    const st = statusMoves || {};
    return (poke.learnset || []).filter((mv) => moveData[mv] || st[mv])
      .sort((a, b) => { const ua = moveUsage[a] ?? -1, ub = moveUsage[b] ?? -1; return ua !== ub ? ub - ua : a.localeCompare(b, "ja"); }); // 採用率降順→データ無しは末尾・五十音
  }, [poke, moveData, statusMoves, moveUsage]);
  const extraMoves = useMemo(() => EXCLUDED_LEARNSET[poke.name] || [], [poke]); // そのポケが覚える「ダメ計対象外」の実在技（カウンター/一撃必殺等）
  const setMove = (i, v) => setMoves((ms) => ms.map((x, j) => (j === i ? v : x)));

  return createPortal(
    <div style={overlay} onClick={onCancel}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>メンバー編集</h3>
        <Row label="ポケモン">
          <select value={name} onChange={(e) => setName(e.target.value)} style={sel}>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Row>
        <Row label="せいかく">
          <span style={{ fontSize: 11, color: "#f9a" }}>▲</span>
          <select value={nature.plus || ""} onChange={(e) => setNature((n) => ({ ...n, plus: e.target.value || null }))} style={selSm}>
            <option value="">なし</option>{NATURE_STATS.map((k) => <option key={k} value={k}>{STAT_LABEL[k]}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#9af", marginLeft: 6 }}>▼</span>
          <select value={nature.minus || ""} onChange={(e) => setNature((n) => ({ ...n, minus: e.target.value || null }))} style={selSm}>
            <option value="">なし</option>{NATURE_STATS.map((k) => <option key={k} value={k}>{STAT_LABEL[k]}</option>)}
          </select>
        </Row>
        <div style={{ margin: "8px 0 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
            <span style={{ opacity: 0.8 }}>努力値(SP)配分 ・ 実数値</span>
            <span style={{ color: total > SP_TOTAL ? "#f88" : "#9af" }}>合計 {total}/{SP_TOTAL}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
            {STAT_KEYS.map((k) => (
              <div key={k} style={{ background: "#1a1a2e", borderRadius: 5, padding: "3px 5px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: nature.plus === k ? "#f9a" : nature.minus === k ? "#9af" : "#aab" }}>{STAT_LABEL[k]}</span>
                  <span style={{ opacity: 0.65 }}>{realStat(k)}</span>
                </div>
                <input type="number" min={0} max={SP_MAX} value={sp[k]} onChange={(e) => setSpStat(k, Number(e.target.value))} style={{ width: "100%", ...numInp }} />
              </div>
            ))}
          </div>
        </div>
        <Row label="もちもの">
          <select value={item} onChange={(e) => setItem(e.target.value)} style={sel}>
            {/* 認識した実物の持ち物（汎用リストに無いもの）を先頭に出して保持 */}
            {!itemOptions.includes(item) && <option value={item}>{item}</option>}
            {itemOptions.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Row>
        <Row label="とくせい">
          <select value={ability} onChange={(e) => setAbility(e.target.value)} style={sel}>
            {(() => { const base = poke.abilities?.length ? poke.abilities : ["なし"]; return (ability && !base.includes(ability) ? [ability, ...base] : base).map((x) => <option key={x}>{x}</option>); })()}
          </select>
        </Row>
        <Row label="わざ(最大4)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, flex: 1 }}>
            {[0, 1, 2, 3].map((i) => (
              <select key={i} value={moves[i] || ""} onChange={(e) => setMove(i, e.target.value)} style={selSm}>
                <option value="">—</option>
                {/* 現在の値がlearnset・対象外のどちらにも無い時だけ単独で先頭に出して保持（スキャンした非合法技など） */}
                {moves[i] && !learnMoves.includes(moves[i]) && !extraMoves.includes(moves[i]) && <option value={moves[i]}>{moves[i]}</option>}
                {learnMoves.map((mv) => <option key={mv} value={mv}>{moveUsage[mv] != null ? `${mv} ${moveUsage[mv].toFixed(1)}%` : mv}</option>)}
                {extraMoves.length > 0 && (
                  <optgroup label="ダメ計対象外の技">
                    {extraMoves.map((mv) => <option key={mv} value={mv}>{mv}</option>)}
                  </optgroup>
                )}
              </select>
            ))}
          </div>
        </Row>
        {initial?.undetMoves > 0 && (
          <div style={{ fontSize: 11, color: "#e8a04a", margin: "3px 0 0", lineHeight: 1.4 }}>
            ⚠ スキャンで {initial.undetMoves}件のわざが検出失敗でした。上のわざ欄から手動で選んでください（保存すると警告は消えます）。
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btn, background: "#3a3a5a" }}>キャンセル</button>
          {/* このモーダルは createPortal で .root の外(document.body)に出るため var(--brand) が解決しない→具体色で塗る（透明になって枠が消えるのを防ぐ） */}
          <button onClick={() => onSave({ name, nature, sp, item, ability, moves: moves.filter(Boolean).slice(0, 4) })} style={{ ...btn, background: "#c084fc" }}>保存</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 技構成＋特性から手持ちポケモンを推定する（ヘッダー名はプロポーショナル＋プレート上で1文字OCR不可なため、
// 確実に読める技/特性から逆引きする）。技1致=1点、特性一致=3点。技4 or 特性+技1 以上(>=4)で確度ありとみなす。
function guessPokemon(pokemonData, moves, ability, stats, nature, hpStat, stat, barSp) {
  const KEYS = ["h", "a", "b", "c", "d", "s"];
  const natMul = (k) => (nature && nature.plus === k ? 1.1 : nature && nature.minus === k ? 0.9 : 1.0);
  const maScore = (p) => { const ls = p.learnset || []; let s = moves.reduce((a, m) => a + (ls.includes(m) ? 1 : 0), 0); if (ability && (p.abilities || []).includes(ability)) s += 3; return s; };
  // ① 実数値(147等)が5つ以上読めていれば種族値マッチで一意特定（タイ崩しの決定打）
  const nRead = stats ? stats.filter((v) => v != null).length : 0;
  if (nRead >= 5 && hpStat && stat) {
    // 各ステで「計算値とほぼ一致(±1)」した数を数える。合計差ではなく一致数で見るので、数字の誤読1-2個があっても効く。
    let best = null, bestM = -1, bestD = Infinity, bma = -1;
    for (const p of pokemonData) {
      if (!p.base) continue;
      let m = 0, diff = 0;
      for (let i = 0; i < 6; i++) { if (stats[i] == null) continue; const sp = (barSp && barSp[KEYS[i]]) || 0; const exp = i === 0 ? hpStat(p.base.h, sp) : stat(p.base[KEYS[i]], sp, natMul(KEYS[i])); const d = Math.abs(exp - stats[i]); if (d <= 1) m++; diff += Math.min(d, 60); }
      const ma = maScore(p);
      if (m > bestM || (m === bestM && diff < bestD) || (m === bestM && diff === bestD && ma > bma)) { bestM = m; bestD = diff; bma = ma; best = p; }
    }
    if (best && bestM >= 4) return best.name; // 6実数値中4つ以上(±1)一致で確定（種族値は指紋・誤読耐性あり）
  }
  // ② フォールバック: 技/特性の逆引き（基本形優先）
  let bestScore = 0, ties = [];
  for (const p of pokemonData) { const s = maScore(p); if (s > bestScore) { bestScore = s; ties = [p]; } else if (s === bestScore && s > 0) ties.push(p); }
  if (bestScore < 2 || !ties.length) return null;
  const baseForms = ties.filter((p) => !/[（(]/.test(p.name));
  return (baseForms.length ? baseForms : ties)[0].name;
}

// 実数値(OCR)から努力値(SP)を逆算する。Champions は Lv50・個体値31固定で「1SP = 実数値+1」なので各ステで一致するSP(0..32)を総当たり。
// numSp=true(概要画面): SPが数字で直読みできる→実数値の誤読を「SP数値」と相互照合して訂正する（例: 攻撃189を180と誤読しても、SP数値32が示す実数値≈読んだ値なら32を採用）。
// numSp無し(ステ画面): SPはオレンジバー読みで不確かなので、従来どおり実数値の逆算を優先しバー読みはフォールバックのみ。
function spFromStats(base, stats, nature, barSp, hpStat, stat, numSp) {
  const KEYS = ["h", "a", "b", "c", "d", "s"];
  const natMul = (k) => (nature && nature.plus === k ? 1.1 : nature && nature.minus === k ? 0.9 : 1.0);
  const expOf = (k, s) => (k === "h" ? hpStat(base.h, s) : stat(base[k], s, natMul(k)));
  const out = {};
  KEYS.forEach((k, i) => {
    const real = stats ? stats[i] : null;
    const sNum = barSp && barSp[k] != null ? barSp[k] : null;
    let found = null; // 実数値に完全一致するSP
    if (real != null && base) { for (let s = 0; s <= 32; s++) { if (expOf(k, s) === real) { found = s; break; } } }
    // 概要画面はSPが数字で直読みできる＝最も確実。妥当(0..32)ならSP数値を最優先で採用（実数値は逆算より誤読しやすい3桁＝同定用に留め、SP決定には使わない）。
    // SP数値が読めない/範囲外の時だけ、実数値の逆算→バー読みにフォールバック。
    if (numSp && sNum != null && sNum >= 0 && sNum <= 32) {
      out[k] = sNum;
    } else {
      out[k] = found != null ? found : ((barSp && barSp[k]) || 0);
    }
  });
  return out;
}

// チーム状態を「計算タブのバー」と「マイチームタブの管理画面」の両方で共有するためのフック。
// 親(ChampionsDamageCalc)で1つだけ持ち、両方へ props で配る → タブを切り替えてもズレない。
export function useMyTeams() {
  const [st, setSt] = useState(loadState);
  const [side, setSide] = useState("atk"); // 反映先（atk=こうげき / def=ぼうぎょ）
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }, [st]);
  const setActive = (i) => setSt((s) => ({ ...s, active: i }));
  const setMember = (team, slot, member) => setSt((s) => { const t = s.teams.map((x) => x.slice()); t[team][slot] = member; return { ...s, teams: t }; });
  const setName = (i, name) => setSt((s) => { const names = (s.names || []).slice(); while (names.length < NUM_TEAMS) names.push(""); names[i] = name; return { ...s, names }; });
  const setTeam = (i, arr) => setSt((s) => { const t = s.teams.map((x) => x.slice()); const a = (arr || []).slice(0, TEAM_SIZE); while (a.length < TEAM_SIZE) a.push(null); t[i] = a; return { ...s, teams: t }; });
  return { teams: st.teams, names: st.names || Array(NUM_TEAMS).fill(""), active: st.active, setActive, setMember, setName, setTeam, side, setSide };
}

// 計算タブ用の細いチームバー：登録済みメンバーをワンクリックで攻撃/防御へセット。登録・編集はマイチームタブで。
export function TeamBar({ teams, active, setActive, side, setSide, onApply, atkName, defName, onManage }) {
  const members = teams[active];
  const filled = members.filter(Boolean).length;
  const curName = side === "atk" ? atkName : defName;
  return (
    <div className="team-bar">
      <div className="team-bar-top">
        <span className="team-bar-label">🧩 マイチーム</span>
        <div className="seg team-bar-teams">
          {teams.map((t, i) => (
            <button key={i} className={active === i ? "seg-btn on" : "seg-btn"} onClick={() => setActive(i)} title={`チーム${i + 1}（${t.filter(Boolean).length}/6）`}>
              {i + 1}<span className="tb-mini">{t.filter(Boolean).length}</span>
            </button>
          ))}
        </div>
        <div className="seg team-bar-side">
          {[["atk", "こうげきへ"], ["def", "ぼうぎょへ"]].map(([v, lbl]) => (
            <button key={v} className={side === v ? "seg-btn on" : "seg-btn"} onClick={() => setSide(v)}>{lbl}</button>
          ))}
        </div>
        <button className="team-bar-manage" onClick={onManage} title="マイチームを登録・編集">登録・編集 →</button>
      </div>
      {filled === 0 ? (
        <div className="team-bar-empty"><button className="link-btn" onClick={onManage}>🧩 マイチームで登録</button>すると、ここからワンクリックで呼び出せます</div>
      ) : (
        <div className="team-bar-chips">
          {members.map((m, i) => m ? (
            <button key={i} className={m.name === curName ? "team-chip on" : "team-chip"} onClick={() => onApply(m, side)}
              title={`${m.name} を${side === "atk" ? "こうげき" : "ぼうぎょ"}側にセット`}>{m.name}</button>
          ) : null)}
        </div>
      )}
    </div>
  );
}

export function TeamPanel({ pokemonData, moveData, itemOptions, hpStat, stat, onApply, atkName, defName, accent = "#5b5be0", teams, names, active, setActive, setMember, setName, setTeam, side, setSide, obs, previewRef, previewOn, setPreviewOn, previewMsg }) {
  const [editing, setEditing] = useState(null); // { team, slot }
  const [renaming, setRenaming] = useState(false); // チーム名編集中
  const [nameInput, setNameInput] = useState("");
  const [confirmReset, setConfirmReset] = useState(false); // 全リセット確認モーダル
  const filled = teams[active].filter(Boolean).length;
  const teamName = (names && names[active]) || `チーム${active + 1}`;
  const moveMember = (slot, dir) => { const j = slot + dir; if (j < 0 || j >= TEAM_SIZE) return; const arr = teams[active].slice(); [arr[slot], arr[j]] = [arr[j], arr[slot]]; setTeam(active, arr); };
  const fileRef = useRef(null);
  const scanCropsRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  // OBS接続は親(useObs)から共有＝相手認識タブと同一接続。obs.ref/obs.pass を既存名にマッピング。
  const { connected: obsConnected } = obs; // 接続状態の表示だけここで使う（接続/設定/プレビューは🎬OBSタブに集約）
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [shareOn, setShareOn] = useState(false);
  // 離脱時: 画面共有だけ止める（共有OBS接続は親が保持＝タブ切替で生かす。ライブプレビューは🎬OBSタブに移設済み）
  useEffect(() => () => { try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {} }, []);

  // スキャン本体: 1920x1080想定のsrc(Image/Canvas)を読み取り→そのままスロットへ1ボタン登録（修正は✎）。
  // targetSlot 指定時はその枠、未指定は先頭の空き枠へ。
  function runScan(src, targetSlot) {
    const dicts = {
      moves: [...new Set([...Object.keys(moveData), ...Object.keys(STATUS_MOVES)])],
      movesIllegal: ILLEGAL_MOVES, // 合法候補で外れた枠を非合法技でも再照合（🚫表示）
      abilities: [...new Set(pokemonData.flatMap((p) => p.abilities || []))],
      kana: loadKana().kana,
    };
    let r;
    try { r = scanStatScreen(src, dicts); } catch (err) { setScanning(false); setScanMsg("スキャン失敗: " + (err?.message || err)); return; }
    const validName = r.pokemon && pokemonData.some((p) => p.name === r.pokemon) ? r.pokemon : null;
    const statusSet = new Set(Object.keys(STATUS_MOVES));
    const readMoves = (r.moves || []).filter((mv) => mv && (moveData[mv] || statusSet.has(mv) || ILLEGAL_SET.has(mv))); // 攻撃＋変化＋非合法(🚫)
    const undetMoveIdx = (r.unknown || []).filter((u) => u.kind === "move").map((u) => u.slot); // 検出失敗した技の元スロット番号(0-3)
    const undetMoves = undetMoveIdx.length; // 文字はあるが辞書照合に失敗した技の数（例: ばかぢからの「ぢ」テンプレ不足）
    const spTotal = Object.values(r.sp || {}).reduce((a, b) => a + b, 0);
    // ステ画面でないフレーム(全0)は登録しない
    if (spTotal === 0 && readMoves.length === 0 && !r.ability) { setScanning(false); setScanMsg("ステータス画面を認識できませんでした（OBSの現在シーンにステ画面を表示してから取り込み）"); return; }
    const guessed = guessPokemon(pokemonData, readMoves, r.ability, r.stats, r.nature, hpStat, stat, r.sp); // 実数値(種族値)＞技/特性 でポケモン推定
    const name = guessed || validName || pokemonData[0].name; // 実数値マッチ(全297対応・高信頼)を優先。ヘッダー名テンプレ照合(validName)は学習済み名にしか効かず誤マッチもするのでフォールバックに降格
    const matched = pokemonData.find((p) => p.name === name);
    // 特性の確定: ポケモンが特定できていれば特性は必ず存在する＝"無し"にしない。
    // ① 全特性OCRが当該ポケの特性を読めた → 採用 ② 候補を「そのポケの特性だけ」に絞って再照合(字数差でほぼ一意。げきりゅう=小書き仮名で全体照合が外れるケースを救済)
    // ③ それでも決まらなければ第1特性(最有力)で埋める。※ポケモン未特定時のみOCR生結果（空もあり得る）
    const identified = !!(guessed || validName);
    const abis = (matched && matched.abilities) || [];
    let ability = "", abilSrc = "";
    if (r.ability && abis.includes(r.ability)) { ability = r.ability; abilSrc = "read"; }
    else if (identified && abis.length && r.abilityCells) { const m = matchAbilityCells(r.abilityCells, abis, dicts.kana); if (m) { ability = m.name; abilSrc = "narrow"; } }
    if (!ability) { if (identified && abis.length) { ability = abis[0]; abilSrc = "default"; } else ability = r.ability || ""; }
    // 努力値(SP): 実数値OCRから逆算してバー読みの欠落(0読み)を補完。実数値が読めた枠は逆算値を優先、読めない枠はバー値
    const sp = spFromStats(matched?.base, r.stats, r.nature, r.sp, hpStat, stat);
    const member = {
      name,
      nature: r.nature || { plus: null, minus: null },
      sp,
      item: "なし",
      ability,
      moves: readMoves.slice(0, 4),
      undetMoves, // 未検出の技数（✎編集で保存すると消える）
      undetMoveIdx, // 検出失敗の元スロット＝表示で順番通りに出す
    };
    const slot = (targetSlot != null) ? targetSlot : (() => { const i = teams[active].findIndex((x) => !x); return i < 0 ? teams[active].length - 1 : i; })();
    setMember(active, slot, member);
    const pokeLabel = guessed ? `${name}(推定)` : validName ? name : "ポケモン不明";
    const statsStr = (r.stats || []).map((v) => v == null ? "?" : v).join("/");
    const abilLabel = ability ? (abilSrc === "read" ? ability : `${ability}(推定)`) : "(読めず)";
    setScanMsg(`枠${slot + 1}に登録: ${pokeLabel} / 実数値[${statsStr}] / SP計${Object.values(sp).reduce((a, b) => a + b, 0)} / 特性${abilLabel} / 技${readMoves.length}${undetMoves ? `・⚠検出失敗${undetMoves}件（✎で手動追加）` : ""}（✎で修正可）`);
    setScanning(false);
  }

  // ① スクショファイルから
  function handleScanFile(e) {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    setScanning(true); setScanMsg("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); runScan(img); };
    img.onerror = () => { setScanning(false); setScanMsg("画像読み込みに失敗しました"); };
    img.src = url;
  }

  // ===== チーム一括スキャン（編成「概要画面」の 能力タブ＋ステータスタブ から6匹まとめて登録） =====
  const [ovAb, setOvAb] = useState(null);   // 能力タブの読み取り結果（6セル）
  const [ovSt, setOvSt] = useState(null);   // ステータスタブの読み取り結果（6セル）
  const [ovMsg, setOvMsg] = useState("");
  const [ovLoading, setOvLoading] = useState(null); // 取込中のタブ("ability"|"status")。ボタン自体を「取り込み中…」表示にする
  // OCR候補の持ち物名＝汎用リスト＋pokemonDataのメガ形態から「○○ナイト」を生成
  const overviewItems = useMemo(() => {
    const megaBases = [...new Set(pokemonData.filter((p) => /\(メガ/.test(p.name)).map((p) => p.name.replace(/\(メガ.*/, "")))];
    // メガ石名は「種族名(±末尾1字省略)＋ナイト(±X/Y)」を候補化。ゲンガー→ゲンガナイト/フシギバナ→フシギバナイト/リザードン→リザードナイトX等の省略・分岐をカバー。
    const megaStones = [];
    for (const b of megaBases) for (const f of [b, b.slice(0, -1)]) megaStones.push(f + "ナイト", f + "ナイトX", f + "ナイトY");
    return [...new Set([...ALL_ITEM_NAMES, ...megaStones])];
  }, [pokemonData]);
  // 読み取れた側（能力 or ステータス）から即登録する。両タブが揃えばより堅牢に再登録し、揃った時点でリセットして次チームに備える。
  function scanOverview(img, tab) {
    let ab = ovAb, st = ovSt;
    let dy = 0;
    if (tab === "ability") {
      const dicts = { moves: [...new Set([...Object.keys(moveData), ...Object.keys(STATUS_MOVES)])], movesIllegal: ILLEGAL_MOVES, abilities: [...new Set(pokemonData.flatMap((p) => p.abilities || []))], items: overviewItems };
      ab = scanTeamOverviewAbility(img, dicts); dy = ab.dy || 0;
    } else {
      st = scanTeamOverviewStatus(img); dy = st.dy || 0;
    }
    const count = applyOverview(ab, st);
    const both = !!(ab && st);
    setOvAb(both ? null : ab); setOvSt(both ? null : st); // 両タブ反映済みなら次チームのためクリア（混在防止）
    const part = tab === "ability" ? "特性/持ち物/技" : "実数値/SP/性格";
    const lbl = tab === "ability" ? "能力" : "ステータス";
    const dyMsg = dy ? `（位置ズレ ${dy > 0 ? "+" : ""}${dy}px を自動補正）` : ""; // ランクマッチ画面など縦ズレを補正したら知らせる
    setOvMsg(`${lbl}タブ取込 → ${count}匹に${part}を登録${both ? "（両タブ反映で完了）" : "（もう片方のタブも取り込むと残りも反映）"}${dyMsg}`);
  }
  // ab/st のうち読めている方だけで登録（片方nullでもOK）。空きスロットは飛ばす。
  function applyOverview(ab, st) {
    if (!ab && !st) return 0;
    const KEYS = ["h", "a", "b", "c", "d", "s"]; let count = 0;
    for (let slot = 0; slot < 6; slot++) {
      const a = (ab && ab[slot]) || {}, s = (st && st[slot]) || {};
      const statsArr = st ? KEYS.map((k) => s.stats?.[k] ?? null) : null;
      const nRead = statsArr ? statsArr.filter((v) => v != null).length : 0;
      if (!((a.moves && a.moves.length) || a.ability || nRead >= 3)) continue; // 空きスロットは飛ばす
      const name = guessPokemon(pokemonData, a.moves || [], a.ability, statsArr, s.nature, hpStat, stat, s.sp) || pokemonData[0].name;
      const matched = pokemonData.find((p) => p.name === name);
      const sp = spFromStats(matched?.base, statsArr, s.nature, s.sp, hpStat, stat, true); // 概要画面はSP数値直読み→相互照合で実数値の誤読を訂正
      let ability = a.ability;
      if (matched && ability && !(matched.abilities || []).includes(ability)) ability = matched.abilities?.[0] || ability;
      if (!ability) ability = matched?.abilities?.[0] || "";
      const item = a.item || "なし"; // OCRで読んだ実名のまま登録（メガ石も「○○ナイト」で個別識別）
      setMember(active, slot, { name, nature: s.nature || { plus: null, minus: null }, sp, item, ability, moves: (a.moves || []).slice(0, 4), undetMoves: a.undetMoves || 0, undetMoveIdx: a.undetMoveIdx || [], abRead: !!ab, stRead: !!st }); // どのタブを取り込んだか＝未取込側のフィールドは表示で「未登録」に
      count++;
    }
    return count;
  }
  async function captureOverviewOBS(tab) {
    setOvLoading(tab); setOvMsg(""); // ボタン自体を「取り込み中…」に。下の結果メッセージは一旦消す
    try { const client = await obs.ensure(); const img = await obsShot(client, 1920, 1080); scanOverview(img, tab); }
    catch (e) { setOvMsg("OBS取込失敗: " + (e?.message || e)); }
    finally { setOvLoading(null); }
  }

  // ② OBS等の画面から直接（初回だけ共有元を選択→以降はボタンで今のフレームを取り込み）
  async function captureFromScreen(targetSlot) {
    setScanMsg("");
    try {
      let stream = streamRef.current;
      if (!stream || !stream.active) {
        if (!navigator.mediaDevices?.getDisplayMedia) { setScanMsg("この環境では画面取り込み非対応。スクショ登録を使ってください"); return; }
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
        streamRef.current = stream;
        const v = document.createElement("video"); v.srcObject = stream; v.muted = true;
        await v.play();
        videoRef.current = v;
        setShareOn(true);
        stream.getVideoTracks()[0].addEventListener("ended", () => { streamRef.current = null; videoRef.current = null; setShareOn(false); });
        await new Promise((res) => setTimeout(res, 500)); // 最初のフレーム安定待ち
      }
      const v = videoRef.current;
      if (!v || !v.videoWidth) { setScanMsg("映像を取得できません（共有元を確認）"); return; }
      setScanning(true);
      const cv = document.createElement("canvas"); cv.width = 1920; cv.height = 1080;
      cv.getContext("2d").drawImage(v, 0, 0, 1920, 1080);
      runScan(cv, targetSlot);
    } catch (e) {
      setScanning(false);
      let denied = false;
      try { denied = (await navigator.permissions.query({ name: "display-capture" })).state === "denied"; } catch {}
      if (denied) setScanMsg("この画面では画面共有が無効化されています。アプリを Chrome/Edge の通常タブで直接開いてから使ってください（埋め込みプレビューでは不可）");
      else if (e && e.name === "NotAllowedError") setScanMsg("画面共有がキャンセルされました（共有元の選択でキャンセルした場合に出ます）");
      else setScanMsg("取り込み失敗: " + (e?.message || e));
    }
  }
  function stopShare() {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null; videoRef.current = null; setShareOn(false); setScanMsg("画面共有を停止しました");
  }

  // ③ OBS WebSocketから直接（権限不要・どの環境でも動く）。現在の番組シーンを1920x1080で撮影→runScan。
  async function captureFromOBS(targetSlot) {
    setScanMsg("");
    try {
      const client = await obs.ensure(); // 共有接続（相手認識タブで繋いでいればそれを再利用）
      setScanning(true);
      const img = await obsShot(client, 1920, 1080);
      runScan(img, targetSlot);
    } catch (e) {
      setScanning(false);
      setScanMsg("OBS取り込み失敗: " + (e?.message || e) + "（OBSの「ツール→WebSocketサーバー設定」を有効化＋ポート/パスワード確認＋現在のシーンにゲーム画面を表示）");
    }
  }

  // ライブプレビューは🎬OBSタブ（親=ChampionsDamageCalc の共通ループ）に移設。タブを跨いでも生き続けるようになった。

  return (
    <div className="team-manager">
      <div className="team-manager-head">
        <h2>🧩 マイチーム登録</h2>
        <span className="team-manager-hint">OBS・スクショから自動登録。登録済みは計算タブからワンクリックで呼び出せます（{filled}/6）</span>
      </div>
      <div className="team-manager-body">
        {/* チーム1〜18: 枠幅いっぱいに9列×2行で均等配置（1つずつ大きく） */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 5, marginBottom: 10 }}>
          {teams.map((t, i) => {
            const nm = (names && names[i]) || `チーム${i + 1}`;
            return (
              <button key={i} onClick={() => setActive(i)} title={nm}
                style={{ padding: "6px 4px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: active === i ? accent : "#2a2a44", color: "#eee", border: "1px solid " + (active === i ? accent : "#3a3a5a"), display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 0 }}>
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</span>
                <span style={{ opacity: 0.9, fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{t.filter(Boolean).length}/6</span>
              </button>
            );
          })}
        </div>
        {/* 選択中チームのヘッダー: 名前(変更可)＋登録数(大)＋全リセット */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          {renaming ? (
            <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={20} placeholder={`チーム${active + 1}`}
              onBlur={() => { setName(active, nameInput.trim()); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { setName(active, nameInput.trim()); setRenaming(false); } if (e.key === "Escape") setRenaming(false); }}
              style={{ fontSize: 19, fontWeight: 700, background: "#0e1320", border: "1px solid " + accent, borderRadius: 7, color: "#fff", padding: "4px 10px", width: 220 }} />
          ) : (
            <>
              <span style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>{teamName}</span>
              <button onClick={() => { setNameInput((names && names[active]) || ""); setRenaming(true); }} title="チーム名を変更" style={miniBtn}>✎</button>
            </>
          )}
          <span style={{ fontSize: 16, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>{filled}/6</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setConfirmReset(true)} disabled={filled === 0}
            style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: filled === 0 ? "default" : "pointer", background: filled === 0 ? "#2a2a3a" : "#3a2424", color: filled === 0 ? "#667" : "#e6bcbc", border: "1px solid " + (filled === 0 ? "#33334a" : "#6b3535"), opacity: filled === 0 ? 0.6 : 1 }}>
            🗑 6匹を全てリセット
          </button>
        </div>
        <div className="tm-body2">
        <div className="tm-side">
        {/* OBS接続状態だけ表示（接続/設定/プレビューは「🎬 OBS」タブに集約）。取込ボタンは未接続でも自動で繋ぎ直す。 */}
        <div style={{ fontSize: 11, fontWeight: 600, color: obsConnected ? "#8fe6a0" : "#8a93a8", marginBottom: 6 }}>
          {obsConnected ? "🟢 OBS接続済み" : "⚪ OBS未接続（🎬 OBSタブで接続）"}
        </div>
        {scanMsg && <div style={{ fontSize: 11, color: "#9cf", marginBottom: 6, lineHeight: 1.35 }}>{scanMsg}</div>}
        {/* チーム一括スキャン（概要画面の 能力タブ＋ステータスタブ から6匹） */}
        <div style={{ border: "1px solid #2c4a6a", borderRadius: 8, padding: "8px 10px", marginBottom: 8, background: "#0f1b2e" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#aee0ff", marginBottom: 5 }}>🚀 チーム一括スキャン（6匹まとめて）</div>
          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 7, lineHeight: 1.4 }}>編成の「能力」「ステータス」画面を取り込んで6匹を登録（両方で完成）。読めない技は✎で補完。</div>
          {[["ability", "①能力タブ", ovAb], ["status", "②ステータスタブ", ovSt]].map(([tab, label, done]) => (
            <div key={tab} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, width: 110, flexShrink: 0, color: done ? "#8fe6a0" : "#cdd8ec" }} title={done ? "取込済み" : ""}>{done ? "✓ " : ""}{label}</span>
              <button onClick={() => captureOverviewOBS(tab)} disabled={!!ovLoading}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6, cursor: ovLoading ? "default" : "pointer", background: ovLoading === tab ? "#2a4a36" : "#1e3a2a", color: "#bfe6c8", border: "1px solid #356b45", opacity: (ovLoading && ovLoading !== tab) ? 0.45 : 1 }}>
                {ovLoading === tab ? "取り込み中…" : "🎬OBS取込"}
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            {(ovAb || ovSt) && (
              <button onClick={() => { setOvAb(null); setOvSt(null); setOvMsg("取込状態をリセットしました"); }}
                style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, cursor: "pointer", background: "transparent", color: "#8c98ae", border: "1px solid #35506b" }}>取込状態をリセット</button>
            )}
          </div>
          {ovMsg && <div style={{ fontSize: 11, color: "#9cf", marginTop: 5, lineHeight: 1.35 }}>{ovMsg}</div>}
        </div>
        {/* ライブプレビュー：🎬OBSタブと共通の親ループが描画（同じcanvas refを渡している）＝タブを跨いでも生きたまま。取り込む前に画面を確認できる。 */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#9aa6bd" }}>📺 プレビュー</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPreviewOn?.((v) => !v)}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer", background: previewOn ? "#3a2a2a" : "#1e3a2a", color: previewOn ? "#e6bcbc" : "#bfe6c8", border: "1px solid " + (previewOn ? "#6b3535" : "#356b45") }}>
              {previewOn ? "■ 停止" : "▶ ライブ"}
            </button>
          </div>
          <canvas ref={previewRef} width={640} height={360}
            style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 6, border: "1px solid #2c3854", background: "#000", display: "block" }} />
          <div style={{ fontSize: 11, opacity: 0.68, marginTop: 3, lineHeight: 1.4 }}>取り込み前のOBS映像確認用。{previewMsg && <span style={{ color: "#f9a" }}>／ {previewMsg}</span>}</div>
        </div>
        </div>
        <div className="tm-members">
        <MemberHeader />
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5 }}>
          {teams[active].map((m, slot) => (
            <MemberCell key={slot} member={m} active={!!m && (m.name === atkName || m.name === defName)} accent={accent} sideLabel="こうげき" busy={scanning}
              pokemonData={pokemonData} hpStat={hpStat} stat={stat}
              canUp={slot > 0} canDown={slot < TEAM_SIZE - 1}
              onMoveUp={() => moveMember(slot, -1)} onMoveDown={() => moveMember(slot, +1)}
              onPick={() => m && onApply(m, "atk")}
              onScan={() => captureFromOBS(slot)}
              onEdit={() => setEditing({ team: active, slot })}
              onClear={() => setMember(active, slot, null)} />
          ))}
        </div>
        <div style={{ fontSize: 11, opacity: 0.68, marginTop: 6 }}>✎で各ステータスを編集 ／ メンバーをクリックで計算タブのこうげき側にセット ／ {filled}匹登録済み</div>
        {filled > 0 && (
          <div style={{ fontSize: 11.5, color: "#8c93b0", lineHeight: 1.55, marginTop: 6 }}>
            ※ 読み取りミス等がありましたら、お手数ですが <b style={{ color: "#c8a0f0", fontWeight: 700 }}>💬フィードバック</b> タブからご報告ください。
          </div>
        )}
        </div>
        </div>
      </div>
      {editing && (
        <MemberEditor pokemonData={pokemonData} moveData={moveData} statusMoves={STATUS_MOVES} itemOptions={itemOptions} hpStat={hpStat} stat={stat} accent={accent}
          initial={editing.initial || teams[editing.team][editing.slot]}
          onCancel={() => { scanCropsRef.current = null; setEditing(null); }}
          onSave={(m) => {
            setMember(editing.team, editing.slot, m);
            const crops = scanCropsRef.current || []; // スキャンで未一致だった名前/特性を学習（次回から自動・localStorageに蓄積）
            for (const u of crops) {
              if (u.kind === "name" && m.name) saveTextTemplate("name", m.name, u.bytes);       // ポケモン名はまるごと照合
              else if (u.kind === "ability" && m.ability && u.cells) learnCells(u.cells, m.ability); // 特性は1文字ずつカナ辞書へ
            }
            scanCropsRef.current = null;
            setEditing(null);
          }} />
      )}
      {confirmReset && createPortal(
        <div onClick={() => setConfirmReset(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#161d2e", border: "1px solid #6b3535", borderRadius: 14, padding: "22px 24px", maxWidth: 380, boxShadow: "0 16px 48px rgba(0,0,0,.6)" }}>
            <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#fff" }}>本当にリセットしますか？</p>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#c4cede", lineHeight: 1.5 }}>「{teamName}」に登録した<b style={{ color: "#f5a3b6" }}>{filled}匹を全て削除</b>します。この操作は元に戻せません。</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setConfirmReset(false)} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", background: "#2a3148", color: "#c4cede", border: "1px solid #3a4a6a" }}>やめる</button>
              <button onClick={() => { setTeam(active, []); setConfirmReset(false); }} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", background: "#7a2828", color: "#ffd6d6", border: "1px solid #9a3a3a", fontWeight: 700 }}>リセットする</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
