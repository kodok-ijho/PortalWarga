/**
 * Script generate icon PWA dari logo.png (landscape, 1415x1071).
 * Pakai sharp (internal dependency @vite-pwa/assets-generator).
 *
 * Logo akan di-*letterbox* (padding) jadi square supaya utuh tanpa crop.
 * Background padding: #1a3d2e (forest-800).
 *
 * Output ke public/:
 *   - pwa-192x192.png        (transparent, ikon PWA)
 *   - pwa-512x512.png        (transparent, ikon PWA)
 *   - pwa-maskable-192x192.png (maskable)
 *   - pwa-maskable-512x512.png (maskable)
 *   - apple-touch-icon-180x180.png
 *   - favicon-32x32.png
 *   - favicon-64x64.png
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SRC = 'public/logo.png';
const OUT_DIR = 'public';
const BG = '#1a3d2e'; // forest-800 — background padding

const TARGETS = [
  { name: 'pwa-192x192.png', size: 192, maskable: false },
  { name: 'pwa-512x512.png', size: 512, maskable: false },
  { name: 'pwa-maskable-192x192.png', size: 192, maskable: true },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon-180x180.png', size: 180, maskable: false },
  { name: 'favicon-32x32.png', size: 32, maskable: false },
  { name: 'favicon-64x64.png', size: 64, maskable: false },
];

async function generateIcon({ name, size, maskable }) {
  const outPath = `${OUT_DIR}/${name}`;

  if (maskable) {
    // Maskable: logo di tengah dengan 10% safe zone margin, background penuh
    const innerMargin = Math.round(size * 0.1);
    const innerSize = size - innerMargin * 2;

    // 1) Resize logo ke innerSize (contain → letterbox)
    const logoBuffer = await sharp(SRC)
      .resize(innerSize, innerSize, { fit: 'contain', background: BG })
      .png()
      .toBuffer();

    // 2) Tempelkan di atas background penuh
    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([{ input: logoBuffer, left: innerMargin, top: innerMargin }])
      .png()
      .toFile(outPath);
  } else {
    // Transparent: logo di-pasang di tengah, sisa transparan
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp(SRC)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer(),
        },
      ])
      .png()
      .toFile(outPath);
  }

  console.log(`  ✓ ${name} (${size}x${size})`);
}

async function main() {
  console.log('Generating PWA icons from', SRC, '...');

  // Verify source exists
  try {
    await sharp(SRC).metadata();
  } catch {
    console.error('Error: logo.png tidak ditemukan di public/');
    process.exit(1);
  }

  for (const target of TARGETS) {
    await generateIcon(target);
  }

  console.log('Done! Icon PWA siap di public/');
}

main().catch((err) => {
  console.error('Gagal generate icon:', err);
  process.exit(1);
});
