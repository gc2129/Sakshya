import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import multer from 'multer';

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OTP_TTL_MS = 5 * 60 * 1000;
const DB_PATH = process.env.SAKSHYA_DB_PATH || join(process.cwd(), 'data', 'sakshya.sqlite');
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
const records = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS evidence_records (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE, event_json TEXT NOT NULL, ordinal INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_events_evidence ON audit_events(evidence_id, ordinal);`);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (value, fallback = '') => String(value ?? fallback).trim();
const labels = { UPLOADED: 'Evidence uploaded', VIEWED: 'Evidence viewed', TRANSFERRED: 'Custody transferred', EDITED: 'Evidence edited', COURT_ACCESSED: 'Court access granted', VERIFIED: 'Integrity verified', SECURITY_INCIDENT: 'Security incident recorded' };
const labelKeys = new Map(Object.entries(labels).map(([key, value]) => [value, key]));

function save(record) {
  const { auditChain, ...stored } = record;
  db.prepare('INSERT INTO evidence_records (id, record_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json').run(record.id, JSON.stringify(stored));
  db.prepare('DELETE FROM audit_events WHERE evidence_id = ?').run(record.id);
  const insert = db.prepare('INSERT INTO audit_events (id, evidence_id, event_json, ordinal) VALUES (?, ?, ?, ?)');
  record.auditChain.forEach((event, ordinal) => insert.run(event.id, record.id, JSON.stringify(event), ordinal));
}
function load() {
  for (const row of db.prepare('SELECT id, record_json FROM evidence_records').all()) {
    const record = JSON.parse(row.record_json);
    record.auditChain = db.prepare('SELECT event_json FROM audit_events WHERE evidence_id = ? ORDER BY ordinal').all(row.id).map((event) => JSON.parse(event.event_json));
    record.securityIncidents ||= [];
    record.provenance ||= { status: 'SOURCE_UNKNOWN', flags: ['source hash unavailable'], uploader: { name: 'Unknown uploader', badge: 'Not provided', role: 'Not provided' }, attestationStatement: 'Not provided', sourceSystemDeviceId: 'Not provided', sourceType: 'manual upload', officialSourceHash: null, sourceSignatureReference: null, authorisedActionLocation: 'Not voluntarily provided' };
    records.set(record.id, record);
  }
}
function append(record, { action = 'VIEWED', actor, badge = '', role = 'Custody Officer', details = '', location = 'Registered evidence facility' }) {
  const event = { id: crypto.randomUUID(), action: labels[action] || action, actor: clean(actor, 'Authorised Officer'), badge: clean(badge, '—'), role: clean(role), details: clean(details), at: new Date().toISOString(), location: clean(location), previousHash: record.auditChain.at(-1)?.eventHash || null };
  event.eventHash = hash(JSON.stringify(event));
  record.auditChain.push(event);
  return event;
}
function state(record) {
  let previousHash = null; let brokenAtIndex = null;
  for (const [index, event] of record.auditChain.entries()) { const { eventHash, ...unsigned } = event; if (event.previousHash !== previousHash || hash(JSON.stringify(unsigned)) !== eventHash) { brokenAtIndex = index; break; } previousHash = eventHash; }
  const evidenceHashValid = record.originalHash === record.currentHash;
  const valid = evidenceHashValid && brokenAtIndex === null;
  return { valid, evidenceHashValid, auditChainValid: brokenAtIndex === null, brokenAtIndex: valid ? null : brokenAtIndex ?? record.tamperBlockIndex ?? Math.max(record.auditChain.length - 1, 0) };
}
function publicRecord(record) {
  const integrity = state(record); const firstBroken = integrity.brokenAtIndex;
  const chain = record.auditChain.map((event, index) => ({ index, action: labelKeys.get(event.action) || event.action, officer: event.actor, badge: event.badge, role: event.role, timestamp: event.at, details: event.details, location: event.location, eventHash: event.eventHash, hash: `sha256:${event.eventHash}`, previousHash: event.previousHash ? `sha256:${event.previousHash}` : 'GENESIS', verified: firstBroken === null || index < firstBroken, compromised: firstBroken !== null && index >= firstBroken }));
  const securityIncidents = record.securityIncidents || [];
  return { id: record.id, docId: record.id, name: record.name, fileName: record.name, size: record.size, mimeType: record.mimeType, caseId: record.caseId, description: record.description, evidenceType: record.evidenceType, classification: record.classification, originalHash: record.originalHash, currentHash: record.currentHash, createdAt: record.createdAt, custodyHolder: record.custodyHolder, tampered: !integrity.valid, tamperBlockIndex: integrity.brokenAtIndex, status: integrity.valid ? 'valid' : 'compromised', valid: integrity.valid, chainLength: chain.length, lastActivity: chain.at(-1)?.timestamp || record.createdAt, chain, timeline: [...chain].reverse(), securityIncidents, provenance: record.provenance, auditChainValid: integrity.auditChainValid, auditChainHead: record.auditChain.at(-1)?.eventHash || null, anomalyFlags: { offHoursActivity: chain.some((event) => { const hour = new Date(event.timestamp).getUTCHours(); return hour < 6 || hour >= 20; }), hashMismatch: !integrity.evidenceHashValid, brokenAuditChain: !integrity.auditChainValid, intrusionAttempt: securityIncidents.length > 0 } };
}
function getRecord(req, res) { const record = records.get(req.params.id); if (!record) { res.status(404).json({ error: 'Evidence not found.' }); return null; } return record; }
function recordInvalidTransfer(record, req, attemptedAction) {
  const body = req.body || {};
  const incident = { id: crypto.randomUUID(), rule: 'INVALID_TRANSFER_OTP', attemptedAction, summary: 'Unauthorised custody transfer was blocked because the submitted confirmation code was invalid.', status: 'OPEN', timestamp: new Date().toISOString(), sourceNetwork: clean(req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress, 'Unavailable'), deviceMetadata: clean(body.deviceMetadata || req.headers['user-agent'], 'Unavailable'), authorisedActionLocation: clean(body.authorisedActionLocation || body.location, 'Not voluntarily provided') };
  record.securityIncidents ||= [];
  record.securityIncidents.push(incident);
  append(record, { action: 'SECURITY_INCIDENT', actor: 'SAKSHYA Security Monitor', badge: 'SYSTEM-SEC', role: 'Intrusion Traceability', details: `${incident.rule}: ${incident.summary} Incident ${incident.id}.`, location: incident.authorisedActionLocation });
  save(record);
  return incident;
}
function provenanceFor(metadata, evidenceHash) {
  const sourceType = clean(metadata.sourceType, 'manual upload');
  const sourceSystemDeviceId = clean(metadata.sourceSystemDeviceId);
  const officialSourceHash = clean(metadata.officialSourceHash);
  const sourceSignatureReference = clean(metadata.sourceSignatureReference);
  const uploaderAttestation = clean(metadata.attestationStatement);
  const flags = [];
  if (!sourceSystemDeviceId) flags.push('unregistered source device');
  if (!officialSourceHash && !sourceSignatureReference) flags.push('source hash unavailable');
  if (officialSourceHash && officialSourceHash !== evidenceHash) flags.push('source hash mismatch');
  if (!uploaderAttestation) flags.push('missing uploader attestation');
  if (!clean(metadata.authorisedActionLocation)) flags.push('upload outside authorised location');
  const trustedSource = sourceType.toLowerCase() !== 'manual upload' && Boolean(sourceSystemDeviceId) && Boolean(officialSourceHash || sourceSignatureReference);
  const status = officialSourceHash && officialSourceHash !== evidenceHash ? 'REVIEW_REQUIRED' : trustedSource && flags.length === 0 ? 'SOURCE_VERIFIED' : flags.includes('missing uploader attestation') ? 'REVIEW_REQUIRED' : 'SOURCE_UNKNOWN';
  return { status, flags, uploader: { name: clean(metadata.officerName, 'Unknown uploader'), badge: clean(metadata.officerBadge, 'Not provided'), role: clean(metadata.officerRole, 'Not provided') }, attestationStatement: uploaderAttestation || 'Not provided', sourceSystemDeviceId: sourceSystemDeviceId || 'Not provided', sourceType, officialSourceHash: officialSourceHash || null, sourceSignatureReference: sourceSignatureReference || null, authorisedActionLocation: clean(metadata.authorisedActionLocation) || 'Not voluntarily provided' };
}
function nextId(value) { return clean(value) || `DOC-2026-${String(Math.floor(10000 + Math.random() * 89999))}`; }
function createRecord({ id, file, metadata = {} }) {
  const digestSource = file?.buffer || Buffer.from(JSON.stringify({ id, caseId: metadata.caseId, description: metadata.description }));
  const evidenceHash = hash(digestSource);
  const record = { id, name: file?.originalname || clean(metadata.fileName, `${id}_evidence_record`), size: file?.size || digestSource.length, mimeType: file?.mimetype || clean(metadata.mimeType, 'application/octet-stream'), caseId: clean(metadata.caseId, 'CASE/UNASSIGNED'), description: clean(metadata.description, 'Registered evidence record.'), evidenceType: clean(metadata.evidenceType, 'Digital Document'), classification: clean(metadata.classification, 'Sensitive'), originalHash: evidenceHash, currentHash: evidenceHash, createdAt: new Date().toISOString(), custodyHolder: clean(metadata.officerName, 'Forensic Officer'), tamperBlockIndex: null, pendingTransfer: null, securityIncidents: [], provenance: provenanceFor(metadata, evidenceHash), auditChain: [] };
  append(record, { action: 'UPLOADED', actor: record.custodyHolder, badge: metadata.officerBadge, role: metadata.officerRole || 'Investigating Officer', details: `${record.description} SHA-256 evidence hash sealed: ${record.originalHash}`, location: metadata.location || 'National Evidence Grid · Intake' });
  append(record, { action: 'VIEWED', actor: 'SAKSHYA Provenance Engine', badge: 'SYSTEM-PROV', role: 'Source Provenance Assessment', details: `Provenance status: ${record.provenance.status}. Flags: ${record.provenance.flags.join(', ') || 'none'}.`, location: record.provenance.authorisedActionLocation });
  return record;
}
function verify(record) { const before = state(record); append(record, { action: 'VERIFIED', actor: 'Verification engine', badge: 'SYSTEM-01', role: 'Integrity Monitor', details: before.valid ? 'SHA-256 hash and audit chain verified.' : 'Integrity verification failed.', location: 'National Evidence Grid' }); save(record); return { ...publicRecord(record), valid: before.valid, brokenAtIndex: before.brokenAtIndex, message: before.valid ? 'Evidence integrity verified.' : 'Evidence integrity compromised.' }; }
function report(record) { const integrity = state(record); return { reportType: 'Sakshya Court-Ready Forensic Evidence Report', generatedAt: new Date().toISOString(), evidence: publicRecord(record), integrityAssessment: { evidenceHashValid: integrity.evidenceHashValid, auditChainValid: integrity.auditChainValid, auditChainBrokenAt: integrity.brokenAtIndex, overallValid: integrity.valid }, anomalyFlags: publicRecord(record).anomalyFlags, attestation: 'This report is generated from SQLite evidence records and its cryptographically linked audit chain.' }; }

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Sakshya API', storage: 'SQLite', uploadLimitBytes: MAX_UPLOAD_BYTES, documentCount: records.size }));
app.get('/api/documents', (_req, res) => res.json([...records.values()].map(publicRecord)));
app.post('/api/documents/upload', (req, res) => { const id = nextId(req.body?.docId); if (records.has(id)) return res.status(409).json({ error: `Document ${id} already exists.` }); const record = createRecord({ id, metadata: req.body || {} }); records.set(id, record); save(record); res.status(201).json(publicRecord(record)); });
app.get('/api/documents/:id/chain', (req, res) => { const record = getRecord(req, res); if (record) res.json(publicRecord(record)); });
app.post('/api/documents/:id/verify', (req, res) => { const record = getRecord(req, res); if (record) res.json(verify(record)); });
app.post('/api/documents/:id/action', (req, res) => { const record = getRecord(req, res); if (!record) return; const body = req.body || {}; const action = clean(body.action).toUpperCase(); if (!['VIEWED', 'TRANSFERRED', 'EDITED', 'COURT_ACCESSED'].includes(action)) return res.status(400).json({ error: 'Action must be VIEWED, TRANSFERRED, EDITED, or COURT_ACCESSED.' }); const from = clean(body.fromOfficer || body.officerName); const to = clean(body.toOfficer); if (action === 'TRANSFERRED') { if (!from || !to || !/^\d{4}$/.test(clean(body.fromOtp)) || !/^\d{4}$/.test(clean(body.toOtp))) { recordInvalidTransfer(record, req, 'DUAL_CONFIRMATION_CUSTODY_TRANSFER'); return res.status(403).json({ error: 'Custody transfer blocked: invalid dual-confirmation OTP.', evidence: publicRecord(record) }); } record.custodyHolder = to; } append(record, { action, actor: from || 'Authorised Officer', badge: body.officerBadge, role: body.role || 'Authorised Officer', details: clean(body.details, 'Custody action recorded.'), location: body.location }); save(record); res.status(201).json(publicRecord(record)); });
app.post('/api/documents/:id/simulate-tamper', (req, res) => { const record = getRecord(req, res); if (!record) return; const index = Number(req.body?.blockIndex); if (!Number.isInteger(index) || !record.auditChain[index]) return res.status(400).json({ error: 'blockIndex must point to an existing chain block.' }); record.auditChain[index].details = clean(req.body?.fakeData, 'Evidence data modified outside the custody workflow.'); record.currentHash = hash(`${record.currentHash}:tampered:${Date.now()}`); record.tamperBlockIndex = index; save(record); res.json(publicRecord(record)); });
app.get('/api/documents/:id/report', (req, res) => { const record = getRecord(req, res); if (record) res.json(report(record)); });
app.post('/api/evidence/upload', upload.single('file'), (req, res) => { if (!req.file) return res.status(400).json({ error: 'Please select one evidence file in the "file" field.' }); const id = nextId(req.body?.docId); if (records.has(id)) return res.status(409).json({ error: `Document ${id} already exists.` }); const record = createRecord({ id, file: req.file, metadata: req.body || {} }); records.set(id, record); save(record); res.status(201).json(publicRecord(record)); });
app.get('/api/evidence/:id', (req, res) => { const record = getRecord(req, res); if (record) res.json(publicRecord(record)); });
app.post('/api/evidence/:id/verify', (req, res) => { const record = getRecord(req, res); if (record) res.json(verify(record)); });
app.post('/api/evidence/:id/transfer/request-otp', (req, res) => { const record = getRecord(req, res); if (!record) return; const recipient = clean(req.body?.recipient); if (!recipient) return res.status(400).json({ error: 'A recipient is required.' }); const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0'); record.pendingTransfer = { recipient, otpHash: hash(otp), expiresAt: Date.now() + OTP_TTL_MS }; append(record, { action: 'VIEWED', actor: record.custodyHolder, role: 'Transfer Controller', details: `Transfer to ${recipient} requires OTP verification.` }); save(record); res.json({ message: 'OTP generated. It expires in 5 minutes.', otp, expiresAt: new Date(record.pendingTransfer.expiresAt).toISOString() }); });
app.post('/api/evidence/:id/transfer', (req, res) => { const record = getRecord(req, res); if (!record) return; const pending = record.pendingTransfer; if (!pending) return res.status(400).json({ error: 'Request a transfer OTP before transferring custody.' }); if (Date.now() > pending.expiresAt) { record.pendingTransfer = null; save(record); return res.status(400).json({ error: 'The transfer OTP has expired.' }); } if (clean(req.body?.recipient) !== pending.recipient || hash(clean(req.body?.otp)) !== pending.otpHash) { recordInvalidTransfer(record, req, 'OTP_VERIFIED_CUSTODY_TRANSFER'); return res.status(401).json({ error: 'Custody transfer blocked: invalid OTP.', evidence: publicRecord(record) }); } const holder = record.custodyHolder; record.custodyHolder = pending.recipient; record.pendingTransfer = null; append(record, { action: 'TRANSFERRED', actor: holder, role: 'Custody Handover', details: `OTP-verified custody transfer to ${record.custodyHolder}.` }); save(record); res.json(publicRecord(record)); });
app.post('/api/evidence/:id/tamper', (req, res) => { const record = getRecord(req, res); if (!record) return; const index = Math.max(0, record.auditChain.length - 1); record.auditChain[index].details = 'Evidence hash deliberately altered for demonstration.'; record.currentHash = hash(`${record.currentHash}:tampered:${Date.now()}`); record.tamperBlockIndex = index; save(record); res.json(publicRecord(record)); });
app.get('/api/evidence/:id/report', (req, res) => { const record = getRecord(req, res); if (record) res.json(report(record)); });
app.use((err, _req, res, _next) => { if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 25 MB upload limit.' }); if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload error: ${err.message}` }); if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON request body.' }); console.error(err); res.status(500).json({ error: 'Internal server error.' }); });

load();
app.listen(PORT, () => console.log(`Sakshya backend listening on http://localhost:${PORT} · SQLite records: ${records.size}`));
