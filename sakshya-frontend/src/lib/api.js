import { authToken, clearAuthSession } from './auth';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

// Every environment must provide the API explicitly. A hosted build must
// never silently call a developer machine on a judge's or officer's device.
const API_BASE = configuredApiUrl.replace(/\/+$/, '');
let authInvalidatedHandler = null;

export function setAuthInvalidatedHandler(handler) {
  authInvalidatedHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (authInvalidatedHandler === handler) authInvalidatedHandler = null;
  };
}

function isSessionFailure(status, payload) {
  if (status !== 401) return false;
  const message = String(payload?.error || payload?.message || '').toLowerCase();
  return message.includes('authentication is required')
    || message.includes('invalid or expired session')
    || message.includes('invalid session token');
}

function responseError(response, payload) {
  const error = new Error(
    payload?.message || payload?.error || `Request failed (${response.status})`,
  );
  error.status = response.status;
  error.payload = payload;
  error.requiredRoles = payload?.requiredRoles || [];
  return error;
}

function requestHeaders({ isFormData, skipAuth, headers } = {}) {
  const token = skipAuth ? '' : authToken();
  const base = isFormData
    ? {}
    : { Accept: 'application/json', 'Content-Type': 'application/json' };
  return {
    ...base,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(headers || {}),
  };
}

async function request(path, options = {}) {
  if (!API_BASE) {
    const error = new Error('VITE_API_URL is not configured for this deployment. Set it to the SAKSHYA API base URL.');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }

  const { skipAuth = false, ...fetchOptions } = options;
  const isFormData = fetchOptions.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: requestHeaders({ isFormData, skipAuth, headers: fetchOptions.headers }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = responseError(response, payload);
    if (isSessionFailure(response.status, payload)) {
      clearAuthSession();
      authInvalidatedHandler?.(error);
    }
    throw error;
  }

  return payload?.data ?? payload;
}

async function requestBlob(path, options = {}) {
  if (!API_BASE) {
    const error = new Error('VITE_API_URL is not configured for this deployment. Set it to the SAKSHYA API base URL.');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }

  const { skipAuth = false, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: requestHeaders({ skipAuth, headers: fetchOptions.headers }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = responseError(response, payload);
    if (isSessionFailure(response.status, payload)) {
      clearAuthSession();
      authInvalidatedHandler?.(error);
    }
    throw error;
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'sakshya-forensic-report.pdf',
  };
}

const encodedId = (value) => encodeURIComponent(value);

function uploadEvidence(data) {
  if (!data?.file) {
    return request('/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  const form = new FormData();
  form.append('file', data.file);
  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'file' && value !== undefined && value !== null && value !== '') {
      form.append(key, value);
    }
  });
  return request('/evidence/upload', { method: 'POST', body: form });
}

export const api = {
  baseUrl: API_BASE,

  login: (credentials) => request('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(credentials),
  }),
  getCurrentUser: () => request('/auth/me'),
  logout: () => clearAuthSession(),

  getHealth: () => request('/health', { skipAuth: true }),
  getAllDocuments: () => request('/documents'),
  listEvidence: () => request('/documents'),

  getDocumentChain: (docId) => request(`/documents/${encodedId(docId)}/chain`),
  getEvidence: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}`),
  getEvidenceVault: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/vault`),
  compareEvidenceVault: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/vault/compare`),
  uploadSuspiciousVaultFile: (evidenceId, { file, reason }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('reason', reason);
    return request(`/evidence/${encodedId(evidenceId)}/vault/suspicious`, {
      method: 'POST',
      body: form,
    });
  },
  downloadVaultFile: (evidenceId, kind) => {
    if (!['original', 'suspicious'].includes(kind)) {
      throw new Error('The requested vault file type is not recognised.');
    }
    return requestBlob(`/evidence/${encodedId(evidenceId)}/vault/${kind}/download`);
  },

  verifyChain: (docId) => request(`/documents/${encodedId(docId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  verifyEvidence: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  uploadDocument: uploadEvidence,
  uploadEvidence,

  addAction: (docId, actionData) => request(`/documents/${encodedId(docId)}/action`, {
    method: 'POST',
    body: JSON.stringify(actionData),
  }),

  simulateTamper: (docId, blockIndex, fakeData) => request(`/documents/${encodedId(docId)}/simulate-tamper`, {
    method: 'POST',
    body: JSON.stringify({ blockIndex, fakeData }),
  }),
  tamperEvidence: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/tamper`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  requestTransferOtp: (evidenceId, recipient) => request(`/evidence/${encodedId(evidenceId)}/transfer/request-otp`, {
    method: 'POST',
    body: JSON.stringify({ recipient }),
  }),
  transferEvidence: (evidenceId, { recipient, otp }) => request(`/evidence/${encodedId(evidenceId)}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ recipient, otp }),
  }),

  getEvidenceIncidents: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/incidents`),
  updateIncidentStatus: (evidenceId, incidentId, status, reason) => request(`/evidence/${encodedId(evidenceId)}/incidents/${encodedId(incidentId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  }),
  approveIncident: (evidenceId, incidentId, location) => request(`/evidence/${encodedId(evidenceId)}/incidents/${encodedId(incidentId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(location ? { location } : {}),
  }),

  getAdminUsers: () => request('/admin/users'),
  getAdminDevices: () => request('/admin/devices'),
  getAdminSourceDevices: () => request('/admin/source-devices'),

  getDocumentReport: (docId) => request(`/documents/${encodedId(docId)}/report`),
  getEvidenceReport: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/report`),
  downloadEvidenceReportPdf: (evidenceId) => requestBlob(`/evidence/${encodedId(evidenceId)}/report.pdf`),
};

export function isApiUnavailable(error) {
  return error?.code === 'API_NOT_CONFIGURED'
    || error?.name === 'TypeError'
    || error?.message?.toLowerCase().includes('failed to fetch');
}

export function isPermissionDenied(error) {
  return error?.status === 403;
}

export { API_BASE };
