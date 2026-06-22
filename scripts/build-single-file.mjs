/**
 * 単一JSXファイルを生成するスクリプト
 * pokedex-data.js のデータを ChampionsDamageCalc.jsx にインライン展開して
 * Claude.ai に貼り付けられる単一ファイルを生成する
 *
 * 実行: node scripts/build-single-file.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const dataFile = readFileSync("src/pokedex-data.js", "utf-8");
const jsxFile  = readFileSync("src/ChampionsDamageCalc.jsx", "utf-8");

// データファイルから export const M_DATA = {...}; と export const POKEMON_DATA = [...]; を抽出
const mMatch   = dataFile.match(/export const M_DATA = ([\s\S]*?);\n\nexport/);
const pkMatch  = dataFile.match(/export const POKEMON_DATA = ([\s\S]*?);\n$/);

if (!mMatch || !pkMatch) {
  console.error("データ抽出失敗: pokedex-data.js のフォーマットを確認してください");
  process.exit(1);
}

const mData   = mMatch[1];
const pkData  = pkMatch[1];

// import文とデータ参照を置き換え
let output = jsxFile
  // import削除
  .replace(/^import \{ useState.*\n/m, 'import { useState, useMemo, useEffect, useRef } from "react";\n')
  .replace(/^import \{ M_DATA.*\n/m, "")
  // M_DATA / POKEMON_DATA のインライン定義を注入
  .replace(
    "const M = { ...M_DATA };",
    `const M_DATA = ${mData};\nconst M = { ...M_DATA };`
  )
  .replace(
    "const POKEMON = POKEMON_DATA;",
    `const POKEMON_DATA = ${pkData};\nconst POKEMON = POKEMON_DATA;`
  );

writeFileSync("champions-damage-calc-full.jsx", output, "utf-8");
console.log("champions-damage-calc-full.jsx を生成しました");
console.log(`サイズ: ${(output.length / 1024).toFixed(0)} KB`);
