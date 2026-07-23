import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const jsonHeaders = {
  entries: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ],
};

const runWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /portal-v1/monitoring/payment-smoke/run',
    position: [180, 120],
    parameters: {
      httpMethod: 'POST',
      path: 'portal-v1/monitoring/payment-smoke/run',
      authentication: 'none',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://portal-warga.vercel.app,http://localhost:5173,http://127.0.0.1:5173',
        ignoreBots: true,
      },
    },
  },
  output: [{ headers: { authorization: 'Bearer token' }, body: {} }],
});

const hourlySchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Hourly Schedule at Minute 5',
    position: [180, 720],
    parameters: {
      rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 5 }] },
    },
  },
  output: [{ timestamp: '2026-07-23T02:05:00.000Z' }],
});

const extractToken = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Extract Bearer Token',
    position: [460, 120],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const source = $input.first()?.json ?? {};
const headers = source.headers ?? {};
const now = new Date().toISOString();
const requestId = headers['x-request-id'] || headers['X-Request-Id'] || 'payment_smoke_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
const authHeader = headers.authorization || headers.Authorization || '';
const match = String(authHeader).match(/^Bearer\\s+(.+)$/i);
function failure(statusCode, code, message) {
  return { statusCode, response: { ok: false, data: null, error: { code, message, details: {} }, meta: { request_id: requestId, timestamp: now } } };
}
if (!match || !match[1]) {
  return [{ json: { tokenPresent: false, request_id: requestId, ...failure(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan login.') } }];
}
return [{ json: { tokenPresent: true, token: match[1].trim(), request_id: requestId, timestamp: now } }];`,
    },
  },
  output: [{ tokenPresent: true, token: 'jwt', request_id: 'payment_smoke_sample' }],
});

const tokenPresent = ifElse({
  version: 2.3,
  config: {
    name: 'Token Present?',
    position: [720, 120],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.tokenPresent }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ tokenPresent: true }],
});

const verifyJwt = node({
  type: 'n8n-nodes-base.jwt',
  version: 1,
  config: {
    name: 'Verify App JWT',
    position: [980, 40],
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'verify',
      token: expr('{{ $json.token }}'),
      options: { complete: false, ignoreExpiration: false, ignoreNotBefore: false, clockTolerance: 30, algorithm: 'HS256' },
    },
    credentials: { jwtAuth: newCredential('PV App JWT') },
  },
  output: [{ sub: '00000000-0000-4000-8000-000000000001', iss: 'portal-palm-village', aud: 'portal-palm-village-web' }],
});

const validateClaims = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate App Claims',
    position: [1240, 40],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const input = $input.first()?.json ?? {};
const payload = input.payload && typeof input.payload === 'object' ? input.payload : input;
const now = new Date().toISOString();
let requestId = null;
try { requestId = $items('Extract Bearer Token', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}
requestId = requestId || 'payment_smoke_' + Date.now();
const aud = payload.aud;
const audienceOk = Array.isArray(aud) ? aud.includes('portal-palm-village-web') : aud === 'portal-palm-village-web';
if (payload.iss !== 'portal-palm-village' || !audienceOk || !payload.sub) {
  return [{ json: { claimsValid: false, statusCode: 401, response: { ok: false, data: null, error: { code: 'INVALID_TOKEN', message: 'Sesi tidak valid. Silakan login ulang.', details: {} }, meta: { request_id: requestId, timestamp: now } } } }];
}
return [{ json: { claimsValid: true, request_id: requestId, sub: payload.sub } }];`,
    },
  },
  output: [{ claimsValid: true, request_id: 'payment_smoke_sample', sub: '00000000-0000-4000-8000-000000000001' }],
});

const claimsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Claims Valid?',
    position: [1500, 40],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.claimsValid }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
  },
  output: [{ claimsValid: true }],
});

const fetchActor = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Fetch Actor Profile',
    position: [1760, -40],
    alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'getAll', tableId: 'profiles', returnAll: false, limit: 1,
      filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.sub }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.com', role: 'admin', approval_status: 'approved', is_active: true }],
});

const authorizeAdmin = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Authorize Admin',
    position: [2020, -40],
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const profile = $input.first()?.json ?? {};
const now = new Date().toISOString();
let requestId = null;
try { requestId = $items('Validate App Claims', 0, 0)?.[0]?.json?.request_id || null; } catch (error) {}
function failure(statusCode, code, message) {
  return { authorized: false, statusCode, response: { ok: false, data: null, error: { code, message, details: {} }, meta: { request_id: requestId, timestamp: now } } };
}
if (!profile.id) return [{ json: failure(401, 'INVALID_TOKEN', 'Sesi tidak valid. Silakan login ulang.') }];
if (profile.is_active !== true || profile.approval_status !== 'approved') return [{ json: failure(403, 'FORBIDDEN', 'Akun tidak dapat mengakses fitur ini.') }];
if (profile.role !== 'admin') return [{ json: failure(403, 'FORBIDDEN_ROLE', 'Hanya Admin yang dapat menjalankan smoke test pembayaran.') }];
return [{ json: { authorized: true, request_id: requestId, actor: { id: profile.id, email: profile.email, role: profile.role } } }];`,
    },
  },
  output: [{ authorized: true, request_id: 'payment_smoke_sample', actor: { id: 'admin-id', email: 'admin@example.com', role: 'admin' } }],
});

const adminAuthorized = ifElse({
  version: 2.3,
  config: {
    name: 'Admin Authorized?', position: [2280, -40],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.authorized }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
  output: [{ authorized: true }],
});

const fetchManualSettings = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Manual Smoke Settings', position: [2540, -120], executeOnce: true, alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: { resource: 'row', operation: 'getAll', tableId: 'ipl_settings', returnAll: true, filterType: 'none' },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ key: 'monitoring.payment_smoke_config', value: { enabled: true, frequency: 'daily', run_hour: 9, timezone: 'Asia/Jakarta', notification_email: 'admin@example.com', notify_recovery: true } }],
});

const fetchScheduledSettings = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Fetch Scheduled Smoke Settings', position: [460, 720], executeOnce: true, alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: { resource: 'row', operation: 'getAll', tableId: 'ipl_settings', returnAll: true, filterType: 'none' },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ key: 'monitoring.payment_smoke_config', value: { enabled: true, frequency: 'daily', run_hour: 9, timezone: 'Asia/Jakarta', notification_email: 'admin@example.com', notify_recovery: true } }],
});

const prepareManual = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Prepare Manual Run', position: [2800, -120],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const rows = $input.all().map((item) => item.json || {});
const map = Object.fromEntries(rows.filter((row) => row.key).map((row) => [row.key, row.value]));
const config = map['monitoring.payment_smoke_config'];
const previous = map['monitoring.payment_smoke_status'] || { status: 'never' };
if (!config) return [{ json: { shouldRun: false, source: 'manual', statusCode: 500, response: { ok: false, data: null, error: { code: 'SMOKE_CONFIG_MISSING', message: 'Konfigurasi smoke test belum tersedia.', details: {} }, meta: { timestamp: new Date().toISOString() } } } }];
return [{ json: { shouldRun: true, source: 'manual', config, previous, started_at: new Date().toISOString() } }];` },
  },
  output: [{ shouldRun: true, source: 'manual', config: {}, previous: { status: 'never' }, started_at: '2026-07-23T00:00:00.000Z' }],
});

const prepareScheduled = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Prepare Scheduled Run', position: [720, 720],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const rows = $input.all().map((item) => item.json || {});
const map = Object.fromEntries(rows.filter((row) => row.key).map((row) => [row.key, row.value]));
const config = map['monitoring.payment_smoke_config'];
const previous = map['monitoring.payment_smoke_status'] || { status: 'never' };
if (!config || config.enabled !== true) return [{ json: { shouldRun: false, source: 'schedule', reason: 'disabled' } }];
const now = new Date();
const last = previous.finished_at ? new Date(previous.finished_at) : null;
const ageHours = last ? (now.getTime() - last.getTime()) / 3600000 : Infinity;
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone || 'Asia/Jakarta', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
const lastParts = last ? Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(last).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])) : {};
const today = parts.year + '-' + parts.month + '-' + parts.day;
const lastDay = lastParts.year ? lastParts.year + '-' + lastParts.month + '-' + lastParts.day : '';
const hour = Number(parts.hour);
let due = false;
if (config.frequency === 'every_6_hours') due = ageHours >= 6;
if (config.frequency === 'daily') due = hour >= Number(config.run_hour || 0) && today !== lastDay;
if (config.frequency === 'weekly') due = parts.weekday === 'Mon' && hour >= Number(config.run_hour || 0) && ageHours >= 144;
return [{ json: { shouldRun: due, source: 'schedule', config, previous, started_at: now.toISOString(), reason: due ? 'due' : 'not_due' } }];` },
  },
  output: [{ shouldRun: true, source: 'schedule', config: {}, previous: { status: 'never' }, started_at: '2026-07-23T00:00:00.000Z' }],
});

const scheduledDue = ifElse({
  version: 2.3,
  config: {
    name: 'Scheduled Run Due?', position: [980, 720],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.shouldRun }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
  output: [{ shouldRun: true }],
});

const manualConfigReady = ifElse({
  version: 2.3,
  config: {
    name: 'Manual Config Ready?', position: [3060, -120],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.shouldRun }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
  output: [{ shouldRun: true }],
});

const prepareFile = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Prepare Smoke File', position: [3320, 460],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const context = $input.first()?.json ?? {};
const stamp = new Date().toISOString();
const fileName = 'pv-payment-smoke-' + stamp.replace(/[:.]/g, '-') + '.txt';
const payload = JSON.stringify({ type: 'payment-smoke-test', created_at: stamp, source: context.source });
return [{ json: context, binary: { data: { data: Buffer.from(payload, 'utf8').toString('base64'), mimeType: 'text/plain', fileName } } }];` },
  },
  output: [{ source: 'manual', config: {}, previous: {}, started_at: '2026-07-23T00:00:00.000Z' }],
});

const uploadFile = node({
  type: 'n8n-nodes-base.googleDrive', version: 3,
  config: {
    name: 'Upload Smoke Proof', position: [3580, 460], onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1000,
    parameters: {
      resource: 'file', operation: 'upload', inputDataFieldName: 'data', name: expr('{{ $binary.data.fileName }}'),
      folderId: { __rl: true, mode: 'id', value: '1nmpwQ-zN5AKDmyIOFI48FSXvji_aSKC4' },
      options: { simplifyOutput: true },
    },
    credentials: { googleDriveOAuth2Api: newCredential('Palm Village Google Drive account') },
  },
  output: [{ id: 'drive-file-id', name: 'pv-payment-smoke.txt' }],
});

const uploadValid = ifElse({
  version: 2.3,
  config: {
    name: 'Smoke Upload Valid?', position: [3840, 460],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ !!$json.id }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
  output: [{ id: 'drive-file-id' }],
});

const shareFile = node({
  type: 'n8n-nodes-base.googleDrive', version: 3,
  config: {
    name: 'Share Smoke Proof', position: [4100, 360], onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1000,
    parameters: {
      resource: 'file', operation: 'share', fileId: { __rl: true, mode: 'id', value: expr('{{ $json.id }}') },
      permissionsUi: { permissionsValues: { role: 'reader', type: 'anyone', allowFileDiscovery: false } },
      options: { sendNotificationEmail: false },
    },
    credentials: { googleDriveOAuth2Api: newCredential('Palm Village Google Drive account') },
  },
  output: [{ id: 'permission-id', role: 'reader', type: 'anyone', allowFileDiscovery: false }],
});

const deleteFile = node({
  type: 'n8n-nodes-base.googleDrive', version: 3,
  config: {
    name: 'Delete Smoke Proof Permanently', position: [4360, 360], onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1000,
    parameters: {
      resource: 'file', operation: 'deleteFile',
      fileId: { __rl: true, mode: 'id', value: expr('{{ $("Upload Smoke Proof").item.json.id }}') },
      options: { deletePermanently: true },
    },
    credentials: { googleDriveOAuth2Api: newCredential('Palm Village Google Drive account') },
  },
  output: [{ id: 'drive-file-id', success: true }],
});

const buildDriveResult = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Drive Smoke Result', position: [4620, 360],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const cleanup = $input.first()?.json ?? {};
const context = $items('Prepare Smoke File', 0, 0)?.[0]?.json ?? {};
const upload = $items('Upload Smoke Proof', 0, 0)?.[0]?.json ?? {};
const share = $items('Share Smoke Proof', 0, 0)?.[0]?.json ?? {};
const shareOk = share.type === 'anyone' && share.role === 'reader' && share.allowFileDiscovery !== true;
const cleanupOk = !cleanup.error && cleanup.success !== false && !cleanup.errorMessage;
const checks = [
  { key: 'database', label: 'Database Supabase', status: 'pass', message: 'Konfigurasi monitoring berhasil dibaca.' },
  { key: 'drive_upload', label: 'Upload Google Drive', status: upload.id ? 'pass' : 'fail', message: upload.id ? 'File uji berhasil diunggah.' : 'File uji gagal diunggah.' },
  { key: 'drive_share', label: 'Izin bukti bayar', status: shareOk ? 'pass' : 'fail', message: shareOk ? 'Permission reader-by-link berhasil diterapkan.' : 'Permission reader-by-link gagal diterapkan.' },
  { key: 'drive_cleanup', label: 'Cleanup Google Drive', status: cleanupOk ? 'pass' : 'fail', message: cleanupOk ? 'File uji dihapus permanen.' : 'File uji gagal dihapus permanen.' },
];
const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
return [{ json: { ...context, status, checks, file_id: upload.id || null, finished_at: new Date().toISOString() } }];` },
  },
  output: [{ source: 'manual', status: 'pass', checks: [], finished_at: '2026-07-23T00:00:01.000Z' }],
});

const buildUploadFailure = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Upload Failure Result', position: [4100, 580],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const context = $items('Prepare Smoke File', 0, 0)?.[0]?.json ?? {};
return [{ json: { ...context, status: 'fail', file_id: null, finished_at: new Date().toISOString(), checks: [
  { key: 'database', label: 'Database Supabase', status: 'pass', message: 'Konfigurasi monitoring berhasil dibaca.' },
  { key: 'drive_upload', label: 'Upload Google Drive', status: 'fail', message: 'File uji gagal diunggah setelah 3 percobaan.' },
  { key: 'drive_share', label: 'Izin bukti bayar', status: 'fail', message: 'Tidak diuji karena upload gagal.' },
  { key: 'drive_cleanup', label: 'Cleanup Google Drive', status: 'pass', message: 'Tidak ada file yang perlu dibersihkan.' },
] } }];` },
  },
  output: [{ source: 'manual', status: 'fail', checks: [], finished_at: '2026-07-23T00:00:01.000Z' }],
});

const prepareStatus = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Prepare Status Update', position: [4880, 460],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const result = $input.first()?.json ?? {};
const duration = Math.max(0, new Date(result.finished_at).getTime() - new Date(result.started_at).getTime());
const value = { status: result.status, source: result.source, started_at: result.started_at, finished_at: result.finished_at, duration_ms: duration, checks: result.checks, file_id: result.file_id || null, notification_sent: false };
return [{ json: { ...result, duration_ms: duration, status_value: value } }];` },
  },
  output: [{ status: 'pass', status_value: { status: 'pass' } }],
});

const updateStatus = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Persist Smoke Status', position: [5140, 460], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'update', tableId: 'ipl_settings', filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: 'monitoring.payment_smoke_status' }] },
      dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'value', fieldValue: expr('{{ $json.status_value }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ key: 'monitoring.payment_smoke_status', value: { status: 'pass' } }],
});

const finalizeResult = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Finalize Smoke Result', position: [5400, 460],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const persisted = $input.first()?.json ?? {};
const prepared = $items('Prepare Status Update', 0, 0)?.[0]?.json ?? {};
const dbWriteOk = persisted.key === 'monitoring.payment_smoke_status' || persisted.value?.status === prepared.status;
const checks = (prepared.checks || []).map((check) => check.key === 'database' && !dbWriteOk ? { ...check, status: 'fail', message: 'Konfigurasi dapat dibaca, tetapi status hasil gagal disimpan.' } : check);
const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
const previousStatus = prepared.previous?.status || 'never';
const previousNotificationAt = prepared.previous?.notification_at ? new Date(prepared.previous.notification_at) : null;
const alertAgeHours = previousNotificationAt ? (Date.now() - previousNotificationAt.getTime()) / 3600000 : Infinity;
const notifyFailure = status === 'fail' && (previousStatus !== 'fail' || alertAgeHours >= 24);
const notifyRecovery = status === 'pass' && previousStatus === 'fail' && prepared.config?.notify_recovery !== false;
const shouldNotify = notifyFailure || notifyRecovery;
const notificationType = notifyRecovery ? 'recovery' : notifyFailure ? 'failure' : null;
const failed = checks.filter((check) => check.status === 'fail');
const testPrefix = prepared.source === 'test' ? '[TEST] ' : '';
const subject = testPrefix + (notificationType === 'recovery' ? '[PULIH] Smoke Test Pembayaran Palm Village' : '[ALERT] Smoke Test Pembayaran Palm Village Gagal');
const rows = checks.map((check) => '<tr><td style="padding:6px;border-bottom:1px solid #ddd">' + check.label + '</td><td style="padding:6px;border-bottom:1px solid #ddd"><b>' + check.status.toUpperCase() + '</b></td><td style="padding:6px;border-bottom:1px solid #ddd">' + check.message + '</td></tr>').join('');
const emailHtml = '<h2>' + (notificationType === 'recovery' ? 'Layanan pembayaran kembali normal' : 'Smoke test pembayaran gagal') + '</h2><p>Waktu: ' + prepared.finished_at + '</p><table style="border-collapse:collapse;width:100%"><tr><th align="left">Pemeriksaan</th><th align="left">Status</th><th align="left">Detail</th></tr>' + rows + '</table><p>Portal Warga Palm Village</p>';
const result = { status, source: prepared.source, started_at: prepared.started_at, finished_at: prepared.finished_at, duration_ms: prepared.duration_ms, checks, file_id: prepared.file_id || null, notification_sent: false, notification_type: notificationType, notification_email: prepared.config?.notification_email || '', failed_count: failed.length };
return [{ json: { ...result, shouldNotify, subject, email_html: emailHtml, status_value: result } }];` },
  },
  output: [{ status: 'pass', shouldNotify: false, subject: '', email_html: '', notification_email: 'admin@example.com', status_value: {} }],
});

const shouldNotify = ifElse({
  version: 2.3,
  config: {
    name: 'Notification Required?', position: [5660, 460],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.shouldNotify }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }], combinator: 'and' } },
  },
  output: [{ shouldNotify: true }],
});

const sendEmail = node({
  type: 'n8n-nodes-base.gmail', version: 2.2,
  config: {
    name: 'Send Smoke Alert Gmail', position: [5920, 360], onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 1000,
    parameters: {
      resource: 'message',
      operation: 'send',
      authentication: 'oAuth2',
      sendTo: expr('{{ $json.notification_email }}'),
      subject: expr('{{ $json.subject }}'),
      emailType: 'html',
      message: expr('{{ $json.email_html }}'),
      options: { appendAttribution: false, senderName: 'Portal Warga Palm Village' },
    },
    credentials: { gmailOAuth2: newCredential('Gmail account PalmVillage.Paguyuban') },
  },
  output: [{ id: 'gmail-message-id', threadId: 'gmail-thread-id' }],
});

const recordNotification = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Record Notification Outcome', position: [6180, 360],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const email = $input.first()?.json ?? {};
const result = $items('Finalize Smoke Result', 0, 0)?.[0]?.json ?? {};
const sent = !!(email.id || email.messageId || (Array.isArray(email.accepted) && email.accepted.length));
const notificationError = sent ? null : String(email.message || email.error || 'EMAIL_SEND_FAILED');
const checks = result.shouldNotify
  ? [...(result.checks || []).filter((check) => check.key !== 'notification'), { key: 'notification', label: 'Email Notifikasi', status: sent ? 'pass' : 'fail', message: sent ? 'Email notifikasi berhasil dikirim.' : notificationError }]
  : result.checks || [];
const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
const value = { ...result.status_value, status, checks, notification_sent: sent, notification_type: result.notification_type, notification_at: sent ? new Date().toISOString() : null, notification_error: notificationError };
return [{ json: { ...result, status, checks, notification_sent: sent, notification_error: notificationError, status_value: value } }];` },
  },
  output: [{ status: 'fail', notification_sent: true, status_value: {} }],
});

const persistNotification = node({
  type: 'n8n-nodes-base.supabase', version: 1,
  config: {
    name: 'Persist Notification Outcome', position: [6440, 360], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: {
      resource: 'row', operation: 'update', tableId: 'ipl_settings', filterType: 'manual', matchType: 'allFilters',
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: 'monitoring.payment_smoke_status' }] },
      dataToSend: 'defineBelow', fieldsUi: { fieldValues: [{ fieldId: 'value', fieldValue: expr('{{ $json.status_value }}') }] },
    },
    credentials: { supabaseApi: newCredential('PV Supabase Service Role') },
  },
  output: [{ key: 'monitoring.payment_smoke_status' }],
});

const restoreNotifiedResult = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Restore Notified Result', position: [6700, 360],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const result = $items('Record Notification Outcome', 0, 0)?.[0]?.json ?? {};
return [{ json: result }];` },
  },
  output: [{ status: 'fail', source: 'manual', notification_sent: true }],
});

const manualResult = ifElse({
  version: 2.3,
  config: {
    name: 'Manual Result?', position: [6960, 460],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.source }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'manual' }], combinator: 'and' } },
  },
  output: [{ source: 'manual' }],
});

const respondResult = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {
    name: 'Respond Smoke Result', position: [7220, 400],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { ok: true, data: { status: $json.status, source: $json.source, started_at: $json.started_at, finished_at: $json.finished_at, duration_ms: $json.duration_ms, checks: $json.checks, notification_sent: $json.notification_sent, notification_error: $json.notification_error || null }, error: null, meta: { timestamp: $now.toISO() } } }}'),
      options: { responseCode: 200, responseHeaders: jsonHeaders },
    },
  },
  output: [{ ok: true }],
});

const endScheduled = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'End Scheduled Run', position: [7220, 560],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `return $input.all();` },
  },
  output: [{ status: 'pass', source: 'schedule' }],
});

const respondAuthError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Auth Error', position: [980, 200], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } },
  output: [{ ok: false }],
});

const respondClaimError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Claim Error', position: [1760, 120], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } },
  output: [{ ok: false }],
});

const respondForbidden = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Forbidden', position: [2540, 40], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } },
  output: [{ ok: false }],
});

const respondConfigError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond Config Error', position: [3320, 40], parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: expr('{{ $json.statusCode }}'), responseHeaders: jsonHeaders } } },
  output: [{ ok: false }],
});

export default workflow('pv-monitoring-payment-smoke', 'PV Monitoring - Payment Smoke Test')
  .add(runWebhook)
  .to(extractToken)
  .to(tokenPresent.onTrue(verifyJwt.to(validateClaims).to(claimsValid.onTrue(fetchActor.to(authorizeAdmin).to(adminAuthorized.onTrue(fetchManualSettings.to(prepareManual).to(manualConfigReady.onTrue(prepareFile).onFalse(respondConfigError))).onFalse(respondForbidden))).onFalse(respondClaimError))).onFalse(respondAuthError))
  .add(hourlySchedule)
  .to(fetchScheduledSettings)
  .to(prepareScheduled)
  .to(scheduledDue.onTrue(prepareFile))
  .add(prepareFile)
  .to(uploadFile)
  .to(uploadValid.onTrue(shareFile.to(deleteFile).to(buildDriveResult).to(prepareStatus)).onFalse(buildUploadFailure.to(prepareStatus)))
  .add(prepareStatus)
  .to(updateStatus)
  .to(finalizeResult)
  .to(shouldNotify.onTrue(sendEmail.to(recordNotification).to(persistNotification).to(restoreNotifiedResult).to(manualResult.onTrue(respondResult).onFalse(endScheduled))).onFalse(manualResult.onTrue(respondResult).onFalse(endScheduled)));
