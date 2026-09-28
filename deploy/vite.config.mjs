import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./web',import.meta.url)),
  plugins:[react()],
  publicDir:fileURLToPath(new URL('../public',import.meta.url)),
  build:{outDir:fileURLToPath(new URL('../outputs/server/public',import.meta.url)),emptyOutDir:true},
});
