/**
 * Generates the browser icons from the brand mark.
 *
 *   node app/scripts/generate-icons.mjs
 *
 * The app shipped with the create-next-app favicon — the framework's own logo
 * on every tab, which is both off-brand and misleading about who runs the site.
 * This renders the real mark instead, and is committed so the icons can be
 * regenerated from the source SVG rather than hand-edited as binaries.
 *
 * The mark is placed on a white tile because a #222 glyph on transparency
 * vanishes against a dark tab bar. The tile is what makes it legible in both
 * browser themes, and it matches how the logo is presented everywhere else.
 *
 * Two source marks, chosen by size. The NB monogram is roughly 2:1, so inside
 * a 16px square each letter gets about seven pixels of height and the counters
 * close into a smear — measured, not assumed. Below 24px the icon therefore
 * falls back to the N alone, which is square and stays crisp at 13px. Larger
 * sizes, where there is room for both letters, use the full monogram.
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const MONOGRAM = join(appDir, 'public/assets/logo-mark.svg'); // NB
const INITIAL = join(appDir, 'public/assets/logo-mark-n.svg'); // N alone
const SMALL_SIZE_CUTOFF = 24;
const OUT = join(appDir, 'src/app');

/** Render the mark trimmed of its whitespace, centred on a white rounded tile. */
async function tile(size) {
  const source = size < SMALL_SIZE_CUTOFF ? INITIAL : MONOGRAM;
  // Rasterise large, then trim: the source SVG carries a wide empty viewBox.
  const glyph = await sharp(await readFile(source), { density: 600 })
    .resize({ width: 1024, fit: 'inside' })
    .trim()
    .toBuffer();

  // The square initial can sit tighter in the tile than the wide monogram.
  const inner = Math.round(size * (size < SMALL_SIZE_CUTOFF ? 0.8 : 0.68));
  const resized = await sharp(glyph)
    .resize({ width: inner, height: inner, fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  const { width, height } = await sharp(resized).metadata();

  const radius = Math.round(size * 0.22);
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#FFFFFF"/></svg>`,
  );

  return sharp(bg)
    .composite([
      {
        input: resized,
        left: Math.round((size - (width ?? inner)) / 2),
        top: Math.round((size - (height ?? inner)) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** ICO container holding PNG entries (supported since Windows Vista). */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]);
}

const sizes = [16, 32, 48];
const rendered = await Promise.all(sizes.map(async (size) => ({ size, data: await tile(size) })));

await writeFile(join(OUT, 'favicon.ico'), ico(rendered));
await writeFile(join(OUT, 'icon.png'), await tile(512));
await writeFile(join(OUT, 'apple-icon.png'), await tile(180));

console.log(`favicon.ico  ${sizes.join('/')}px`);
console.log('icon.png     512px');
console.log('apple-icon.png 180px');
