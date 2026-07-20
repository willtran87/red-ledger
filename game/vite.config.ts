import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  publicDir: resolve(__dirname, '../assets'),
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    copyPublicDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
