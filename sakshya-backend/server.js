import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OTP_TTL_MS = 5 * 60 * 1000;
const records = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalJson = (value) => JSON.stringify(value);
const isOffHours = (timestamp) => {
  const hour = new Date(timestamp).getUTCHours();
  return hour < 6 || hour >= 20;
};

function appendAuditEvent(record, { action, actor, details = '' }) {
  const at = new Date().toISOString();
  const previousHash = record.auditChain.at(-1)?.eventHash || null;
  const entry = { id: crypto.randomUUID(), action, actor, details, at, previousHash };
  entry.eventHash = sha256(canonicalJson(entry));
  record.auditChain.push(entry);
  return entry;
}

function verifyAuditChain(record) {
  let previousHash = null;
  for (const entry of record.auditChain) {
    const { eventHash, ...unsignedEntry } = entry;
    if (entry.previousHash !== previousHash || sha256(canonicalJson(unsignedEntry)) !== eventHash) {
      return { valid: false, brokenAt: entry.id };
    }
    previousHash = eventHash;
  }
  return { valid: true, headHash: previousHash };
}

function anomalyFlags(record) {
  const chain = verifyAuditChain(record);
  return {
    offHoursActivity: record.auditChain.some((entry) => isOffHours(entry.at)),
    hashMismatch: record.originalHash !== record.currentHash,
    brokenAuditChain: !chain.valid
  };
}

function publicRecord(record) {
  const chain = verifyAuditChain(record);
  return {
    id: record.id, name: record.name, size: record.size, mimeType: record.mimeType,
    originalHash: record.originalHash, currentHash: record.currentHash, createdAt: record.createdAt,
    custodyHolder: record.custodyHolder, tampered: record.tampered, anomalyFlags: anomalyFlags(record),
    auditChainValid: chain.valid, auditChainHead: chain.headHash || null,
    timeline: [...record.auditChain].reverse()
  };
}

function getRecord(req, res) {
  const record = records.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Evidence not found.' });
    return null;
  }
  return record;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Sakshya API', uploadLimitBytes: MAX_UPLOAD_BYTES });
});

app.post('/api/evidence/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please select one evidence file in the "file" field.' });
  const id = crypto.randomUUID();
  const digest = sha256(req.file.buffer);
  const record = {
    id, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype || 'application/octet-stream',
    originalHash: digest, currentHash: digest, createdAt: new Date().toISOString(),
    custodyHolder: 'Forensic Officer', tampered: false, auditChain: [], pendingTransfer: null
  };
  appendAuditEvent(record, {
    action: 'Evidence uploaded', actor: record.custodyHolder,
    details: `SHA-256 evidence hash sealed: ${digest}`
  });
  records.set(id, record);
  res.status(201).json(publicRecord(record));
});

app.get('/api/evidence/:id', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(publicRecord(record));
});

app.post('/api/evidence/:id/verify', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const chain = verifyAuditChain(record);
  const hashValid = record.originalHash === record.currentHash;
  const valid = hashValid && chain.valid;
  appendAuditEvent(record, {
    action: 'Integrity verified', actor: 'Verification engine',
    details: valid ? 'SHA-256 hash and audit chain verified.' : 'Integrity verification failed.'
  });
  res.json({ ...publicRecord(record), valid, message: valid ? 'Evidence integrity verified.' : 'Evidence integrity compromised.' });
});

app.post('/api/evidence/:id/transfer/request-otp', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const recipient = String(req.body?.recipient || '').trim();
  if (!recipient) return res.status(400).json({ error: 'A recipient is required.' });
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  record.pendingTransfer = { recipient, otpHash: sha256(otp), expiresAt: Date.now() + OTP_TTL_MS };
  appendAuditEvent(record, {
    action: 'Custody transfer OTP requested', actor: record.custodyHolder,
    details: `Transfer to ${recipient} requires OTP verification.`
  });
  // This self-contained demo returns the OTP; production should deliver it out of band.
  res.json({ message: 'OTP generated. It expires in 5 minutes.', otp, expiresAt: new Date(record.pendingTransfer.expiresAt).toISOString() });
});

app.post('/api/evidence/:id/transfer', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const { recipient, otp } = req.body || {};
  const pending = record.pendingTransfer;
  if (!pending) return res.status(400).json({ error: 'Request a transfer OTP before transferring custody.' });
  if (Date.now() > pending.expiresAt) {
    record.pendingTransfer = null;
    return res.status(400).json({ error: 'The transfer OTP has expired. Request a new OTP.' });
  }
  if (String(recipient || '').trim() !== pending.recipient) return res.status(400).json({ error: 'Recipient does not match the OTP request.' });
  if (sha256(String(otp || '')) !== pending.otpHash) return res.status(401).json({ error: 'Invalid transfer OTP.' });
  const previousHolder = record.custodyHolder;
  record.custodyHolder = pending.recipient;
  record.pendingTransfer = null;
  appendAuditEvent(record, {
    action: 'Custody transferred', actor: previousHolder,
    details: `OTP-verified custody transfer to ${record.custodyHolder}.`
  });
  res.json(publicRecord(record));
});

app.post('/api/evidence/:id/tamper', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  record.tampered = true;
  record.currentHash = sha256(`${record.currentHash}:tampered:${Date.now()}`);
  appendAuditEvent(record, {
    action: 'Integrity breach simulated', actor: 'Demo system',
    details: 'Evidence hash deliberately altered for demonstration.'
  });
  res.json(publicRecord(record));
});

app.get('/api/evidence/:id/report', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const chain = verifyAuditChain(record);
  const flags = anomalyFlags(record);
  res.json({
    reportType: 'Sakshya Court-Ready Forensic Evidence Report', generatedAt: new Date().toISOString(),
    evidence: publicRecord(record),
    integrityAssessment: {
      evidenceHashValid: !flags.hashMismatch, auditChainValid: chain.valid,
      auditChainBrokenAt: chain.brokenAt || null, overallValid: !flags.hashMismatch && chain.valid
    },
    anomalyFlags: flags,
    attestation: 'This report is generated from the evidence record and its cryptographically linked audit chain.'
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds the 25 MB upload limit.' });
  }
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.message}` });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON request body.' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => console.log(`Sakshya backend listening on http://localhost:${PORT}`));
