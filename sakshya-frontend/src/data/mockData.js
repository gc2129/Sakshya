const now = Date.now();
const minutesAgo = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();

const hash = (seed) => `sha256:${seed.padEnd(64, '0').slice(0, 64)}`;

export const mockDocuments = [
  {
    id: 'DOC-2026-00217',
    docId: 'DOC-2026-00217',
    caseId: 'CASE/DEL/24-1187',
    name: 'Forensic_Seizure_Inventory.pdf',
    description: 'Seizure inventory and initial scene documentation for Case 24-1187.',
    evidenceType: 'Digital Document',
    classification: 'Sensitive',
    size: '4.8 MB',
    status: 'valid',
    chainLength: 5,
    lastActivity: minutesAgo(14),
    chain: [
      { index: 0, action: 'UPLOADED', officer: 'Ananya Rao', badge: 'DL-4172', role: 'Investigating Officer', timestamp: minutesAgo(242), details: 'Evidence package sealed and registered against the case file.', hash: hash('0a7d1f2c'), previousHash: 'GENESIS', verified: true, location: 'South District Evidence Room' },
      { index: 1, action: 'VIEWED', officer: 'Vikram Singh', badge: 'DL-2198', role: 'Senior Authority', timestamp: minutesAgo(188), details: 'Accessed for supervisory review. No changes permitted.', hash: hash('3b12ad90'), previousHash: hash('0a7d1f2c'), verified: true, location: 'DCP Office · South District' },
      { index: 2, action: 'TRANSFERRED', officer: 'Ananya Rao → Meera Joshi', badge: 'DL-4172 → DL-5321', role: 'Custody Handover', timestamp: minutesAgo(122), details: 'Physical custody acknowledged at Central Forensic Laboratory.', hash: hash('7c89ee41'), previousHash: hash('3b12ad90'), verified: true, location: 'CFSL, Rohini · Gate 02' },
      { index: 3, action: 'VIEWED', officer: 'Meera Joshi', badge: 'DL-5321', role: 'Forensic Analyst', timestamp: minutesAgo(62), details: 'Reviewed pages 1–18 and confirmed metadata integrity.', hash: hash('d201ab67'), previousHash: hash('7c89ee41'), verified: true, location: 'CFSL Digital Lab 03' },
      { index: 4, action: 'COURT_ACCESSED', officer: 'Court Reader Office', badge: 'ECOURT-009', role: 'Judiciary Viewer', timestamp: minutesAgo(14), details: 'Read-only access granted for e-court hearing bundle.', hash: hash('f810cc29'), previousHash: hash('d201ab67'), verified: true, location: 'District & Sessions Court · Court 4' },
    ],
  },
  {
    id: 'DOC-2026-00194',
    docId: 'DOC-2026-00194',
    caseId: 'CASE/MUM/24-0874',
    name: 'CCTV_Extract_Block-C.mp4',
    description: 'Certified CCTV extract from Block C, time range 21:00–23:00 hrs.',
    evidenceType: 'Digital Document',
    classification: 'Classified',
    size: '286 MB',
    status: 'valid',
    chainLength: 4,
    lastActivity: minutesAgo(48),
    chain: [
      { index: 0, action: 'UPLOADED', officer: 'Nikhil Deshmukh', badge: 'MH-8044', role: 'Investigating Officer', timestamp: minutesAgo(481), details: 'Original media export received from authorised DVR.', hash: hash('5e102ab9'), previousHash: 'GENESIS', verified: true, location: 'Mumbai Cyber Cell' },
      { index: 1, action: 'VIEWED', officer: 'Kavita Menon', badge: 'MH-3310', role: 'Forensic Analyst', timestamp: minutesAgo(364), details: 'Frame-level review completed; codec and duration confirmed.', hash: hash('a1c667be'), previousHash: hash('5e102ab9'), verified: true, location: 'Maharashtra FSL · Media Lab' },
      { index: 2, action: 'TRANSFERRED', officer: 'Kavita Menon → Arjun Mehta', badge: 'MH-3310 → MH-7120', role: 'Custody Handover', timestamp: minutesAgo(205), details: 'Encrypted media transferred under dual officer confirmation.', hash: hash('b98f054c'), previousHash: hash('a1c667be'), verified: true, location: 'Maharashtra FSL · Secure Vault' },
      { index: 3, action: 'COURT_ACCESSED', officer: 'e-Court Registry', badge: 'ECOURT-014', role: 'Judiciary Viewer', timestamp: minutesAgo(48), details: 'Evidence made available to the presiding bench in read-only mode.', hash: hash('cc62d990'), previousHash: hash('b98f054c'), verified: true, location: 'e-Court Services Gateway' },
    ],
  },
  {
    id: 'DOC-2026-00172',
    docId: 'DOC-2026-00172',
    caseId: 'CASE/KOL/24-0631',
    name: 'Device_Extraction_Report.zip',
    description: 'Mobile device extraction report with examiner notes and manifests.',
    evidenceType: 'Digital Document',
    classification: 'Sensitive',
    size: '19.2 MB',
    status: 'compromised',
    chainLength: 6,
    lastActivity: minutesAgo(91),
    chain: [
      { index: 0, action: 'UPLOADED', officer: 'Sourav Ghosh', badge: 'WB-2901', role: 'Investigating Officer', timestamp: minutesAgo(895), details: 'Extraction report registered after device imaging.', hash: hash('91d2e0a1'), previousHash: 'GENESIS', verified: true, location: 'Kolkata Digital Evidence Cell' },
      { index: 1, action: 'VIEWED', officer: 'Sourav Ghosh', badge: 'WB-2901', role: 'Investigating Officer', timestamp: minutesAgo(771), details: 'Initial review of extraction manifest.', hash: hash('12a8f1c4'), previousHash: hash('91d2e0a1'), verified: true, location: 'Kolkata Digital Evidence Cell' },
      { index: 2, action: 'TRANSFERRED', officer: 'Sourav Ghosh → Priya Nair', badge: 'WB-2901 → WB-9018', role: 'Custody Handover', timestamp: minutesAgo(612), details: 'Transferred to forensic examiner for independent validation.', hash: hash('7880bfde'), previousHash: hash('12a8f1c4'), verified: true, location: 'West Bengal FSL · Intake' },
      { index: 3, action: 'EDITED', officer: 'System Observer', badge: 'AUDIT-000', role: 'Unauthorised Mutation', timestamp: minutesAgo(286), details: 'Evidence description changed outside the custody workflow.', hash: hash('e12c8820'), previousHash: hash('7880bfde'), verified: false, compromised: true, location: 'Unknown endpoint · outside policy' },
      { index: 4, action: 'VIEWED', officer: 'Priya Nair', badge: 'WB-9018', role: 'Forensic Analyst', timestamp: minutesAgo(205), details: 'Accessed after the chain had already diverged.', hash: hash('0f9a122e'), previousHash: hash('e12c8820'), verified: false, compromised: true, location: 'West Bengal FSL · Review Bay' },
      { index: 5, action: 'ALERT_RAISED', officer: 'SAKSHYA Integrity Engine', badge: 'SYSTEM-01', role: 'Automated Monitor', timestamp: minutesAgo(91), details: 'Hash mismatch detected during scheduled integrity scan.', hash: hash('2b44c0fa'), previousHash: hash('0f9a122e'), verified: false, compromised: true, location: 'National Evidence Grid' },
    ],
  },
];

export const activityFeed = [
  { time: minutesAgo(14), tone: 'teal', icon: 'verified', title: 'Chain verification completed', subject: 'DOC-2026-00217', meta: 'E-court bundle · Court 4' },
  { time: minutesAgo(48), tone: 'blue', icon: 'court', title: 'Read-only court access granted', subject: 'DOC-2026-00194', meta: 'e-Court Services Gateway' },
  { time: minutesAgo(91), tone: 'red', icon: 'alert', title: 'Integrity anomaly raised', subject: 'DOC-2026-00172', meta: 'Block 3 · Unauthorised mutation' },
  { time: minutesAgo(122), tone: 'gold', icon: 'transfer', title: 'Custody handover acknowledged', subject: 'DOC-2026-00217', meta: 'Ananya Rao → Meera Joshi' },
  { time: minutesAgo(188), tone: 'blue', icon: 'view', title: 'Supervisory review logged', subject: 'DOC-2026-00217', meta: 'Vikram Singh · DL-2198' },
];

export const anomalyEvents = [
  { id: 'ANM-047', risk: 'high', score: 92, type: 'Repeated access outside assignment', docId: 'DOC-2026-00172', actor: 'Priya Nair · WB-9018', when: 'Today, 02:14 IST', summary: 'Four reads within 11 minutes after the chain reported a divergence.', details: ['Access occurred outside the officer’s assigned case cluster.', 'The device fingerprint was not seen in the prior 30-day baseline.', 'The event followed an unauthorised mutation at block 3.'], status: 'Open' },
  { id: 'ANM-044', risk: 'medium', score: 67, type: 'Unusual location', docId: 'DOC-2026-00217', actor: 'Vikram Singh · DL-2198', when: 'Yesterday, 23:48 IST', summary: 'Access from a registered device outside the declared office geofence.', details: ['Location variance: 18.4 km from DCP Office · South District.', 'Device certificate and session duration remain valid.'], status: 'Under review' },
  { id: 'ANM-041', risk: 'low', score: 34, type: 'Odd hour review', docId: 'DOC-2026-00194', actor: 'Kavita Menon · MH-3310', when: 'Yesterday, 05:26 IST', summary: 'Single access event during a non-standard shift window.', details: ['Officer roster shows an approved early shift.', 'No download, export, or transfer action was observed.'], status: 'Acknowledged' },
];

export const officers = [
  { name: 'Ananya Rao', badge: 'DL-4172', role: 'Investigating Officer', unit: 'South District', status: 'On duty', accesses: 42, lastSeen: '14 min ago', trust: 98 },
  { name: 'Vikram Singh', badge: 'DL-2198', role: 'Senior Authority', unit: 'South District', status: 'On duty', accesses: 27, lastSeen: '18 min ago', trust: 96 },
  { name: 'Meera Joshi', badge: 'DL-5321', role: 'Forensic Analyst', unit: 'CFSL Rohini', status: 'In lab', accesses: 64, lastSeen: '32 min ago', trust: 99 },
  { name: 'Priya Nair', badge: 'WB-9018', role: 'Forensic Analyst', unit: 'WB FSL', status: 'Review required', accesses: 18, lastSeen: '91 min ago', trust: 71 },
];

export const chartData = [
  { day: 'Mon', sealed: 18, verified: 14, alerts: 1 },
  { day: 'Tue', sealed: 25, verified: 21, alerts: 0 },
  { day: 'Wed', sealed: 22, verified: 19, alerts: 1 },
  { day: 'Thu', sealed: 34, verified: 31, alerts: 2 },
  { day: 'Fri', sealed: 29, verified: 27, alerts: 0 },
  { day: 'Sat', sealed: 19, verified: 18, alerts: 1 },
  { day: 'Sun', sealed: 26, verified: 23, alerts: 1 },
];

export function cloneDocuments() {
  return JSON.parse(JSON.stringify(mockDocuments));
}

export function documentFromApi(record) {
  if (!record) return null;
  const id = record.docId || record.id || `DOC-${Date.now()}`;
  const sourceTimeline = record.chain || record.timeline || [];
  const chain = sourceTimeline.map((entry, index) => ({
    index: entry.index ?? index,
    action: entry.action || entry.data?.action || 'VIEWED',
    officer: entry.officer || entry.actor || entry.data?.officerName || 'Authorised Officer',
    badge: entry.badge || entry.officerBadge || entry.data?.officerBadge || '—',
    role: entry.role || 'Custody Officer',
    timestamp: entry.timestamp || entry.at || new Date().toISOString(),
    details: entry.details || entry.description || entry.data?.description || 'Custody action recorded.',
    hash: entry.currentHash || entry.hash || record.currentHash || hash(id),
    previousHash: entry.previousHash || 'GENESIS',
    verified: entry.verified !== false && !record.tampered,
    compromised: Boolean(entry.compromised || record.tampered),
    location: entry.location || 'Registered evidence facility',
  }));
  return {
    id,
    docId: id,
    caseId: record.caseId || 'CASE/UNASSIGNED',
    name: record.name || record.fileName || 'Evidence record',
    description: record.description || 'Registered evidence record.',
    evidenceType: record.evidenceType || 'Digital Document',
    classification: record.classification || 'Sensitive',
    size: record.size ? `${Math.round(record.size / 1024)} KB` : '—',
    status: record.tampered ? 'compromised' : 'valid',
    chainLength: chain.length || record.chainLength || 1,
    lastActivity: chain.at(-1)?.timestamp || new Date().toISOString(),
    chain,
  };
}
