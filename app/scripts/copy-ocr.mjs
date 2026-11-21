// Copies the on-device OCR engine (tesseract.js) into public/ocr so it is served
// from our own origin: screenshots are read in the browser and never uploaded.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
const out = 'public/ocr'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm'])
  cpSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`)
// Language data is shipped inside a .js file (base64) because some static hosts
// only serve web file types. worker-wrap.js decodes it and answers tesseract's
// download request locally, so nothing is fetched from outside our origin.
const lang = readFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz').toString('base64')
writeFileSync(`${out}/eng-traineddata.js`, `self.__LUDA_ENG=${JSON.stringify(lang)};`)
writeFileSync(`${out}/worker-wrap.js`, `const _fetch = self.fetch.bind(self);
self.fetch = (u, o) => {
  if (!/eng\\.traineddata(\\.gz)?$/.test(String(u))) return _fetch(u, o);
  if (!self.__LUDA_ENG) importScripts('eng-traineddata.js');
  const bin = atob(self.__LUDA_ENG), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Promise.resolve(new Response(bytes));
};
importScripts('worker.min.js');
`)
console.log('OCR assets copied to', out)
