import { useState, useEffect } from "react";

// フィードバックタブ。送信内容は ①この端末(localStorage)に控え ＋ ②Googleフォーム設定時はそこへPOST。
const KEY = "championsFeedback";
const CATEGORIES = ["不具合の報告", "機能の要望", "その他"];

// ▼▼ Googleフォーム連携（ここを埋めると送信内容が自分のGoogleフォーム→スプレッドシートに届く。空のままなら端末内保存のみ）▼▼
// GFORM_ID  : 送信URL  https://docs.google.com/forms/d/e/【ここ】/formResponse  の【ここ】の長い文字列
// GFORM_ENTRY: 各項目の「entry.数字」。フォーム編集→右上⋮→「事前入力したURLを取得」で各欄にダミー入力すると、生成URLに entry.数字=値 が並ぶ → それを写す
const GFORM_ID = "1FAIpQLSfr1zv0cJlQ2L5rM8s4DeOQMPlUIr0sEtDwVUBHERrywabHEQ";
const GFORM_ENTRY = { cat: "entry.926364873", text: "entry.1237453704" }; // 種類 / 内容

// 実装予定（ロードマップ）。done: true は実装済み（取り消し線＋実装完了表示）
const PLANNED = [
  { text: "採用率の高い技を上に表示", done: true },
  { text: "ダブルバトルへの対応", done: true },
];

export default function FeedbackPanel({ version = "dev" }) {
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => { try { setHistory(JSON.parse(localStorage.getItem(KEY)) || []); } catch {} }, []);

  const save = (list) => { setHistory(list); try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  const submit = () => {
    if (!text.trim()) return;
    const entry = { id: Date.now(), cat, text: text.trim(), at: new Date().toLocaleString("ja-JP") };
    save([entry, ...history].slice(0, 50)); // まず端末内に控え
    // Googleフォームが設定済みなら送信（no-cors＝レスポンスは読めないが投稿は通る。失敗しても控えは残る）
    if (GFORM_ID && GFORM_ENTRY.text) {
      const fd = new FormData();
      if (GFORM_ENTRY.cat) fd.append(GFORM_ENTRY.cat, cat);
      fd.append(GFORM_ENTRY.text, entry.text);
      try { fetch(`https://docs.google.com/forms/d/e/${GFORM_ID}/formResponse`, { method: "POST", mode: "no-cors", body: fd }); } catch {}
    }
    setText(""); setSent(true);
    setTimeout(() => setSent(false), 4000);
  };
  const remove = (id) => save(history.filter((e) => e.id !== id));

  const card = { background: "#0f1626", border: "1px solid #232d44", borderRadius: 12, padding: 16, marginBottom: 16 };
  const label = { fontSize: 12, fontWeight: 700, color: "#9aa6bd", marginBottom: 6, display: "block" };
  const h2 = { fontSize: 15, fontWeight: 800, color: "#e8ecf4", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "4px 2px 40px" }}>
      <h2 style={{ ...h2, fontSize: 20 }}>💬 フィードバック</h2>
      <p style={{ fontSize: 13, color: "#9aa6bd", lineHeight: 1.6, marginTop: 0 }}>
        何かありましたらお気軽にお寄せください。頂いた内容は今後の改善に活用します。
      </p>

      {/* 実装予定（ロードマップ）＝メッセージ欄より上に配置 */}
      <div style={card}>
        <h2 style={h2}>🔧 実装予定</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#9aa6bd", lineHeight: 1.9 }}>
          {PLANNED.map((k, i) => (
            <li key={i}>
              <span style={k.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{k.text}</span>
              {k.done && <span style={{ marginLeft: 8, color: "#5fcf80", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>✅ 実装完了</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* 投稿フォーム */}
      <div style={card}>
        <h2 style={h2}>📝 メッセージを送る</h2>
        <span style={label}>種類</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                background: cat === c ? "var(--brand)" : "#1a2336", color: cat === c ? "#1a1030" : "#cfe0ff",
                border: "1px solid " + (cat === c ? "var(--brand)" : "#2c3854") }}>{c}</button>
          ))}
        </div>

        <span style={label}>内容</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          style={{ width: "100%", boxSizing: "border-box", background: "#0b101c", color: "#eef3ff", border: "1px solid #2c3854",
            borderRadius: 8, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={submit} disabled={!text.trim()}
            style={{ padding: "9px 22px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, cursor: text.trim() ? "pointer" : "default",
              background: text.trim() ? "var(--brand)" : "#2a3148", color: text.trim() ? "#1a1030" : "#6b7794" }}>送信する</button>
          {sent && <span style={{ fontSize: 13, color: "#7fe0b0", fontWeight: 600 }}>✓ 送信しました。ありがとうございます！</span>}
        </div>
        <p style={{ fontSize: 11, color: "#6b7794", margin: "12px 0 0", lineHeight: 1.5 }}>
          {GFORM_ID
            ? "※ 送信内容は運営に届きます（この端末にも控えが残ります）。"
            : "※ 現在は送信先サーバー準備中のため、内容はお使いの端末内（ブラウザ）に保存されます。"}
        </p>
      </div>

      {/* 送信履歴 */}
      {history.length > 0 && (
        <div style={card}>
          <h2 style={h2}>🗂 送信した内容（この端末）</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((e) => (
              <div key={e.id} style={{ background: "#0b101c", border: "1px solid #232d44", borderRadius: 8, padding: "8px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1030", background: "var(--brand)", borderRadius: 5, padding: "1px 7px" }}>{e.cat}</span>
                  <span style={{ fontSize: 11, color: "#6b7794" }}>{e.at}</span>
                  <button onClick={() => remove(e.id)} title="削除"
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7794", cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
                <div style={{ fontSize: 13, color: "#dbe4f3", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{e.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* バージョン */}
      <p style={{ fontSize: 11, color: "#6b7794", textAlign: "center", margin: "4px 0 0" }}>バージョン: {version}</p>
    </div>
  );
}
