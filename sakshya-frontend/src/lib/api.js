const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

// Every environment must provide the API explicitly. A hosted build must
// never silently call a developer machine on a judge's or officer's device.
const API_BASE = configuredApiUrl.replace(/\/+$/, '');

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

  getHealth: () => request('/health'),
  getAllDocuments: () => request('/documents'),
  listEvidence: () => request('/documents'),

  getDocumentChain: (docId) => request(`/documents/${encodedId(docId)}/chain`),
  getEvidence: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}`),

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

  resetTamper: (docId) => request(`/documents/${encodedId(docId)}/reset-demo`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  resetDemo: (evidenceId) => request(`/documents/${encodedId(evidenceId)}/reset-demo`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  getDocumentReport: (docId) => request(`/documents/${encodedId(docId)}/report`),
  getEvidenceReport: (evidenceId) => request(`/evidence/${encodedId(evidenceId)}/report`),
};

export function isApiUnavailable(error) {
  return error?.code === 'API_NOT_CONFIGURED'
    || error?.name === 'TypeError'
    || error?.message?.toLowerCase().includes('failed to fetch');
}

export { API_BASE };
