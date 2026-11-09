import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
// Keep CJK maps, fallback fonts and image decoders local, with the same PDF.js version.
function pdfAssets(){
 const root=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
 const assets=new Map<string,string>();
 for(const folder of ['cmaps','standard_fonts','wasm'])for(const file of readdirSync(join(root,folder)))if((/\.(bcmap|pfb|ttf|wasm)$/.test(file)||['jbig2_nowasm_fallback.js','openjpeg_nowasm_fallback.js'].includes(file)))assets.set(`pdfjs/${folder}/${file}`,join(root,folder,file));
 return {name:'local-pdf-assets',generateBundle(this:{emitFile:(file:{type:'asset';fileName:string;source:Uint8Array})=>unknown}){for(const [fileName,path] of assets)this.emitFile({type:'asset',fileName,source:readFileSync(path)});},configureServer(server:import('vite').ViteDevServer){server.middlewares.use((req,res,next)=>{const path=assets.get((req.url??'').split('?')[0].replace(/^\//,''));if(!path)return next();res.setHeader('Content-Type',path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(readFileSync(path));});}};
}
export default defineConfig({ plugins: [react(),pdfAssets()], server: { port: 5173, strictPort: true }, build: { sourcemap: false } });
