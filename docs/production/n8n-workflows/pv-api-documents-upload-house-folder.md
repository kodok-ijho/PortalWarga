# Perubahan n8n: "PV API - Documents Upload" → simpan per folder rumah

Workflow `PV API - Documents Upload` (id `o47irPJJCrT2PpCy`) belum ada sumbernya di repo dan
tidak dibuka untuk akses MCP, jadi perubahan ini harus diterapkan manual di editor n8n.

## Kondisi sekarang

Portal mengirim field multipart berikut untuk dokumen warga (`category = resident`):

| field                | contoh                               |
|----------------------|--------------------------------------|
| `gdrive_folder_id`   | `1XW94zFg559-Ub746KoPQbUmMURp0wGR2` (folder induk "Dokumen Warga") |
| `gdrive_folder_path` | `CB1-1A` (kode rumah, dari `unitDriveFolderName()` di `client/src/services/dataHelpers.js`) |
| `unit_id`            | `12`                                 |

Bila workflow mengunggah langsung ke `gdrive_folder_id`, semua berkas warga bercampur di satu folder.

## Yang perlu diubah

Sisipkan langkah "cari atau buat subfolder rumah" **sebelum** node upload Google Drive, lalu pakai
ID subfolder itu untuk upload dan untuk kolom `documents.gdrive_folder_id`.

1. **Code: "Resolve House Folder Name"** (setelah validasi token & role, sebelum upload)
   ```js
   const f = $json.body ?? $json; // sesuaikan dengan bentuk item di workflow
   const parentId = '1XW94zFg559-Ub746KoPQbUmMURp0wGR2'; // jangan percaya ID induk dari klien
   const isResident = f.category === 'resident';
   // Idealnya kode rumah diambil dari tabel units berdasarkan unit_id (block-unit_number),
   // bukan dari input klien. Minimal: sanitasi agar aman dipakai di query Drive.
   const name = String(f.gdrive_folder_path || `Unit-${f.unit_id}`)
     .toUpperCase().replace(/[^A-Z0-9-]+/g, '');
   return [{ json: { ...$json, house_parent_id: parentId, house_folder_name: name, use_house_folder: isResident && !!name } }];
   ```

2. **IF: `use_house_folder` is true** → cabang true lanjut ke langkah 3; cabang false langsung ke upload lama.

3. **Google Drive: "Search House Folder"**
   - Resource: *File/Folder*, Operation: *Search*
   - Search method: *Advanced Search (query string)*
   - Query:
     ```
     name = '{{ $json.house_folder_name }}' and '{{ $json.house_parent_id }}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false
     ```
   - Limit: 1, Settings → **Always Output Data: ON** (agar alur lanjut walau folder belum ada).

4. **IF: "Folder Exists"** → `{{ $json.id }}` is not empty.
   - false → **Google Drive: "Create House Folder"**
     - Resource: *Folder*, Operation: *Create*
     - Folder name: `{{ $('Resolve House Folder Name').item.json.house_folder_name }}`
     - Parent folder (By ID): `{{ $('Resolve House Folder Name').item.json.house_parent_id }}`

5. **Set: "Target Folder"** (gabungkan kedua cabang)
   - `target_folder_id` = `{{ $json.id }}`
   - sertakan kembali data biner berkas (Include Other Fields / ambil binary dari node webhook).

6. **Node upload Google Drive yang sudah ada**: ubah *Parent Folder* menjadi
   `{{ $('Target Folder').item.json.target_folder_id }}` untuk cabang rumah
   (cabang non-rumah tetap memakai folder kategori).

7. **Node insert Supabase `documents`**: isi `gdrive_folder_id` dengan `target_folder_id`
   (ID subfolder rumah) dan `gdrive_folder_path` dengan `house_folder_name`.
   Portal memakai ID ini untuk tombol "Folder Drive" di detail rumah.

## Uji setelah diterapkan

1. Login sebagai warga, buka menu Rumah → rumah sendiri → Upload. Folder `Dokumen Warga/<KODE>`
   harus dibuat otomatis.
2. Upload sekali lagi ke rumah yang sama: berkas masuk ke folder yang sama (tidak membuat duplikat).
3. Baris baru di `documents` memiliki `gdrive_folder_id` = ID subfolder, bukan ID induk.

## Catatan

- Dokumen lama tetap berada di folder induk. Bila perlu dipindah, pindahkan manual di Drive lalu
  perbarui `gdrive_folder_id` baris terkait.
- Dua upload bersamaan untuk rumah yang belum punya folder bisa membuat dua folder bernama sama.
  Risiko kecil; jika terjadi, gabungkan manual di Drive.
