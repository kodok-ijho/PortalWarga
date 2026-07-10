/**
 * Capture transaction-flow screenshots for Midtrans onboarding documentation.
 *
 * Usage:
 *   1. Run the app: npm --prefix client run dev
 *   2. Run this script from repo root:
 *      node docs/production/midtrans-flow/capture-midtrans-flow.js
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('../../../client/node_modules/playwright');

const BASE = process.env.PV_BASE_URL || 'http://localhost:5173';
const OUT = resolve('docs/production/midtrans-flow/screenshots');
const W = 1440;
const H = 900;

mkdirSync(OUT, { recursive: true });

async function save(page, name, options = {}) {
  await page.screenshot({
    path: resolve(OUT, `${name}.png`),
    fullPage: options.fullPage ?? false,
  });
  console.log(`saved ${name}.png`);
}

async function loginAsWarga(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pv_demo_session', JSON.stringify({
      id: 'p-4',
      full_name: 'Ahmad Hidayat',
      phone: '0856-4000-0004',
      role: 'warga',
      unit_id: 3,
      occupancy_status: 'owner_rented',
      is_active: true,
      email: 'ahmad.h@palmvillage.id',
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}

async function selectFirstPayableBill(page) {
  await page.goto(`${BASE}/payment-matrix`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('select').selectOption('2025');
  await page.waitForTimeout(500);
  const ownRow = page.locator('tr', { hasText: 'Rumah Saya' }).first();
  await ownRow.locator('span[title="Klik untuk pilih"]').first().click();
  await page.waitForTimeout(500);
}

function midtransCheckoutHtml() {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Midtrans Snap Checkout - Sandbox Mock</title>
  <style>
    :root {
      color-scheme: light;
      --blue: #00a2e9;
      --navy: #19324d;
      --line: #d9e2ec;
      --muted: #64748b;
      --green: #15803d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #eef4f8;
      font-family: Inter, Arial, sans-serif;
      color: #172033;
    }
    .shell {
      width: min(1080px, calc(100vw - 48px));
      height: min(760px, calc(100vh - 48px));
      display: grid;
      grid-template-columns: 420px 1fr;
      overflow: hidden;
      border-radius: 10px;
      border: 1px solid #d7e2ea;
      background: #fff;
      box-shadow: 0 24px 70px rgba(25, 50, 77, .18);
    }
    aside {
      background: linear-gradient(180deg, #15324f 0%, #10263d 100%);
      color: #fff;
      padding: 34px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 44px;
    }
    .mark {
      width: 32px;
      height: 32px;
      border-radius: 7px;
      background: #d4af37;
      display: grid;
      place-items: center;
      color: #123222;
      font-weight: 900;
    }
    .summary {
      display: grid;
      gap: 18px;
      padding: 22px;
      border-radius: 8px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
    }
    .summary small {
      color: #bdd2e4;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .summary strong {
      display: block;
      margin-top: 5px;
      font-size: 17px;
    }
    .total strong {
      color: #f7d35a;
      font-size: 28px;
    }
    main {
      padding: 34px;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }
    .midtrans {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    .midtrans-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 28px;
      color: #12365a;
      font-weight: 600;
    }
    .bars {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .bars i {
      display: block;
      width: 5px;
      border-radius: 2px;
      background: var(--blue);
    }
    .bars i:nth-child(1) { height: 16px; opacity: .45; }
    .bars i:nth-child(2) { height: 24px; }
    .bars i:nth-child(3) { height: 12px; opacity: .65; }
    .badge {
      border: 1px solid #b8dff4;
      background: #edf9ff;
      color: #006c9f;
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 700;
    }
    h1 {
      margin: 4px 0 0;
      font-size: 24px;
      color: var(--navy);
    }
    .methods {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .method {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-height: 98px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #fff;
    }
    .method.active {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(0,162,233,.12);
    }
    .icon {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: #eef8fe;
      color: #007db7;
      font-weight: 800;
      flex: 0 0 auto;
    }
    .method strong { display: block; color: #20324a; margin-bottom: 4px; }
    .method span { display: block; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .qr-panel {
      display: grid;
      grid-template-columns: 210px 1fr;
      align-items: center;
      gap: 24px;
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfdff;
    }
    .qr {
      width: 190px;
      aspect-ratio: 1;
      border: 8px solid #fff;
      box-shadow: 0 6px 20px rgba(15,23,42,.12);
      background:
        linear-gradient(90deg, #111 10px, transparent 10px) 0 0 / 20px 20px,
        linear-gradient(#111 10px, transparent 10px) 0 0 / 20px 20px,
        #fff;
      position: relative;
    }
    .qr:before, .qr:after {
      content: "";
      position: absolute;
      width: 52px;
      height: 52px;
      border: 10px solid #111;
      background: #fff;
    }
    .qr:before { left: 10px; top: 10px; }
    .qr:after { right: 10px; bottom: 10px; }
    .steps {
      display: grid;
      gap: 10px;
      color: #334155;
      font-size: 14px;
      line-height: 1.55;
    }
    .steps b { color: var(--navy); }
    .status {
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .status p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    button {
      border: 0;
      border-radius: 8px;
      background: var(--blue);
      color: #fff;
      padding: 12px 18px;
      font-weight: 800;
      font-size: 14px;
    }
    @media (max-width: 820px) {
      body { display: block; background: #fff; }
      .shell { width: 100%; height: auto; min-height: 100vh; grid-template-columns: 1fr; border-radius: 0; }
      aside { padding: 24px; }
      main { padding: 24px; }
      .methods, .qr-panel { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <section class="shell" aria-label="Midtrans Snap Checkout Sandbox Mock">
    <aside>
      <div class="brand"><span class="mark">PV</span> Portal Warga Palm Village</div>
      <div class="summary">
        <div>
          <small>Order ID</small>
          <strong>PV-IPL-202607-A03-0001</strong>
        </div>
        <div>
          <small>Produk</small>
          <strong>Tagihan IPL Blok A/03 - November 2025</strong>
        </div>
        <div>
          <small>Pembayar</small>
          <strong>Ahmad Hidayat</strong>
        </div>
        <div class="total">
          <small>Total Tagihan</small>
          <strong>Rp140.000</strong>
        </div>
      </div>
    </aside>
    <main>
      <div class="midtrans">
        <div class="midtrans-logo"><span class="bars"><i></i><i></i><i></i></span> midtrans</div>
        <span class="badge">Sandbox Checkout Mock</span>
      </div>
      <h1>Pilih Metode Pembayaran</h1>
      <div class="methods">
        <div class="method active">
          <span class="icon">QR</span>
          <div><strong>QRIS</strong><span>Scan melalui aplikasi mobile banking atau e-wallet yang mendukung QRIS.</span></div>
        </div>
        <div class="method">
          <span class="icon">VA</span>
          <div><strong>Bank Transfer</strong><span>Virtual account tersedia jika metode ini diaktifkan pada akun Midtrans.</span></div>
        </div>
      </div>
      <div class="qr-panel">
        <div class="qr" aria-label="Contoh QRIS"></div>
        <div class="steps">
          <div><b>1.</b> Buka aplikasi bank atau e-wallet.</div>
          <div><b>2.</b> Pilih menu Scan QRIS.</div>
          <div><b>3.</b> Pastikan nominal dan merchant sesuai.</div>
          <div><b>4.</b> Konfirmasi pembayaran. Status di portal menunggu webhook Midtrans.</div>
        </div>
      </div>
      <div class="status">
        <p>Transaksi dianggap lunas hanya setelah backend menerima notifikasi settlement dari Midtrans.</p>
        <button>Bayar Sekarang</button>
      </div>
    </main>
  </section>
</body>
</html>`;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    locale: 'id-ID',
  });
  const page = await context.newPage();

  try {
    await loginAsWarga(page);
    await save(page, '01-dashboard-warga');

    await selectFirstPayableBill(page);
    await save(page, '02-pilih-tagihan');

    await page.getByRole('button', { name: /Bayar via QRIS/i }).click();
    await page.waitForTimeout(500);
    await save(page, '03-konfirmasi-pembayaran');

    const checkoutPage = await context.newPage();
    await checkoutPage.setContent(midtransCheckoutHtml(), { waitUntil: 'domcontentloaded' });
    await save(checkoutPage, '04-midtrans-checkout-qris');
    await checkoutPage.close();

    await page.getByRole('button', { name: /Lanjut ke Checkout Midtrans/i }).click();
    await page.waitForTimeout(1000);
    await save(page, '05-status-lunas');

    await browser.close();
  } catch (error) {
    console.error(error);
    await page.screenshot({ path: resolve(OUT, 'error-debug.png'), fullPage: true }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
})();
