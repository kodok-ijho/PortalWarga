# Requirement UAT Portal Warga dari Sudut Pandang Warga

> Sistem: Portal Warga Palm Village  
> Status: Approved baseline untuk implementasi UAT  
> Tanggal: 10 Agustus 2026  
> Dokumen terkait: `WargaUAT_Plan.md`, `WargaUAT_Task.md`

## 1. Pendahuluan

Dokumen ini mendefinisikan kebutuhan untuk menyiapkan lingkungan UAT terisolasi dan mengaudit kesiapan Portal Warga dari sudut pandang warga. Production telah digunakan oleh sebagian warga untuk pilot dan berisi data nyata. Oleh sebab itu, seluruh registrasi, upload, transaksi, verifikasi, serta cleanup UAT wajib menggunakan Supabase staging dan data sintetis.

Tujuan UAT adalah membuktikan bahwa warga baru dapat:

1. masuk menggunakan Google dan menyelesaikan registrasi pertama;
2. menunggu dan menerima keputusan persetujuan akun;
3. melihat profil, unit, daftar rumah, serta data penghuni yang diizinkan;
4. mencatat satu pembayaran IPL untuk satu atau beberapa bulan;
5. mengunggah bukti secara aman;
6. menerima notifikasi pencatatan dan keputusan verifikasi;
7. tidak dapat mengakses data privat atau tindakan milik pengguna lain.

UAT menghasilkan laporan temuan dan rekomendasi. Perbaikan produk tidak boleh dilakukan sampai laporan audit disetujui secara terpisah.

## 2. Glosarium

- **Production**: Vercel, Supabase, n8n workflow, storage, dan email yang melayani warga sebenarnya.
- **UAT**: pengujian penerimaan pengguna dengan codebase lokal, Supabase staging, workflow n8n khusus UAT, storage staging, dan SMTP sandbox.
- **Warga UAT**: `ngatormatic@gmail.com`, dimulai sebagai pengguna yang belum terdaftar di staging.
- **Staff UAT**: `denmas.dyudhiantoro@gmail.com`, diberi kewenangan bendahara di staging dan dapat menyetujui registrasi serta memverifikasi IPL.
- **Unit UAT**: unit sintetis yang hanya dapat dilihat oleh pemiliknya dan admin staging.
- **Submission pembayaran**: satu pencatatan transfer oleh warga dengan satu bukti dan satu atau beberapa alokasi periode IPL.
- **Alokasi periode**: bagian submission yang mewakili satu bulan tagihan dan diputuskan secara independen.
- **`uat_run_id`**: identitas unik satu sesi UAT untuk penelusuran dan cleanup.
- **Fail-closed**: aplikasi menolak berjalan atau menolak request ketika konfigurasi environment tidak dapat dibuktikan aman.
- **Release gate**: kondisi yang wajib dipenuhi sebelum tahap berikutnya boleh dilakukan.

## 3. Aktor dan Data

| Aktor | Identitas | Kewenangan UAT |
| --- | --- | --- |
| Warga | `ngatormatic@gmail.com` | Registrasi, membaca direktori yang diizinkan, mencatat pembayaran unit sendiri, membaca status sendiri |
| Bendahara | `denmas.dyudhiantoro@gmail.com` | Menyetujui profil UAT dan memverifikasi alokasi pembayaran UAT |
| Admin staging | Akun admin terkontrol | Melihat seluruh data UAT, membantu seed dan cleanup, melakukan tindakan yang juga diizinkan untuk bendahara |
| Warga lain sintetis | Fixture staging | Membuktikan isolasi lintas pengguna/unit |

Seluruh entitas UAT yang dapat dimutasi harus memiliki `uat_run_id`. Entitas demo yang bertahan lebih lama dari satu request juga harus dapat dikenali dengan `is_demo = true` atau penanda ekuivalen yang tervalidasi server.

## 4. Batas Ruang Lingkup

### Termasuk

- isolasi local/staging dari production;
- workflow n8n UAT pada instance n8n yang sama dengan production;
- registrasi warga baru dan persetujuan staff;
- direktori rumah/penghuni;
- matriks dan pencatatan pembayaran IPL multi-bulan;
- upload bukti privat;
- notifikasi email melalui SMTP sandbox hosted;
- authorization negative test, laporan severity, dan cleanup.

### Tidak termasuk pada tahap audit

- mutasi atau pengujian end-to-end terhadap database production;
- pengiriman email melalui Gmail production;
- refactor workflow production;
- penerapan temuan produk ke production;
- commit, push, deployment, atau migrasi production tanpa persetujuan eksplisit pemilik.

## 5. Requirement

### WUAT-REQ-001 — Baseline repository dan larangan menimpa pekerjaan

**User story:** Sebagai pemilik aplikasi, saya ingin UAT dimulai dari baseline repository yang dapat dibuktikan agar hasil audit relevan dan perubahan lokal saya tetap aman.

#### Acceptance criteria

1. WHEN implementasi dimulai, THE IMPLEMENTER SHALL mencatat branch, commit lokal, commit origin, `git status`, serta perbedaan yang relevan sebelum mengubah file.
2. IF worktree memiliki perubahan yang bukan milik implementasi UAT, THE IMPLEMENTER SHALL mempertahankan perubahan tersebut dan tidak melakukan reset, checkout, pull, atau overwrite destruktif.
3. WHEN local dan origin berbeda, THE IMPLEMENTER SHALL menjelaskan dampaknya dan meminta persetujuan sebelum operasi Git yang dapat mengubah worktree.
4. WHEN laporan audit dibuat, THE SYSTEM SHALL mencantumkan commit dan versi schema/workflow yang benar-benar diuji.

### WUAT-REQ-002 — Pemisahan konfigurasi environment

**User story:** Sebagai pemilik data warga, saya ingin local UAT mustahil salah terhubung ke production.

#### Acceptance criteria

1. WHEN aplikasi berjalan dalam mode UAT, THE LOCAL SERVER SHALL menggunakan Supabase staging dan namespace n8n `portal-uat-v1`.
2. IF mode UAT mendeteksi URL Supabase production, namespace `portal-v1`, atau credential production, THE LOCAL SERVER SHALL berhenti secara fail-closed sebelum menerima request.
3. WHEN build production dibuat, THE PRODUCTION PROXY SHALL menggunakan namespace `portal-v1` dan SHALL NOT menerima pemilihan namespace dari browser.
4. WHEN code dipush, THE CODEBASE SHALL tetap environment-neutral; konfigurasi UAT/production dipilih oleh env lokal atau env server-side deployment, bukan edit manual source code.
5. THE SYSTEM SHALL NOT memasukkan data atau secret UAT ke bundle production maupun data atau secret production ke bundle UAT.

### WUAT-REQ-003 — Pengelolaan secret

**User story:** Sebagai pemilik aplikasi, saya ingin key berprivilege tinggi tidak dapat dibaca browser atau tersimpan di Git.

#### Acceptance criteria

1. THE SYSTEM SHALL mengekspos ke browser hanya Supabase URL dan anon/publishable key yang memang browser-safe.
2. THE SYSTEM SHALL menyimpan service-role key, legacy JWT secret, basic-auth credential n8n, dan `X-UAT-Key` hanya pada credential store atau env server-side tanpa awalan `VITE_`.
3. BEFORE UAT pertama, THE OWNER SHALL merotasi service-role key dan legacy JWT secret staging yang sebelumnya ditempatkan dalam `client/src/staging.env`.
4. WHEN secret scanning dijalankan, THE CHECK SHALL gagal jika secret server-side ditemukan dalam source, file terlacak Git, output build, atau variabel `VITE_*`.
5. WHEN menampilkan log/error, THE SYSTEM SHALL meredaksi token, credential, signed URL, dan nilai secret.

### WUAT-REQ-004 — Isolasi workflow n8n UAT

**User story:** Sebagai operator, saya ingin workflow UAT dapat berada di instance n8n yang sama tanpa dapat tertukar dengan workflow production.

#### Acceptance criteria

1. THE SYSTEM SHALL memberi nama workflow UAT dengan prefix `UAT -` dan webhook prefix `/webhook/portal-uat-v1/*`.
2. THE UAT WORKFLOWS SHALL menggunakan credential Supabase staging, storage staging, dan SMTP sandbox secara eksklusif.
3. THE PRODUCTION WORKFLOWS SHALL tetap menggunakan `/webhook/portal-v1/*` dan tidak diubah selama tahap UAT.
4. WHEN browser local mengirim request, THE BROWSER SHALL memanggil `/api/n8n/*`; THE LOCAL PROXY SHALL menambahkan namespace dan `X-UAT-Key` secara server-side.
5. IF request UAT tidak memiliki kunci transport yang valid dan App JWT yang valid pada endpoint terproteksi, THE WORKFLOW SHALL menolaknya.
6. THE UAT WORKFLOWS SHALL aktif hanya selama jendela UAT dan SHALL memiliki kill switch.
7. AFTER sesi UAT berakhir, THE UAT WORKFLOWS SHALL dinonaktifkan dan execution payload yang memuat data UAT SHALL dibersihkan sesuai retensi pengujian.

### WUAT-REQ-005 — Dataset dan unit UAT terisolasi

**User story:** Sebagai warga pilot, saya tidak ingin melihat unit atau transaksi pengujian.

#### Acceptance criteria

1. WHEN staging disiapkan, THE IMPLEMENTER SHALL menyalin schema/migration yang diperlukan tanpa menyalin data warga, auth user, audit log, atau file production.
2. THE SYSTEM SHALL membuat satu unit sintetis untuk warga UAT dan satu fixture lintas pengguna untuk negative test.
3. THE SYSTEM SHALL memastikan unit UAT hanya terlihat oleh pemilik unit dan admin staging; bendahara hanya memperoleh data minimum yang diperlukan untuk approval/verifikasi.
4. THE SYSTEM SHALL mengecualikan entitas `is_demo` dari agregasi laporan yang dimaksudkan merepresentasikan data nyata.
5. WHEN cleanup dijalankan, THE SYSTEM SHALL dapat menghapus seluruh entitas terkait berdasarkan `uat_run_id` tanpa memilih data secara manual.

### WUAT-REQ-006 — Registrasi pertama warga

**User story:** Sebagai warga baru, saya ingin mendaftar dengan akun Google dan memahami status akun saya.

#### Acceptance criteria

1. GIVEN `ngatormatic@gmail.com` belum terdaftar di staging, WHEN pengguna login Google pertama kali, THE SYSTEM SHALL membuat profil pending tanpa memberinya akses warga yang sudah approved.
2. WHEN registrasi berhasil, THE SYSTEM SHALL menampilkan status menunggu dan instruksi yang jelas tanpa mengungkap detail internal.
3. WHEN bendahara menyetujui profil, THE SYSTEM SHALL mengaitkan warga dengan unit UAT dan mengaktifkan hak role warga.
4. WHEN warga login ulang setelah approval, THE SYSTEM SHALL membuka fitur warga dan mempertahankan pembatasan staff/admin.
5. IF profil ditolak atau tidak aktif, THE SYSTEM SHALL menolak akses dan menyediakan pesan serta jalur pengajuan kembali yang dapat dipahami.

### WUAT-REQ-007 — Direktori rumah dan transparansi penghuni

**User story:** Sebagai warga approved, saya ingin melihat daftar rumah dan informasi tetangga sesuai kebijakan komunitas.

#### Acceptance criteria

1. WHEN warga membuka `/houses`, THE SYSTEM SHALL mengizinkan route dan API untuk role warga.
2. THE DIRECTORY SHALL menampilkan nama, email, nomor telepon, unit, status hunian, dan status matriks IPL yang diperbolehkan.
3. THE DIRECTORY SHALL NOT menampilkan bukti pembayaran, detail transfer, signed URL, catatan internal verifikasi, atau credential pengguna lain.
4. IF warga mencoba endpoint atau objek privat milik unit lain secara langsung, THE SYSTEM SHALL mengembalikan `403` atau `404` tanpa membocorkan keberadaan data sensitif.
5. THE WARGA ROLE SHALL NOT dapat membuat, mengubah, atau menghapus master unit maupun profil pengguna lain.

### WUAT-REQ-008 — Upload bukti pembayaran

**User story:** Sebagai warga, saya ingin foto bukti dari ponsel dapat diunggah tanpa mengorbankan privasi.

#### Acceptance criteria

1. WHEN file gambar valid berukuran sampai 5 MB dipilih, THE CLIENT SHALL menerima file lalu mencoba kompresi sebelum upload.
2. IF file sumber melebihi 5 MB atau tipe file tidak diizinkan, THE CLIENT SHALL menolak sebelum upload dengan pesan yang dapat ditindaklanjuti.
3. WHEN kompresi berhasil, THE SYSTEM SHALL mengunggah hasil kompresi dan menampilkan preview/nama file yang benar.
4. IF kompresi atau upload gagal, THE SYSTEM SHALL tidak membuat submission pembayaran parsial dan SHALL memungkinkan retry.
5. THE STORAGE SHALL privat; hanya pemilik, bendahara, dan admin berwenang yang dapat memperoleh akses sementara ke bukti.

### WUAT-REQ-009 — Pencatatan IPL multi-bulan atomik

**User story:** Sebagai warga, saya ingin mencatat satu transfer untuk beberapa bulan hanya sekali.

#### Acceptance criteria

1. WHEN warga mencatat transfer Rp700.000 untuk lima bulan, THE SYSTEM SHALL membuat satu submission, satu bukti, dan lima alokasi periode dalam satu transaksi atomik.
2. IF salah satu periode tidak valid, duplikat, atau gagal dibuat, THE SYSTEM SHALL membatalkan seluruh submission dan tidak meninggalkan pembayaran sebagian.
3. THE SYSTEM SHALL mencegah warga memilih tagihan milik unit lain atau periode yang sudah lunas/disetujui.
4. THE SYSTEM SHALL menampilkan hubungan antara total transfer, daftar periode, nominal per periode, dan status masing-masing periode.
5. WHEN submission berhasil, THE WARGA SHALL hanya perlu melakukan satu tindakan catat bayar.

### WUAT-REQ-010 — Verifikasi per periode dan pengajuan kembali

**User story:** Sebagai bendahara, saya ingin memutuskan setiap bulan secara terpisah; sebagai warga, saya ingin penolakan satu bulan tidak membatalkan bulan lain.

#### Acceptance criteria

1. THE SYSTEM SHALL mengizinkan bendahara dan admin memverifikasi tiap alokasi periode secara independen.
2. WHEN satu alokasi disetujui, THE MATRIX SHALL menandai hanya periode tersebut sebagai lunas/approved.
3. WHEN satu alokasi ditolak, THE MATRIX SHALL mengembalikan hanya periode tersebut ke kondisi belum bayar dan periode approved lainnya SHALL tetap unchanged.
4. WHEN periode ditolak, THE WARGA SHALL dapat mengajukan kembali periode itu tanpa menggandakan periode yang sudah approved.
5. THE UI AND resident-facing notifications SHALL menonjolkan bendahara sebagai verifikator, walaupun admin juga berwenang.

### WUAT-REQ-011 — Notifikasi email UAT

**User story:** Sebagai warga, saya ingin menerima konfirmasi dan keputusan yang membawa saya langsung ke halaman terkait tanpa email UAT terkirim kepada penerima nyata.

#### Acceptance criteria

1. WHEN satu submission pembayaran berhasil dibuat, THE SYSTEM SHALL membuat satu email logis untuk warga, satu untuk kelompok admin, dan satu untuk kelompok bendahara, dengan deduplikasi jika satu alamat memenuhi lebih dari satu kategori.
2. WHEN satu alokasi periode disetujui atau ditolak, THE SYSTEM SHALL membuat satu email keputusan kepada warga untuk periode tersebut.
3. THE DECISION EMAIL SHALL memuat periode, nominal, status, catatan aman, dan deep link ke halaman pembayaran yang dimaksud.
4. THE EMAIL PIPELINE SHALL bersifat fail-open terhadap transaksi bisnis; kegagalan email tidak boleh mengubah hasil pendaftaran/pembayaran.
5. IN UAT, THE EMAIL DISPATCHER SHALL mengalihkan seluruh penerima ke SMTP sandbox hosted dan menyimpan penerima asli hanya sebagai metadata aman.
6. THE EMAIL PIPELINE SHALL mencegah duplikasi logis ketika request, workflow, atau dispatcher diulang.

### WUAT-REQ-012 — Audit otorisasi dan privasi

**User story:** Sebagai warga, saya ingin yakin akun warga tidak dapat mengambil alih fungsi staff atau membaca data privat tetangga.

#### Acceptance criteria

1. WHEN warga memanggil endpoint approval, verification, master data, reports privat, users, logs, atau settings staff, THE SYSTEM SHALL menolak request server-side.
2. WHEN ID unit/payment/file diganti dengan ID milik fixture lain, THE SYSTEM SHALL menolak akses tanpa mengandalkan route guard frontend.
3. WHEN token hilang, kedaluwarsa, salah audience/issuer, atau role-nya dimanipulasi, THE SYSTEM SHALL menolak request.
4. THE AUDIT SHALL mencakup horizontal privilege escalation, vertical privilege escalation, object enumeration, signed URL leakage, dan UAT-to-production routing.

### WUAT-REQ-013 — Laporan temuan dan severity

**User story:** Sebagai pemilik aplikasi, saya ingin memperoleh keputusan yang jelas sebelum memperluas penggunaan aplikasi.

#### Acceptance criteria

1. WHEN audit selesai, THE IMPLEMENTER SHALL membuat laporan berisi skenario, hasil aktual, hasil yang diharapkan, bukti tersamarkan, dampak warga, severity, dan rekomendasi.
2. THE REPORT SHALL menggunakan severity:
   - `Critical`: akses tanpa otorisasi, kebocoran secret/PII, atau UAT menyentuh production;
   - `High`: alur utama warga gagal, kebijakan direktori dilanggar, atau bukti pembayaran terekspos;
   - `Medium`: transaksi parsial, notifikasi/istilah tidak konsisten, upload umum gagal, atau performa mengganggu;
   - `Low`: masalah usability/visual yang tidak memblokir alur.
3. THE REPORT SHALL membedakan temuan yang sudah terbukti, risiko berbasis static review, dan keterbatasan karena production tidak diuji langsung.
4. IF terdapat temuan Critical, THE REPORT SHALL menandainya sebagai release blocker meskipun production sedang pilot.
5. THE IMPLEMENTER SHALL NOT memperbaiki temuan produk sebelum pemilik menyetujui fase remediasi terpisah.

### WUAT-REQ-014 — Cleanup dan bukti tidak ada residu

**User story:** Sebagai operator, saya ingin seluruh data pengujian dapat dihapus tanpa meninggalkan residu yang dapat terbawa ke production.

#### Acceptance criteria

1. AFTER bukti audit dikumpulkan, THE SYSTEM SHALL menghapus row UAT dalam urutan child-to-parent, objek storage, token/session, email sandbox, dan execution payload UAT.
2. THE CLEANUP SHALL dibatasi menggunakan `uat_run_id` dan SHALL gagal jika target environment bukan staging.
3. WHEN cleanup selesai, THE IMPLEMENTER SHALL menjalankan query verifikasi yang menghasilkan nol entitas UAT.
4. THE IMPLEMENTER SHALL menonaktifkan workflow UAT dan mencabut kunci akses sesi.
5. THE IMPLEMENTER SHALL menyimpan hanya laporan yang sudah disamarkan serta konfigurasi workflow UAT inactive tanpa data atau secret temporer.

### WUAT-REQ-015 — Gate perubahan production

**User story:** Sebagai pemilik aplikasi, saya ingin audit dan perbaikan tidak otomatis berubah menjadi deployment production.

#### Acceptance criteria

1. THE IMPLEMENTER SHALL meminta approval terpisah sebelum memperbaiki backlog produk, mengubah workflow production, menjalankan migrasi production, commit, push, atau deploy.
2. WHEN perbaikan nantinya disetujui, THE IMPLEMENTER SHALL memprioritaskan: menonaktifkan Admin Demo, membuka direktori warga sesuai kebijakan, upload 5 MB, pembayaran multi-bulan atomik, notifikasi per periode, konsistensi istilah bendahara, dan optimasi bundle.
3. WHEN eksperimen penggabungan endpoint dilakukan, THE IMPLEMENTER SHALL melakukannya pada workflow UAT terpisah dan tidak mengganti workflow production sebelum parity test serta approval.

## 6. Kriteria Selesai

UAT dianggap selesai hanya jika:

- seluruh requirement yang termasuk tahap audit mempunyai bukti pass/fail;
- tidak ada request, row, file, email, atau workflow UAT yang menggunakan resource production;
- laporan severity telah diserahkan;
- seluruh entitas UAT telah dibersihkan dan workflow dinonaktifkan;
- backlog remediasi tetap belum dikerjakan sampai mendapat approval baru.
