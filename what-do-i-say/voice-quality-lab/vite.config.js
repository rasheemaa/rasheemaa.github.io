import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: '/what-do-i-say/voice-quality-lab/',
  build: {
    outDir: '../',
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: { entryFileNames: 'assets/quality-v1.js' }
    }
  }
});
