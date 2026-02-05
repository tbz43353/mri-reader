import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteCommonjs(),
  ],
  base: './',
  server: {
    port: 5175,
    strictPort: false,
  },
  worker: {
    // Use ES module format for workers (required for code-splitting builds)
    format: 'es',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // External optional dependencies that Cornerstone3D doesn't require for basic usage
      external: ['@icr/polyseg-wasm'],
      onwarn(warning, warn) {
        // Suppress warnings for optional dependencies and circular dependencies in node_modules
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        if (warning.message?.includes('@icr/polyseg-wasm')) return;
        warn(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Exclude dicom-image-loader from pre-bundling (it has web workers that need special handling)
    exclude: ['@cornerstonejs/dicom-image-loader', '@icr/polyseg-wasm'],
    // Include dicom-parser to ensure it's properly bundled
    include: ['dicom-parser'],
  },
});
