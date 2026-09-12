import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // A physical entry lets static hosts serve /nilgiris/ without an SPA rewrite.
      name: 'nilgiris-static-entry',
      enforce: 'post',
      generateBundle(_, bundle) {
        const index = bundle['index.html']
        if (index?.type === 'asset') {
          this.emitFile({
            type: 'asset',
            fileName: 'nilgiris/index.html',
            source: String(index.source).replace(
              '<title>prominence</title>',
              '<title>The Nilgiris · Mountainology</title>',
            ),
          })
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
