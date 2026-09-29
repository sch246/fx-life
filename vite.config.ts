import { defineConfig } from 'vite';

// 相对路径，便于把 dist/ 当纯静态页面放到任何地方（含 GitHub Pages 子路径）。
export default defineConfig({
  base: './',
});
