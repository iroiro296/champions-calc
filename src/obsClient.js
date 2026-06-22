import { useState, useRef } from "react";

const loadObsCfg = () => { try { return JSON.parse(localStorage.getItem("obsCfg") || "{}"); } catch { return {}; } };
const saveObsCfg = (patch) => { try { localStorage.setItem("obsCfg", JSON.stringify({ ...loadObsCfg(), ...patch })); } catch {} };

// ダメージ計算タブ(相手認識)とマイチームタブ(ステ画面スキャン)で OBS 接続を共有するフック。
// 親(ChampionsDamageCalc)で1つだけ持ち、両タブへ props で配る → 片方が繋げば両方が接続済みになり、
// タブ切替でも接続が生き続ける（親はアンマウントしないので ref のクライアントが保持される）。
export function useObs() {
  const ref = useRef(null);
  const manualRef = useRef(false);  // ユーザーが「切断」した＝自動再接続しない
  const credRef = useRef(null);     // 直近に接続成功した接続情報（自動再接続で再利用）
  const reconnRef = useRef(null);   // 再接続タイマー
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cfg = loadObsCfg();
  const [host, setHost] = useState(cfg.host || "localhost");
  const [port, setPort] = useState(cfg.port || "4455");
  const [pass, setPass] = useState(cfg.pass || "");

  // 指定の接続情報で実際にWebSocketを張り、ref と onClose を設定する。失敗時は client を閉じて throw。
  async function openWith(creds) {
    const client = createOBSClient();
    try {
      await Promise.race([
        client.connect(String(creds.host || "localhost").trim() || "localhost", String(creds.port || "4455").trim() || "4455", creds.pass || ""),
        new Promise((_, rej) => setTimeout(() => rej(new Error("接続タイムアウト")), 6000)),
      ]);
    } catch (e) { try { client.close(); } catch {} throw e; }
    ref.current = client;
    client.onClose = () => {
      ref.current = null; setConnected(false);
      // ユーザーが切断していない想定外の切断（タブ操作/スキャン負荷/OBS側の都合など）→ 自動で繋ぎ直す＝
      // 「ダメ計タブを開いたら接続が切れる」等が起きても勝手に復帰する。
      if (!manualRef.current && credRef.current) scheduleReconnect(1);
    };
    setConnected(true);
    return client;
  }

  // 想定外切断後の自動再接続（バックオフ。上限まで試して諦める）
  function scheduleReconnect(attempt) {
    clearTimeout(reconnRef.current);
    if (manualRef.current || ref.current?.isOpen() || !credRef.current) return;
    setError(`接続が切れました。自動再接続中…(${attempt})`);
    reconnRef.current = setTimeout(async () => {
      if (manualRef.current || ref.current?.isOpen() || !credRef.current) return;
      try { await openWith(credRef.current); setError(""); }
      catch { if (attempt < 15 && !manualRef.current) scheduleReconnect(attempt + 1); else setError("OBSへ自動再接続できませんでした。「接続」で繋ぎ直してください。"); }
    }, Math.min(800 * attempt, 5000));
  }

  async function connect() {
    if (ref.current?.isOpen()) { setConnected(true); return ref.current; }
    manualRef.current = false;
    clearTimeout(reconnRef.current);
    setBusy(true); setError("");
    try {
      const creds = { host, port, pass };
      const client = await openWith(creds);
      credRef.current = creds;          // 以後の自動再接続はこの情報で
      saveObsCfg(creds);
      return client;
    } catch (e) {
      setConnected(false);
      setError(String(e?.message || e));
      throw e;
    } finally { setBusy(false); }
  }
  async function ensure() { return ref.current?.isOpen() ? ref.current : await connect(); }
  function disconnect() { manualRef.current = true; clearTimeout(reconnRef.current); try { ref.current?.close(); } catch {} ref.current = null; setConnected(false); setError(""); }

  return { ref, connected, busy, error, setError, host, setHost, port, setPort, pass, setPass, connect, ensure, disconnect };
}

// OBSから1フレーム撮る共通関数（プレビュー/スキャン/相手認識すべてで使う）。
// obsCfg.source が選ばれていればそのソースを直接、未選択/__PROGRAM__は現在の番組シーンを撮る。
// fmt未指定は png（可逆）＝OCR用。jpg圧縮ノイズは文字テンプレ(png由来)とのハミングを底上げして技/数字の誤読・性格矢印の色滲み→誤検出を招くため、スキャンは必ずpng。プレビューだけ軽さ優先でjpg可。
export async function obsShot(client, w, h, fmt) {
  let sel; try { sel = JSON.parse(localStorage.getItem("obsCfg"))?.source; } catch {}
  const sourceName = (sel && sel !== "__PROGRAM__") ? sel : (await client.request("GetCurrentProgramScene")).currentProgramSceneName;
  const shot = await client.request("GetSourceScreenshot", { sourceName, imageFormat: fmt || "png", imageWidth: w, imageHeight: h });
  return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("画像取得失敗")); i.src = shot.imageData; });
}

/* 最小限の obs-websocket v5 クライアント（ブラウザ用）
   - connect(host, port, password): Hello/Identify ハンドシェイク（認証は SHA256 チャレンジ）
   - request(type, data): リクエスト/レスポンスを requestId で対応付け
   使い方:
     const c = createOBSClient();
     await c.connect("localhost", "4455", "pass");
     const { inputs } = await c.request("GetInputList");
     const { imageData } = await c.request("GetSourceScreenshot", { sourceName, imageFormat:"jpg", imageWidth:1920, imageHeight:1080 });
*/
export function createOBSClient() {
  let ws = null;
  let nextId = 1;
  const pending = new Map();
  const handlers = { onClose: null };

  async function sha256b64(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function connect(host, port, password) {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        ws = new WebSocket(`ws://${host}:${port}`);
      } catch (e) {
        reject(new Error("WebSocketを開けませんでした"));
        return;
      }
      ws.onmessage = async (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.op === 0) {
          // Hello → Identify
          const d = { rpcVersion: 1 };
          if (msg.d && msg.d.authentication) {
            const { challenge, salt } = msg.d.authentication;
            const secret = await sha256b64((password || "") + salt);
            d.authentication = await sha256b64(secret + challenge);
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (msg.op === 2) {
          // Identified
          settled = true;
          resolve();
        } else if (msg.op === 7) {
          // RequestResponse
          const p = pending.get(msg.d.requestId);
          if (p) {
            pending.delete(msg.d.requestId);
            if (msg.d.requestStatus && msg.d.requestStatus.result) p.resolve(msg.d.responseData || {});
            else p.reject(new Error(msg.d.requestStatus?.comment || "リクエストが失敗しました"));
          }
        }
      };
      ws.onerror = () => {
        if (!settled) reject(new Error("接続エラー（OBSのWebSocketサーバーが有効か、ポートを確認してください）"));
      };
      ws.onclose = () => {
        if (!settled) reject(new Error("接続が閉じられました（ポート/パスワードを確認してください）"));
        handlers.onClose && handlers.onClose();
      };
    });
  }

  function request(requestType, requestData) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) { reject(new Error("未接続です")); return; }
      const requestId = "r" + (nextId++);
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData: requestData || {} } }));
      setTimeout(() => {
        if (pending.has(requestId)) { pending.delete(requestId); reject(new Error("タイムアウト")); }
      }, 8000);
    });
  }

  return {
    connect,
    request,
    close() { try { ws && ws.close(); } catch {} ws = null; pending.clear(); },
    isOpen() { return !!ws && ws.readyState === 1; },
    set onClose(fn) { handlers.onClose = fn; },
  };
}
