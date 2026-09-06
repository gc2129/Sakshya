import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import multer from 'multer';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OTP_TTL_MS = 5 * 60 * 1000;
const records = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const ACTION_LABELS = {
  UPLOADED: 'Evidence uploaded',
  VIEWED: 'Evidence viewed',
  TRANSFERRED: 'Custody transferred',
  EDITED: 'Evidence edited',
  COURT_ACCESSED: 'Court access granted',
  VERIFIED: 'Integrity verified',
};

const ACTION_NAMES = new Map(Object.entries(ACTION_LABELS).map(([key, value]) => [value, key]));
const VALID_ACTIONS = new Set(['VIEWED', 'TRANSFERRED', 'EDITED', 'COURT_ACCESSED']);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Keep the terminal useful during a live hackathon demonstration.
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalJson = (value) => JSON.stringify(value);
const clean = (value, fallback = '') => String(value ?? fallback).trim();

function normaliseAction(action) {
  const value = clean(action).toUpperCase();
  return ACTION_LABELS[value] ? value : ACTION_NAMES.get(action) || value;
}

function appendAuditEvent(record, {
  action,
  actor,
  badge = '',
  role = 'Custody Officer',
  details = '',
  location = 'Registered evidence facility',
}) {
  const at = new Date().toISOString();
  const previousHash = record.auditChain.at(-1)?.eventHash || null;
  const entry = {
    id: crypto.randomUUID(),
    action: ACTION_LABELS[action] || action,
    actor: clean(actor, 'Authorised Officer'),
    badge: clean(badge, '—'),
    role: clean(role, 'Custody Officer'),
    details: clean(details, 'Custody action recorded.'),
    at,
    location: clean(location, 'Registered evidence facility'),
    previousHash,
  };
  entry.eventHash = sha256(canonicalJson(entry));
  record.auditChain.push(entry);
  if (!record.tampered) sealBaseline(record);
  return entry;
}

function verifyAuditChain(record) {
  let previousHash = null;
  for (const [index, entry] of record.auditChain.entries()) {
    const { eventHash, ...unsignedEntry } = entry;
    const recomputedHash = sha256(canonicalJson(unsignedEntry));
    if (entry.previousHash !== previousHash || recomputedHash !== eventHash) {
      return {
        valid: false,
        brokenAtIndex: index,
        brokenAt: entry.id,
        details: `Audit block ${index} does not match its stored SHA-256 fingerprint or previous-hash pointer.`,
      };
    }
    previousHash = eventHash;
  }
  return { valid: true, brokenAtIndex: null, brokenAt: null, details: 'All audit blocks and hash links are valid.' };
}

function integrityState(record) {
  const audit = verifyAuditChain(record);
  const evidenceHashValid = record.originalHash === record.currentHash;
  const tamperIndex = Number.isInteger(record.tamperBlockIndex) ? record.tamperBlockIndex : null;
  const brokenAtIndex = audit.brokenAtIndex ?? (evidenceHashValid ? null : tamperIndex ?? Math.max(record.auditChain.length - 1, 0));
  const valid = evidenceHashValid && audit.valid;
  return {
    valid,
    evidenceHashValid,
    auditChainValid: audit.valid,
    brokenAtIndex: valid ? null : brokenAtIndex,
    details: valid
      ? `All ${record.auditChain.length} custody blocks match their linked SHA-256 fingerprints.`
      : audit.valid
        ? 'The evidence fingerprint no longer matches the sealed source hash.'
        : audit.details,
  };
}

function anomalyFlags(record, state = integrityState(record)) {
  return {
    offHoursActivity: record.auditChain.some((entry) => {
      const hour = new Date(entry.at).getUTCHours();
      return hour < 6 || hour >= 20;
    }),
    hashMismatch: !state.evidenceHashValid,
    brokenAuditChain: !state.auditChainValid,
  };
}

function clientChain(record, state = integrityState(record)) {
  const firstBroken = state.brokenAtIndex;
  return record.auditChain.map((entry, index) => {
    const compromised = firstBroken !== null && index >= firstBroken;
    return {
      index,
      action: ACTION_NAMES.get(entry.action) || entry.action,
      officer: entry.actor,
      badge: entry.badge,
      role: entry.role,
      timestamp: entry.at,
      details: entry.details,
      hash: `sha256:${entry.eventHash}`,
      eventHash: entry.eventHash,
      previousHash: entry.previousHash ? `sha256:${entry.previousHash}` : 'GENESIS',
      verified: !compromised,
      compromised,
      location: entry.location,
    };
  });
}

function publicRecord(record) {
  const state = integrityState(record);
  const chain = clientChain(record, state);
  const headHash = record.auditChain.at(-1)?.eventHash || null;
  return {
    id: record.id,
    docId: record.id,
    name: record.name,
    fileName: record.name,
    size: record.size,
    mimeType: record.mimeType,
    caseId: record.caseId,
    description: record.description,
    evidenceType: record.evidenceType,
    classification: record.classification,
    originalHash: record.originalHash,
    currentHash: record.currentHash,
    createdAt: record.createdAt,
    custodyHolder: record.custodyHolder,
    tampered: !state.valid,
    tamperBlockIndex: state.brokenAtIndex,
    status: state.valid ? 'valid' : 'compromised',
    valid: state.valid,
    chainLength: chain.length,
    lastActivity: chain.at(-1)?.timestamp || record.createdAt,
    chain,
    timeline: [...chain].reverse(),
    anomalyFlags: anomalyFlags(record, state),
    auditChainValid: state.auditChainValid,
    auditChainHead: headHash,
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

function createRecord({ id, file = null, metadata = {} }) {
  const source = file?.buffer || Buffer.from(canonicalJson({
    id,
    caseId: metadata.caseId,
    description: metadata.description,
    evidenceType: metadata.evidenceType,
    classification: metadata.classification,
  }));
  const digest = sha256(source);
  const record = {
    id,
    name: file?.originalname || clean(metadata.fileName, `${id}_evidence_record`),
    size: file?.size || source.length,
    mimeType: file?.mimetype || clean(metadata.mimeType, 'application/octet-stream'),
    caseId: clean(metadata.caseId, 'CASE/UNASSIGNED'),
    description: clean(metadata.description, 'Registered evidence record.'),
    evidenceType: clean(metadata.evidenceType, 'Digital Document'),
    classification: clean(metadata.classification, 'Sensitive'),
    originalHash: digest,
    currentHash: digest,
    createdAt: new Date().toISOString(),
    custodyHolder: clean(metadata.officerName, 'Forensic Officer'),
    tampered: false,
    tamperBlockIndex: null,
    auditChain: [],
    pendingTransfer: null,
  };
  appendAuditEvent(record, {
    action: 'UPLOADED',
    actor: record.custodyHolder,
    badge: metadata.officerBadge,
    role: metadata.officerRole || 'Investigating Officer',
    details: `${record.description} SHA-256 evidence hash sealed: ${digest}`,
    location: metadata.location || 'National Evidence Grid · Intake',
  });
  sealBaseline(record);
  return record;
}

// The demo reset returns a record to the state that existed before a deliberate
// tamper simulation. It is never used by normal custody operations.
function sealBaseline(record) {
  record.baselineAuditChain = JSON.parse(JSON.stringify(record.auditChain));
  record.baselineCurrentHash = record.currentHash;
}

function resetRecord(record) {
  if (!record.baselineAuditChain) return false;
  record.auditChain = JSON.parse(JSON.stringify(record.baselineAuditChain));
  record.currentHash = record.baselineCurrentHash || record.originalHash;
  record.tampered = false;
  record.tamperBlockIndex = null;
  return true;
}

function nextRecordId(requestedId) {
  const requested = clean(requestedId);
  if (requested) return requested;
  return `DOC-2026-${String(Math.floor(10000 + Math.random() * 89999))}`;
}

function seedRecord({ id, name, caseId, description, evidenceType, classification, size, actions, compromisedAt = null }) {
  const record = createRecord({
    id,
    metadata: {
      caseId,
      description,
      evidenceType,
      classification,
      officerName: actions[0]?.actor,
      officerBadge: actions[0]?.badge,
    },
  });
  record.name = name;
  record.size = size;
  actions.slice(1).forEach((event) => appendAuditEvent(record, event));
  sealBaseline(record);
  if (compromisedAt !== null && record.auditChain[compromisedAt]) {
    record.auditChain[compromisedAt].details = `${record.auditChain[compromisedAt].details} · Demo integrity mutation.`;
    record.currentHash = sha256(`${record.currentHash}:seed-tamper`);
    record.tampered = true;
    record.tamperBlockIndex = compromisedAt;
  }
  records.set(id, record);
}

function seedData() {
  if (records.size) return;
  seedRecord({
    id: 'DOC-2026-00217',
    name: 'Forensic_Seizure_Inventory.pdf',
    caseId: 'CASE/DEL/24-1187',
    description: 'Seizure inventory and initial scene documentation for Case 24-1187.',
    evidenceType: 'Digital Document',
    classification: 'Sensitive',
    size: 4.8 * 1024 * 1024,
    actions: [
      { actor: 'Ananya Rao', badge: 'DL-4172', role: 'Investigating Officer', details: 'Evidence package sealed and registered against the case file.', location: 'South District Evidence Room' },
      { action: 'VIEWED', actor: 'Vikram Singh', badge: 'DL-2198', role: 'Senior Authority', details: 'Accessed for supervisory review. No changes permitted.', location: 'DCP Office · South District' },
      { action: 'TRANSFERRED', actor: 'Ananya Rao', badge: 'DL-4172', role: 'Custody Handover', details: 'Physical custody acknowledged at Central Forensic Laboratory.', location: 'CFSL, Rohini · Gate 02' },
      { action: 'VIEWED', actor: 'Meera Joshi', badge: 'DL-5321', role: 'Forensic Analyst', details: 'Reviewed pages 1–18 and confirmed metadata integrity.', location: 'CFSL Digital Lab 03' },
      { action: 'COURT_ACCESSED', actor: 'Court Reader Office', badge: 'ECOURT-009', role: 'Judiciary Viewer', details: 'Read-only access granted for e-court hearing bundle.', location: 'District & Sessions Court · Court 4' },
    ],
  });
  seedRecord({
    id: 'DOC-2026-00194',
    name: 'CCTV_Extract_Block-C.mp4',
    caseId: 'CASE/MUM/24-0874',
    description: 'Certified CCTV extract from Block C, time range 21:00–23:00 hrs.',
    evidenceType: 'Media Extract',
    classification: 'Classified',
    size: 286 * 1024 * 1024,
    actions: [
      { actor: 'Nikhil Deshmukh', badge: 'MH-8044', role: 'Investigating Officer', details: 'Original media export received from authorised DVR.', location: 'Mumbai Cyber Cell' },
      { action: 'VIEWED', actor: 'Kavita Menon', badge: 'MH-3310', role: 'Forensic Analyst', details: 'Frame-level review completed; codec and duration confirmed.', location: 'Maharashtra FSL · Media Lab' },
      { action: 'TRANSFERRED', actor: 'Kavita Menon', badge: 'MH-3310', role: 'Custody Handover', details: 'Encrypted media transferred under dual officer confirmation.', location: 'Maharashtra FSL · Secure Vault' },
      { action: 'COURT_ACCESSED', actor: 'e-Court Registry', badge: 'ECOURT-014', role: 'Judiciary Viewer', details: 'Evidence made available to the presiding bench in read-only mode.', location: 'e-Court Services Gateway' },
    ],
  });
  seedRecord({
    id: 'DOC-2026-00172',
    name: 'Device_Extraction_Report.zip',
    caseId: 'CASE/KOL/24-0631',
    description: 'Mobile device extraction report with examiner notes and manifests.',
    evidenceType: 'Forensic Image',
    classification: 'Sensitive',
    size: 19.2 * 1024 * 1024,
    compromisedAt: 3,
    actions: [
      { actor: 'Sourav Ghosh', badge: 'WB-2901', role: 'Investigating Officer', details: 'Extraction report registered after device imaging.', location: 'Kolkata Digital Evidence Cell' },
      { action: 'VIEWED', actor: 'Sourav Ghosh', badge: 'WB-2901', role: 'Investigating Officer', details: 'Initial review of extraction manifest.', location: 'Kolkata Digital Evidence Cell' },
      { action: 'TRANSFERRED', actor: 'Sourav Ghosh', badge: 'WB-2901', role: 'Custody Handover', details: 'Transferred to forensic examiner for independent validation.', location: 'West Bengal FSL · Intake' },
      { action: 'EDITED', actor: 'System Observer', badge: 'AUDIT-000', role: 'Unauthorised Mutation', details: 'Evidence description changed outside the custody workflow.', location: 'Unknown endpoint · outside policy' },
      { action: 'VIEWED', actor: 'Priya Nair', badge: 'WB-9018', role: 'Forensic Analyst', details: 'Accessed after the chain had already diverged.', location: 'West Bengal FSL · Review Bay' },
      { action: 'VERIFIED', actor: 'SAKSHYA Integrity Engine', badge: 'SYSTEM-01', role: 'Automated Monitor', details: 'Hash mismatch detected during scheduled integrity scan.', location: 'National Evidence Grid' },
    ],
  });
}

function verifyRecord(record) {
  const before = integrityState(record);
  appendAuditEvent(record, {
    action: 'VERIFIED',
    actor: 'Verification engine',
    badge: 'SYSTEM-01',
    role: 'Integrity Monitor',
    details: before.valid ? 'SHA-256 hash and audit chain verified.' : 'Integrity verification failed.',
    location: 'National Evidence Grid',
  });
  return {
    ...publicRecord(record),
    valid: before.valid,
    brokenAtIndex: before.brokenAtIndex,
    details: before.details,
    alertMessage: before.valid ? null : `TAMPERING DETECTED at block ${before.brokenAtIndex}`,
    message: before.valid ? 'Evidence integrity verified.' : 'Evidence integrity compromised.',
  };
}

function mutateRecord(record, blockIndex, fakeData) {
  const index = Number(blockIndex);
  if (!Number.isInteger(index) || index < 0 || index >= record.auditChain.length) return null;
  record.auditChain[index].details = clean(fakeData, 'Evidence data modified outside the custody workflow.');
  record.currentHash = sha256(`${record.currentHash}:tampered:${Date.now()}`);
  record.tampered = true;
  record.tamperBlockIndex = index;
  return record;
}

function reportForRecord(record) {
  const state = integrityState(record);
  return {
    reportType: 'Sakshya Court-Ready Forensic Evidence Report',
    generatedAt: new Date().toISOString(),
    evidence: publicRecord(record),
    integrityAssessment: {
      evidenceHashValid: state.evidenceHashValid,
      auditChainValid: state.auditChainValid,
      auditChainBrokenAt: state.brokenAtIndex,
      overallValid: state.valid,
    },
    anomalyFlags: anomalyFlags(record, state),
    attestation: 'This report is generated from the evidence record and its cryptographically linked audit chain.',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Sakshya API', uploadLimitBytes: MAX_UPLOAD_BYTES, documentCount: records.size });
});

// Frontend-compatible document register and chain endpoints.
app.get('/api/documents', (_req, res) => {
  res.json(Array.from(records.values()).map(publicRecord));
});

app.post('/api/documents/upload', (req, res) => {
  const id = nextRecordId(req.body?.docId);
  if (records.has(id)) return res.status(409).json({ error: `Document ${id} already exists.` });
  const record = createRecord({ id, metadata: req.body || {} });
  records.set(id, record);
  res.status(201).json(publicRecord(record));
});

app.get('/api/documents/:id/chain', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(publicRecord(record));
});

app.post('/api/documents/:id/verify', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(verifyRecord(record));
});

app.post('/api/documents/:id/action', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const body = req.body || {};
  const action = normaliseAction(body.action);
  if (!VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Action must be VIEWED, TRANSFERRED, EDITED, or COURT_ACCESSED.' });
  }

  const fromOfficer = clean(body.fromOfficer || body.officerName);
  const toOfficer = clean(body.toOfficer);
  if (action === 'TRANSFERRED') {
    if (!fromOfficer || !toOfficer) return res.status(400).json({ error: 'A transfer requires fromOfficer and toOfficer.' });
    if (!/^\d{4}$/.test(clean(body.fromOtp)) || !/^\d{4}$/.test(clean(body.toOtp))) {
      return res.status(400).json({ error: 'Both transfer confirmations require a four-digit OTP.' });
    }
    record.custodyHolder = toOfficer;
  }

  appendAuditEvent(record, {
    action,
    actor: fromOfficer || 'Authorised Officer',
    badge: body.officerBadge,
    role: body.role || (action === 'TRANSFERRED' ? 'Custody Handover' : 'Authorised Officer'),
    details: action === 'TRANSFERRED'
      ? clean(body.details, `Custody transferred from ${fromOfficer} to ${toOfficer}. Dual officer confirmation recorded.`)
      : clean(body.details, 'Custody action recorded.'),
    location: body.location,
  });
  res.status(201).json(publicRecord(record));
});

app.post('/api/documents/:id/simulate-tamper', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  if (!mutateRecord(record, req.body?.blockIndex, req.body?.fakeData)) {
    return res.status(400).json({ error: 'blockIndex must point to an existing chain block.' });
  }
  res.json(publicRecord(record));
});

app.post('/api/documents/:id/reset-demo', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  if (!resetRecord(record)) return res.status(400).json({ error: 'No demo baseline is available for this record.' });
  res.json(publicRecord(record));
});

app.get('/api/documents/:id/report', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(reportForRecord(record));
});

// Rich evidence endpoints remain available for direct integrations and API demos.
app.post('/api/evidence/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please select one evidence file in the "file" field.' });
  const id = nextRecordId(req.body?.docId);
  if (records.has(id)) return res.status(409).json({ error: `Document ${id} already exists.` });
  const record = createRecord({ id, file: req.file, metadata: req.body || {} });
  records.set(id, record);
  res.status(201).json(publicRecord(record));
});

app.get('/api/evidence/:id', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(publicRecord(record));
});

app.post('/api/evidence/:id/verify', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(verifyRecord(record));
});

app.post('/api/evidence/:id/transfer/request-otp', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  const recipient = clean(req.body?.recipient);
  if (!recipient) return res.status(400).json({ error: 'A recipient is required.' });
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  record.pendingTransfer = { recipient, otpHash: sha256(otp), expiresAt: Date.now() + OTP_TTL_MS };
  appendAuditEvent(record, {
    action: 'VIEWED',
    actor: record.custodyHolder,
    role: 'Transfer Controller',
    details: `Transfer to ${recipient} requires OTP verification.`,
    location: 'National Evidence Grid · Transfer desk',
  });
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
  if (clean(recipient) !== pending.recipient) return res.status(400).json({ error: 'Recipient does not match the OTP request.' });
  if (sha256(clean(otp)) !== pending.otpHash) return res.status(401).json({ error: 'Invalid transfer OTP.' });
  const previousHolder = record.custodyHolder;
  record.custodyHolder = pending.recipient;
  record.pendingTransfer = null;
  appendAuditEvent(record, {
    action: 'TRANSFERRED',
    actor: previousHolder,
    role: 'Custody Handover',
    details: `OTP-verified custody transfer to ${record.custodyHolder}.`,
    location: 'Registered evidence facility',
  });
  res.json(publicRecord(record));
});

app.post('/api/evidence/:id/tamper', (req, res) => {
  const record = getRecord(req, res);
  if (!record) return;
  mutateRecord(record, record.auditChain.length - 1, 'Evidence hash deliberately altered for demonstration.');
  res.json(publicRecord(record));
});

app.get('/api/evidence/:id/report', (req, res) => {
  const record = getRecord(req, res);
  if (record) res.json(reportForRecord(record));
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

seedData();
app.listen(PORT, () => console.log(`Sakshya backend listening on http://localhost:${PORT} · ${records.size} seeded records`));
