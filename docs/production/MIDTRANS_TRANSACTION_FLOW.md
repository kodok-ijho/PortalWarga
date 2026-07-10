# Dokumen Flow Transaksi Pembayaran IPL dengan Midtrans

Portal Warga Palm Village

Tanggal dokumen: 8 Juli 2026

## Tujuan Dokumen

Dokumen ini menjelaskan alur transaksi pembayaran IPL dari tahap pemesanan/tagihan di Portal Warga Palm Village sampai proses checkout pembayaran melalui Midtrans.

Dokumen ini disiapkan sebagai lampiran data tambahan onboarding Midtrans. Surat penunjukan PIC merchant disiapkan sebagai dokumen terpisah.

## Ringkasan Alur

1. Warga login ke Portal Warga Palm Village.
2. Warga membuka menu `Keuangan & IPL` lalu memilih `Matriks Pembayaran IPL`.
3. Sistem menampilkan daftar tagihan IPL per unit dan periode.
4. Warga memilih tagihan yang akan dibayar.
5. Sistem menampilkan ringkasan tagihan dan total pembayaran.
6. Warga memilih metode pembayaran `QRIS`.
7. Sistem membuat transaksi pembayaran dan mengarahkan warga ke checkout Midtrans.
8. Warga menyelesaikan pembayaran di halaman checkout Midtrans.
9. Midtrans mengirim notifikasi/webhook ke backend.
10. Backend memverifikasi notifikasi Midtrans, lalu memperbarui status pembayaran menjadi `Lunas`.

## Catatan Implementasi

Saat dokumen ini dibuat, UI demo Portal Warga Palm Village sudah memiliki alur pemilihan tagihan dan konfirmasi pembayaran QRIS. Integrasi production Midtrans akan mengganti simulasi QRIS demo dengan pembuatan transaksi melalui backend/n8n dan checkout Midtrans.

Screenshot checkout Midtrans pada dokumen ini menggunakan tampilan sandbox/mock untuk menggambarkan target halaman checkout Midtrans, karena Snap/checkout live belum terhubung langsung pada UI demo lokal.

## Data Contoh Transaksi

| Field | Nilai contoh |
| --- | --- |
| Merchant | Portal Warga Palm Village |
| Pengguna | Ahmad Hidayat |
| Unit | Blok A/03 |
| Produk/tagihan | Tagihan IPL November 2025 |
| Metode | QRIS via Midtrans |
| Nominal | Rp140.000 |
| Contoh order ID | PV-IPL-202607-A03-0001 |

## Step-by-Step Flow dengan Screenshot

### 1. Warga membuka dashboard portal

Setelah login, warga masuk ke dashboard Portal Warga Palm Village. Dari dashboard, warga dapat mengakses menu `Keuangan & IPL`.

![Dashboard warga](midtrans-flow/screenshots/01-dashboard-warga.png)

### 2. Warga memilih tagihan IPL

Pada halaman `Matriks Pembayaran IPL`, sistem menampilkan status tagihan per bulan. Warga memilih tagihan yang masih belum dibayar untuk unitnya sendiri.

![Pilih tagihan IPL](midtrans-flow/screenshots/02-pilih-tagihan.png)

### 3. Sistem menampilkan konfirmasi pembayaran

Setelah tagihan dipilih, sistem menampilkan ringkasan transaksi berisi periode tagihan, total nominal, dan pilihan metode pembayaran. Warga memilih `QRIS`, lalu melanjutkan ke checkout Midtrans.

![Konfirmasi pembayaran IPL](midtrans-flow/screenshots/03-konfirmasi-pembayaran.png)

### 4. Warga menyelesaikan pembayaran di checkout Midtrans

Backend membuat transaksi Midtrans dengan `order_id` unik, nominal transaksi, detail customer, dan item tagihan. Setelah token/checkout URL diterima, warga diarahkan ke checkout Midtrans untuk menyelesaikan pembayaran QRIS.

![Checkout Midtrans QRIS](midtrans-flow/screenshots/04-midtrans-checkout-qris.png)

### 5. Status tagihan diperbarui menjadi lunas

Setelah pembayaran berhasil, Midtrans mengirim notifikasi/webhook ke backend. Backend memverifikasi signature dan status transaksi, lalu memperbarui status payment dan tagihan di database. Portal kemudian menampilkan tagihan sebagai `Lunas`.

![Status pembayaran lunas](midtrans-flow/screenshots/05-status-lunas.png)

## Alur Teknis Backend

```mermaid
sequenceDiagram
  participant W as Warga
  participant FE as Portal Warga
  participant API as Backend n8n
  participant DB as Supabase
  participant M as Midtrans

  W->>FE: Pilih tagihan IPL
  FE->>API: POST /payments/qris/create
  API->>API: Validasi JWT, role, dan kepemilikan unit
  API->>DB: Buat payment pending dan order_id unik
  API->>M: Create transaction QRIS/Snap
  M-->>API: Token/checkout/payment data
  API->>DB: Simpan metadata transaksi Midtrans
  API-->>FE: Return checkout data
  FE-->>W: Tampilkan checkout Midtrans
  W->>M: Bayar QRIS
  M->>API: Webhook payment notification
  API->>API: Verifikasi signature Midtrans
  API->>DB: Update payment completed
  API->>DB: Update bill paid
  FE->>API: Refresh status tagihan
  API-->>FE: Status lunas
```

## Kontrol Keamanan dan Validasi

- `order_id` dibuat unik untuk setiap transaksi.
- Frontend tidak menyimpan Midtrans Server Key.
- Payment hanya dibuat melalui backend yang memvalidasi JWT dan kepemilikan unit.
- Status `Lunas` tidak dipercaya dari frontend atau return page saja.
- Status `Lunas` hanya ditetapkan setelah webhook Midtrans diverifikasi backend.
- Webhook Midtrans diproses secara idempotent agar notifikasi ganda tidak menggandakan pembayaran.
- Semua aksi penting dicatat pada audit log.

## Endpoint Production yang Direncanakan

| Endpoint | Fungsi |
| --- | --- |
| `POST /portal-v1/payments/qris/create` | Membuat transaksi QRIS Midtrans untuk tagihan IPL |
| `POST /portal-v1/payments/midtrans/webhook` | Menerima dan memverifikasi notifikasi pembayaran Midtrans |
| `GET/POST /portal-v1/bills/list` | Mengambil daftar tagihan dan status pembayaran terbaru |

## Status Dokumen

Dokumen ini siap dipakai sebagai lampiran flow transaksi untuk onboarding Midtrans, dengan catatan bahwa screenshot checkout Midtrans adalah representasi sandbox/mock sampai integrasi Midtrans production tersambung ke backend.
