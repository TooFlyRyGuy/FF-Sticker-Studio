import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isPreview = !!process.env.BOLT_ENVIRONMENT || !!process.env.WEBCONTAINER;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: isPreview
          ? false
          : { overlay: true },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
