# Inventory Workflow Production untuk Notifikasi Email

> Status: hasil inventory repository lokal, bukan export live n8n
> Tanggal pemeriksaan: 6 Agustus 2026

## Ringkasan

Source workflow production di repository belum lengkap. Karena itu perubahan yang menyentuh jalur payment manual/cash, QRIS create/webhook, dan approval user/payment belum boleh dipromosikan sebagai production-ready hanya berdasarkan artifact lokal.

## Matrix source

| Workflow production | Source repository | Actor yang dibutuhkan | Status |
| --- | --- | --- | --- |
| `PV API - Auth Google` (`cjTmCiGHewDOvSKf`) | Tidak ditemukan | `profile.id` dari session | Blocker export live |
| `PV API - Users Approve` (`dih5U9wvmuWHa48Q`) | Tidak ditemukan | `approved_by` | Blocker export live |
| `PV API - Users Reject` (`qwUVSZEbIAh5KveZ`) | `docs/production/n8n-workflows/pv-api-users-reject.workflow.js` | `rejected_by` sudah dibentuk dari actor | Source tersedia, perlu verifikasi checksum live |
| `PV API - Payments Manual Submit` (`Zv7w0dW9zEiTh1hu`) | Tidak ditemukan | `recorded_by` | Blocker export live |
| `PV API - Payments Cash Create` (`8Jrj8pvEevmLZPZX`) | Tidak ditemukan | `recorded_by` | Blocker export live |
| `PV API - Payments Manual Approve` (`9fMshlbEy0Ol2wfY`) | Tidak ditemukan | `verified_by` | Blocker export live |
| `PV API - Payments Manual Reject` (`jivBKWczopjc37eH`) | Tidak ditemukan | `verified_by` | Blocker export live |
| QRIS Create (`Gt84N4815U8eXyIP`) | Tidak ditemukan | actor system/`recorded_by` null | Blocker export live |
| QRIS Status | `docs/production/n8n-workflows/pv-api-payments-qris-status.workflow.js` | actor system/`recorded_by` null | Source tersedia, perlu verifikasi checksum live |
| QRIS Webhook (`dBVwg3tPDSfuxXZl`) | Tidak ditemukan | actor system/`recorded_by` null | Blocker export live |
| Transactional Email v1 prototype | `docs/production/n8n-workflows/pv-notifications-transactional-email.workflow.js` | dispatcher worker | Prototype, digantikan v2 |

## Bukti dan gap

- Source `Users Reject` memetakan actor ke `rejected_by`; pasangan `Users Approve` belum tersedia.
- Source QRIS Status melakukan update `payments.status` dan `paid_at`, tetapi tidak mengisi actor manusia; ini sesuai model actor system untuk callback provider.
- Source payment create/approval yang lengkap tidak ada sehingga mapping `recorded_by` dan `verified_by` belum dapat diverifikasi lintas jalur.
- Credential name yang diketahui dari source adalah `PV Supabase Service Role`, `PV App JWT`, dan `Gmail account PalmVillage.Paguyuban`. Sender yang ditetapkan adalah `palmvillage.paguyuban@gmail.com`; secret tidak disalin ke repository.

## Tindakan sebelum deployment

1. Export JSON/source workflow live dari n8n untuk seluruh baris berstatus Blocker.
2. Simpan workflow export, ID, active version, checksum, dan waktu export.
3. Bandingkan dengan source repository; setiap perbedaan membutuhkan review.
4. Uji bahwa `recorded_by`/`verified_by`/`approved_by`/`rejected_by` berasal dari JWT/session server-side.
5. Setelah seluruh source tersedia, ubah status matrix dan lanjutkan gate EMAIL-020.

Artifact ini sengaja mencatat blocker secara eksplisit agar tidak ada asumsi bahwa source yang hilang sudah terversi.
