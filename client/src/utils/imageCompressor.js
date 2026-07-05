/**
 * Kompresi gambar client-side menggunakan Canvas API.
 * Tanpa dependensi eksternal — murni Web API bawaan browser.
 *
 * Spesifikasi:
 * - Minimum output: 514px lebar
 * - Maksimum output: 1204px (sisi terpanjang)
 * - Format output: JPEG (quality 0.7)
 * - File non-gambar (PDF) di-skip tanpa kompresi
 */

/**
 * Kompresi file gambar.
 * @param {File} file  — File dari <input type="file">
 * @param {Object} [opts]
 * @param {number} [opts.maxDimension=1204]  — Batas piksel sisi terpanjang
 * @param {number} [opts.minWidth=514]       — Lebar minimum output
 * @param {number} [opts.quality=0.7]        — JPEG quality (0–1)
 * @returns {Promise<{file: File, preview: string, originalSize: number, compressedSize: number, skipped: boolean}>}
 */
export async function compressImage(file, opts = {}) {
  const { maxDimension = 1204, minWidth = 514, quality = 0.7 } = opts;

  // Skip non-image files (PDF, etc.)
  if (!file.type.startsWith('image/')) {
    const preview = URL.createObjectURL(file);
    return {
      file,
      preview,
      originalSize: file.size,
      compressedSize: file.size,
      skipped: true,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // 1. Scale DOWN jika salah satu sisi melebihi maxDimension
          if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // 2. Scale UP jika lebar di bawah minWidth (jarang, tapi safety-net)
          if (width < minWidth) {
            const ratio = minWidth / width;
            width = minWidth;
            height = Math.round(height * ratio);
          }

          // 3. Gambar ke canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // 4. Export sebagai JPEG blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Gagal mengkompresi gambar.'));
                return;
              }
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg' }
              );
              const preview = canvas.toDataURL('image/jpeg', quality);

              resolve({
                file: compressedFile,
                preview,
                originalSize: file.size,
                compressedSize: blob.size,
                skipped: false,
              });
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Format ukuran file ke string yang mudah dibaca.
 * @param {number} bytes
 * @returns {string} misal "1.2 MB", "340 KB"
 */
export function formatFileSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Hitung persentase penghematan.
 * @param {number} original
 * @param {number} compressed
 * @returns {string} misal "85% lebih kecil"
 */
export function compressionSavings(original, compressed) {
  if (original <= 0) return '0%';
  const pct = Math.round(((original - compressed) / original) * 100);
  return `${pct}% lebih kecil`;
}
