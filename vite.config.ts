import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = (env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '').trim();
  return {
    base: './',
    plugins: [],
    envPrefix: 'QUANTOS_PUBLIC_',
    define: {
      __QE_VITE_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
