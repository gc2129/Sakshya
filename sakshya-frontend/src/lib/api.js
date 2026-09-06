const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

// Local development remains convenient, but a production build must be
// pointed at an explicit deployed API. This prevents a hosted UI from
// silently trying to call localhost on a judge's or officer's machine.
const API_BASE = (configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:5000/api' : ''))
  .replace(/\/+$/, '');

async function request(path, options = {}) {
  if (!API_BASE) {
    const error = new Error('VITE_API_URL is not configured for this deployment. Set it to the SAKSHYA API base URL.');
    error.code = 'API_NOT_CONFIGURED';
    throw error;
  }

  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: isFormData
      ? options.headers
      : { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload?.data ?? payload;
}

const encodedId = (value) => encodeURIComponent(value);

export const api = {
  baseUrl: API_BASE,

  getHealth: () => request('/health'),

  // This existing backend list endpoint powers the evidence register.
  listEvidence: () => request('/documents'),

  uploadEvidence: ({ file, caseId, officer, description, classification }) => {
    const form = new FormData();
    form.append('file', file);
    if (caseId) form.append('caseId', caseId);
    if (officer) {
      // The rich evidence route accepts officerName. Keep officer too for
      // compatibility with the documented multipart contract.
      form.append('officer', officer);
      form.append('officerName', officer);
    }
    if (description) form.append('description', description);
    if (classification) form.append('classification', classification);

    return request('/evidence/upload', { method: 'POST', body: form });
  },

  getEvidence: (evidenceId) =>
    request(`/evidence/${encodedId(evidenceId)}`),

  verifyEvidence: (evidenceId) =>
    request(`/evidence/${encodedId(evidenceId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  tamperEvidence: (evidenceId) =>
    request(`/evidence/${encodedId(evidenceId)}/tamper`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  requestTransferOtp: (evidenceId, recipient) =>
    request(`/evidence/${encodedId(evidenceId)}/transfer/request-otp`, {
      method: 'POST',
      body: JSON.stringify({ recipient }),
    }),

  // The running backend uses `otp` (not `verificationCode`) for handover.
  transferEvidence: (evidenceId, { recipient, otp }) =>
    request(`/evidence/${encodedId(evidenceId)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ recipient, otp }),
    }),

  getEvidenceReport: (evidenceId) =>
    request(`/evidence/${encodedId(evidenceId)}/report`),

  // Existing demo helper provided by the backend for restoring a seeded record.
  resetDemo: (evidenceId) =>
    request(`/documents/${encodedId(evidenceId)}/reset-demo`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export function isApiUnavailable(error) {
  return error?.code === 'API_NOT_CONFIGURED'
    || error?.name === 'TypeError'
    || error?.message?.toLowerCase().includes('failed to fetch');
}

export { API_BASE };
