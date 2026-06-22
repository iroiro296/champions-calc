# ポケモンチャンピオンズ ダメージ計算ツール

ポケモンチャンピオンズ（レギュレーションM-A）対応の非公式ダメージ計算ツール。

## 機能

- 内定全275フォーム収録（メガシンカ・リージョンフォーム含む、ポケモン徹底攻略の内定リストと照合済み）
- チャンピオンズ仕様の計算式（Lv50固定 / 個体値31固定 / 能力ポイントSP制）
- 天気・フィールド・特性・もちもの・壁・状況技・確定急所などの補正に対応
- 検索はひらがな/カタカナ/ローマ字/「メガ◯◯」「アローラ◯◯」表記に対応
- 耐久力推定: 与ダメ%から相手のHP/防御SP・性格を逆算（回復アイテム自動補正）
- 攻撃力推定: 被ダメ実数値から相手の攻撃SP・性格を逆算
- ポケモン・技の選択履歴（最新順チップ表示）

## 開発・ビルド

```bash
npm install
npm run dev        # 開発サーバー
npm run build      # 本番ビルド → dist/（そのまま静的ホスティングに配置可能）
```

### データ更新

```bash
node scripts/fetch-showdown-data.mjs   # Showdown Champions mod + PokeAPIから再生成
node scripts/compare-yakkun.mjs        # yakkun内定リストとの照合
node scripts/build-single-file.mjs     # 単一JSXファイル版を生成（Claude.ai artifact用）
```

## 公開方法

`dist/` フォルダをそのまま GitHub Pages / Netlify / Cloudflare Pages 等にアップロードするだけで動きます（相対パスでビルドされるためサブディレクトリ配置も可）。

## データソース

- 種族値・技・特性: [Pokémon Showdown](https://github.com/smogon/pokemon-showdown)（Champions mod）
- 日本語名: [PokeAPI](https://pokeapi.co/)
- 内定リスト照合: [ポケモン徹底攻略](https://yakkun.com/ch/)

## 免責

非公式のファンメイドツールです。ポケットモンスター・ポケモンは任天堂・クリーチャーズ・ゲームフリークの登録商標です。
