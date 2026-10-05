import {defineConfig} from 'vitest/config';
// Isolated forensic suite: distinguish FIXED regression labels from defect reproductions.
export default defineConfig({test:{include:['audit/**/*.repro.test.ts'],testTimeout:15000}});
