// Copies the on-device OCR engine (tesseract.js) into public/ocr so it is served
// from our own origin: screenshots are read in the browser and never uploaded.
import { cpSync, mkdirSync } from 'node:fs'
const out = 'public/ocr'
mkdirSync(out, { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm'])
  cpSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`)
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', `${out}/eng.traineddata.gz`)
console.log('OCR assets copied to', out)
