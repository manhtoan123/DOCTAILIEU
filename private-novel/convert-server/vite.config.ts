import {defineConfig} from 'vite';

export default defineConfig({
  publicDir:false,
  build:{
    target:'node24',
    ssr:'convert-server/main.ts',
    outDir:'.dsh-tmp/convert-service',
    emptyOutDir:true,
    rollupOptions:{output:{entryFileNames:'convert-server.mjs'}},
  },
});
