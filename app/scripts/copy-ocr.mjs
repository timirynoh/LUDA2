// Copies the on-device OCR engine (tesseract.js) into public/ocr so it is served
// from our own origin: screenshots are read in the browser and never uploaded.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
const out = 'public/ocr'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm'])
  cpSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`)
// Stored as .bin (some static hosts refuse .gz); worker-wrap.js maps the name back.
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/eng-traineddata.bin`)
writeFileSync(`${out}/worker-wrap.js`, `// Redirects tesseract's language download to our .bin copy, then loads the real worker.
const _fetch = self.fetch.bind(self);
self.fetch = (u, o) => _fetch(String(u).replace(/eng\\.traineddata\\.gz$/, 'eng-traineddata.bin'), o);
importScripts('worker.min.js');
`)
console.log('OCR assets copied to', out)
