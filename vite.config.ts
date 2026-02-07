import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isActionsBuild = process.env.GITHUB_ACTIONS === 'true';
const isUserOrOrgPagesRepo = repositoryName?.endsWith('.github.io') ?? false;

const basePath =
  process.env.VITE_BASE_PATH ??
  (isActionsBuild && repositoryName && !isUserOrOrgPagesRepo ? `/${repositoryName}/` : '/');

export default defineConfig({
  base: basePath,
  build: {
    chunkSizeWarningLimit: 700
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      manifest: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'robots.txt'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}']
      }
    })
  ]
});
