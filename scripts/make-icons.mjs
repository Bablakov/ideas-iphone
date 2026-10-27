// Рисует иконки приложения из SVG: `npm run icons`.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// Тёмный фон и жёлтая лампочка-«идея». Maskable режется по центральному кругу,
// поэтому для него содержимое уменьшается (inset < 1).
const svg = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0d1117"/>
  <g transform="translate(256 256) scale(${inset}) translate(-256 -256)">
    <path d="M256 92 C186 92 138 144 138 208 C138 252 160 280 182 304 C196 320 204 334 204 356 L308 356 C308 334 316 320 330 304 C352 280 374 252 374 208 C374 144 326 92 256 92 Z" fill="#ffc233"/>
    <rect x="204" y="376" width="104" height="26" rx="13" fill="#ffc233"/>
    <rect x="224" y="414" width="64" height="24" rx="12" fill="#ffc233"/>
    <path d="M222 214 L256 252 L290 214" fill="none" stroke="#0d1117" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M256 252 L256 348" fill="none" stroke="#0d1117" stroke-width="16" stroke-linecap="round"/>
  </g>
</svg>`;

const jobs = [
  ["icon-512.png", 512, 1],
  ["icon-512-maskable.png", 512, 0.72],
  ["icon-192.png", 192, 1],
  ["apple-touch-icon.png", 180, 1],
];
for (const [name, size, inset] of jobs) {
  await sharp(Buffer.from(svg(inset))).resize(size, size).png().toFile(new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  console.log("ok", name);
}
