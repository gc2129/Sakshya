const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body.data ?? body;
}

export const api = {
  baseUrl: API_BASE,
  getHealth: () => request('/health'),
  getAllDocuments: () => request('/documents'),
  getDocumentChain: (docId) => request(`/documents/${encodeURIComponent(docId)}/chain`),
  verifyChain: (docId) => request(`/documents/${encodeURIComponent(docId)}/verify`),
  uploadDocument: (data) => {
    if (data.file) {
      const form = new FormData();
      form.append('file', data.file);
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'file' && value !== undefined && value !== null) form.append(key, value);
      });
      return request('/evidence/upload', { method: 'POST', body: form });
    }
    return request('/documents/upload', { method: 'POST', body: JSON.stringify(data) });
  },
  addAction: (docId, actionData) => request(`/documents/${encodeURIComponent(docId)}/action`, {
    method: 'POST',
    body: JSON.stringify(actionData),
  }),
  simulateTamper: (docId, blockIndex, fakeData) => request(`/documents/${encodeURIComponent(docId)}/simulate-tamper`, {
    method: 'POST',
    body: JSON.stringify({ blockIndex, fakeData }),
  }),
};

export function isApiUnavailable(error) {
  return error?.name === 'TypeError' || error?.message?.toLowerCase().includes('failed to fetch');
}

export { API_BASE };
