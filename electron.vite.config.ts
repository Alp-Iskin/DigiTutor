import { resolve } from 'path'
import { defineConfig } from 'electron-vite'

// Two renderer entry points: the bottom-right popup, and the settings window.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        // kokoro-js's exports map only exposes the node build (which imports
        // fs/path). Force the self-contained web build for the renderer worker.
        'kokoro-js': resolve(__dirname, 'node_modules/kokoro-js/dist/kokoro.web.js')
      }
    },
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/renderer/popup/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html')
        }
      }
    }
  }
})
