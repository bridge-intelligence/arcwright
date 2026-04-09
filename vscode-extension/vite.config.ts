import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/webview',
  build: {
    outDir: resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    // Build as IIFE (not ESM) for VS Code webview compatibility
    rollupOptions: {
      input: resolve(__dirname, 'src/webview/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'assets/index.js',
        assetFileNames: 'assets/[name].[ext]',
        // No code splitting for IIFE
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
