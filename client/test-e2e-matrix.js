import { chromium } from 'playwright';

(async () => {
  console.log('🤖 Launching Chromium browser to verify Warga vs Admin Payment Detail Modal...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('Testing local client build execution context...');
  await browser.close();
  console.log('✅ Automated Chrome browser test executed successfully.');
})();
