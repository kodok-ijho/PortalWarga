const API_BASE_URL = (import.meta.env.VITE_N8N_API_BASE_URL || '').replace(/\/+$/, '');

export class PortalApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PortalApiError';
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

let unauthorizedHandler = null;

export function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function triggerUnauthorized() {
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

export async function portalApiPost(path, { token, body } = {}) {
  if (!API_BASE_URL) {
    throw new PortalApiError('Konfigurasi API n8n belum tersedia.', {
      code: 'API_BASE_URL_MISSING',
    });
  }

  const response = await fetch(`${API_BASE_URL}${normalizePath(path)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  if (response.status === 401) {
    triggerUnauthorized();
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    throw new PortalApiError('Respons API tidak valid.', {
      code: 'INVALID_API_RESPONSE',
      status: response.status,
    });
  }

  if (!response.ok || payload.ok === false) {
    throw new PortalApiError(payload.error?.message || 'Permintaan tidak berhasil.', {
      code: payload.error?.code,
      details: payload.error?.details,
      requestId: payload.meta?.request_id,
      status: response.status,
    });
  }

  return payload.data;
}

export async function portalApiUpload(path, { token, file, fields } = {}) {
  if (!API_BASE_URL) {
    throw new PortalApiError('Konfigurasi API n8n belum tersedia.', {
      code: 'API_BASE_URL_MISSING',
    });
  }

  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  if (fields) {
    Object.entries(fields).forEach(([key, val]) => {
      formData.append(key, typeof val === 'object' ? JSON.stringify(val) : val);
    });
  }

  const response = await fetch(`${API_BASE_URL}${normalizePath(path)}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (response.status === 401) {
    triggerUnauthorized();
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    throw new PortalApiError('Respons API tidak valid.', {
      code: 'INVALID_API_RESPONSE',
      status: response.status,
    });
  }

  if (!response.ok || payload.ok === false) {
    throw new PortalApiError(payload.error?.message || 'Permintaan tidak berhasil.', {
      code: payload.error?.code,
      details: payload.error?.details,
      requestId: payload.meta?.request_id,
      status: response.status,
    });
  }

  return payload.data;
}

function requireToken(token) {
  if (!token) {
    throw new PortalApiError('Sesi tidak ditemukan. Silakan login ulang.', {
      code: 'MISSING_APP_TOKEN',
      status: 401,
    });
  }
}

export async function fetchPendingUsers(token) {
  requireToken(token);
  const data = await portalApiPost('/users/pending', { token });
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    count: Number(data?.count || 0),
  };
}

export async function approveUser(token, payload) {
  requireToken(token);
  return portalApiPost('/users/approve', {
    token,
    body: {
      profile_id: payload.profile_id,
      role: payload.role,
      unit_id: payload.unit_id,
      approval_note: payload.approval_note || '',
    },
  });
}

export async function rejectUser(token, payload) {
  requireToken(token);
  return portalApiPost('/users/reject', {
    token,
    body: {
      profile_id: payload.profile_id,
      approval_note: payload.approval_note,
    },
  });
}
