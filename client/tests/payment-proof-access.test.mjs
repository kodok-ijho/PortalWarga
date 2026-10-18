import assert from 'node:assert/strict';

// 1. Google Drive ID extraction tests
function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch?.[1]) return fileMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch?.[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) return trimmed;
  return null;
}

function getPaymentProofDirectUrl(payment) {
  let sourceUrl =
    (typeof payment === 'string' ? payment : null) ||
    payment?.proof_file_url ||
    payment?.receipt_file_url ||
    payment?.proof_url ||
    payment?.file_url ||
    payment?.proof_file_path ||
    payment?.receipt_file ||
    payment?.metadata?.proof_file_url ||
    payment?.metadata?.drive_url ||
    payment?.metadata?.file_url;

  const driveId =
    payment?.proof_file_id ||
    payment?.metadata?.proof_file_id ||
    extractGoogleDriveFileId(sourceUrl);

  if (driveId) {
    return `https://drive.google.com/file/d/${driveId}/view`;
  }

  if (!sourceUrl) return '';
  sourceUrl = String(sourceUrl).trim();

  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return sourceUrl;
  }

  const cleanPath = sourceUrl.replace(/^payments\//, '');
  const supabaseUrl = 'https://mzjgliclzihrdjaqzmqg.supabase.co';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/payments/${encodeURIComponent(cleanPath)}`;
}

function getPaymentProofPreviewUrl(payment) {
  let sourceUrl =
    (typeof payment === 'string' ? payment : null) ||
    payment?.proof_file_url ||
    payment?.receipt_file_url ||
    payment?.proof_url ||
    payment?.file_url ||
    payment?.proof_file_path ||
    payment?.receipt_file ||
    payment?.metadata?.proof_file_url ||
    payment?.metadata?.drive_url ||
    payment?.metadata?.file_url;

  const driveId =
    payment?.proof_file_id ||
    payment?.metadata?.proof_file_id ||
    extractGoogleDriveFileId(sourceUrl);

  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w1200`;
  }

  if (!sourceUrl) return null;
  sourceUrl = String(sourceUrl).trim();

  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return sourceUrl;
  }

  const cleanPath = sourceUrl.replace(/^payments\//, '');
  const supabaseUrl = 'https://mzjgliclzihrdjaqzmqg.supabase.co';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/payments/${encodeURIComponent(cleanPath)}`;
}

console.log('🧪 Running Payment Proof & Access Authorization Tests...');

// Test 1: Google Drive URL with query params
const driveUrl1 = 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0JkLmNoPqRsTuVw/view?usp=sharing';
assert.equal(extractGoogleDriveFileId(driveUrl1), '1A2B3C4D5E6F7G8H9I0JkLmNoPqRsTuVw');
assert.equal(
  getPaymentProofDirectUrl({ proof_file_url: driveUrl1 }),
  'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0JkLmNoPqRsTuVw/view'
);
assert.equal(
  getPaymentProofPreviewUrl({ proof_file_url: driveUrl1 }),
  'https://lh3.googleusercontent.com/d/1A2B3C4D5E6F7G8H9I0JkLmNoPqRsTuVw=w1200'
);
console.log('  ✔ Google Drive file/d/ link extraction and preview/direct URL PASSED');

// Test 2: Google Drive open?id= link
const driveUrl2 = 'https://drive.google.com/open?id=1234567890abcdefghijklmnopqrstuvw';
assert.equal(extractGoogleDriveFileId(driveUrl2), '1234567890abcdefghijklmnopqrstuvw');
console.log('  ✔ Google Drive open?id= link extraction PASSED');

// Test 3: Payment record with proof_file_id only
const paymentWithIdOnly = { proof_file_id: '1xyz_ABC-1234567890abcdefghijkl' };
assert.equal(
  getPaymentProofDirectUrl(paymentWithIdOnly),
  'https://drive.google.com/file/d/1xyz_ABC-1234567890abcdefghijkl/view'
);
assert.equal(
  getPaymentProofPreviewUrl(paymentWithIdOnly),
  'https://lh3.googleusercontent.com/d/1xyz_ABC-1234567890abcdefghijkl=w1200'
);
console.log('  ✔ Payment with proof_file_id only PASSED');

// Test 4: Authorization Logic for CB4 no 12
function checkAccess({ role, profile, myUnitId, targetUnit, bill, payment }) {
  const isStaffRole = ['pengurus', 'bendahara', 'admin', 'admin_viewer'].includes(String(role).toLowerCase());
  const resolvedUnitId = targetUnit?.id ?? bill?.unit_id ?? payment?.unit_id;

  const isMyUnit = Boolean(
    (myUnitId && resolvedUnitId && String(resolvedUnitId) === String(myUnitId)) ||
    (profile?.unit_id && resolvedUnitId && String(resolvedUnitId) === String(profile.unit_id)) ||
    (profile?.unitId && resolvedUnitId && String(resolvedUnitId) === String(profile.unitId)) ||
    (profile?.unit?.id && resolvedUnitId && String(resolvedUnitId) === String(profile.unit.id)) ||
    (targetUnit?.block && targetUnit?.unit_number && (
      (profile?.unit?.block && profile?.unit?.unit_number &&
        String(profile.unit.block).trim().toLowerCase() === String(targetUnit.block).trim().toLowerCase() &&
        String(profile.unit.unit_number).trim() === String(targetUnit.unit_number).trim()) ||
      (profile?.block && profile?.unit_number &&
        String(profile.block).trim().toLowerCase() === String(targetUnit.block).trim().toLowerCase() &&
        String(profile.unit_number).trim() === String(targetUnit.unit_number).trim())
    )) ||
    (profile?.id && targetUnit?.owner_id && String(targetUnit.owner_id) === String(profile.id)) ||
    (profile?.id && targetUnit?.occupant_id && String(targetUnit.occupant_id) === String(profile.id)) ||
    (profile?.id && targetUnit?._occupant?.id && String(targetUnit._occupant.id) === String(profile.id)) ||
    (profile?.email && targetUnit?._occupant?.email && String(profile.email).trim().toLowerCase() === String(targetUnit._occupant.email).trim().toLowerCase()) ||
    (profile?.email && targetUnit?.resident?.email && String(profile.email).trim().toLowerCase() === String(targetUnit.resident.email).trim().toLowerCase()) ||
    (profile?.id && bill?.resident_id && String(bill.resident_id) === String(profile.id)) ||
    (profile?.id && payment?.resident_id && String(payment.resident_id) === String(profile.id))
  );

  const canViewReceipt = isStaffRole || isMyUnit;
  return { canViewReceipt, isMyUnit, isStaffRole };
}

const targetCB4_12 = {
  id: 42,
  block: 'CB4',
  unit_number: '12',
  occupant_id: 'user_cb4_12',
  _occupant: { id: 'user_cb4_12', email: 'cb4_12@warga.id' }
};

// Case A: Pengurus viewing CB4 no 12
const pengurusAccess = checkAccess({
  role: 'pengurus',
  profile: { id: 'pengurus_1', role: 'pengurus' },
  myUnitId: null,
  targetUnit: targetCB4_12,
  bill: { id: 101, unit_id: 42 },
  payment: { id: 201, unit_id: 42 }
});
assert.equal(pengurusAccess.canViewReceipt, true, 'Pengurus must be able to view proof');
console.log('  ✔ Pengurus can view payment proof PASSED');

// Case B: Bendahara viewing CB4 no 12
const bendaharaAccess = checkAccess({
  role: 'bendahara',
  profile: { id: 'bendahara_1', role: 'bendahara' },
  myUnitId: null,
  targetUnit: targetCB4_12,
  bill: { id: 101, unit_id: 42 },
  payment: { id: 201, unit_id: 42 }
});
assert.equal(bendaharaAccess.canViewReceipt, true, 'Bendahara must be able to view proof');
console.log('  ✔ Bendahara can view payment proof PASSED');

// Case C: Admin viewing CB4 no 12
const adminAccess = checkAccess({
  role: 'admin',
  profile: { id: 'admin_1', role: 'admin' },
  myUnitId: null,
  targetUnit: targetCB4_12,
  bill: { id: 101, unit_id: 42 },
  payment: { id: 201, unit_id: 42 }
});
assert.equal(adminAccess.canViewReceipt, true, 'Admin must be able to view proof');
console.log('  ✔ Admin can view payment proof PASSED');

// Case D: Resident of CB4 no 12 viewing their own unit
const residentOwnAccess = checkAccess({
  role: 'warga',
  profile: { id: 'user_cb4_12', block: 'CB4', unit_number: '12', email: 'cb4_12@warga.id' },
  myUnitId: 42,
  targetUnit: targetCB4_12,
  bill: { id: 101, unit_id: 42 },
  payment: { id: 201, unit_id: 42 }
});
assert.equal(residentOwnAccess.canViewReceipt, true, 'CB4 no 12 occupant must be able to view proof');
console.log('  ✔ Resident of CB4 no 12 can view their own payment proof PASSED');

// Case E: Resident of another unit (e.g. CA1 no 5) viewing CB4 no 12
const otherResidentAccess = checkAccess({
  role: 'warga',
  profile: { id: 'user_ca1_5', block: 'CA1', unit_number: '5', email: 'ca1_5@warga.id' },
  myUnitId: 10,
  targetUnit: targetCB4_12,
  bill: { id: 101, unit_id: 42 },
  payment: { id: 201, unit_id: 42 }
});
assert.equal(otherResidentAccess.canViewReceipt, false, 'Other resident MUST NOT be able to view proof');
console.log('  ✔ Other resident viewing CB4 no 12 is DENIED authorization PASSED');

console.log('🎉 All Payment Proof & Access Authorization Tests PASSED successfully!');
