import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 前端构建配置。
// 产物输出到 ../src-tauri/dist（由 tauri.conf.json 的前端配置引用）。
export default defineConfig({
  plugins: [react()],
  // Tauri 要求相对 base，避免资源路径问题
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // 允许 Tauri 注入环境
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    // Tauri 的 frontendDist 为 "dist"（相对 src-tauri/），故产物输出到 src-tauri/dist/
    // 注意：outDir 相对 Vite root（项目根），直接写子目录路径即可，勿加 "../"
    outDir: 'src-tauri/dist',
    emptyOutDir: true,
    target: 'es2021',
  },
})
