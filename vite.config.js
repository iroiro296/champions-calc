import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// package.json の version をビルド時に埋め込む（フィードバックタブの「バージョン」表示用）。
// リリース時は package.json の "version" を上げるだけで反映される。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 任意のサブパス（GitHub Pages等）でも動くよう相対パスで出力
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
