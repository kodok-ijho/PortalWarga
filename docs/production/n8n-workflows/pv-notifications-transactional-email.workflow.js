// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ⚠️  DEPRECATED v1 — DO NOT activate this workflow alongside v2!         │
// │                                                                          │
// │ This file is kept ONLY as a rollback reference.                          │
// │ Production dispatcher: pv-notifications-transactional-email-v2           │
// │                                                                          │
// │ v1 lacks atomic locking (FOR UPDATE SKIP LOCKED / lease tokens).         │
// │ Running both v1 and v2 simultaneously WILL cause:                        │
// │   • Duplicate email sends (v1 steals pending items without leases)       │
// │   • Outbox state corruption (v1 updates conflict with v2 outcomes)       │
// │                                                                          │
// │ If you must rollback to v1, FIRST disable all v2 notification workflows. │
// └──────────────────────────────────────────────────────────────────────────┘
import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const everyMinute = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every Minute',
    position: [180, 260],
    parameters: {
      rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] },
    },
  },
  output: [{ timestamp: '2026-08-05T00:00:00.000Z' }],
});

const recoverStaleClaims = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Recover Stale Email Claims',
    position: [460, 260],
    executeOnce: true,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'row',
      operation: 'update',
      tableId: 'email_notification_outbox',
      filterType: 'manual',
      matchType: 'allFilters',
      filters: {
        conditions: [
          { keyName: 'status', condition: 'eq', keyValue: 'processing' },
          { keyName: 'claimed_at', condition: 'lt', keyValue: expr('{{ $now.minus({ minutes: 15 }).toISO() }}') },
        ],
      },
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'status', fieldValue: 'pending' },
          { fieldId: 'available_at', fieldValue: expr('{{ $now.toISO() }}') },
          { fieldId: 'last_error', fieldValue: 'Recovered after an interrupted dispatcher execution.' },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', status: 'pending' }],
});

const fetchPending = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Pending Transactional Emails',
    position: [740, 260],
    executeOnce: true,
    alwaysOutputData: false,
    parameters: {
      resource: 'row',
      operation: 'getAll',
      tableId: 'email_notification_outbox',
      returnAll: false,
      limit: 50,
      filterType: 'manual',
      matchType: 'allFilters',
      filters: {
        conditions: [
          { keyName: 'status', condition: 'eq', keyValue: 'pending' },
          { keyName: 'available_at', condition: 'lte', keyValue: expr('{{ $now.toISO() }}') },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{
    id: '00000000-0000-4000-8000-000000000001',
    event_type: 'profile.registered.admin',
    recipient_email: 'admin@example.com',
    recipient_name: 'Admin',
    payload: { full_name: 'Warga Baru', email: 'warga@example.com' },
    attempts: 0,
  }],
});

const claimEmail = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Claim Transactional Email',
    position: [1020, 260],
    parameters: {
      resource: 'row',
      operation: 'update',
      tableId: 'email_notification_outbox',
      filterType: 'manual',
      matchType: 'allFilters',
      filters: {
        conditions: [
          { keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.id }}') },
          { keyName: 'status', condition: 'eq', keyValue: 'pending' },
        ],
      },
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'status', fieldValue: 'processing' },
          { fieldId: 'claimed_at', fieldValue: expr('{{ $now.toISO() }}') },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', status: 'processing', event_type: 'profile.registered.admin' }],
});

const prepareEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Transactional Email',
    position: [1300, 260],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const portalUrl = 'https://portal-warga.vercel.app';
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? esc(value) : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(date) + ' WIB';
};
const statusLabel = (value) => ({ pending_approval: 'Menunggu verifikasi', approved: 'Disetujui', rejected: 'Ditolak', suspended: 'Ditangguhkan', pending: 'Menunggu proses', pending_verification: 'Menunggu verifikasi', completed: 'Terverifikasi' }[value] || value || '-');
const methodLabel = (value) => ({ bank_transfer: 'Transfer bank', cash: 'Tunai', qris: 'QRIS', other: 'Lainnya' }[value] || value || '-');
const row = (label, value) => '<tr><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#4b5563">' + esc(label) + '</td><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">' + esc(value) + '</td></tr>';
const layout = (title, intro, rows, note = '') => '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173b2c"><div style="background:#174c3c;color:white;padding:18px 22px"><h2 style="margin:0">' + esc(title) + '</h2></div><div style="padding:22px;border:1px solid #d1d5db;border-top:0"><p>' + esc(intro) + '</p><table style="border-collapse:collapse;width:100%;margin:18px 0">' + rows + '</table>' + (note ? '<p style="color:#4b5563">' + esc(note) + '</p>' : '') + '<p><a href="' + portalUrl + '" style="display:inline-block;background:#b98a3d;color:white;text-decoration:none;padding:10px 16px;border-radius:6px">Buka Portal Warga</a></p><p style="font-size:12px;color:#6b7280">Email otomatis dari Portal Warga Palm Village. Mohon tidak membalas email ini.</p></div></div>';

return $input.all().map((item) => {
  const outbox = item.json || {};
  const p = typeof outbox.payload === 'string' ? JSON.parse(outbox.payload || '{}') : (outbox.payload || {});
  let subject = '[Portal Warga] Notifikasi';
  let title = 'Notifikasi Portal Warga';
  let intro = 'Terdapat aktivitas baru di Portal Warga Palm Village.';
  let rows = '';
  let note = '';

  switch (outbox.event_type) {
    case 'profile.registered.user':
      subject = '[Portal Warga] Pendaftaran akun diterima'; title = 'Pendaftaran akun diterima';
      intro = 'Halo ' + (p.full_name || 'Warga') + ', pendaftaran akun Anda sudah kami terima.';
      rows = row('Email', p.email) + row('Status', statusLabel(p.approval_status)) + row('Waktu pendaftaran', dateTime(p.created_at));
      note = 'Admin akan memeriksa data Anda. Anda akan menerima email berikutnya setelah proses verifikasi selesai.';
      break;
    case 'profile.registered.admin':
      subject = '[Portal Warga] Pendaftaran pengguna baru'; title = 'Pengguna baru menunggu verifikasi';
      intro = 'Ada pendaftaran pengguna baru yang perlu diperiksa oleh Admin.';
      rows = row('Nama', p.full_name) + row('Email', p.email) + row('Role awal', p.role) + row('Waktu', dateTime(p.created_at));
      note = 'Buka menu Persetujuan User untuk memeriksa dan menyetujui atau menolak pendaftaran.';
      break;
    case 'profile.verification.user':
      subject = '[Portal Warga] Status akun: ' + statusLabel(p.approval_status); title = 'Hasil verifikasi akun';
      intro = 'Status akun Portal Warga Anda telah diperbarui.';
      rows = row('Nama', p.full_name) + row('Email', p.email) + row('Status', statusLabel(p.approval_status)) + row('Catatan', p.approval_note || '-');
      note = p.approval_status === 'approved' ? 'Akun Anda sudah dapat digunakan sesuai role yang diberikan.' : 'Hubungi pengurus Palm Village jika Anda memerlukan penjelasan lebih lanjut.';
      break;
    case 'profile.verification.actor':
      subject = '[Portal Warga] Verifikasi pengguna selesai'; title = 'Verifikasi pengguna berhasil dicatat';
      intro = 'Tindakan verifikasi pengguna Anda sudah tersimpan.';
      rows = row('Pengguna', p.full_name) + row('Email', p.email) + row('Status', statusLabel(p.approval_status)) + row('Catatan', p.approval_note || '-');
      break;
    case 'profile.verification.admin':
      subject = '[Portal Warga] Status verifikasi pengguna diperbarui'; title = 'Status pengguna diperbarui';
      intro = 'Status verifikasi pengguna berikut baru saja berubah.';
      rows = row('Pengguna', p.full_name) + row('Email', p.email) + row('Status', statusLabel(p.approval_status)) + row('Catatan', p.approval_note || '-');
      break;
    case 'payment.recorded.resident':
      subject = '[Portal Warga] Pembayaran IPL berhasil dicatat'; title = 'Pencatatan pembayaran IPL';
      intro = 'Pembayaran IPL Anda sudah tercatat di Portal Warga.';
      rows = row('Periode', p.period) + row('Unit', p.unit_label) + row('Jumlah', money(p.amount)) + row('Metode', methodLabel(p.method)) + row('Status', statusLabel(p.status)) + row('Tanggal bayar', dateTime(p.paid_at));
      note = p.status === 'pending_verification' ? 'Bukti pembayaran sedang menunggu verifikasi Admin atau Bendahara.' : '';
      break;
    case 'payment.recorded.staff':
      subject = '[Portal Warga] Pembayaran IPL baru dicatat'; title = 'Pembayaran IPL baru';
      intro = 'Ada pembayaran IPL baru yang tercatat dan mungkin memerlukan verifikasi.';
      rows = row('Warga', p.resident_name || p.resident_email) + row('Unit', p.unit_label) + row('Periode', p.period) + row('Jumlah', money(p.amount)) + row('Metode', methodLabel(p.method)) + row('Status', statusLabel(p.status)) + row('Waktu', dateTime(p.created_at));
      break;
    case 'payment.verification.resident':
      subject = '[Portal Warga] Pembayaran IPL ' + statusLabel(p.status); title = 'Hasil verifikasi pembayaran IPL';
      intro = 'Status verifikasi pembayaran IPL Anda telah diperbarui.';
      rows = row('Periode', p.period) + row('Unit', p.unit_label) + row('Jumlah', money(p.amount)) + row('Status', statusLabel(p.status)) + row('Catatan', p.verification_note || '-') + row('Waktu verifikasi', dateTime(p.verified_at));
      note = p.status === 'rejected' ? 'Silakan periksa catatan verifikasi dan kirim ulang bukti pembayaran yang sesuai.' : 'Terima kasih, pembayaran Anda sudah terverifikasi.';
      break;
    case 'payment.verification.actor':
      subject = '[Portal Warga] Verifikasi pembayaran selesai'; title = 'Verifikasi pembayaran berhasil dicatat';
      intro = 'Tindakan verifikasi pembayaran IPL Anda sudah tersimpan.';
      rows = row('Warga', p.resident_name) + row('Periode', p.period) + row('Jumlah', money(p.amount)) + row('Status', statusLabel(p.status)) + row('Catatan', p.verification_note || '-');
      break;
    case 'payment.verification.staff':
      subject = '[Portal Warga] Status pembayaran IPL diperbarui'; title = 'Status pembayaran diperbarui';
      intro = 'Status verifikasi pembayaran IPL berikut baru saja berubah.';
      rows = row('Warga', p.resident_name) + row('Periode', p.period) + row('Jumlah', money(p.amount)) + row('Status', statusLabel(p.status)) + row('Catatan', p.verification_note || '-');
      break;
    default:
      rows = row('Jenis aktivitas', outbox.event_type) + row('Waktu', dateTime(outbox.created_at));
  }

  return { json: { ...outbox, subject, email_html: layout(title, intro, rows, note) } };
});`,
    },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', recipient_email: 'admin@example.com', subject: '[Portal Warga] Pendaftaran pengguna baru', email_html: '<html></html>' }],
});

const sendEmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Send Transactional Gmail',
    position: [1580, 260],
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    parameters: {
      resource: 'message',
      operation: 'send',
      authentication: 'oAuth2',
      sendTo: expr('{{ $json.recipient_email }}'),
      subject: expr('{{ $json.subject }}'),
      emailType: 'html',
      message: expr('{{ $json.email_html }}'),
      options: { appendAttribution: false, senderName: 'Portal Warga Palm Village' },
    },
    credentials: { gmailOAuth2: newCredential('Gmail account PalmVillage.Paguyuban') },
  },
  output: [{ id: 'gmail-message-id', threadId: 'gmail-thread-id' }],
});

const recordOutcome = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Record Transactional Email Outcome',
    position: [1860, 260],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const prepared = $items('Prepare Transactional Email', 0, 0) || [];
return $input.all().map((item, index) => {
  const mail = item.json || {};
  const source = prepared[index]?.json || {};
  const sent = Boolean(mail.id || mail.messageId || (Array.isArray(mail.accepted) && mail.accepted.length));
  const attempts = Number(source.attempts || 0) + 1;
  const terminalFailure = !sent && attempts >= 5;
  const delayMinutes = Math.min(60, Math.pow(2, attempts));
  const error = sent ? null : String(mail.error?.message || mail.message || mail.error || 'EMAIL_SEND_FAILED').slice(0, 1000);
  return { json: {
    outbox_id: source.id,
    status: sent ? 'sent' : terminalFailure ? 'failed' : 'pending',
    attempts,
    sent_at: sent ? new Date().toISOString() : null,
    available_at: sent ? new Date().toISOString() : new Date(Date.now() + delayMinutes * 60000).toISOString(),
    last_error: error,
  } };
});`,
    },
  },
  output: [{ outbox_id: '00000000-0000-4000-8000-000000000001', status: 'sent', attempts: 1, sent_at: '2026-08-05T00:00:00.000Z', last_error: null }],
});

const persistOutcome = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Persist Transactional Email Outcome',
    position: [2140, 260],
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'row',
      operation: 'update',
      tableId: 'email_notification_outbox',
      filterType: 'manual',
      matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.outbox_id }}') }] },
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'status', fieldValue: expr('{{ $json.status }}') },
          { fieldId: 'attempts', fieldValue: expr('{{ $json.attempts }}') },
          { fieldId: 'sent_at', fieldValue: expr('{{ $json.sent_at }}') },
          { fieldId: 'available_at', fieldValue: expr('{{ $json.available_at }}') },
          { fieldId: 'last_error', fieldValue: expr('{{ $json.last_error }}') },
        ],
      },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', status: 'sent' }],
});

export default workflow('pv-notifications-transactional-email', 'PV Notifications - Transactional Email')
  .add(everyMinute)
  .to(recoverStaleClaims)
  .to(fetchPending)
  .to(claimEmail)
  .to(prepareEmail)
  .to(sendEmail)
  .to(recordOutcome)
  .to(persistOutcome);
