import { useState, useEffect } from "react";

// 「🎬 OBS」タブの中身：接続設定 ＋ 撮影ソース選択 ＋ ライブプレビュー。
// プレビューの取得ループ自体は親(ChampionsDamageCalc)に1個だけ置く＝タブを跨いでも死なない。ここはその映像canvasと操作だけ。
// props: obs(useObsの返り値) / previewRef(親のループが描くcanvas ref) / previewOn,setPreviewOn(共有プレビューON/OFF) / previewMsg(取得状況)
const inp = { boxSizing: "border-box", background: "#0e1320", border: "1px solid #2c3854", borderRadius: 6, color: "#c4cede", fontSize: 12, padding: "6px 9px" };

export default function ObsPanel({ obs, previewRef, previewOn, setPreviewOn, previewMsg }) {
  const { connected, busy, error, host, setHost, port, setPort, pass, setPass, connect, disconnect, ref } = obs;
  const [sources, setSources] = useState([]);
  const [source, setSource] = useState(() => { try { return JSON.parse(localStorage.getItem("obsCfg") || "{}").source || "__PROGRAM__"; } catch { return "__PROGRAM__"; } });

  // 接続中はソース一覧(GetInputList)を取得。音声系(wasapi等)は映像が無い＝プレビューが黒くなるので除外。
  async function loadSources() {
    try { const c = ref.current; if (!c?.isOpen()) return; const inputs = ((await c.request("GetInputList")).inputs || []).filter((i) => !/audio|wasapi|coreaudio|pulse|sndio|jack|mic/i.test(i.inputKind || "")).map((i) => i.inputName); setSources(inputs); } catch {}
  }
  useEffect(() => {
    if (!connected) return;
    loadSources();
    // 既定ソース（現在のシーン）を obsCfg にも保存 → 相手認識/スキャンが「ソース未選択」でも接続だけで即動く
    try { const c = JSON.parse(localStorage.getItem("obsCfg") || "{}"); if (!c.source) localStorage.setItem("obsCfg", JSON.stringify({ ...c, source })); } catch {}
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps
  // ソース選択は obsCfg.source に保存（obsShot/相手認識/スキャンが共通で参照する単一の真実）
  function pickSource(v) { setSource(v); try { const c = JSON.parse(localStorage.getItem("obsCfg") || "{}"); localStorage.setItem("obsCfg", JSON.stringify({ ...c, host, port, pass, source: v })); } catch {} }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "4px 2px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#aee0ff", marginBottom: 4 }}>🎬 OBS接続</div>
      <div style={{ fontSize: 11.5, opacity: 0.72, marginBottom: 12, lineHeight: 1.5 }}>
        OBSの「ツール → WebSocketサーバー設定」を有効化し、ここで接続します。接続はアプリ全体で共有され、マイチーム／相手認識の取り込みにそのまま使われます（権限不要・推奨）。
      </div>

      {/* 接続 */}
      <div style={{ border: "1px solid #2c3854", borderRadius: 10, padding: "12px 14px", marginBottom: 12, background: "#0f1626" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: connected ? "#8fe6a0" : "#8a93a8" }}>{connected ? "🟢 接続済み" : "⚪ 未接続"}</span>
          <div style={{ flex: 1 }} />
          {connected
            ? <button onClick={() => disconnect()} style={{ fontSize: 12, padding: "6px 16px", borderRadius: 6, cursor: "pointer", background: "#3a2a2a", color: "#e6bcbc", border: "1px solid #6b3535" }}>切断</button>
            : <button onClick={() => connect().catch(() => {})} disabled={busy} style={{ fontSize: 12, fontWeight: 600, padding: "6px 18px", borderRadius: 6, cursor: busy ? "default" : "pointer", background: "#234a2e", color: "#bfe6c8", border: "1px solid #356b45" }}>{busy ? "接続中…" : "接続"}</button>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 120px" }}><div style={{ fontSize: 11, color: "#8a93a8", marginBottom: 3 }}>ホスト</div><input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" style={{ ...inp, width: "100%" }} /></label>
          <label style={{ flex: "0 1 90px" }}><div style={{ fontSize: 11, color: "#8a93a8", marginBottom: 3 }}>ポート</div><input value={port} onChange={(e) => setPort(e.target.value)} placeholder="4455" style={{ ...inp, width: "100%" }} /></label>
          <label style={{ flex: "1 1 160px" }}><div style={{ fontSize: 11, color: "#8a93a8", marginBottom: 3 }}>パスワード</div><input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="未設定なら空欄" style={{ ...inp, width: "100%" }} /></label>
        </div>
        {error && <div style={{ fontSize: 11, color: "#f9a", lineHeight: 1.35 }}>{error}</div>}
      </div>

      {/* 撮影ソース */}
      <div style={{ border: "1px solid #2c3854", borderRadius: 10, padding: "12px 14px", marginBottom: 12, background: "#0f1626" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#cdd8ec", marginBottom: 6 }}>撮影ソース</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8, lineHeight: 1.4 }}>ゲーム画面を映しているソース（または「現在のシーン」）を選びます。<b>ゲームを全画面で映すソース</b>を選ぶと読み取り枠と揃います。</div>
        <select value={source} onChange={(e) => pickSource(e.target.value)} disabled={!connected} style={{ ...inp, width: "100%", cursor: connected ? "pointer" : "default", opacity: connected ? 1 : 0.6 }}>
          <option value="__PROGRAM__">（番組: 現在のシーン）</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!connected && <div style={{ fontSize: 11, color: "#8a93a8", marginTop: 6 }}>※接続するとソース一覧が出ます</div>}
      </div>

      {/* プレビュー */}
      <div style={{ border: "1px solid #2c3854", borderRadius: 10, padding: "12px 14px", background: "#0f1626" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#cdd8ec" }}>📺 プレビュー（映っているか確認）</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setPreviewOn((v) => !v)} disabled={!connected}
            style={{ fontSize: 12, padding: "5px 16px", borderRadius: 6, cursor: connected ? "pointer" : "default", opacity: connected ? 1 : 0.5, background: previewOn ? "#3a2a2a" : "#1e3a2a", color: previewOn ? "#e6bcbc" : "#bfe6c8", border: "1px solid " + (previewOn ? "#6b3535" : "#356b45") }}>
            {previewOn ? "■ 停止" : "▶ ライブ"}
          </button>
        </div>
        <canvas ref={previewRef} width={640} height={360}
          style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 8, border: "1px solid #2c3854", background: "#000", display: "block" }} />
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.4 }}>
          OBSが今映している映像をここに表示します。タブを離れると止まりますが、戻れば自動で再開します（接続は維持されます）。
          {previewMsg && <span style={{ color: "#f9a" }}> ／ {previewMsg}</span>}
        </div>
      </div>
    </div>
  );
}
