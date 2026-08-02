# UAT Laporan Keuangan

Dokumen ini mendefinisikan skenario dan hasil UAT untuk laporan pemasukan, laporan pengeluaran, laporan bulanan, laporan tahunan, saldo berjalan, akses, ekspor, dan kegagalan dependensi.

Tanggal UAT: 24 Juli 2026  
Lingkungan: pilot production n8n + Supabase, UI Vite lokal dengan konfigurasi API production  
Aktor UAT: Admin `dyudhiantoro@gmail.com`

## Cakupan

- Laporan pemasukan berdasarkan pembayaran selesai dan tanggal `paid_at`.
- Laporan pengeluaran berdasarkan `expense_date`.
- Laporan bulanan berdasarkan periode tagihan `YYYY-MM`.
- Laporan tahunan berdasarkan tahun buku Juli sampai Juni tahun berikutnya.
- Saldo awal, pemasukan, pengeluaran, saldo akhir, jumlah transaksi, dan carry-forward.
- Filter bulan/tahun, tampilan detail, CSV, dan print/PDF.
- Aliran data UI -> API n8n -> credential Supabase -> tabel database -> normalisasi response -> UI.
- Authentication, role, periode tidak valid, empty period, response malformed, timeout, dan kegagalan query.

Di luar cakupan: QRIS, upload bukti pembayaran, Google Drive, dan proses approve/reject pembayaran. Modul tersebut diuji di `UATPembayaran.md`.

## Kontrak Data

### Endpoint

| Endpoint | Method | Minimum role | Tujuan |
| --- | --- | --- | --- |
| `/reports/monthly-finance` | POST JSON | `pengurus` | Tagihan, koleksi, pemasukan kas, dan pengeluaran satu bulan |
| `/reports/running-balance` | POST JSON | `pengurus` | Rantai saldo dari Juli 2026 sampai periode yang diminta |

Request normal:

```json
{"year": 2026, "month": 7}
```

Response sukses wajib memiliki envelope `ok`, `data`, `error`, dan `meta.request_id`. `monthly-finance.data` wajib memiliki `report`, `expenses`, dan `cashPayments`. `running-balance.data` wajib memiliki `chain`.

`report` berisi `billCount`, `paidCount`, `totalBilled`, `totalCollected`, `totalOutstanding`, `collectionRate`, `byBlock`, dan `details`. Setiap chain berisi `period`, `openingBalance`, `totalIncome`, `totalExpense`, `closingBalance`, `incomeCount`, dan `expenseCount`.

### Sumber database

| Data | Tabel | Aturan |
| --- | --- | --- |
| Tagihan | `ipl_bills` | laporan koleksi memakai `period`; denda ikut dalam nominal |
| Pembayaran | `payments` | hanya `status=completed`; kas masuk memakai rentang `paid_at` |
| Pengeluaran | `expenses` | memakai rentang `expense_date` |
| Unit | `units` | mengisi blok dan nomor unit |
| Penghuni | `profiles` | mengisi nama penghuni |

Pemisahan tanggal wajib dipertahankan: tagihan menentukan kinerja penagihan, sedangkan `paid_at` menentukan arus kas. Pembayaran pada Juli untuk tagihan periode lama tetap muncul di kas Juli, tetapi tidak mengubah koleksi tagihan Juli.

## Skenario Positif

| ID | Skenario | Hasil yang diharapkan |
| --- | --- | --- |
| FIN-POS-001 | Admin membuka menu Laporan Keuangan | Halaman tampil tanpa `Respons API tidak valid` dan request bulanan terkirim |
| FIN-POS-002 | Pilih bulan dengan tagihan | Jumlah tagihan, lunas, tertagih, piutang, dan persentase sesuai `ipl_bills` |
| FIN-POS-003 | Ada pembayaran completed | Pemasukan menampilkan tanggal, unit, penghuni, periode IPL, nominal, metode |
| FIN-POS-004 | Payment completed melunasi tagihan periode berbeda | Masuk kas berdasarkan `paid_at`, bukan periode tagihan |
| FIN-POS-005 | Tidak ada pembayaran | Empty state dan total pemasukan nol |
| FIN-POS-006 | Ada denda keterlambatan | `amount + late_fee` dipakai pada total tagihan dan tertagih |
| FIN-POS-007 | Beberapa blok memiliki tagihan | `byBlock` mengelompokkan billed dan collected tanpa menghilangkan blok |
| FIN-POS-008 | Admin mencatat pengeluaran valid | Data tersimpan dan diambil berdasarkan `expense_date` |
| FIN-POS-009 | Beberapa pengeluaran dalam satu bulan | Kategori, tanggal, deskripsi, nominal, dan total tampil satu kali |
| FIN-POS-010 | Tidak ada pengeluaran | Empty state dan total nol |
| FIN-POS-011 | Pengeluaran pada tanggal pertama bulan | Masuk ke bulan tersebut |
| FIN-POS-012 | Pengeluaran pada tanggal terakhir bulan | Masuk ke bulan tersebut |
| FIN-POS-013 | Pindah bulan | Label dan data mengikuti periode baru; hasil stale tidak menimpa |
| FIN-POS-014 | Saldo berjalan bulanan tersedia | Saldo awal, kas masuk, kas keluar, saldo akhir tampil |
| FIN-POS-015 | Formula saldo bulanan | `closing = opening + income - expense` |
| FIN-POS-016 | Pilih mode tahunan | UI memuat Juli tahun terpilih sampai Juni tahun berikutnya |
| FIN-POS-017 | Tahun buku memiliki data 12 bulan | Dua belas bulan diagregasi dan detail unit tidak terduplikasi |
| FIN-POS-018 | Tahun buku melewati Desember | Januari-Juni memakai `year + 1` |
| FIN-POS-019 | Tahun buku kosong | Nilai nol dan empty state tanpa crash |
| FIN-POS-020 | Carry-forward tahunan | Opening bulan berikutnya sama dengan closing bulan sebelumnya |
| FIN-POS-021 | Ekspor CSV bulanan | File memuat kolom laporan yang sedang tampil |
| FIN-POS-022 | Ekspor CSV tahunan | File memuat agregasi tahunan, bukan hanya bulan terakhir |
| FIN-POS-023 | Klik PDF/Print | Dialog print browser terbuka dengan layout laporan |
| FIN-POS-024 | Tahun setelah 2028 | Dropdown menyediakan tahun mulai 2026 hingga minimal dua tahun ke depan |
| FIN-POS-025 | Row query berulang dari chain n8n | Agregasi mendeduplikasi berdasarkan ID |

## Skenario Negatif dan Resiliensi

| ID | Skenario | Hasil yang diharapkan |
| --- | --- | --- |
| FIN-NEG-001 | Tanpa Authorization | HTTP 401 envelope JSON; query laporan tidak berjalan |
| FIN-NEG-002 | JWT invalid atau expired | HTTP 401 `INVALID_TOKEN` |
| FIN-NEG-003 | Role `warga` | HTTP 403 `FORBIDDEN_ROLE` |
| FIN-NEG-004 | Akun nonaktif | HTTP 403 `SUSPENDED_USER` |
| FIN-NEG-005 | Akun belum approved | HTTP 403 `FORBIDDEN` |
| FIN-NEG-006 | `year` bukan integer | HTTP 400 `INVALID_PERIOD` |
| FIN-NEG-007 | `month=0` | HTTP 400 `INVALID_PERIOD` |
| FIN-NEG-008 | `month=13` | HTTP 400 `INVALID_PERIOD` |
| FIN-NEG-009 | `year` sebelum awal data 2026 | HTTP 400 `INVALID_PERIOD` |
| FIN-NEG-010 | Field tahun/bulan hilang | HTTP 400, bukan default diam-diam |
| FIN-NEG-011 | Query Supabase atau credential gagal | Tidak ada sukses palsu; client menampilkan error dan retry |
| FIN-NEG-012 | Response API kosong | Client menolak response tanpa render parsial |
| FIN-NEG-013 | Response tidak memiliki `report` | Client menampilkan data laporan tidak lengkap |
| FIN-NEG-014 | `expenses` bukan array | Client menampilkan detail tidak valid |
| FIN-NEG-015 | Salah satu request tahunan gagal | Tidak menampilkan angka parsial sebagai sukses |
| FIN-NEG-016 | Klik cepat filter berulang | Tidak terjadi loop request dan hasil stale tidak menang |
| FIN-NEG-017 | Empty result Supabase | Tetap response JSON sukses dengan array kosong |
| FIN-NEG-018 | Payment tanpa unit/profile | Fallback `-`, bukan crash |
| FIN-NEG-019 | Metadata payment bukan JSON | Fallback metadata kosong |
| FIN-NEG-020 | Nominal null atau string numerik | Konversi numerik konsisten tanpa `NaN` |
| FIN-NEG-021 | Pengeluaran bulan lain | Tidak masuk detail atau total bulan terpilih |
| FIN-NEG-022 | Payment pending/rejected | Tidak dihitung sebagai kas masuk completed |
| FIN-NEG-023 | Retry setelah gagal | Satu pemuatan ulang normal, tanpa loop toast/request |
| FIN-NEG-024 | Browser headless dianggap bot | Bedakan 403 navigasi background dari endpoint laporan |

## Aliran Data End-to-End

1. Admin memilih mode, tahun, dan bulan di `client/src/pages/Reports.jsx`.
2. UI memanggil `fetchMonthlyFinance()` dan `fetchRunningBalance()` dengan JWT Bearer.
3. Webhook n8n memverifikasi token, issuer, audience, expiry, profile, status akun, dan minimum role `pengurus`.
4. `Check Input Period` menolak integer tahun/bulan yang tidak valid atau di luar 2026-2100.
5. Monthly mengambil `ipl_bills`, `expenses`, `payments`, `units`, dan `profiles` melalui node Supabase native dengan credential `PV Supabase Service Role` (`yIZ9pdIj39ToovM3`).
6. Code node mendeduplikasi row, menggabungkan unit/profile, memisahkan collection dan cash flow, lalu membentuk envelope JSON.
7. Running balance mengambil payment completed dan expense, mendeduplikasi row, lalu menghitung chain mulai saldo awal Rp15.000.000 pada Juli 2026.
8. `Respond to Webhook` mengirim JSON dengan `request_id` untuk trace.
9. `apiClient.js` membaca envelope; `Reports.jsx` memvalidasi `report`, `expenses`, `cashPayments`, dan `chain` sebelum render.
10. Tahunan memanggil 12 periode dengan concurrency maksimum 3 dan running balance sampai Juni tahun berikutnya.

## Hasil UAT 24 Juli 2026

| Area | Hasil | Bukti |
| --- | --- | --- |
| Build frontend | PASS | `npm run build`, 697 modul |
| API monthly valid | PASS | Juli 2026: 53 bills, 3 paid, billed Rp7.390.000, collected Rp420.000, 3 cash payments |
| API running balance | PASS | Juli 2026: income Rp420.000, opening Rp15.000.000, closing Rp15.420.000 sebelum fixture |
| API tanpa token | PASS | Kedua endpoint HTTP 401 `UNAUTHORIZED` |
| API periode invalid | PASS | `month=13` dan `year=x` HTTP 400 `INVALID_PERIOD` |
| Empty fiscal months | PASS | 12 bulan Juli 2026-Juni 2027 merespons JSON dengan array kosong valid |
| Rekonsiliasi 12 bulan | PASS | Income/expense sama dengan chain; carry-forward dan formula benar |
| Pengeluaran positif | PASS | Fixture Rp125.000 tampil satu kali di monthly dan running balance; kemudian dihapus |
| UI monthly live | PASS | `Rincian Kas Masuk IPL` tampil tanpa pesan response invalid |
| UI yearly live | PASS | Periode Juli-Juni dan agregasi selesai |
| CSV/PDF controls | PASS untuk keberadaan kontrol | Download isi CSV dan dialog print manual belum dieksekusi pada UAT live ini |

Fixture pengeluaran ID `44c32123-258b-48bf-b4ef-fc336ef6b17e` diverifikasi muncul satu kali dengan total Rp125.000, lalu dihapus. Setelah cleanup, jumlah pengeluaran Juli kembali nol.

Bukti eksekusi utama: monthly `244005`, running balance `244006`, dan running balance dengan fixture `243968`. UAT browser memakai proxy headless dengan User-Agent browser karena n8n `ignoreBots` menolak request Playwright langsung.

### Catatan browser

UAT browser mencatat 17 request report saat development server aktif, terdiri dari 14 monthly dan 3 running balance. Ini dipengaruhi React development effect dan pemuatan ulang auth, bukan loop error. Endpoint report tidak mengembalikan 403. Empat response 403 berasal dari background endpoint `/users/pending` dan `/payments/list`, sehingga tidak dihitung sebagai kegagalan laporan. Production build perlu diuji dengan browser normal untuk navigasi tersebut.

### Skenario yang belum dieksekusi langsung

Skenario sudah didefinisikan tetapi belum diberi bukti live pada sesi ini: JWT expired/invalid, role warga, akun suspended/pending, injection response malformed/timeout, race saat klik filter cepat, payment metadata rusak, dan verifikasi isi file CSV/dialog print. Skenario ini tidak dinyatakan PASS sampai dijalankan pada sesi UAT lanjutan.

## Temuan, Penyebab, dan Solusi

| Temuan | Penyebab | Dampak | Solusi |
| --- | --- | --- | --- |
| `Respons API tidak valid` pada saldo berjalan | HTTP Request memakai `genericAuthType=supabaseApi`, padahal generic HTTP tidak mendukung credential Supabase; header `apikey` hilang | Workflow berhenti sebelum Respond node dan body kosong | Ganti query payment/expense dengan node Supabase native dan credential service-role aktif |
| Laporan bulanan 200 tetapi kosong | Query memakai anon key dan RLS tidak mengembalikan data pilot | Angka laporan salah | Query native service-role untuk bills, payments, expenses, units, profiles |
| Row laporan terduplikasi | Query chain menerima banyak input dan meneruskan row berulang | Total dapat membesar | Deduplikasi semua dataset berdasarkan ID |
| Request error memicu ratusan eksekusi | Object ToastContext dibuat ulang dan menjadi dependency `loadData`; toast error memicu render lalu request ulang | Beban n8n meningkat dan UI tidak stabil | Memoize API ToastContext; yearly request dibatasi concurrency 3 |
| Periode invalid diproses diam-diam | Workflow lama memakai default tanpa validasi | Input typo menghasilkan chain kosong | Tambah branch `Period Valid?` dan response JSON HTTP 400 |
| Bentuk payment/expense tidak cocok UI | Backend mengirim snake_case/raw relation, UI memakai camelCase | Kolom unit, penghuni, tanggal kosong | Normalisasi `cashPayments` dan `expenses` di Code node |

## Rencana Perbaikan Lanjutan

1. Jalankan smoke test report pada production build dengan browser allowlisted untuk memastikan background navigation 403 tidak terjadi.
2. Tambahkan test otomatis kontrak envelope untuk setiap endpoint sebelum publish.
3. Tambahkan pagination/limit eksplisit bila volume tabel melebihi 1.000 row.
4. Uji ulang export CSV/PDF dengan dataset multi-bulan yang memiliki pengeluaran dan pembayaran nyata setelah reset pilot.

## Status Akhir

**Skenario inti dengan credential Admin untuk pemasukan, pengeluaran, bulanan, tahunan, saldo berjalan, tanpa token, periode invalid, empty period, deduplikasi, dan response contract PASS.** Tidak ada lagi error `Respons API tidak valid` pada endpoint laporan dengan credential Admin yang valid. Skenario negatif lain yang disebutkan di atas masih menunggu eksekusi live.
