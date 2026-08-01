# Requirement Pemasukan Non-IPL dan Keuangan Event

> Sistem: Portal Warga Palm Village
> Status: Draft untuk review
> Tanggal: 1 Agustus 2026

## 1. Ruang Lingkup

Dokumen ini menetapkan kebutuhan fungsional, hak akses, validasi, dan kriteria penerimaan untuk:

- master Event/Kegiatan;
- assignment Anggota Koordinator Event dan Bendahara Event;
- pemasukan umum non-IPL;
- pemasukan event;
- pengeluaran event;
- laporan keuangan event dan laporan konsolidasi.

Alur pembayaran IPL, verifikasi IPL, serta Midtrans/QRIS tidak diubah oleh fitur ini.

## 2. Aktor

### 2.1. Admin

Role global `admin`. Memiliki akses master event, assignment, seluruh transaksi umum dan event, serta seluruh laporan.

### 2.2. Bendahara

Role global `bendahara`. Memiliki akses seluruh pemasukan/pengeluaran umum dan event serta seluruh laporan, tetapi tidak mengelola master/assignment event pada versi awal.

### 2.3. Bendahara Event

Profil aktif yang memiliki assignment `event_treasurer` pada event tertentu. Bukan role global. Hanya dapat mengelola pemasukan dan pengeluaran event yang di-assign.

### 2.4. Anggota Koordinator Event

Profil aktif yang memiliki assignment `coordinator_member` pada event tertentu. Bukan role global. Hanya dapat melihat pemasukan, pengeluaran, dan laporan event yang di-assign.

### 2.5. Pengguna lain

Koordinator Palm Village tanpa assignment, Warga, dan pengguna nonaktif tidak memperoleh akses ke data keuangan event melalui modul ini. `admin_viewer` hanya dapat dipakai sebagai mode demo read-only dan tidak memiliki izin mutasi.

## 3. User Stories

### US-01 — Admin mengelola event

Sebagai Admin, saya ingin membuat, mengubah, mengarsipkan event, dan mengatur pengelolanya agar hak akses keuangan event dapat diberikan secara terukur.

### US-02 — Admin/Bendahara mencatat pemasukan umum

Sebagai Admin atau Bendahara, saya ingin mencatat pemasukan non-IPL yang tidak terkait event agar seluruh arus kas Palm Village tercatat.

### US-03 — Pengelola mencatat pemasukan event

Sebagai Admin, Bendahara, atau Bendahara Event, saya ingin mencatat pemasukan event sesuai kewenangan saya agar saldo event akurat.

### US-04 — Pengelola mencatat pengeluaran event

Sebagai Admin, Bendahara, atau Bendahara Event, saya ingin mencatat pengeluaran event sesuai kewenangan saya agar penggunaan dana event dapat dipertanggungjawabkan.

### US-05 — Anggota koordinator memantau event

Sebagai Anggota Koordinator Event, saya ingin melihat transaksi dan laporan event yang di-assign tanpa dapat mengubahnya agar saya dapat memantau pelaksanaan anggaran.

### US-06 — Bendahara melihat laporan konsolidasi

Sebagai Bendahara, saya ingin laporan memisahkan IPL, non-IPL umum, dan event agar saldo keseluruhan dan saldo setiap event dapat direkonsiliasi.

## 4. Kebutuhan Fungsional

### REQ-EVT-001 — Membuat event

- Given pengguna adalah Admin aktif.
- When pengguna mengisi judul, kode, tanggal mulai, lokasi, dan status event yang valid.
- Then sistem membuat event dan audit log `event.create`.
- And pengguna non-Admin ditolak oleh backend walaupun mengirim request manual.

### REQ-EVT-002 — Mengubah event

- Admin dapat mengubah data event yang belum dihapus.
- Perubahan tanggal, status, judul, dan lokasi wajib dicatat dalam audit log.
- Event berstatus `archived` tidak menerima transaksi baru.

### REQ-EVT-003 — Menghapus event

- Aksi hapus hanya tersedia untuk Admin.
- Sistem melakukan soft delete dengan `deleted_at` dan `deleted_by`.
- Transaksi dan assignment historis tidak ikut dihapus permanen.
- Event terhapus tidak tampil pada pilihan pencatatan transaksi baru.

### REQ-EVT-004 — Assignment anggota

- Admin dapat menambah, mengubah, dan mencabut assignment.
- Profil yang dipilih wajib aktif dan approved.
- Role assignment hanya `coordinator_member` atau `event_treasurer`.
- Satu profil hanya mempunyai satu assignment aktif per event.
- Pencabutan assignment langsung menghilangkan akses event pada request berikutnya.

### REQ-EVT-005 — Daftar event berdasarkan akses

- Admin/Bendahara mendapatkan semua event yang tidak dihapus.
- Bendahara Event dan Anggota Koordinator Event hanya mendapatkan event dengan assignment aktif miliknya.
- Endpoint tidak boleh membocorkan transaksi atau daftar anggota event lain.

### REQ-INC-001 — Jenis pemasukan non-IPL

- Form menyediakan pilihan `Umum / Non-Event` dan `Event/Kegiatan`.
- Jika jenis Event dipilih, field event wajib diisi.
- Jika jenis Umum dipilih, event wajib kosong.
- Pemasukan IPL tidak boleh dimasukkan melalui form ini.

### REQ-INC-002 — CRUD pemasukan umum non-IPL

- Hanya Admin dan Bendahara yang dapat create, update, dan delete.
- Bendahara Event dan Anggota Koordinator Event tidak dapat melihat atau memutasi pemasukan umum melalui endpoint ini.
- Delete menggunakan soft delete dan audit log.

### REQ-INC-003 — CRUD pemasukan event

- Admin dan Bendahara dapat mengelola pemasukan seluruh event.
- Bendahara Event dapat mengelola pemasukan hanya pada event assignment aktifnya.
- Anggota Koordinator Event hanya dapat membaca pemasukan event assignment aktifnya.
- Perubahan `event_id` hanya boleh dilakukan jika pengguna memiliki akses tulis pada event asal dan event tujuan; untuk Bendahara Event perpindahan lintas event ditolak.

### REQ-INC-004 — Field pemasukan

Field wajib:

- tanggal pemasukan;
- scope;
- event bila scope event;
- kategori;
- sumber/pembayar;
- nominal lebih dari nol;
- metode pembayaran;
- deskripsi.

Field opsional:

- nomor referensi;
- lampiran bukti JPG/PNG sesuai batas ukuran endpoint;
- catatan internal.

### REQ-EXP-001 — Scope pengeluaran

- Form Pengeluaran menyediakan scope `Umum` dan `Event`.
- Pengeluaran lama otomatis dianggap scope Umum.
- Event wajib dipilih untuk pengeluaran event.
- Pengeluaran event harus tampil pada laporan event dan konsolidasi.

### REQ-EXP-002 — CRUD pengeluaran umum

- Hanya Admin dan Bendahara yang dapat create, update, dan delete pengeluaran umum.
- Pengguna event-scoped tidak dapat mengakses pengeluaran umum melalui endpoint event.

### REQ-EXP-003 — CRUD pengeluaran event

- Admin dan Bendahara dapat mengelola pengeluaran seluruh event.
- Bendahara Event dapat mengelola pengeluaran event assignment aktifnya.
- Anggota Koordinator Event hanya dapat membaca pengeluaran event assignment aktifnya.
- Seluruh aturan file bukti pada expenses saat ini tetap berlaku.

### REQ-RPT-001 — Laporan event

Laporan event wajib menampilkan:

- identitas dan periode event;
- total pemasukan;
- total pengeluaran;
- saldo/net event;
- jumlah transaksi;
- rincian pemasukan dan pengeluaran;
- kategori, tanggal, metode, sumber/penerima, penginput, dan lampiran;
- filter tanggal dan kategori;
- ekspor CSV/PDF.

### REQ-RPT-002 — Akses laporan event

- Admin/Bendahara dapat membuka laporan semua event.
- Bendahara Event dan Anggota Koordinator Event hanya dapat membuka laporan event assignment aktifnya.
- Manipulasi `event_id` pada request event lain harus menghasilkan HTTP 403 tanpa data parsial.

### REQ-RPT-003 — Laporan konsolidasi

Laporan konsolidasi penuh hanya tersedia bagi Admin dan Bendahara, dan harus memisahkan:

- pemasukan IPL;
- pemasukan non-IPL umum;
- pemasukan event;
- pengeluaran umum;
- pengeluaran event;
- saldo awal dan saldo akhir.

Data soft-deleted tidak dihitung pada laporan aktif.

### REQ-AUD-001 — Audit log

Sistem wajib mencatat aksi:

- `event.create`, `event.update`, `event.delete`;
- `event_member.assign`, `event_member.update`, `event_member.revoke`;
- `income.create`, `income.update`, `income.delete`;
- `expense.create`, `expense.update`, `expense.delete`.

Metadata audit minimal berisi entity ID, event ID, actor, timestamp, dan ringkasan field before/after tanpa menyimpan file biner atau token.

### REQ-SEC-001 — Otorisasi server-side

- Backend wajib mengambil profile dan role dari token/session terverifikasi.
- Request tidak boleh menentukan sendiri actor, role, atau capability.
- Setiap operasi event-scoped wajib memeriksa assignment aktif.
- RLS wajib mencerminkan aturan backend sebagai defense-in-depth.

### REQ-SEC-002 — Capability frontend

- Frontend boleh memakai response `my-access` untuk menu dan tombol.
- Menyembunyikan tombol tidak dianggap sebagai kontrol keamanan.
- Response akses harus memuat event ID dan capability `can_view`, `can_manage_finance`, serta `can_manage_event`.

## 5. Matriks Otorisasi Detail

| Resource / Aksi | Admin | Bendahara | Bendahara Event assigned | Koordinator Event assigned | Role lain |
| --- | :---: | :---: | :---: | :---: | :---: |
| Event list semua | R | R | - | - | - |
| Event assigned | R | R | R | R | - |
| Event create/update/delete | C/R/U/D | R | R assigned | R assigned | - |
| Assignment event | C/R/U/D | R | R sendiri | R sendiri | - |
| Pemasukan umum | C/R/U/D | C/R/U/D | - | - | - |
| Pengeluaran umum | C/R/U/D | C/R/U/D | - | - | - |
| Pemasukan event | C/R/U/D semua | C/R/U/D semua | C/R/U/D assigned | R assigned | - |
| Pengeluaran event | C/R/U/D semua | C/R/U/D semua | C/R/U/D assigned | R assigned | - |
| Laporan konsolidasi | R | R | - | - | - |
| Laporan event | R semua | R semua | R assigned | R assigned | - |

Keterangan: hak `D` berarti soft delete.

## 6. Aturan Validasi Data

- Nominal menggunakan `numeric(12,2)` dan harus lebih dari nol.
- Tanggal transaksi wajib valid dan tidak boleh kosong.
- `event_id` harus menunjuk event yang tidak dihapus.
- Event archived/cancelled tidak menerima transaksi baru; koreksi transaksi lama hanya Admin/Bendahara.
- Kategori dan deskripsi tidak boleh hanya whitespace.
- File hanya JPG/PNG, mengikuti batas maksimal endpoint existing (saat ini 2 MB setelah kompresi).
- Update transaksi mempertahankan file lama bila tidak ada file pengganti.
- Delete transaksi tidak otomatis menghapus file Google Drive sebelum kebijakan retensi disepakati; file ditandai untuk cleanup terkontrol.
- Seluruh query list dan laporan mengecualikan `deleted_at is not null`, kecuali mode audit Admin.

## 7. Kebutuhan Non-Fungsional

### Keamanan

- Tidak ada akses lintas event melalui IDOR.
- Tidak ada service-role key atau credential Drive di frontend.
- Fungsi security-definer memakai `search_path` eksplisit dan execute privilege minimum.

### Integritas

- Transaksi event tidak boleh dihitung ganda sebagai pemasukan umum atau IPL.
- Migrasi expenses lama tidak mengubah total laporan historis.
- Perubahan assignment tidak mengubah histori actor pada transaksi lama.

### Performa

- List 12 bulan dengan filter event merespons dalam target p95 kurang dari 2 detik pada beban normal.
- Index tersedia pada tanggal, scope, event ID, deleted_at, dan assignment aktif.

### Auditabilitas

- Setiap perubahan nominal dan event dapat ditelusuri ke actor.
- Soft delete dapat direkonstruksi dari audit log.

### Usability

- Event selector hanya menampilkan event yang boleh diakses pengguna.
- UI memberi label jelas `Umum` atau nama event pada setiap transaksi.
- Mode read-only tidak menampilkan tombol mutasi.

## 8. Acceptance Criteria Utama

### AC-01 — Pemasukan umum

1. Admin dan Bendahara dapat menambah, mengubah, dan menghapus pemasukan umum.
2. Bendahara Event mendapat 403 saat mencoba endpoint pemasukan umum.
3. Pemasukan umum muncul pada laporan konsolidasi dan tidak muncul pada laporan event.

### AC-02 — Isolasi Bendahara Event

1. Pengguna ditugaskan sebagai Bendahara Event A.
2. Pengguna dapat CRUD pemasukan dan pengeluaran Event A.
3. Pengguna tidak melihat Event B pada selector.
4. Request manual ke Event B menghasilkan 403.
5. Pengguna tidak dapat mengubah master Event A atau assignment.

### AC-03 — Anggota Koordinator Event read-only

1. Pengguna ditugaskan sebagai Anggota Koordinator Event A.
2. Pengguna melihat transaksi dan laporan Event A.
3. Tombol tambah/edit/hapus tidak muncul.
4. Request create/update/delete langsung menghasilkan 403.

### AC-04 — Admin dan Bendahara lintas event

1. Admin/Bendahara dapat memfilter dan mengelola transaksi semua event.
2. Hanya Admin melihat kontrol master event dan assignment.
3. Bendahara tidak dapat mengubah assignment melalui API.

### AC-05 — Soft delete dan laporan

1. Transaksi yang dihapus tidak muncul pada list dan tidak dihitung dalam laporan aktif.
2. Audit log tetap menyimpan actor, event, nominal, dan waktu penghapusan.
3. Event yang dihapus tidak dapat dipilih untuk transaksi baru.

### AC-06 — Kompatibilitas laporan lama

1. Setelah migrasi tetapi sebelum ada transaksi baru, total pemasukan IPL dan pengeluaran historis sama dengan baseline.
2. Pemasukan non-IPL/event baru muncul pada komponen laporan yang benar.
3. Saldo akhir memenuhi rumus konsolidasi.

## 9. Di Luar Scope

- Midtrans/QRIS untuk event.
- Tiket berbayar dan RSVP berbayar.
- Approval transaksi bertingkat.
- Refund otomatis.
- Integrasi rekening koran.
- Notifikasi WhatsApp/email pengelola event.
