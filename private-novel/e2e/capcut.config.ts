import {defineConfig} from '@playwright/test';
import base from '../playwright.config';
export default defineConfig({...base,testDir:'.',testMatch:'tts-capcut.spec.ts',outputDir:'../.dsh-tmp/capcut-e2e-preview',use:{...base.use,baseURL:'http://127.0.0.1:5189'},webServer:{cwd:process.cwd(),command:'npm.cmd exec -- vite preview --outDir .dsh-tmp/capcut-dist --host 127.0.0.1 --port 5189 --strictPort',url:'http://127.0.0.1:5189',reuseExistingServer:false,timeout:60000}});
