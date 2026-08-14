/**
 * Click-Ship Extension - Vite Build Configuration
 */

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// Read manifest
const manifest = JSON.parse(
  readFileSync(new URL('./manifest.json', import.meta.url), 'utf8')
);

const __dirname = import.meta.dirname;

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Entry points are derived from manifest.json by the crx plugin.
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    },
    // Generate source maps for debugging
    sourcemap: process.env.NODE_ENV !== 'production'
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content')
    }
  },

  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
});
