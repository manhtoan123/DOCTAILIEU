import {defineConfig,devices} from '@playwright/test';
const ociFixture=process.env.VITE_CONVERT_SERVER_ORIGIN==='https://localhost:18443';
const baseURL=ociFixture?'http://127.0.0.1:18573':'http://127.0.0.1:5173';
export default defineConfig({testDir:'./e2e',timeout:60000,use:{baseURL,trace:'retain-on-failure'},projects:[{name:'chromium',use:{...devices['Desktop Chrome'],channel:'msedge'}},{name:'android-layout',use:{...devices['Pixel 7'],defaultBrowserType:'chromium',channel:'msedge'}}],webServer:{command:ociFixture?'npm.cmd run preview -- --port 18573 --outDir .dsh-tmp/oci-app --strictPort':'npm.cmd run dev',url:baseURL,reuseExistingServer:!ociFixture,timeout:60000}});
