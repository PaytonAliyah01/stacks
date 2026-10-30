import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` makes one self-contained file (dist/index.html) that opens
// by double-clicking it, no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
