# Deployment ke Vercel

Panduan ini memakai folder `PortalPalmVillage` sebagai root project di Vercel. Aplikasi frontend tetap berada di folder `client`.

## 1. Persiapan Repository

Pastikan file berikut ikut ter-push ke GitHub:

- `package.json`
- `vercel.json`
- `client/package.json`
- `client/package-lock.json`
- `client/src`
- `client/public`

Folder yang tidak perlu di-push:

- `client/node_modules`
- `client/dist`
- `.env`
- `.vercel`

## 2. Import Project di Vercel

1. Buka Vercel, lalu pilih **Add New Project**.
2. Import repository GitHub project ini.
3. Set **Root Directory** ke `PortalPalmVillage` jika repository GitHub berisi folder induk lain.
4. Biarkan Vercel membaca konfigurasi dari `vercel.json`.

Konfigurasi yang dipakai:

```json
{
  "installCommand": "npm --prefix client ci",
  "buildCommand": "npm --prefix client run build",
  "outputDirectory": "client/dist",
  "framework": "vite"
}
```

## 3. Environment Variables

Untuk preview demo tanpa Supabase:

```env
VITE_DEMO_MODE=true
```

Untuk production dengan Supabase:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Tambahkan env vars di Vercel melalui:

**Project Settings** -> **Environment Variables**

Pilih environment yang sesuai: **Production**, **Preview**, dan/atau **Development**.

## 4. Supabase Production Checklist

Sebelum `VITE_DEMO_MODE=false`, pastikan:

- Schema di `supabase/schema.sql` sudah dijalankan di Supabase SQL Editor.
- Supabase Auth email/password sudah aktif.
- User admin awal sudah dibuat.
- Row di tabel `profiles` untuk user admin sudah memiliki role `admin`.
- Domain Vercel sudah ditambahkan ke Supabase Auth URL Configuration jika memakai redirect/auth flow.

URL yang biasanya perlu diset di Supabase:

```text
Site URL: https://domain-vercel-kamu.vercel.app
Redirect URLs:
https://domain-vercel-kamu.vercel.app/*
```

## 5. Verifikasi Lokal

Jalankan dari folder `PortalPalmVillage`:

```bash
npm run build
```

Build berhasil jika Vite membuat output di:

```text
client/dist
```

## 6. Troubleshooting Cepat

Jika halaman route seperti `/reports` menjadi 404 saat refresh, pastikan `vercel.json` memiliki rewrite:

```json
{
  "source": "/(.*)",
  "destination": "/index.html"
}
```

Jika login production gagal, cek kembali:

- `VITE_DEMO_MODE=false`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- tabel `profiles`
- policy RLS di Supabase
