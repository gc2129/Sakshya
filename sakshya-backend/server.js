import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3001;
const records = new Map();

app.use(cors());
app.use(express.json());

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const event = (action, actor, details = '') => ({
  id: crypto.randomUUID(), action, actor, details, at: new Date().toISOString()
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Sakshya API' }));

app.post('/api/evidence/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please select a file.' });
  const id = crypto.randomUUID();
  const digest = hash(req.file.buffer);
  const record = {
    id, name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype,
    originalHash: digest, currentHash: digest, tampered: false,
    timeline: [event('Evidence uploaded', 'Forensic Officer', `SHA-256 sealed: ${digest.slice(0, 16)}…`)]
  };
  records.set(id, record);
  res.status(201).json(publicRecord(record));
});

app.get('/api/evidence/:id', (req, res) => {
  const record = records.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Evidence not found.' });
  res.json(publicRecord(record));
});

app.post('/api/evidence/:id/transfer', (req, res) => {
  const record = records.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Evidence not found.' });
  const recipient = String(req.body?.recipient || 'Investigating Officer');
  record.timeline.push(event('Custody transferred', 'Forensic Officer', `Transferred to ${recipient}`));
  res.json(publicRecord(record));
});

app.post('/api/evidence/:id/tamper', (req, res) => {
  const record = records.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Evidence not found.' });
  record.tampered = true;
  record.currentHash = hash(`${record.currentHash}:tampered:${Date.now()}`);
  record.timeline.push(event('Integrity breach simulated', 'Demo system', 'Evidence hash deliberately altered for demonstration'));
  res.json(publicRecord(record));
});

app.post('/api/evidence/:id/verify', (req, res) => {
  const record = records.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Evidence not found.' });
  const valid = record.originalHash === record.currentHash;
  record.timeline.push(event('Integrity verified', 'Verification engine', valid ? 'Hash match confirmed' : 'ALERT: Hash mismatch detected'));
  res.json({ ...publicRecord(record), valid, message: valid ? 'Evidence integrity verified.' : 'Tampering detected — evidence integrity compromised.' });
});

function publicRecord(record) {
  return { ...record, timeline: [...record.timeline].reverse() };
}

app.listen(PORT, () => console.log(`Sakshya backend listening on http://localhost:${PORT}`));
