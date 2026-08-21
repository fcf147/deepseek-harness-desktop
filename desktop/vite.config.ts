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
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021',
  },
})
