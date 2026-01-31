import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { builtinModules } from 'module';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            ssr: true,
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
              fileName: () => '[name].cjs',
            },
            rollupOptions: {
              external: ['electron', ...builtinModules],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            ssr: true,
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => '[name].cjs',
            },
            rollupOptions: {
              external: ['electron', ...builtinModules],
            },
          },
        },
      },
    ]),
    renderer(),
  ].filter(Boolean),
  // Conditional base: use relative path for Electron builds (when running via npm run electron:build)
  // We will set VITE_ELECTRON_BUILD env var in the script if needed, or rely on mode.
  // Actually, for Electron production build, we usually want relative paths.
  // We can default to existing unless we detect Electron.
  base: process.env.ELECTRON_BUILD ? './' : "/pl_humanize/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
