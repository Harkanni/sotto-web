// Regenerates every icon and launch screen from the brand SVGs in assets/brand. Run after
// changing the mark (Node 22.18+, which runs the TypeScript device list directly):
//   pnpm generate:assets
// Outputs are committed, so builds never depend on this script.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brand = (name) => resolve(root, 'assets/brand', name);
const out = (path) => resolve(root, path);

async function png(svgFile, size) {
  const svg = await readFile(brand(svgFile));
  // Render at 4x the target size, then downsample: sharper edges than rasterising directly.
  const viewBoxWidth = Number(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(svg.toString())?.[1] ?? 28);
  return sharp(svg, { density: Math.max(72, Math.ceil((72 * size * 4) / viewBoxWidth)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

// ICO with PNG-encoded images (supported by every current browser and OS).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

await mkdir(out('public/icons'), { recursive: true });

// Browser tab: SVG for modern browsers, ICO fallback built from the small-size variant.
await copyFile(brand('mark.svg'), out('src/app/icon.svg'));
const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, data: await png('mark-small.svg', size) });
await writeFile(out('src/app/favicon.ico'), ico(icoImages));

// iOS home screen: full-bleed square, iOS rounds the corners itself.
await writeFile(out('src/app/apple-icon.png'), await png('mark-fullbleed.svg', 180));

// PWA: "any" icons keep the rounded tile; "maskable" icons are full-bleed with a safe zone.
await writeFile(out('public/icons/icon-192.png'), await png('mark.svg', 192));
await writeFile(out('public/icons/icon-512.png'), await png('mark.svg', 512));
await writeFile(out('public/icons/maskable-512.png'), await png('mark-fullbleed.svg', 512));

// iOS launch screens: the mark centred on the app's background, light and dark, for every
// iPhone and iPad size (src/lib/pwa/splash.ts lists them and builds the <link> tags).
const { splashFiles, SPLASH_SCHEMES } = await import('../src/lib/pwa/splash.ts');
await mkdir(out('public/splash'), { recursive: true });
const marks = new Map();
for (const file of splashFiles()) {
  const size = 96 * file.device.ratio;
  if (!marks.has(size)) marks.set(size, await png('mark.svg', size));
  const image = await sharp({
    create: {
      width: file.width,
      height: file.height,
      channels: 3,
      background: SPLASH_SCHEMES[file.scheme],
    },
  })
    .composite([{ input: marks.get(size), gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(out(`public${file.url}`), image);
}

console.log(
  'Icons written: src/app/{icon.svg,favicon.ico,apple-icon.png}, public/icons/*.png, public/splash/*.png',
);
