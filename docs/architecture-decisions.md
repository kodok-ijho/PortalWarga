# Architecture Decision Records (ADR) — RuangWarga SaaS

Dokumen resmi pencatatan keputusan arsitektural teknis dan bisnis platform RuangWarga.

---

## ADR-001: Model Pengelolaan Multi-Properti untuk Vertikal Kos-kosan & Kontrakan

| Atribut | Nilai |
|---|---|
| **Nomor ADR** | ADR-001 |
| **Status** | **ACCEPTED & IMPLEMENTED** |
| **Tanggal Keputusan** | 14 September 2026 |
| **Ref Task** | `task.md` **T7.6** (Phase 7 — Template Vertikal: Kos-kosan) |
| **Ref Requirement** | `requirement.md` **FR-17** |
| **Ref Spesifikasi** | `specification.md` **§2, §3, §7.2** |
| **Pihak Terkait** | Product Owner, Platform Architect, Lead Developer |

---

### 1. Konteks & Masalah

Pada vertikal bisnis **Kos-kosan & Kontrakan (FR-17)**, pemilik kos sering kali memiliki lebih dari satu properti atau lokasi usaha. Contoh kasus riil:
- **Pak Budi** memiliki:
  1. *Kos Melati Dago* (15 kamar) — dikelola oleh penjaga kos bernama Pak Joko, rekening bank BCA.
  2. *Kos Melati Tubagus* (10 kamar) — dikelola oleh penjaga kos bernama Bu Siti, rekening bank Mandiri.

Terdapat dua dimensi variasi multi-properti di lapangan:
1. **Multi-Lokasi / Multi-Cabang**: Properti berada di alamat geografis berbeda, memiliki staf/penjaga kos berbeda, dan rekening bank atau pembukuan pengeluaran (listrik, air, internet) yang terpisah.
2. **Multi-Gedung / Multi-Sayap dalam Satu Lokasi**: Properti berada di satu lahan/alamat yang sama, namun terdiri dari beberapa blok/bangunan fisik (misal: Gedung Depan, Paviliun Belakang, atau Lantai 1 & Lantai 2).

Pertanyaan arsitektural: **Apakah satu pemilik dengan multi-properti kos mengelola usahanya dalam 1 tenant dengan pengelompokan properti di dalamnya, atau menggunakan tenant terpisah untuk tiap properti?**

---

### 2. Opsi yang Dipertimbangkan

#### Opsi A: 1 Lokasi/Properti Kos = 1 Tenant Mandiri (Multi-Tenant Native)
- Setiap properti/cabang didaftarkan sebagai 1 entitas `tenants` tersendiri (misal: "Kos Melati Dago", "Kos Melati Tubagus").
- Pemilik kos menggunakan **1 akun login** yang sama (`auth.users`), dan terdaftar sebagai `role = 'admin'` di kedua tenant pada tabel `tenant_members`.
- Pemilik berpindah antar properti secara instan melalui Tenant Switcher di navigasi atas atau menu `/account/tenants` (`MyTenants.jsx`).
- Penjaga kos / staf cabang diundang ke masing-masing tenant (Pak Joko diundang ke Dago, Bu Siti ke Tubagus) dengan peran `pengurus`.

#### Opsi B: 1 Tenant Menggabungkan Seluruh Cabang (Single-Tenant Multi-Branch)
- Pemilik kos hanya memiliki 1 tenant (misal: "Bisnis Kos Melati Grup").
- Semua kamar dari seluruh cabang (Dago dan Tubagus) digabung dalam 1 daftar unit, dengan kolom tambahan `branch_id` atau `property_name`.
- Matriks pembayaran, daftar penyewa, dan laporan kas menyertakan dropdown filter "Pilih Cabang".

---

### 3. Matriks Perbandingan & Evaluasi

| Kriteria Evaluasi | Opsi A: 1 Tenant per Properti | Opsi B: Semua Cabang 1 Tenant | Catatan Teknis |
|---|---|---|---|
| **Isolasi Keamanan & RLS** | **Sangat Tinggi (Aman 100%)**.<br>PostgreSQL RLS `tenant_id` otomatis mencegah penjaga kos Dago mengintip kamar, uang sewa, atau penyewa di cabang Tubagus. | **Rentan Bocor**.<br>Penjaga kos (staf) di satu cabang dapat melihat kamar dan transaksi seluruh cabang lain, kecuali jika skema DB dan RLS dirombak ulang secara kompleks. | Prinsip utama RuangWarga: RLS database adalah benteng utama privasi. |
| **Pemisahan Buku Kas & Rekening** | **Bersih & Mandiri**.<br>Setiap properti memiliki rekening bank penampung, riwayat tagihan, pengeluaran token listrik, WiFi, dan laporan laba-rugi terisolasi. | **Bercampur**.<br>Transaksi dari berbagai rekening bank dan pengeluaran bercampur dalam 1 tabel kas tenant. | Pemilik kos butuh laporan keuangan per properti untuk evaluasi profitabilitas. |
| **Model Kuota Langganan (SumoPod)** | **Konsisten & Fleksibel**.<br>Kapasitas blok kamar (`tenant_subscription_blocks`) dihitung presisi per properti (Dago: 15 kamar, Tubagus: 10 kamar). Jika satu cabang tutup/dijual, langganan cabang tersebut dapat dihentikan tanpa mengganggu cabang lain. | **Kompleks**.<br>Kuota blok harus diakumulasikan secara global, menyulitkan alokasi biaya langganan per unit bisnis. | Selaras dengan fondasi Phase 1 & 4. |
| **User Experience (UX)** | **Intuitif**.<br>Cukup 1 klik via Tenant Switcher atau halaman Layanan Saya (`/account/tenants`). Pengguna tidak dibingungkan oleh filter cabang di setiap halaman. | Pemilik tidak perlu switch tenant, tetapi form penambahan kamar, pengeluaran, dan penagihan menjadi lebih panjang karena wajib memilih cabang. | Standar SaaS modern (mirip Slack workspaces / Notion workspaces). |
| **Dukungan Listing Publik (Phase 10)** | **Langsung Siap**.<br>Setiap tenant merepresentasikan 1 entitas kos nyata dengan alamat fisik, foto gerbang, peraturan, dan nomor kontak pengelola lokal yang jelas di `/listing/kos`. | Memerlukan mapping alamat dan kontak yang berbeda-beda per kamar di direktori publik. | Memudahkan calon penyewa menemukan kos per lokasi spesifik. |

---

### 4. Keputusan yang Ditetapkan (Decision)

Disepakati bahwa RuangWarga menerapkan pendekatan **Opsi A: 1 Properti/Lokasi Kos = 1 Tenant Mandiri**, dengan dukungan pelengkap berupa **Pengelompokan Gedung via Metadata**:

1. **Multi-Cabang / Lokasi Berbeda**:
   - Dikelola sebagai **tenant terpisah**.
   - Pemilik kos cukup login dengan satu akun (Google OAuth / Supabase Auth).
   - Pemilik dapat membuat properti kos baru kapan saja melalui alur `/account/add-tenant` -> `ChooseTenantType.jsx` (tipe `kos`) -> `KosSetupWizard.jsx`.
   - Di dashboard akun (`/account/tenants`), semua properti kos yang dimiliki tampil rapi dengan badge status langganan masing-masing dan tombol beralih cepat.

2. **Multi-Gedung / Multi-Sayap dalam Satu Lokasi**:
   - Jika pemilik memiliki satu kompleks kos dengan beberapa bangunan (misal: "Gedung Depan", "Gedung Belakang", "Lantai 1", "Lantai 2"), maka dikelola dalam **1 tenant yang sama**.
   - Penamaan kamar dapat menggunakan label representatif (misal: `A-101`, `B-201`) dan detail gedung/lantai dicatat pada kolom `tenant_units.metadata` (`metadata.building`, `metadata.floor`, `metadata.fasilitas`).

3. **Delegasi Staf / Penjaga Kos**:
   - Pemilik kos (`admin`) dapat mengundang penjaga kos ke tenant yang bersangkutan dengan peran `pengurus`.
   - Berkat isolasi RLS `tenant_id`, penjaga kos Cabang A dijamin tidak dapat membaca data keuangan, identitas penyewa, maupun mutasi kas di Cabang B.

---

### 5. Dampak dan Konsekuensi Teknis

1. **Skema Database**:
   - Tidak memerlukan tabel baru `branches` atau penambahan foreign key `property_id` pada tabel operasional.
   - Skema `tenants`, `tenant_units`, `billing_items`, `payments`, dan `expenses` yang sudah ada tetap solid dan konsisten.
2. **Keamanan RLS**:
   - RLS policy yang telah diimplementasikan di Phase 1–5 berfungsi 100% efektif tanpa modifikasi lanjutan.
3. **Billing Platform**:
   - Model penagihan langganan SumoPod per tenant berjalan wajar dan adil sesuai kapasitas masing-masing properti.
4. **Roadmap Masa Depan (Enhancement Opsional)**:
   - Pada Tenant Owner Dashboard (`/account/tenants`), di masa depan dapat ditambahkan widget *Portfolio Overview* untuk menampilkan total akumulasi kamar tersewa dan total pendapatan pemilik di seluruh properti kos miliknya secara teragregasi.

---

### 6. Riwayat Perubahan
- **v1.0 (14 September 2026)**: Keputusan ADR-001 dirumuskan, disetujui, dan didokumentasikan untuk menyelesaikan Task T7.6.
