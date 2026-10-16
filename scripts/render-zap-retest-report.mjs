import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tmp/pdf-review/package.json'));
const canvas = require('@napi-rs/canvas');
globalThis.DOMMatrix = canvas.DOMMatrix;
globalThis.ImageData = canvas.ImageData;
globalThis.Path2D = canvas.Path2D;
const pdfjs = await import(pathToFileURL(path.join(root, 'tmp/pdf-review/node_modules/pdfjs-dist/legacy/build/pdf.mjs')));
const source = path.join(root, 'output/pdf/optical-store-zap-retest-and-fixes.pdf');
const document = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(source)),
  standardFontDataUrl: path.join(root, 'tmp/pdf-review/node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/',
  useSystemFonts: true,
}).promise;
const output = path.join(root, 'tmp/pdfs/zap-retest');
fs.mkdirSync(output, { recursive: true });
for (let p = 1; p <= document.numPages; p++) {
  const page = await document.getPage(p);
  const viewport = page.getViewport({ scale: 1.5 });
  const surface = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: surface.getContext('2d'), viewport }).promise;
  fs.writeFileSync(path.join(output, `page-${p}.png`), surface.toBuffer('image/png'));
  console.log(`Rendered page ${p} / ${document.numPages}`);
}
