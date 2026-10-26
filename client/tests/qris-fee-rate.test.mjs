import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🧪 Testing QRIS Fee Rate (0.75%) Data Service Contract & Calculations...');

// 1. Inspect dataService.js source code contracts
const dataServiceSrc = await readFile(path.join(rootDir, 'src', 'services', 'dataService.js'), 'utf8');

assert.ok(
  dataServiceSrc.includes('export const QRIS_FEE_RATE = 0.0075;'),
  'dataService.js must export QRIS_FEE_RATE set to 0.0075 (0.75%)'
);

assert.ok(
  !dataServiceSrc.includes('qris_fee_rate: 0.007'),
  'dataService.js must not retain old 0.007 rate in any return payload'
);

assert.ok(
  !dataServiceSrc.includes('Math.round(totalAmount / 1.007)'),
  'dataService.js must not retain old 1.007 in reverse baseAmount calculation'
);

assert.ok(
  !dataServiceSrc.includes('Math.ceil(base * 0.007)'),
  'dataService.js must not retain old 0.007 in Non-IPL fee calculation'
);

assert.ok(
  dataServiceSrc.includes('Math.round(totalAmount / (1 + QRIS_FEE_RATE))'),
  'dataService.js must calculate baseAmount using (1 + QRIS_FEE_RATE)'
);

assert.ok(
  dataServiceSrc.includes('Math.ceil(base * QRIS_FEE_RATE)'),
  'dataService.js must calculate Non-IPL fee using Math.ceil(base * QRIS_FEE_RATE)'
);

// 2. Mathematical unit checks for 0.75% rate
const RATE = 0.0075;

// Sample 1: Rp 100.000
const base1 = 100000;
const fee1 = Math.ceil(base1 * RATE);
const total1 = base1 + fee1;
assert.equal(fee1, 750, 'Fee for 100,000 must be 750 (0.75%)');
assert.equal(total1, 100750, 'Total for 100,000 must be 100,750');
assert.equal(Math.round(total1 / (1 + RATE)), base1, 'Reverse base calculation must recover 100,000');

// Sample 2: Rp 140.000 (Case reported by user: 140,000 with 0.75% fee = 1,050 -> Total: 141,050)
const base2 = 140000;
const fee2 = Math.ceil(base2 * RATE);
const total2 = base2 + fee2;
assert.equal(fee2, 1050, 'Fee for 140,000 must be 1,050 (0.75%), NOT 980 (0.7%)');
assert.equal(total2, 141050, 'Total for 140,000 must be 141,050, NOT 140,980');
assert.equal(Math.round(total2 / (1 + RATE)), base2, 'Reverse base calculation must recover 140,000');

// Sample 3: Rp 150.000 (typical standard IPL)
const base3 = 150000;
const fee3 = Math.ceil(base3 * RATE);
const total3 = base3 + fee3;
assert.equal(fee3, 1125, 'Fee for 150,000 must be 1,125 (0.75%)');
assert.equal(total3, 151125, 'Total for 150,000 must be 151,125');
assert.equal(Math.round(total3 / (1 + RATE)), base3, 'Reverse base calculation must recover 150,000');

// Sample 4: Ceiling behavior for non-integer multiplication
const base4 = 33333; // 33333 * 0.0075 = 249.9975 -> ceil to 250
const fee4 = Math.ceil(base4 * RATE);
assert.equal(fee4, 250, 'Fee for 33,333 must be rounded up to 250');

console.log('✅ All QRIS Fee Rate (0.75%) tests passed successfully!');
