import { Component, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, HashRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import Joyride from 'react-joyride';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileJson,
  FilePlus2,
  FileText,
  Fingerprint,
  Info,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  Network,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UploadCloud,
  UserCheck,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api, isApiUnavailable, setAuthInvalidatedHandler } from './lib/api';
import { clearAuthSession, hasPermission, permissionsFor, readAuthSession, roles, saveAuthSession } from './lib/auth';
import { AppShell } from './components/Shell';
import { ForensicComparisonVaultPage } from './components/ForensicComparisonVault';
import {
  EmptyState,
  HashChainVisualizer,
  HashChip,
  IntegrityMeter,
  LoadingSkeleton,
  Modal,
  OfficialSeal,
  PageHeader,
  RiskBadge,
  SectionEyebrow,
  StatsCard,
  StatusBadge,
  TimelineComponent,
  VerificationResult,
  cn,
  CopyableValue,
  formatShortTime,
  formatTime,
  motionProps,
  relativeTime,
  shortHash,
} from './components/ui';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

// Hash routing keeps every screen refreshable on a static GitHub Pages host.
// Local development continues to use clean browser URLs.
const Router = window.location.hostname.endsWith('github.io') ? HashRouter : BrowserRouter;

function formatEvidenceSize(value) {
  if (typeof value === 'string') return value;
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function normalizeDocument(record) {
  if (!record || typeof record !== 'object') return null;
  const id = record.id || record.docId;
  if (!id) return null;
  const sourceChain = Array.isArray(record.chain)
    ? record.chain
    : Array.isArray(record.timeline) ? [...record.timeline].reverse() : [];
  const chain = sourceChain.map((entry, index) => ({
    ...entry,
    index: Number.isInteger(entry.index) ? entry.index : index,
    action: entry.action || 'CUSTODY_EVENT',
    officer: entry.officer || entry.actor || 'Authorised Officer',
    badge: entry.badge || '—',
    role: entry.role || 'Authorised Officer',
    timestamp: entry.timestamp || entry.at || record.createdAt,
    details: entry.details || 'Custody action recorded.',
    hash: entry.hash || (entry.eventHash ? `sha256:${entry.eventHash}` : '—'),
    previousHash: entry.previousHash || 'GENESIS',
  }));
  const status = record.status === 'compromised' || record.valid === false || record.tampered
    ? 'compromised'
    : record.status === 'valid' || record.valid === true ? 'valid' : 'pending';
  return {
    ...record,
    id,
    docId: record.docId || id,
    name: record.name || record.fileName || id,
    size: formatEvidenceSize(record.size),
    chain,
    chainLength: chain.length,
    lastActivity: record.lastActivity || chain.at(-1)?.timestamp || record.createdAt,
    status,
  };
}

function verificationFromRecord(record) {
  if (!record) return null;
  const invalid = record.valid === false || record.status === 'compromised' || record.tampered === true;
  const valid = record.valid === true || (!invalid && record.status === 'valid');
  if (!valid && !invalid) return null;
  return {
    valid,
    brokenAtIndex: valid ? null : Number.isInteger(record.brokenAtIndex) ? record.brokenAtIndex : record.tamperBlockIndex ?? null,
    details: record.details || record.message || (valid
      ? 'The backend reports a matching evidence hash and audit chain.'
      : 'The backend reports an evidence hash or audit-chain mismatch.'),
  };
}

function activityFeedFromDocuments(documents) {
  return documents.flatMap((document) => (document.chain || []).map((entry) => {
    const action = String(entry.action || '').toUpperCase();
    const compromised = entry.compromised || entry.verified === false || document.status === 'compromised';
    return {
      title: action.replaceAll('_', ' ') || 'Custody event',
      subject: document.docId,
      meta: `${entry.officer || 'Authorised Officer'} · ${entry.badge || '—'}`,
      time: entry.timestamp,
      tone: compromised ? 'alert' : action === 'TRANSFERRED' ? 'transfer' : action === 'COURT_ACCESSED' ? 'court' : action === 'VERIFIED' ? 'verified' : 'default',
      icon: compromised ? 'alert' : action === 'TRANSFERRED' ? 'transfer' : action === 'COURT_ACCESSED' ? 'court' : action === 'VERIFIED' ? 'verified' : 'activity',
    };
  })).filter((item) => item.time).sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);
}

function chartDataFromDocuments(documents) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      day: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      dateKey: date.toISOString().slice(0, 10),
      sealed: 0,
      verified: 0,
      alerts: 0,
    };
  });
  const byDate = new Map(days.map((day) => [day.dateKey, day]));
  documents.forEach((document) => (document.chain || []).forEach((entry) => {
    const bucket = byDate.get(new Date(entry.timestamp).toISOString().slice(0, 10));
    if (!bucket) return;
    const action = String(entry.action || '').toUpperCase();
    if (action === 'UPLOADED') bucket.sealed += 1;
    if (action === 'VERIFIED') bucket.verified += 1;
    if (entry.compromised || entry.verified === false || document.status === 'compromised') bucket.alerts += 1;
  }));
  return days.map(({ dateKey, ...day }) => day);
}

function anomalyEventsFromDocuments(documents) {
  const events = [];
  documents.forEach((document) => {
    const flags = document.anomalyFlags || {};
    const incidents = Array.isArray(document.securityIncidents) ? document.securityIncidents : [];
    incidents.forEach((incident) => {
      const timestamp = incident.timestamp || document.lastActivity;
      const rawSeverity = incident.severity || incident.risk || incident.riskLevel;
      const severity = ['critical', 'high', 'medium', 'low'].includes(String(rawSeverity || '').toLowerCase())
        ? String(rawSeverity).toLowerCase()
        : 'review';
      const rawScore = incident.riskScore;
      const score = rawScore !== undefined && rawScore !== null && Number.isFinite(Number(rawScore))
        ? Number(rawScore)
        : null;
      const trace = incident.networkOriginContext || {};
      const sourceNetwork = incident.sourceNetwork || trace.sourceNetwork || 'Not supplied';
      const deviceContext = incident.deviceContext || trace.deviceContext || incident.deviceMetadata || 'Not supplied';
      const locationContext = incident.locationContext || trace.locationContext || incident.authorisedActionLocation || 'Not voluntarily shared';
      const networkOrigin = trace.networkOrigin || 'Not supplied';
      const rawStatus = String(incident.status || 'OPEN').toUpperCase();
      events.push({
        docId: document.docId,
        id: incident.id || `${document.docId}-INCIDENT-${timestamp}`,
        score,
        risk: severity,
        type: incident.rule || 'Security incident',
        actor: 'SAKSHYA Security Monitor',
        timestamp,
        when: relativeTime(timestamp),
        status: rawStatus === 'OPEN' ? 'Open' : rawStatus === 'ESCALATED' ? 'Escalated' : 'Resolved',
        summary: incident.summary || 'A security rule blocked or flagged an action on this evidence record.',
        details: [
          `Attempted action: ${incident.attemptedAction || 'Not supplied'}`,
          `Source network: ${sourceNetwork}`,
          `Network origin: ${networkOrigin}`,
          `Device context: ${deviceContext}`,
          `Voluntarily shared location: ${locationContext}`,
        ],
        incident,
      });
    });

    const base = { docId: document.docId, timestamp: document.lastActivity, when: relativeTime(document.lastActivity), status: 'Open' };
    if (flags.brokenAuditChain) events.push({ ...base, id: `${document.docId}-CHAIN`, score: null, risk: 'critical', type: 'Broken audit chain', actor: 'Integrity engine', summary: 'A linked custody event no longer matches the cryptographic chain.', details: ['Previous-hash pointer or event fingerprint failed verification.', `Review block ${document.tamperBlockIndex ?? '—'} before court submission.`] });
    if (flags.hashMismatch) events.push({ ...base, id: `${document.docId}-HASH`, score: null, risk: 'critical', type: 'Evidence hash mismatch', actor: 'Integrity engine', summary: 'The current evidence digest differs from the sealed source digest.', details: ['Current SHA-256 does not equal the original SHA-256.', 'Treat the evidence as compromised until reviewed.'] });
    if (flags.intrusionAttempt && !incidents.length) events.push({ ...base, id: `${document.docId}-OTP`, score: null, risk: 'high', type: 'Blocked custody attempt', actor: 'SAKSHYA Security Monitor', summary: 'A custody transfer was blocked after invalid confirmation credentials.', details: ['The backend reported an invalid transfer confirmation.', 'Senior authority review is required.'] });
    if (flags.offHoursActivity) events.push({ ...base, id: `${document.docId}-HOURS`, score: null, risk: 'medium', type: 'Off-hours activity', actor: 'Rule-based monitor', summary: 'At least one custody event occurred outside the normal operating window.', details: ['Event time was outside 06:00–20:00 UTC.', 'Confirm the activity against the case diary and duty roster.'] });
  });
  return events.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function officerStatsFromDocuments(documents) {
  const byOfficer = new Map();
  documents.forEach((document) => (document.chain || []).forEach((entry) => {
    const name = entry.officer || 'Authorised Officer';
    const current = byOfficer.get(name) || { name, badge: entry.badge || '—', role: entry.role || 'Custody Officer', accesses: 0, lastSeen: entry.timestamp, review: false };
    current.accesses += 1;
    current.badge = current.badge === '—' ? (entry.badge || '—') : current.badge;
    if (new Date(entry.timestamp) > new Date(current.lastSeen)) current.lastSeen = entry.timestamp;
    if (document.status === 'compromised' || entry.compromised || entry.verified === false) current.review = true;
    byOfficer.set(name, current);
  }));
  return [...byOfficer.values()].sort((a, b) => b.accesses - a.accesses).map((officer) => ({
    ...officer,
    unit: officer.role || 'Custody operations',
    lastSeen: relativeTime(officer.lastSeen),
    status: officer.review ? 'Review required' : 'Active',
  }));
}

const authProfiles = [
  { role: roles.investigatingOfficer, username: 'investigator', password: 'demo-investigator-2026', description: 'Seal evidence and manage assigned custody.' },
  { role: roles.forensicAnalyst, username: 'analyst', password: 'demo-analyst-2026', description: 'Verify integrity and prepare reports.' },
  { role: roles.seniorAuthority, username: 'authority', password: 'demo-authority-2026', description: 'Review incidents and run controlled demos.' },
  { role: roles.courtViewer, username: 'court', password: 'demo-court-2026', description: 'Read-only verification and court review.' },
  { role: roles.systemAdmin, username: 'admin', password: 'demo-admin-2026', description: 'Manage authorised users and devices.' },
];

const permissionLabels = {
  upload: 'seal new evidence',
  verify: 'verify cryptographic integrity',
  action: 'append custody actions',
  transfer: 'transfer custody',
  tamper: 'run the controlled tamper demonstration',
  report: 'generate forensic reports',
  incidents: 'review security incidents',
  admin: 'manage system administration',
  vault: 'open the forensic comparison vault',
};

function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('sakshya-theme') || 'light');
  const [highContrast, setHighContrast] = useState(() => window.localStorage.getItem('sakshya-contrast') === 'true');
  const [session, setSession] = useState(() => readAuthSession());
  const [authStatus, setAuthStatus] = useState('checking');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [backendError, setBackendError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completedReports, setCompletedReports] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [authProbe, setAuthProbe] = useState(0);
  const permissions = permissionsFor(session?.user?.role);
  const apiOnline = backendStatus === 'online' && authStatus === 'signed-in';

  useEffect(() => {
    window.localStorage.setItem('sakshya-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('sakshya-contrast', String(highContrast));
  }, [highContrast]);

  useEffect(() => setAuthInvalidatedHandler(() => {
    clearAuthSession();
    setSession(null);
    setDocuments([]);
    setAuthStatus('sign-in-required');
    setAuthError('Your backend session has expired or is no longer valid. Sign in again.');
    setBackendStatus('online');
    setBackendError('');
    setLoading(false);
  }), []);

  useEffect(() => {
    let active = true;
    async function establishSession() {
      setAuthStatus('checking');
      setBackendStatus('checking');
      setLoading(Boolean(readAuthSession()?.token));

      try {
        const health = await api.getHealth();
        if (!active) return;
        setBackendStatus(health?.ok === false ? 'offline' : 'online');
        setBackendError(health?.ok === false ? 'The SAKSHYA backend reported an unhealthy state.' : '');
      } catch (error) {
        if (active) {
          setBackendStatus('offline');
          setBackendError(error.message || 'The SAKSHYA backend could not be reached.');
          setAuthStatus(session?.token ? 'offline' : 'sign-in-required');
          setLoading(false);
        }
        return;
      }

      if (!active) return;
      const stored = readAuthSession();
      if (!stored?.token) {
        setSession(null);
        setAuthStatus('sign-in-required');
        setLoading(false);
        return;
      }

      try {
        const remote = await api.getCurrentUser();
        const currentUser = remote?.user || remote;
        if (!currentUser?.role) throw new Error('The authentication service returned no officer profile.');
        const next = { ...stored, user: currentUser };
        saveAuthSession(next);
        if (active) {
          setSession(next);
          setAuthStatus('signed-in');
          setAuthError('');
        }
      } catch (error) {
        if (active) {
          if (isApiUnavailable(error)) {
            setBackendStatus('offline');
            setBackendError(error.message || 'The backend could not validate the saved session.');
            setAuthStatus('offline');
          } else {
            clearAuthSession();
            setSession(null);
            setAuthStatus('sign-in-required');
            setAuthError(error.status === 401
              ? 'Your previous backend session is no longer valid. Sign in again.'
              : error.message || 'The saved session could not be validated.');
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    establishSession();
    return () => { active = false; };
  }, [authProbe, session?.token]);

  useEffect(() => {
    if (authStatus !== 'signed-in' || !session?.token) {
      setDocuments([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    async function sync() {
      try {
        const health = await api.getHealth();
        const remote = await api.getAllDocuments();
        const list = Array.isArray(remote) ? remote : remote?.documents || remote?.data;
        const mapped = Array.isArray(list) ? list.map(normalizeDocument).filter(Boolean) : [];
        if (active) {
          setDocuments(mapped);
          setBackendStatus(health?.ok === false ? 'offline' : 'online');
          setBackendError(health?.ok === false ? 'The SAKSHYA backend reported an unhealthy state.' : '');
          setLastSync(new Date());
          setLoading(false);
        }
      } catch (error) {
        if (!active) return;
        if (isApiUnavailable(error)) {
          setBackendStatus('offline');
          setBackendError(error.message || 'The evidence API could not be reached.');
        } else {
          setBackendStatus('online');
          setBackendError('');
        }
        setLoading(false);
      }
    }

    setLoading(true);
    sync();
    const interval = window.setInterval(sync, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [authStatus, session?.token, refreshToken]);

  function markBackendSuccess() {
    setBackendStatus('online');
    setBackendError('');
    setLastSync(new Date());
  }

  function markBackendFailure(error) {
    if (isApiUnavailable(error)) {
      setBackendStatus('offline');
      setBackendError(error.message || 'The evidence API could not be reached.');
    }
  }

  async function signIn(credentials) {
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await api.login(credentials);
      const next = saveAuthSession(result);
      setSession(next);
      setDocuments([]);
      setBackendStatus('online');
      setBackendError('');
      setAuthStatus('checking');
      toast.success('Backend session issued. Validating officer profile…');
    } catch (error) {
      if (isApiUnavailable(error)) {
        setBackendStatus('offline');
        setBackendError(error.message || 'The SAKSHYA backend could not be reached.');
      } else {
        setBackendStatus('online');
        setAuthError(error.message || 'Sign-in was not accepted by the backend.');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut() {
    api.logout();
    clearAuthSession();
    setSession(null);
    setDocuments([]);
    setLastSync(null);
    setAuthError('');
    setBackendError('');
    setAuthStatus('checking');
    setBackendStatus('checking');
    setLoading(true);
    setAuthProbe((value) => value + 1);
  }

  async function uploadDocument(payload) {
    try {
      const remote = await api.uploadDocument(payload);
      const created = normalizeDocument(remote);
      if (!created) throw new Error('The evidence API returned an unreadable record.');
      setDocuments((current) => [created, ...current]);
      markBackendSuccess();
      return created;
    } catch (error) {
      markBackendFailure(error);
      throw error;
    }
  }

  async function addAction(docId, actionData) {
    const current = documents.find((document) => document.docId === docId);
    if (!current) throw new Error('Document not found.');
    try {
      const remote = await api.addAction(docId, actionData);
      const updated = normalizeDocument(remote);
      if (!updated) throw new Error('The evidence API returned an unreadable chain.');
      setDocuments((currentDocuments) => currentDocuments.map((document) => document.docId === docId ? updated : document));
      markBackendSuccess();
      return updated;
    } catch (error) {
      const incidentRecord = normalizeDocument(error.payload?.evidence);
      if (incidentRecord) {
        setDocuments((currentDocuments) => currentDocuments.map((document) => document.docId === docId ? incidentRecord : document));
        setBackendStatus('online');
        setLastSync(new Date());
      } else {
        markBackendFailure(error);
      }
      throw error;
    }
  }

  async function requestTransferOtp(evidenceId, recipient) {
    try {
      const result = await api.requestTransferOtp(evidenceId, recipient);
      markBackendSuccess();
      return result;
    } catch (error) {
      markBackendFailure(error);
      throw error;
    }
  }

  async function completeTransfer(evidenceId, recipient, otp) {
    try {
      const remote = await api.transferEvidence(evidenceId, { recipient, otp });
      const updated = normalizeDocument(remote);
      if (!updated) throw new Error('The evidence API returned an unreadable custody record.');
      setDocuments((currentDocuments) => currentDocuments.map((document) => document.docId === evidenceId ? updated : document));
      markBackendSuccess();
      return updated;
    } catch (error) {
      const incidentRecord = normalizeDocument(error.payload?.evidence);
      if (incidentRecord) {
        setDocuments((currentDocuments) => currentDocuments.map((document) => document.docId === evidenceId ? incidentRecord : document));
        setBackendStatus('online');
        setLastSync(new Date());
      } else {
        markBackendFailure(error);
      }
      throw error;
    }
  }

  async function verifyDocument(docId) {
    const document = documents.find((item) => item.docId === docId);
    if (!document) return { valid: false, details: 'Document not found.' };
    try {
      const remote = await api.verifyChain(docId);
      const updated = normalizeDocument(remote);
      const result = {
        valid: typeof remote?.valid === 'boolean' ? remote.valid : updated?.valid === true,
        brokenAtIndex: Number.isInteger(remote?.brokenAtIndex) ? remote.brokenAtIndex : null,
        details: remote?.details || remote?.message || 'Verification completed by the SAKSHYA backend.',
      };
      if (updated) setDocuments((current) => current.map((item) => item.docId === docId ? updated : item));
      markBackendSuccess();
      return result;
    } catch (error) {
      markBackendFailure(error);
      throw error;
    }
  }

  async function tamperDocument(docId, blockIndex, fakeData) {
    const document = documents.find((item) => item.docId === docId);
    if (!document) throw new Error('Document not found.');
    try {
      const remote = await api.simulateTamper(docId, blockIndex, fakeData);
      const updated = normalizeDocument(remote);
      if (!updated) throw new Error('The evidence API returned an unreadable chain.');
      setDocuments((current) => current.map((item) => item.docId === docId ? updated : item));
      markBackendSuccess();
      return updated;
    } catch (error) {
      markBackendFailure(error);
      throw error;
    }
  }

  function markReportGenerated(docId) {
    if (!docId) return;
    setCompletedReports((current) => current.includes(docId) ? current : [...current, docId]);
  }

  const workspace = authStatus === 'signed-in' && session?.user ? (
    <AppShell
      theme={theme}
      onThemeChange={setTheme}
      highContrast={highContrast}
      onContrastChange={() => setHighContrast((value) => !value)}
      apiOnline={apiOnline}
      apiError={backendError}
      lastSync={lastSync}
      documents={documents}
      user={session.user}
      permissions={permissions}
      onLogout={signOut}
    >
      <Routes>
        <Route path="/" element={<LandingPage documents={documents} apiOnline={apiOnline} permissions={permissions} />} />
        <Route path="/dashboard" element={<DashboardPage documents={documents} onRefresh={() => setRefreshToken((value) => value + 1)} lastSync={lastSync} loading={loading} apiOnline={apiOnline} apiError={backendError} permissions={permissions} />} />
        <Route path="/document/:docId" element={<DocumentDetailPage documents={documents} onAddAction={addAction} onVerify={verifyDocument} onTamper={tamperDocument} permissions={permissions} user={session.user} />} />
        <Route path="/upload" element={<RoleGate user={session.user} permission="upload"><UploadPage onUpload={uploadDocument} apiOnline={apiOnline} apiError={backendError} user={session.user} /></RoleGate>} />
        <Route path="/verify" element={<RoleGate user={session.user} permission="verify"><VerifyPage documents={documents} onVerify={verifyDocument} apiOnline={apiOnline} apiError={backendError} permissions={permissions} /></RoleGate>} />
        <Route path="/demo" element={<RoleGate user={session.user} permission="tamper"><DemoPage documents={documents} onTamper={tamperDocument} onVerify={verifyDocument} reportIds={completedReports} canVerify={Boolean(permissions.verify)} canUpload={Boolean(permissions.upload)} /></RoleGate>} />
        <Route path="/transfer" element={<RoleGate user={session.user} permission="transfer"><TransferPage documents={documents} onRequestTransferOtp={requestTransferOtp} onTransfer={completeTransfer} apiOnline={apiOnline} permissions={permissions} /></RoleGate>} />
        <Route path="/anomalies" element={<RoleGate user={session.user} permission="incidents"><AnomaliesPage documents={documents} /></RoleGate>} />
        <Route path="/reports" element={<RoleGate user={session.user} permission="report"><ReportsPage documents={documents} onReportGenerated={markReportGenerated} apiOnline={apiOnline} apiError={backendError} /></RoleGate>} />
        <Route path="/vault" element={<RoleGate user={session.user} permission="vault"><ForensicComparisonVaultPage documents={documents} apiOnline={apiOnline} apiError={backendError} /></RoleGate>} />
        <Route path="/admin" element={<RoleGate user={session.user} permission="admin"><AdminPage documents={documents} apiOnline={apiOnline} apiError={backendError} /></RoleGate>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  ) : null;

  return (
    <Router>
      <Toaster position="bottom-right" toastOptions={{ duration: 3400, style: { background: theme === 'dark' ? '#13233a' : '#0A2540', color: '#fff', borderRadius: '8px', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px' } }} />
      <AppErrorBoundary>
        {authStatus === 'checking' ? <AuthLoadingScreen backendStatus={backendStatus} /> : workspace || <LoginPage backendStatus={backendStatus} backendError={backendError} error={authError} busy={authBusy} onLogin={signIn} onRetry={() => { setAuthError(''); setAuthProbe((value) => value + 1); }} />}
      </AppErrorBoundary>
    </Router>
  );
}

function AuthLoadingScreen({ backendStatus }) {
  const status = backendStatus === 'offline' ? 'offline' : 'pending';
  const label = backendStatus === 'offline' ? 'Backend offline' : 'Checking secure backend session';
  return <main className="auth-loading"><div className="auth-loading__mark"><OfficialSeal /></div><SectionEyebrow icon={LockKeyhole}>SAKSHYA SECURE ACCESS</SectionEyebrow><h1>Establishing a trusted session</h1><p>Checking the live evidence node and validating your backend-issued officer session.</p><StatusBadge status={status} label={label} pulse={backendStatus === 'checking'} /></main>;
}

function LoginPage({ backendStatus, backendError, error, busy, onLogin, onRetry }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('');
  const backendOnline = backendStatus === 'online';
  const statusLabel = backendStatus === 'online'
    ? 'Backend online · sign-in required'
    : backendStatus === 'offline'
      ? 'Backend offline'
      : 'Connecting to SAKSHYA backend…';

  function chooseProfile(profile) {
    setSelectedProfile(profile.username);
    setCredentials({ username: profile.username, password: profile.password });
    setShowPassword(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (!credentials.username.trim() || !credentials.password) return;
    await onLogin({ username: credentials.username.trim(), password: credentials.password });
  }

  return <main className="auth-screen">
    <section className="auth-brand-panel">
      <div className="auth-brand-panel__top"><OfficialSeal /><span>Government of India<br /><strong>Ministry of Home Affairs</strong></span></div>
      <div className="auth-brand-panel__copy"><SectionEyebrow icon={Fingerprint}>NATIONAL EVIDENCE GRID</SectionEyebrow><h1>SAKSHYA</h1><p>Digital Evidence Integrity Platform</p><div className="auth-rule" /><h2>Custody you can prove.</h2><span>Every upload, handover and verification is recorded as a cryptographically linked event for authorised review.</span></div>
      <div className="auth-brand-panel__facts"><span><ShieldCheck size={15} /> SHA-256 evidence sealing</span><span><LockKeyhole size={15} /> Role-bound access controls</span><span><BadgeCheck size={15} /> Court-ready audit records</span></div>
      <div className="auth-brand-panel__footer"><span>SIH26190 · Smart India Hackathon 2026</span><span>Restricted system · Prototype environment</span></div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-form-panel__inner">
        <div className="auth-status-row"><span className={cn('auth-status-dot', 'auth-status-dot--' + backendStatus)} /><strong>{statusLabel}</strong>{!backendOnline && <button className="text-button" type="button" onClick={onRetry}><RefreshCw size={14} />Retry</button>}</div>
        <div className="auth-form-header"><SectionEyebrow icon={UserRound}>AUTHORISED OPERATOR ACCESS</SectionEyebrow><h2>Sign in to command centre</h2><p>Use an account issued by the SAKSHYA backend. Your password is never stored in this browser.</p></div>
        {(error || backendError) && <div className="auth-error" role="alert"><ShieldAlert size={17} /><div><strong>{error ? 'Sign-in not accepted' : 'Evidence node unavailable'}</strong><span>{error || backendError}</span></div></div>}
        <form className="auth-form" onSubmit={submit}>
          <label className="form-field"><span>Username<i>*</i></span><div className="auth-input-wrap"><UserRound size={16} /><input autoComplete="username" value={credentials.username} onChange={(event) => { setSelectedProfile(''); setCredentials({ ...credentials, username: event.target.value }); }} placeholder="Enter authorised username" required /></div></label>
          <label className="form-field"><span>Password<i>*</i></span><div className="auth-input-wrap"><LockKeyhole size={16} /><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={credentials.password} onChange={(event) => { setSelectedProfile(''); setCredentials({ ...credentials, password: event.target.value }); }} placeholder="Enter backend password" required /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
          <button className="button button--primary button--full auth-submit" type="submit" disabled={busy || !backendOnline}>{busy ? <LoaderCircle size={17} className="spin" /> : <LogIn size={17} />}{busy ? 'Authenticating…' : backendOnline ? 'Sign in securely' : 'Waiting for backend'}</button>
        </form>
        <div className="auth-divider"><span>DEMO ACCESS PROFILES</span></div>
        <div className="auth-profiles">{authProfiles.map((profile) => <button className={cn('auth-profile', selectedProfile === profile.username && 'auth-profile--selected')} type="button" key={profile.username} onClick={() => chooseProfile(profile)}><span className="auth-profile__icon"><UserCheck size={15} /></span><span><strong>{profile.role}</strong><small>{profile.description}</small></span><code>{profile.username}</code></button>)}</div>
        <p className="auth-footnote"><LockKeyhole size={13} /> Session token is signed by the backend and expires after eight hours. Demo passwords are for the local prototype only.</p>
      </div>
    </section>
  </main>;
}

function RoleGate({ user, permission, children }) {
  if (hasPermission(user, permission)) return children;
  return <PermissionDenied permission={permission} />;
}

function PermissionDenied({ permission }) {
  return <section className="permission-page" role="alert"><div className="permission-page__icon"><ShieldAlert size={25} /></div><SectionEyebrow icon={LockKeyhole}>ROLE-BOUND ACTION</SectionEyebrow><h1>You do not have permission</h1><p>Your current backend role is not authorised to {permissionLabels[permission] || 'use this area'}. Sign in with an approved role or ask a Senior Authority to review access.</p><div className="permission-page__meta"><span>Backend policy response</span><strong>403 · access denied</strong></div></section>;
}

function actionErrorMessage(error, fallback) {
  if (error?.status === 403) return 'You do not have permission to perform this action with the current backend role.';
  return error?.message || fallback;
}

function BackendActionError({ message }) {
  if (!message) return null;
  return <div className="backend-action-error" role="alert"><ShieldAlert size={17} /><div><strong>{message.includes('permission') ? 'Role policy blocked this action' : 'Action could not be completed'}</strong><span>{message}</span></div></div>;
}

function LandingPage({ documents, apiOnline, permissions = {} }) {
  const valid = documents.filter((document) => document.status === 'valid').length;
  const compromised = documents.filter((document) => document.status === 'compromised').length;
  const leadDocument = documents[0];
  const leadStatus = !apiOnline ? 'offline' : leadDocument?.status === 'compromised' ? 'compromised' : leadDocument?.status === 'valid' ? 'verified' : 'pending';
  const leadLink = leadDocument ? `/document/${encodeURIComponent(leadDocument.docId)}` : permissions.upload ? '/upload' : '/dashboard';
  return <div className="landing-page">
    <motion.section className="landing-hero" {...motionProps(0.03)}>
      <div className="landing-hero__copy"><div className="hero-official"><span className="hero-official__line" /><span>Government of India · Ministry of Home Affairs</span></div><h1>Custody you can <span>prove.</span></h1><p className="landing-hero__lead">SAKSHYA is a secure digital evidence and document custody grid that turns every handover, review and court access into a verifiable chain of record.</p><div className="hero-actions"><Link to="/dashboard" className="button button--primary">Open command centre <ArrowRight size={16} /></Link>{permissions.tamper && <Link to="/demo" className="button button--ghost">See the tamper demo <Network size={16} /></Link>}</div><div className="hero-trust"><span><ShieldCheck size={14} /> SHA-256 linked records</span><span><LockKeyhole size={14} /> Restricted access control</span><span><BadgeCheck size={14} /> Court-ready audit trail</span></div></div>
      <div className="landing-hero__visual"><div className="hero-grid-lines" /><div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" /><div className="hero-node hero-node--main"><div className="hero-node__top"><span className="hero-node__signal"><span /> LIVE INTEGRITY ENGINE</span><Fingerprint size={24} /></div><strong>{leadDocument ? <>Evidence<br />remains intact.</> : <>Awaiting<br />live evidence.</>}</strong><div className="hero-node__footer"><span>chain state</span><StatusBadge status={leadStatus} label={leadDocument ? (apiOnline ? leadStatus.toUpperCase() : 'OFFLINE SNAPSHOT') : 'AWAITING API'} pulse={leadStatus === 'verified'} /></div></div><div className="hero-mini-node hero-mini-node--a"><span>{leadDocument ? `BLOCK ${String(Math.max(leadDocument.chain.length - 1, 0)).padStart(2, '0')}` : 'NO BLOCK'}</span><code>{shortHash(leadDocument?.chain?.at(-1)?.hash)}</code></div><div className="hero-mini-node hero-mini-node--b"><span>HASH LINK</span><Link2 size={15} /></div><div className="hero-connector hero-connector--a" /><div className="hero-connector hero-connector--b" /></div>
    </motion.section>
    <section className="landing-stats"><div><span className="landing-stats__value">{documents.length || 0}</span><span className="landing-stats__label">Evidence records</span></div><div><span className="landing-stats__value">{valid}</span><span className="landing-stats__label">Verified chains</span></div><div className={compromised ? 'landing-stats__alert' : ''}><span className="landing-stats__value">{compromised}</span><span className="landing-stats__label">Compromised</span></div><div><span className="landing-stats__value">{apiOnline ? 'ONLINE' : 'OFFLINE'}</span><span className="landing-stats__label">Backend status</span></div></section>
    <section className="landing-section"><div className="landing-section__heading"><div><SectionEyebrow icon={Activity}>WHY SAKSHYA</SectionEyebrow><h2>Evidence history that stands up to scrutiny.</h2></div><p>Built for the operational reality of law enforcement and the evidentiary standards of the judiciary.</p></div><div className="landing-feature-grid"><FeatureCard icon={Fingerprint} number="01" title="Seal once. Verify forever." text="Each custody event is linked to the previous record using a SHA-256 fingerprint, making unauthorised changes mathematically visible." /><FeatureCard icon={Users} number="02" title="Accountability at every handover." text="Officer identity, badge, location and time are recorded together so responsibility never gets lost between departments." /><FeatureCard icon={FileCheck2} number="03" title="Court-ready by design." text="Generate an official report with signatures, timestamps and cryptographic proof for judicial review." /></div></section>
    <section className="landing-chain-section"><div className="landing-section__heading"><div><SectionEyebrow icon={Network}>LIVE SYSTEM MODEL</SectionEyebrow><h2>A transparent chain for an invisible guarantee.</h2></div><Link to={leadLink} className="text-link">{leadDocument ? 'Explore a custody record' : 'Register the first record'} <ArrowUpRight size={15} /></Link></div><HashChainVisualizer chain={leadDocument?.chain?.slice(0, 4) || []} compact /></section>
    <div className="landing-cta"><div><SectionEyebrow icon={Building2}>NATIONAL EVIDENCE GRID</SectionEyebrow><h2>Make every record defensible.</h2><p>SAKSHYA is a Smart India Hackathon 2026 prototype for SIH26190 · Ministry of Home Affairs.</p></div>{permissions.upload && <Link to="/upload" className="button button--light">Seal new evidence <FilePlus2 size={16} /></Link>}</div>
  </div>;
}

function FeatureCard({ icon: Icon, number, title, text }) {
  return <motion.article className="feature-card" {...motionProps(Number(number) * 0.04)}><div className="feature-card__top"><span className="feature-card__icon"><Icon size={19} /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p><ArrowUpRight className="feature-card__arrow" size={17} /></motion.article>;
}

function DashboardPage({ documents, onRefresh, lastSync, loading, apiOnline, apiError, permissions = {} }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const validCount = documents.filter((document) => document.status === 'valid').length;
  const compromisedCount = documents.filter((document) => document.status === 'compromised').length;
  const pendingActions = documents.filter((document) => document.status === 'pending').length;
  const openAlerts = anomalyEventsFromDocuments(documents).filter((event) => event.status === 'Open').length;
  const totalBlocks = documents.reduce((sum, document) => sum + document.chain.length, 0);
  const activityFeed = activityFeedFromDocuments(documents);
  const chartData = chartDataFromDocuments(documents);
  const filtered = documents.filter((document) => {
    const officers = (document.chain || []).flatMap((entry) => [entry.officer, entry.badge]).join(' ');
    const matchesQuery = `${document.docId} ${document.caseId} ${document.name} ${document.classification} ${officers}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'all' || document.status === filter);
  });
  const filterLabel = filter === 'all' ? 'All records' : filter === 'valid' ? 'Verified records' : filter === 'compromised' ? 'Records with alerts' : 'Pending records';
  const toneFor = { alert: 'red', transfer: 'blue', court: 'teal', verified: 'teal', default: 'blue' };

  return (
    <div className="dashboard-page">
      <DemoFlowStrip permissions={permissions} apiOnline={apiOnline} />
      <PageHeader eyebrow="OPERATIONS OVERVIEW" icon={LayoutIcon} title="Command centre" description="Live custody posture across the secure evidence register." actions={<><button className="button button--secondary" type="button" onClick={() => { onRefresh(); toast.success('Evidence register refresh requested.'); }}><RefreshCw size={15} />Refresh register</button>{permissions.upload && <Link className="button button--primary" to="/upload"><FilePlus2 size={15} />Seal evidence</Link>}</>} />
      {!loading && !apiOnline && <OfflineBanner message={apiError} />}
      <section className="stats-grid command-stats">
        <StatsCard label="Evidence in custody" value={loading ? '—' : String(documents.length).padStart(2, '0')} helper={loading ? 'Loading live register…' : `${totalBlocks} linked custody blocks`} icon={FileCheck2} tone="navy" trend={apiOnline ? 'Live' : 'Offline'} onClick={() => { setFilter('all'); setQuery(''); }} />
        <StatsCard label="Verified records" value={loading ? '—' : String(validCount).padStart(2, '0')} helper="Backend-confirmed integrity" icon={ShieldCheck} tone="teal" trend={apiOnline ? 'Live' : '—'} onClick={() => { setFilter('valid'); setQuery(''); }} />
        <StatsCard label="Open security alerts" value={loading ? '—' : String(openAlerts).padStart(2, '0')} helper={openAlerts ? 'Review before court submission' : permissions.incidents ? 'No active signals' : 'Restricted to Senior Authority'} icon={ShieldAlert} tone={openAlerts ? 'amber' : 'slate'} trend={openAlerts ? 'Review' : 'Clear'} onClick={permissions.incidents ? () => navigate('/anomalies') : undefined} />
        <StatsCard label="Pending custody actions" value={loading ? '—' : String(pendingActions).padStart(2, '0')} helper={permissions.transfer ? 'Records awaiting a next action' : 'Transfer view restricted by role'} icon={ClipboardCheck} tone="blue" trend={pendingActions ? 'Action' : 'Clear'} onClick={permissions.transfer ? () => navigate('/transfer') : undefined} />
      </section>
      <section className="dashboard-layout">
        <div className="panel panel--activity">
          <div className="panel-header"><div><SectionEyebrow icon={Activity}>AUDIT STREAM</SectionEyebrow><h2>Recent custody activity</h2></div><span className="live-data-caption"><span className={cn('pulse-dot', apiOnline ? 'pulse-dot--green' : 'pulse-dot--amber')} />{apiOnline ? 'Live register' : 'Last known snapshot'}</span></div>
          {loading ? <LoadingSkeleton lines={6} /> : activityFeed.length ? <div className="activity-feed">{activityFeed.map((item, index) => <motion.article className="activity-item" key={`${item.subject}-${item.time}-${index}`} {...motionProps(index * 0.03)}><span className={cn('activity-item__icon', `activity-item__icon--${toneFor[item.tone] || 'blue'}`)}>{item.icon === 'alert' ? <ShieldAlert size={15} /> : item.icon === 'verified' ? <ShieldCheck size={15} /> : item.icon === 'transfer' ? <ArrowRight size={15} /> : item.icon === 'court' ? <Building2 size={15} /> : <Eye size={15} />}</span><div className="activity-item__content"><div><strong>{item.title}</strong><time>{relativeTime(item.time)}</time></div><span><code>{item.subject}</code> · {item.meta}</span></div></motion.article>)}</div> : <EmptyState icon={Activity} title="No custody activity yet" text="Real actions will appear here after an evidence record is sealed." />}
          <div className="panel-footer-link"><span>Last successful sync · {lastSync ? relativeTime(lastSync) : 'Not connected'}</span><Link to="/dashboard">Open full register <ArrowRight size={14} /></Link></div>
        </div>
        <div className="panel panel--posture">
          <div className="panel-header"><div><SectionEyebrow icon={BarChart3}>SYSTEM POSTURE</SectionEyebrow><h2>Seven-day custody volume</h2></div><span className="panel-period">Live event counts</span></div>
          <div className="chart-legend"><span><i className="legend-line legend-line--sealed" />sealed</span><span><i className="legend-line legend-line--verified" />verified</span><span><i className="legend-line legend-line--alert" />alerts</span></div>
          <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 4, left: -25, bottom: 0 }}><defs><linearGradient id="sealedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.16} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient><linearGradient id="verifiedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f6e56" stopOpacity={0.14} /><stop offset="100%" stopColor="#0f6e56" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel)', fontSize: 11 }} /><Area type="monotone" dataKey="sealed" stroke="#2563eb" strokeWidth={2} fill="url(#sealedFill)" /><Area type="monotone" dataKey="verified" stroke="#0f6e56" strokeWidth={2} fill="url(#verifiedFill)" /><Area type="monotone" dataKey="alerts" stroke="#b7791f" strokeWidth={1.5} fill="transparent" /></AreaChart></ResponsiveContainer></div>
          <div className="posture-foot"><span><span className={cn('pulse-dot', apiOnline ? 'pulse-dot--green' : 'pulse-dot--amber')} />{apiOnline ? 'Integrity engine operational' : 'Awaiting backend connection'}</span><span className="mono">{lastSync ? `synced ${relativeTime(lastSync)}` : 'not synced'}</span></div>
        </div>
      </section>
      <section className="register-section">
        <div className="section-toolbar"><div><SectionEyebrow icon={FileCheck2}>EVIDENCE REGISTER</SectionEyebrow><h2>{filterLabel} <span>{filtered.length}</span></h2></div><div className="register-tools"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, case, officer or file" /></label><select className="filter-select" aria-label="Filter evidence records" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="valid">Verified</option><option value="compromised">Alerts</option><option value="pending">Pending</option></select>{filter !== 'all' && <button className="button button--secondary button--icon-only" type="button" title="Clear status filter" aria-label="Clear status filter" onClick={() => setFilter('all')}><X size={16} /></button>}</div></div>
        {loading ? <div className="panel register-loading"><LoadingSkeleton lines={6} /></div> : <div className="document-grid">{filtered.map((document, index) => <DocumentCard document={document} key={document.docId} index={index} />)}{!filtered.length && <EmptyState icon={Search} title={documents.length ? 'No records match' : 'Evidence register is empty'} text={documents.length ? 'Try a different ID, case reference, officer or status.' : 'Seal the first evidence record to begin the live custody register.'} />}</div>}
      </section>
    </div>
  );
}

function DemoFlowStrip({ permissions = {}, apiOnline }) {
  const steps = [
    { label: 'Seal evidence', permission: 'upload', to: '/upload' },
    { label: 'Verify chain', permission: 'verify', to: '/verify' },
    { label: 'Transfer custody', permission: 'transfer', to: '/transfer' },
    { label: 'Tamper demo', permission: 'tamper', to: '/demo' },
    { label: 'Forensic report', permission: 'report', to: '/reports' },
  ];

  return <section className="demo-flow-strip" aria-label="Judge demo flow"><div className="demo-flow-strip__intro"><SectionEyebrow icon={Network}>JUDGE DEMO FLOW</SectionEyebrow><strong>{apiOnline ? 'Live backend workflow' : 'Backend reconnect required'}</strong><small>Use only authorised actions on a live record.</small></div><ol className="demo-flow-strip__steps">{steps.map((step, index) => { const allowed = Boolean(permissions[step.permission]); return <li className={cn('demo-flow-step', !allowed && 'demo-flow-step--restricted')} key={step.permission}><span className="demo-flow-step__number">{String(index + 1).padStart(2, '0')}</span>{allowed ? <Link to={step.to}><span>{step.label}</span><ArrowRight size={12} /></Link> : <div className="demo-flow-step__copy"><strong>{step.label}</strong><small>Role restricted</small></div>}</li>; })}</ol></section>;
}

function DocumentCard({ document, index = 0 }) {
  return <motion.article className={cn('document-card', document.status === 'compromised' && 'document-card--compromised')} {...motionProps(0.04 + index * 0.04)}><div className="document-card__top"><div className="document-card__file-icon"><FileText size={19} /></div><StatusBadge status={document.status} /></div><div className="document-card__identity"><Link to={`/document/${document.docId}`}><h3>{document.docId}</h3></Link><p>{document.name}</p></div><div className="document-card__meta"><span><small>CASE REFERENCE</small><code>{document.caseId}</code></span><span><small>CLASSIFICATION</small><strong>{document.classification}</strong></span></div><div className="document-card__bottom"><span><Link2 size={13} /> {document.chain.length} blocks linked</span><span>{relativeTime(document.lastActivity)}</span><Link to={`/document/${document.docId}`} className="round-arrow" aria-label={`Open ${document.docId}`}><ArrowUpRight size={15} /></Link></div></motion.article>;
}

function OfflineBanner({ message }) {
  return <div className="offline-banner" role="status"><span className="offline-banner__icon"><ShieldAlert size={16} /></span><div><strong>Backend connection unavailable</strong><span>{message || 'Live evidence actions are paused. Reconnect the API to continue.'}</span></div><span className="offline-banner__state">NOT SYNCED</span></div>;
}

function LayoutIcon(props) {
  return <Activity {...props} />;
}

function DocumentDetailPage({ documents, onAddAction, onVerify, onTamper, permissions = {}, user }) {
  const { docId } = useParams();
  const document = documents.find((item) => item.docId === docId);
  const navigate = useNavigate();
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [result, setResult] = useState(document ? verificationFromRecord(document) : null);
  const [operationError, setOperationError] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [tamperOpen, setTamperOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ action: 'VIEWED', officerName: user?.name || '', officerBadge: user?.badge || '', details: '' });
  const [tamperForm, setTamperForm] = useState({ blockIndex: '2', fakeData: 'Description modified outside the authorised custody workflow.' });

  useEffect(() => { if (document) setResult(verificationFromRecord(document)); }, [docId, document?.status, document?.chain.length]);
  if (!document) return <NotFoundPage compact />;

  async function verify() {
    setVerifyBusy(true);
    setOperationError('');
    try {
      await wait(220);
      const next = await onVerify(document.docId);
      setResult(next);
      toast[next.valid ? 'success' : 'error'](next.valid ? 'Custody chain verified.' : `Integrity break detected at block ${next.brokenAtIndex}.`);
    } catch (error) {
      const message = actionErrorMessage(error, 'Chain verification failed.');
      setOperationError(message);
      toast.error(message);
    } finally {
      setVerifyBusy(false);
    }
  }

  async function submitAction(event) {
    event.preventDefault();
    if (!actionForm.officerName.trim() || !actionForm.officerBadge.trim() || !actionForm.details.trim()) {
      toast.error('Officer identity and action details are required.');
      return;
    }
    try {
      const updated = await onAddAction(document.docId, actionForm);
      setActionOpen(false);
      setResult(verificationFromRecord(updated));
      setActionForm((current) => ({ ...current, details: '' }));
      setOperationError('');
      toast.success('Custody action appended to chain.');
    } catch (error) {
      const message = actionErrorMessage(error, 'Could not append custody action.');
      setOperationError(message);
      toast.error(message);
    }
  }

  async function submitTamper(event) {
    event.preventDefault();
    try {
      const updated = await onTamper(document.docId, Number(tamperForm.blockIndex), tamperForm.fakeData);
      setTamperOpen(false);
      setResult(verificationFromRecord(updated));
      setOperationError('');
      toast('Demo mutation applied. Verify the chain to see the break.', { icon: '⚠' });
    } catch (error) {
      const message = actionErrorMessage(error, 'Could not apply the demo mutation.');
      setOperationError(message);
      toast.error(message);
    }
  }

  return <div className="detail-page"><PageHeader eyebrow="CUSTODY RECORD" icon={FileCheck2} title={document.docId} description={`${document.name} · ${document.caseId}`} actions={<>{permissions.action && <button className="button button--secondary" type="button" onClick={() => setActionOpen(true)}><FilePlus2 size={15} />Add action</button>}{permissions.verify && <button className="button button--primary" type="button" onClick={verify} disabled={verifyBusy}>{verifyBusy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}{verifyBusy ? 'Verifying…' : 'Verify chain'}</button>}{permissions.tamper && <button className="button button--danger-ghost" type="button" onClick={() => setTamperOpen(true)}><Zap size={15} />Simulate tamper</button>}</>} /><BackendActionError message={operationError} /><div className="detail-summary"><div className="detail-summary__identity"><div className="document-hero-icon"><FileText size={24} /></div><div><span className="section-eyebrow">DOCUMENT ID</span><h2>{document.docId}</h2><div className="detail-summary__badges"><StatusBadge status={document.status} /><span className="classification-badge">{document.classification}</span><span className="classification-badge">{document.evidenceType}</span></div></div></div><div className="detail-summary__stats"><div><span>Case reference</span><strong>{document.caseId}</strong></div><div><span>Chain length</span><strong>{document.chain.length} blocks</strong></div><div><span>Last activity</span><strong>{relativeTime(document.lastActivity)}</strong></div></div></div><EvidenceIntegrity document={document} /><CompromisedIncidentPanel document={document} /><SourceProvenanceCard document={document} /><VerificationResult result={result} busy={verifyBusy} onVerify={permissions.verify ? verify : undefined} /><div className="detail-main-grid"><div><HashChainVisualizer chain={document.chain} /><section className="panel timeline-panel"><div className="panel-header"><div><SectionEyebrow icon={Clock3}>CUSTODY TIMELINE</SectionEyebrow><h2>Immutable activity record</h2></div><span className="panel-counter">{document.chain.length} events</span></div><TimelineComponent chain={document.chain} /></section></div><aside className="detail-aside"><section className="panel metadata-panel"><div className="panel-header"><div><SectionEyebrow icon={Info}>RECORD METADATA</SectionEyebrow><h2>Evidence profile</h2></div><button className="icon-button" type="button"><MoreHorizontal size={17} /></button></div><MetadataRow label="Description" value={document.description} /><MetadataRow label="Evidence type" value={document.evidenceType} /><MetadataRow label="File size" value={document.size} /><MetadataRow label="Current custody" value={document.custodyHolder || 'Registered officer'} /><MetadataRow label="Registered at" value={formatTime(document.createdAt)} /><div className="metadata-divider" /><div className="metadata-seal"><ShieldCheck size={18} /><div><strong>Custody policy active</strong><span>Dual officer confirmation required for transfer.</span></div></div></section><section className="panel integrity-side-panel"><SectionEyebrow icon={Fingerprint}>INTEGRITY SUMMARY</SectionEyebrow><IntegrityMeter value={result?.valid === true ? 100 : result?.valid === false ? 0 : null} /><div className="integrity-side-row"><span>Root fingerprint</span><HashChip hash={document.originalHash || document.chain[0]?.hash} /></div><div className="integrity-side-row"><span>Current fingerprint</span><HashChip hash={document.currentHash || document.chain.at(-1)?.hash} /></div><div className="integrity-side-row"><span>Audit chain</span><strong className={document.auditChainValid === false ? 'text-danger' : 'text-success'}>{document.auditChainValid === false ? 'Invalid' : 'Valid'}</strong></div>{permissions.report && <Link to={`/reports?doc=${document.docId}`} className="button button--secondary button--full"><FileText size={15} />Open forensic report</Link>}</section></aside></div>{actionOpen && <Modal title="Append custody action" eyebrow="CONTROLLED WRITE" onClose={() => setActionOpen(false)}><form className="modal-form" onSubmit={submitAction}><FormField label="Action type" required><select value={actionForm.action} onChange={(event) => setActionForm({ ...actionForm, action: event.target.value })}><option>VIEWED</option><option>EDITED</option><option>COURT_ACCESSED</option></select></FormField><div className="form-grid form-grid--two"><FormField label="Signed-in officer" required><input value={actionForm.officerName} readOnly /></FormField><FormField label="Badge number" required><input value={actionForm.officerBadge} readOnly /></FormField></div><FormField label="Action details" required><textarea value={actionForm.details} onChange={(event) => setActionForm({ ...actionForm, details: event.target.value })} placeholder="State why this action was performed…" required /></FormField><div className="modal-form__footer"><span><LockKeyhole size={14} /> This action becomes part of the signed record.</span><button className="button button--primary" type="submit">Append to chain <ArrowRight size={15} /></button></div></form></Modal>}{tamperOpen && <Modal title="Simulate tamper event" eyebrow="DEMO-ONLY CONTROL" onClose={() => setTamperOpen(false)}><form className="modal-form" onSubmit={submitTamper}><div className="warning-callout"><AlertTriangle size={17} /><div><strong>For demonstration purposes only</strong><p>This directly mutates a local block without recalculating its hash. Use Verify chain afterwards to show the mathematical break.</p></div></div><FormField label="Block to mutate" required><select value={tamperForm.blockIndex} onChange={(event) => setTamperForm({ ...tamperForm, blockIndex: event.target.value })}>{document.chain.map((entry) => <option key={entry.index} value={entry.index}>Block {String(entry.index).padStart(2, '0')} · {entry.action}</option>)}</select></FormField><FormField label="Injected fake data" required><textarea value={tamperForm.fakeData} onChange={(event) => setTamperForm({ ...tamperForm, fakeData: event.target.value })} required /></FormField><div className="modal-form__footer"><span className="text-danger"><ShieldAlert size={14} /> Chain will be marked compromised.</span><button className="button button--danger" type="submit">Apply demo mutation <Zap size={15} /></button></div></form></Modal>}</div>;
}

function EvidenceIntegrity({ document }) {
  const compromised = document.status === 'compromised' || document.tampered;
  const sealed = document.valid === true || document.status === 'valid';
  const status = compromised ? 'compromised' : sealed ? 'valid' : 'pending';
  const label = compromised ? 'COMPROMISED' : sealed ? 'VERIFIED' : 'SEALED · VERIFY PENDING';
  const auditKnown = typeof document.auditChainValid === 'boolean';
  const auditLabel = auditKnown ? (document.auditChainValid ? 'INTACT' : 'BROKEN') : 'NOT RETURNED';
  const auditClass = auditKnown ? (document.auditChainValid ? 'text-success' : 'text-danger') : '';
  const latest = document.chain.at(-1);
  return <section className={cn('evidence-integrity', compromised && 'evidence-integrity--compromised')}><div className="evidence-integrity__header"><div><SectionEyebrow icon={Fingerprint}>EVIDENCE INTEGRITY</SectionEyebrow><h2>Evidence fingerprint and custody posture</h2></div><StatusBadge status={status} label={label} pulse={compromised} /></div><div className="evidence-integrity__id"><span>Evidence ID</span><CopyableValue>{document.docId}</CopyableValue></div><div className="evidence-integrity__grid"><div className="evidence-fingerprint"><span className="evidence-fingerprint__label">ORIGINAL SHA-256</span><HashChip hash={document.originalHash || document.chain[0]?.hash} /><small>Sealed when the record was registered</small></div><div className="evidence-fingerprint"><span className="evidence-fingerprint__label">CURRENT SHA-256</span><HashChip hash={document.currentHash || latest?.hash} /><small>{compromised ? 'Does not match the sealed fingerprint' : 'Matches the sealed fingerprint'}</small></div><div className="integrity-state"><span>Audit-chain validity</span><strong className={auditClass}>{auditLabel}</strong><small>{document.auditChainHead ? `Head · ${shortHash(document.auditChainHead)}` : 'Not returned by backend'}</small></div><div className="integrity-state"><span>Current custody holder</span><strong>{document.custodyHolder || latest?.officer || 'Not returned'}</strong><small>Latest event · {formatTime(latest?.timestamp)}</small></div></div></section>;
}

function CompromisedIncidentPanel({ document }) {
  const compromised = document.status === 'compromised' || document.tampered;
  if (!compromised) return null;
  const flags = document.anomalyFlags || {};
  const source = sourceProvenanceFromRecord(document);
  const reason = flags.hashMismatch
    ? 'The current evidence fingerprint differs from the original sealed hash.'
    : flags.brokenAuditChain
      ? 'One or more custody events no longer link to the previous hash.'
      : source.status === 'REVIEW_REQUIRED'
        ? 'Source provenance has been marked for authorised review.'
        : 'The backend has marked this evidence record for integrity review.';
  const comparison = flags.hashMismatch ? 'MISMATCH' : flags.brokenAuditChain ? 'CHAIN BREAK' : source.status === 'REVIEW_REQUIRED' ? 'SOURCE REVIEW' : 'REVIEW REQUIRED';
  return <section className="incident-panel incident-panel--critical" role="alert"><div className="incident-panel__header"><span className="incident-panel__icon"><ShieldAlert size={19} /></span><div><SectionEyebrow>ACTIVE INTEGRITY INCIDENT</SectionEyebrow><h2>Evidence requires immediate review</h2></div><StatusBadge status="compromised" label="INTEGRITY COMPROMISED" pulse /></div><p className="incident-panel__copy">{reason} Verification is red until the authority reviews the record and its custody history.</p><div className="incident-panel__meta"><span><strong>Break location</strong><code>Block {document.tamperBlockIndex ?? 'not reported'}</code></span><span><strong>Integrity reason</strong><code>{comparison}</code></span><span><strong>Security incidents</strong><code>{document.securityIncidents?.length || 0} recorded</code></span></div></section>;
}

function sourceProvenanceFromRecord(record) {
  const raw = record?.sourceProvenance || record?.provenance;
  const hasStatus = Boolean(record?.sourceProvenanceStatus || raw);
  const status = String(record?.sourceProvenanceStatus || raw?.status || (typeof raw === 'string' ? raw : '') || 'NOT_RETURNED').toUpperCase();
  const flagCopy = {
    'missing source hash': 'Source hash was not returned.',
    'source hash unavailable': 'Source hash was not returned.',
    'unregistered source device': 'Source device is not registered.',
    'missing attestation': 'Source attestation was not provided.',
    'missing uploader attestation': 'Source attestation was not provided.',
    'source mismatch': 'Source and custody fingerprints do not match.',
    'source hash mismatch': 'Source and custody fingerprints do not match.',
    'location review': 'Source location requires authorised review.',
    'upload outside authorised location': 'Source location requires authorised review.',
  };
  const rawFlags = raw && typeof raw === 'object' && Array.isArray(raw.flags) ? raw.flags : [];
  const flags = rawFlags.map((flag) => flagCopy[String(flag).toLowerCase()] || String(flag)).filter(Boolean);
  return {
    available: hasStatus,
    status,
    explanation: hasStatus ? (flags.join(' ') || (status === 'SOURCE_VERIFIED' ? 'Backend returned source verification metadata.' : 'Backend returned a source-provenance status for review.')) : 'Source provenance is not exposed by the current backend response; do not treat the pre-upload source as independently attested.',
    hash: raw?.officialSourceHash || raw?.sourceHash || raw?.hash,
    device: raw?.sourceSystemDeviceId || raw?.sourceDevice || raw?.device,
    sourceType: raw?.sourceType,
    attestation: raw?.attestationStatement || raw?.attestation,
    location: raw?.authorisedActionLocation || raw?.location || raw?.locationReview,
  };
}

function SourceProvenanceCard({ document }) {
  const source = sourceProvenanceFromRecord(document);
  const status = source.status === 'SOURCE_VERIFIED' ? 'valid' : source.status === 'REVIEW_REQUIRED' ? 'review' : 'pending';
  return <section className="source-provenance panel"><div className="source-provenance__header"><div><SectionEyebrow icon={FileCheck2}>SOURCE PROVENANCE</SectionEyebrow><h2>Pre-upload origin context</h2></div><StatusBadge status={status} label={source.status.replaceAll('_', ' ')} /></div><p>{source.explanation}</p>{source.available && <div className="source-provenance__facts">{source.sourceType && <MetadataRow label="Source type" value={source.sourceType} />}{source.hash && <MetadataRow label="Source hash" value={<HashChip hash={source.hash} />} />}{source.device && <MetadataRow label="Source device" value={source.device} />}{source.attestation && <MetadataRow label="Attestation" value={source.attestation} />}{source.location && <MetadataRow label="Location review" value={source.location} />}</div>}</section>;
}

function MetadataRow({ label, value }) {
  return <div className="metadata-row"><span>{label}</span><strong>{value}</strong></div>;
}

function FormField({ label, required, hint, children }) {
  return <label className="form-field"><span>{label}{required && <i>*</i>}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function UploadPage({ onUpload, apiOnline, apiError, user }) {
  const [form, setForm] = useState({ docId: '', caseId: '', officerName: user?.name || '', officerBadge: user?.badge || '', officerRole: user?.role || '', description: '', evidenceType: 'Digital Document', classification: 'Sensitive' });
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState({});
  const [fingerprint, setFingerprint] = useState({ status: 'idle', progress: 0 });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  async function generateFingerprint() {
    setFingerprint({ status: 'generating', progress: 4 });
    for (let progress = 16; progress <= 100; progress += 12) {
      await wait(85);
      setFingerprint({ status: progress === 100 ? 'done' : 'generating', progress });
    }
  }

  function selectFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    if (!form.docId) setField('docId', `DOC-2026-${String(Math.floor(10000 + Math.random() * 89999))}`);
    setFingerprint({ status: 'idle', progress: 0 });
  }

  function validate() {
    const next = {};
    if (!form.docId.trim()) next.docId = 'Document ID is required.';
    if (!form.caseId.trim()) next.caseId = 'Case reference is required.';
    if (!form.officerName.trim()) next.officerName = 'Officer name is required.';
    if (!form.officerBadge.trim()) next.officerBadge = 'Badge number is required.';
    if (!form.description.trim()) next.description = 'Add a short description for the record.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) { toast.error('Complete the required evidence metadata.'); return; }
    setBusy(true);
    try {
      if (fingerprint.status !== 'done') await generateFingerprint();
      const document = await onUpload({ ...form, file });
      setSuccess(document);
      toast.success('Evidence sealed and registered.');
    } catch (error) {
      toast.error(error.message || 'Could not seal the evidence record.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="upload-page"><PageHeader eyebrow="EVIDENCE INTAKE" icon={UploadCloud} title="Seal new evidence" description="Create a cryptographic root record before evidence enters the custody workflow." actions={<div className={cn('secure-context', !apiOnline && 'secure-context--offline')}><LockKeyhole size={14} /><span>{apiOnline ? 'Live API write · officer identity required' : 'Backend unavailable · write paused'}</span></div>} />{!apiOnline && <OfflineBanner message={apiError} />}<div className="upload-layout"><form className="panel upload-form" onSubmit={submit}><div className="panel-header"><div><SectionEyebrow icon={FilePlus2}>RECORD DETAILS</SectionEyebrow><h2>Evidence metadata</h2></div><span className="required-note"><i>*</i> required</span></div><div className="form-grid form-grid--two"><FormField label="Document ID" required hint="Unique custody reference"><div className="input-with-prefix"><span>SAK</span><input value={form.docId} onChange={(event) => setField('docId', event.target.value)} placeholder="DOC-2026-00218" /></div>{errors.docId && <small className="field-error">{errors.docId}</small>}</FormField><FormField label="Case reference" required><input value={form.caseId} onChange={(event) => setField('caseId', event.target.value)} placeholder="CASE/DEL/24-1188" />{errors.caseId && <small className="field-error">{errors.caseId}</small>}</FormField></div><div className="form-grid form-grid--two"><FormField label="Evidence type" required><select value={form.evidenceType} onChange={(event) => setField('evidenceType', event.target.value)}><option>Digital Document</option><option>Physical Item</option><option>Media Extract</option><option>Forensic Image</option></select></FormField><FormField label="Classification level" required><select value={form.classification} onChange={(event) => setField('classification', event.target.value)}><option>Normal</option><option>Sensitive</option><option>Classified</option></select></FormField></div><FormField label="Description" required hint="This description becomes part of the signed block"><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Describe what this evidence contains and why it is being registered…" />{errors.description && <small className="field-error">{errors.description}</small>}</FormField><div className="form-divider" /><div className="panel-header panel-header--form"><div><SectionEyebrow icon={UserCheck}>REGISTERING OFFICER</SectionEyebrow><h2>Identity confirmation</h2></div><span className="operator-note"><UserCheck size={13} /> Officer identity required</span></div><div className="form-grid form-grid--two"><FormField label="Officer name" required><input value={form.officerName} onChange={(event) => setField('officerName', event.target.value)} />{errors.officerName && <small className="field-error">{errors.officerName}</small>}</FormField><FormField label="Badge / department ID" required><input value={form.officerBadge} onChange={(event) => setField('officerBadge', event.target.value)} />{errors.officerBadge && <small className="field-error">{errors.officerBadge}</small>}</FormField></div><div className="form-submit-row"><span><ShieldCheck size={14} /> Metadata will be sealed with the current timestamp.</span><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <LockKeyhole size={15} />}{busy ? 'Sealing record…' : 'Seal & register evidence'}</button></div></form><aside className="upload-side"><section className="panel drop-panel"><div className="panel-header"><div><SectionEyebrow icon={FileText}>SOURCE PACKAGE</SectionEyebrow><h2>Attach evidence</h2></div><span className="optional-note">optional in demo</span></div><label className={cn('dropzone', dragging && 'dropzone--dragging')} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}><input type="file" onChange={(event) => selectFile(event.target.files?.[0])} /><span className="dropzone__icon"><UploadCloud size={24} /></span><strong>{file ? file.name : 'Drop a source package here'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || 'application/octet-stream'}` : 'PDF, image, audio, video or forensic archive'}</span><small>Maximum prototype payload · 500 MB</small></label>{file && <div className="file-preview"><FileText size={16} /><div><strong>{file.name}</strong><span>Ready for fingerprinting</span></div><button className="icon-button" type="button" onClick={() => setFile(null)} aria-label="Remove attached file"><X size={15} /></button></div>}</section><section className="panel fingerprint-panel"><div className="panel-header"><div><SectionEyebrow icon={Fingerprint}>CRYPTOGRAPHIC FINGERPRINT</SectionEyebrow><h2>Root hash generation</h2></div><span className={cn('hash-state', `hash-state--${fingerprint.status}`)}>{fingerprint.status === 'done' ? 'READY' : fingerprint.status === 'generating' ? 'PREPARING' : 'AWAITING'}</span></div><div className="fingerprint-workspace"><div className="fingerprint-graphic"><div className={cn('fingerprint-core', fingerprint.status === 'generating' && 'fingerprint-core--active', fingerprint.status === 'done' && 'fingerprint-core--done')}><Fingerprint size={29} /></div><span className="fingerprint-ring fingerprint-ring--one" /><span className="fingerprint-ring fingerprint-ring--two" /></div><div className="fingerprint-copy">{fingerprint.status === 'idle' && <><strong>Awaiting secure request</strong><p>The backend returns the SHA-256 root only after the evidence metadata is submitted.</p></>}{fingerprint.status === 'generating' && <><strong>Preparing secure seal…</strong><p>Packaging the metadata and optional source file for the backend fingerprint engine.</p></>}{fingerprint.status === 'done' && <><strong>Request prepared</strong><p className="mono">Sealed hash appears after backend confirmation</p></>}</div></div><div className="fingerprint-progress"><span style={{ width: `${fingerprint.progress}%` }} /><small>{fingerprint.status === 'done' ? 'READY' : `${fingerprint.progress}%`}</small></div><button className="button button--secondary button--full" type="button" onClick={generateFingerprint} disabled={fingerprint.status === 'generating'}>{fingerprint.status === 'done' ? <><Check size={15} />Request prepared</> : <><Fingerprint size={15} />Prepare secure seal</>}</button></section></aside></div>{success && <Modal title="Evidence sealed successfully" eyebrow="CHAIN ROOT CREATED" onClose={() => setSuccess(null)}><div className="success-modal"><div className="success-modal__icon"><ShieldCheck size={30} /></div><h3>{success.docId}</h3><p>The evidence record is now the first verified block in a new chain of custody.</p><div className="success-modal__hash"><span>ROOT FINGERPRINT</span><HashChip hash={success.chain[0]?.hash} /></div><div className="success-modal__details"><span><strong>Case reference</strong>{success.caseId}</span><span><strong>Registered by</strong>{success.chain[0]?.officer}</span></div><div className="modal-form__footer"><Link to={`/document/${success.docId}`} className="button button--primary" onClick={() => setSuccess(null)}>Open custody record <ArrowRight size={15} /></Link><button className="button button--secondary" type="button" onClick={() => setSuccess(null)}>Seal another</button></div></div></Modal>}</div>;
}

function VerifyPage({ documents, onVerify, apiOnline, apiError, permissions = {} }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [operationError, setOperationError] = useState('');
  const document = documents.find((item) => item.docId === selectedId);

  useEffect(() => {
    if (!selectedId && documents[0]?.docId) setSelectedId(documents[0].docId);
  }, [documents, selectedId]);

  async function runVerification() {
    if (!document) return;
    setBusy(true);
    setResult(null);
    setLogs([]);
    setOperationError('');
    try {
      const checks = ['Loading signed chain manifest', `Checking ${document.chain.length} block fingerprints`, 'Comparing previous-hash pointers', 'Validating officer and timestamp metadata', 'Writing verification result to audit stream'];
      for (const [index, check] of checks.entries()) {
        await wait(250);
        setLogs((current) => [...current, { text: check, time: new Date().toISOString(), ok: index < 4 }]);
      }
      const next = await onVerify(selectedId);
      setResult(next);
      toast[next.valid ? 'success' : 'error'](next.valid ? 'Chain valid — all links verified.' : `Tampering detected at block ${next.brokenAtIndex}.`);
    } catch (error) {
      const message = actionErrorMessage(error, 'Could not verify this chain.');
      setOperationError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="verify-page"><PageHeader eyebrow="INTEGRITY VERIFICATION" icon={ShieldCheck} title="Chain verifier" description="Recompute the evidence history and confirm that no custody record has changed." actions={permissions.tamper && <Link to="/demo" className="button button--secondary"><Network size={15} />Open judge demo</Link>} />{!apiOnline && <OfflineBanner message={apiError} />}<BackendActionError message={operationError} /><div className="verify-layout"><section className="panel verify-control"><div className="panel-header"><div><SectionEyebrow icon={FileCheck2}>SELECT RECORD</SectionEyebrow><h2>Evidence to verify</h2></div><StatusBadge status={apiOnline ? 'online' : 'offline'} label={apiOnline ? 'Backend reachable' : 'API unavailable'} /></div><FormField label="Document or case record"><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null); setLogs([]); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></FormField>{document && <div className="verify-document-card"><div className="document-hero-icon"><FileText size={21} /></div><div><strong>{document.docId}</strong><span>{document.caseId}</span><small>{document.chain.length} linked blocks · {document.classification}</small></div><StatusBadge status={document.status} /></div>}<button className="button button--primary button--full verify-button" type="button" onClick={runVerification} disabled={busy || !document || !apiOnline}>{busy ? <><LoaderCircle size={17} className="spin" />Verifying custody chain…</> : <><ShieldCheck size={17} />Verify chain integrity</>}</button><div className="verify-note"><Info size={14} /><span>{apiOnline ? 'The engine recomputes each block locally and compares its stored fingerprint with the linked previous hash.' : 'Reconnect the backend before requesting a cryptographic verification.'}</span></div></section><section className="verify-result-column">{result || busy ? <VerificationResult result={result || { details: 'Verification engine is checking every linked block.' }} busy={busy} /> : <div className="verify-placeholder"><div className="verify-placeholder__icon"><ShieldCheck size={34} /></div><h2>{apiOnline ? 'Ready to verify' : 'Verification unavailable'}</h2><p>{apiOnline ? 'Select a record and run the integrity engine. The result will include the exact block where a chain diverges.' : 'The live backend must confirm the chain before a result can be shown.'}</p></div>}<div className="panel verification-log"><div className="panel-header"><div><SectionEyebrow icon={Terminal}>VERIFICATION LOG</SectionEyebrow><h2>Engine activity</h2></div><span className="mono">{logs.length}/{5} checks</span></div>{logs.length ? <div className="log-list">{logs.map((log, index) => <motion.div className="log-row" key={`${log.text}-${index}`} {...motionProps(index * 0.03)}><span className="log-row__icon"><Check size={13} /></span><div><strong>{log.text}</strong><span>{formatTime(log.time)}</span></div><code>PASS</code></motion.div>)}</div> : <EmptyState icon={Terminal} title="No verification run yet" text="Your cryptographic verification trace will appear here." />}</div></section></div>{result && !result.valid && <section className="panel broken-block-panel"><div className="broken-block-panel__icon"><AlertTriangle size={19} /></div><div><SectionEyebrow>EXCEPTION LOCATION</SectionEyebrow><h2>Broken link detected at block {String(result.brokenAtIndex).padStart(2, '0')}</h2><p>{result.details}</p></div><Link to={`/document/${selectedId}`} className="button button--danger-ghost">Inspect custody record <ArrowRight size={15} /></Link></section>}</div>;
}


function demoProgressFromRecord(document, reportIds = []) {
  const chain = document?.chain || [];
  const hasAction = (action) => chain.some((entry) => entry.action === action);
  const tamperIndex = Number.isInteger(document?.tamperBlockIndex) ? document.tamperBlockIndex : null;
  const verifiedAfterTamper = tamperIndex !== null && chain.some((entry) => entry.action === 'VERIFIED' && entry.index > tamperIndex);
  return [
    { key: 'upload', label: 'Upload', done: Boolean(document && hasAction('UPLOADED')) },
    { key: 'verify', label: 'Verify', done: hasAction('VERIFIED') && (tamperIndex === null || !verifiedAfterTamper) },
    { key: 'transfer', label: 'Transfer', done: hasAction('TRANSFERRED') },
    { key: 'tamper', label: 'Tamper', done: Boolean(document?.tampered) },
    { key: 'verify-again', label: 'Verify again', done: Boolean(document?.tampered && verifiedAfterTamper) },
    { key: 'report', label: 'Report', done: Boolean(document && reportIds.includes(document.docId)) },
  ];
}

function DemoProgress({ steps }) {
  const firstPending = steps.findIndex((step) => !step.done);
  return <ol className="demo-progress" aria-label="Live demo progress">{steps.map((step, index) => <li className={cn('demo-progress__step', step.done && 'demo-progress__step--done', !step.done && index === firstPending && 'demo-progress__step--current')} key={step.key}><span>{step.done ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><strong>{step.label}</strong><small>{step.done ? 'Complete' : index === firstPending ? 'Next' : 'Pending'}</small>{index < steps.length - 1 && <i className={cn('demo-progress__line', step.done && 'demo-progress__line--done')} />}</li>)}</ol>;
}

function DemoPage({ documents, onTamper, onVerify, reportIds = [], canVerify = false, canUpload = false }) {
  const candidate = documents.find((item) => item.status === 'valid') || documents[0];
  const [selectedId, setSelectedId] = useState(candidate?.docId || '');
  const [baseline, setBaseline] = useState(() => JSON.parse(JSON.stringify(candidate?.chain || [])));
  const [tampered, setTampered] = useState(Boolean(candidate?.tampered));
  const [checking, setChecking] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [comparison, setComparison] = useState(50);
  const [logs, setLogs] = useState(candidate ? ['Live demo workspace initialised', `Baseline chain loaded · ${candidate.docId}`] : ['Awaiting a live evidence record']);
  const document = documents.find((item) => item.docId === selectedId) || candidate;
  const tamperActive = tampered || Boolean(document?.tampered);
  const afterChain = tamperActive ? document?.chain : baseline;
  const afterResult = tamperActive ? verificationFromRecord(document) : null;
  const progress = demoProgressFromRecord(document, reportIds);
  const tourSteps = [
    { target: '#demo-record-select', content: 'Choose a real sealed record from the live evidence register.', disableBeacon: true },
    { target: '#demo-tamper-action', content: 'Trigger the backend demo mutation. The block changes without a new valid fingerprint.', placement: 'bottom' },
    { target: '#demo-before-card', content: 'Compare the original captured chain with the backend-reported mutated state.', placement: 'top' },
    { target: '#demo-terminal', content: 'Use this trace to explain the divergence to evaluators.', placement: 'top' },
  ];

  useEffect(() => {
    const next = documents.find((item) => item.docId === selectedId);
    if (next && !next.tampered) {
      setBaseline(JSON.parse(JSON.stringify(next.chain)));
      setTampered(false);
      setLogs(['Live demo workspace initialised', `Baseline chain loaded · ${next.docId}`]);
    }
  }, [documents, selectedId]);

  async function simulate() {
    if (!document || !document.chain.length) { toast.error('Select a live evidence record with a custody chain.'); return; }
    setChecking(true);
    const blockIndex = Math.min(2, document.chain.length - 1);
    setLogs((current) => [...current, `Requesting demo mutation · block ${String(blockIndex).padStart(2, '0')}`]);
    try {
      await onTamper(document.docId, blockIndex, 'Injected demo value: custody description altered.');
      setTampered(true);
      setLogs((current) => [...current, 'Backend mutation confirmed', 'Hash mismatch ready for verification']);
      toast('Tamper simulation applied to the live backend record.', { icon: '⚠' });
    } catch (error) {
      toast.error(error.message || 'Could not apply the demo mutation.');
    } finally {
      setChecking(false);
    }
  }

  async function verifyMutated() {
    if (!document) return;
    if (!canVerify) {
      toast.error('You do not have permission to verify this chain. Switch to a Forensic Analyst or Court Viewer role.');
      return;
    }
    setChecking(true);
    setLogs((current) => [...current, `Verifying ${document.chain.length} linked blocks`]);
    try {
      const result = await onVerify(document.docId);
      setLogs((current) => [...current, result.valid ? 'All fingerprints matched' : `Break reported at block ${result.brokenAtIndex}`]);
      toast[result.valid ? 'success' : 'error'](result.valid ? 'Chain valid.' : `Tampering detected at block ${result.brokenAtIndex}.`);
    } catch (error) {
      toast.error(error.message || 'Could not verify the mutated chain.');
    } finally {
      setChecking(false);
    }
  }

  if (!document) return <div className="demo-page"><PageHeader eyebrow="DEMONSTRATION MODE" icon={Network} title="Show the proof" description="Run the tamper demonstration against a live evidence record." /><div className="panel"><EmptyState icon={FileCheck2} title="No live evidence record" text="Seal a record first. Demo mode never fabricates a production chain." />{canUpload && <Link to="/upload" className="button button--primary">Seal new evidence <ArrowRight size={15} /></Link>}</div></div>;

  return <div className="demo-page"><Joyride steps={tourSteps} run={tourRunning} continuous showProgress showSkipButton callback={(data) => { if (['finished', 'skipped'].includes(data.status)) setTourRunning(false); }} styles={{ options: { primaryColor: '#0a2540', zIndex: 120 } }} /><PageHeader eyebrow="DEMONSTRATION MODE" icon={Network} title="Show the proof" description="A controlled, visual walkthrough of how a hash chain exposes an unauthorised change." actions={<div className="demo-head-actions"><button className="button button--secondary" type="button" onClick={() => setTourRunning(true)}><Info size={15} />Guided tour</button><div className="demo-mode-badge"><span className="pulse-dot pulse-dot--amber" />Judge presentation mode</div></div>} /><DemoProgress steps={progress} /><section className="demo-command"><div className="demo-command__copy"><SectionEyebrow icon={FileCheck2}>SELECT A LIVE RECORD</SectionEyebrow><h2>Run the before / after test</h2><p>Use a real backend record to explain the integrity guarantee in under two minutes.</p></div><div className="demo-command__controls"><select id="demo-record-select" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setTampered(false); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select>{tamperActive ? <>{canVerify ? <button id="demo-tamper-action" className="button button--secondary" type="button" onClick={verifyMutated} disabled={checking}>{checking ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}{checking ? 'Verifying…' : 'Verify mutated chain'}</button> : <button id="demo-tamper-action" className="button button--secondary" type="button" disabled title="Sign in as a Forensic Analyst or Court Viewer to verify"><LockKeyhole size={15} />Switch role to verify</button>}<Link className="button button--ghost" to="/upload">Use new evidence</Link></> : <button id="demo-tamper-action" className="button button--danger" type="button" onClick={simulate} disabled={checking}>{checking ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}{checking ? 'Applying mutation…' : 'Simulate tamper'}</button>}</div></section><div className="demo-comparison"><DemoChainColumn tourId="demo-before-card" title="Before tamper" subtitle="Captured live baseline" chain={baseline} valid={!candidate?.tampered} /><div className="demo-divider"><span>THEN</span><ArrowRight size={17} /><span>NOW</span></div><DemoChainColumn title="After tamper" subtitle={tamperActive ? 'Backend-reported state' : 'Awaiting simulation'} chain={afterChain} valid={tamperActive ? afterResult?.valid === true : true} brokenAtIndex={afterResult?.brokenAtIndex} /><div className="demo-result-badge"><span className={tamperActive ? 'demo-result-badge--bad' : 'demo-result-badge--good'}>{tamperActive ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</span><strong>{tamperActive ? 'CHAIN BREAK VISIBLE' : 'CHAIN INTACT'}</strong><small>{tamperActive ? `Backend reports block ${afterResult?.brokenAtIndex ?? '—'} for review` : 'No mismatch detected'}</small></div></div><div className="comparison-control"><span>Original state</span><input aria-label="Compare original and mutated states" type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} /><span>Mutated state</span><strong>{comparison}% focus</strong></div><section className="demo-lower-grid"><div className="panel explainer-panel"><SectionEyebrow icon={Fingerprint}>HOW THE DETECTION WORKS</SectionEyebrow><h2>One changed value breaks the link.</h2><div className="explainer-steps"><ExplainerStep number="01" title="Each action is hashed" text="The block stores its own data fingerprint — including officer, time and action." /><ExplainerStep number="02" title="The next block remembers it" text="Every new record stores the previous block’s hash, creating a linked sequence." /><ExplainerStep number="03" title="Verification recomputes everything" text="A single altered value produces a different fingerprint and exposes the exact break." /></div><Link to="/verify" className="text-link">Open full chain verifier <ArrowRight size={15} /></Link></div><div id="demo-terminal" className="panel terminal-panel"><div className="panel-header"><div><SectionEyebrow icon={Terminal}>LIVE DEMO TRACE</SectionEyebrow><h2>Integrity engine console</h2></div><span className="terminal-live"><span /> LIVE</span></div><div className="terminal-window"><div className="terminal-window__bar"><span /><span /><span /><code>sakshya-integrity-engine</code></div><div className="terminal-output">{logs.map((log, index) => <div key={`${log}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><code><i>›</i> {log}{index === logs.length - 1 && <b className="terminal-cursor" />}</code></div>)}</div></div><div className="terminal-footer"><span><span className="pulse-dot pulse-dot--green" />Live backend record</span><code>SHA-256 / chained</code></div></div></section></div>;
}

function DemoChainColumn({ title, subtitle, chain = [], valid, brokenAtIndex, tourId }) {
  return <section id={tourId} className={cn('demo-chain-column', !valid && 'demo-chain-column--bad')}><div className="demo-chain-column__header"><div><h3>{title}</h3><span>{subtitle}</span></div><StatusBadge status={valid ? 'valid' : 'compromised'} label={valid ? 'VALID' : 'BROKEN'} /></div><div className="demo-block-list">{chain.slice(0, 5).map((entry, index) => { const bad = !valid && index >= 2; return <div className={cn('demo-block', bad && 'demo-block--bad')} key={`${entry.index}-${title}`}><span className="demo-block__number">{String(entry.index).padStart(2, '0')}</span><div><strong>{entry.action.replaceAll('_', ' ')}</strong><HashChip hash={entry.hash} copyable={false} label="" /></div>{bad ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}</div>; })}</div><div className="demo-chain-column__foot"><span><Link2 size={13} />{chain.length} linked blocks</span><code>{valid ? 'MATCH' : 'MISMATCH'}</code></div></section>;
}

function ExplainerStep({ number, title, text }) {
  return <div className="explainer-step"><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>;
}


function IncidentMetadata({ event }) {
  const incident = event.incident;
  const trace = incident?.networkOriginContext || {};
  const metadata = [
    ['Rule', incident?.rule || event.type],
    ['Attempted action', incident?.attemptedAction || 'Rule-based signal'],
    ['Timestamp', formatTime(incident?.timestamp || event.timestamp)],
    ['Source network', incident?.sourceNetwork || trace.sourceNetwork || 'Not supplied'],
    ['Network origin', trace.networkOrigin || 'Not supplied'],
    ['Device context', incident?.deviceContext || trace.deviceContext || incident?.deviceMetadata || 'Not supplied'],
    ['Voluntarily shared location', incident?.locationContext || trace.locationContext || incident?.authorisedActionLocation || 'Not voluntarily shared'],
  ];
  return <div className="incident-meta-grid">{metadata.map(([label, value]) => <div className="incident-meta-item" key={label}><span>{label}</span><strong className={label === 'Timestamp' || label === 'Source network' || label === 'Network origin' ? 'mono' : ''}>{value}</strong></div>)}</div>;
}

function AnomaliesPage({ documents }) {
  const liveEvents = anomalyEventsFromDocuments(documents);
  const [expanded, setExpanded] = useState(liveEvents[0]?.id);
  const [events, setEvents] = useState(liveEvents);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setEvents(liveEvents);
    setExpanded(liveEvents[0]?.id);
  }, [documents]);

  const open = events.filter((event) => event.status === 'Open').length;
  const escalated = events.filter((event) => event.status === 'Escalated').length;
  const totalEvents = documents.reduce((sum, document) => sum + (document.chain?.length || 0), 0);
  const flaggedToday = events.filter((event) => event.timestamp && new Date(event.timestamp).toDateString() === new Date().toDateString()).length;
  const scoredEvents = events.filter((event) => Number.isFinite(event.score));
  const maxScore = scoredEvents.length ? scoredEvents.reduce((max, event) => Math.max(max, event.score), 0) : null;
  const riskLabel = maxScore === null ? (events.length ? 'REVIEW' : 'CLEAR') : maxScore >= 90 ? 'CRITICAL' : maxScore >= 60 ? 'MEDIUM' : 'LOW';
  const compliant = totalEvents ? Math.max(0, Math.round(((totalEvents - events.length) / totalEvents) * 100)) : 100;
  const visibleEvents = events.filter((event) => filter === 'all' || (filter === 'open' ? event.status === 'Open' : event.status === 'Escalated'));

  function refreshSignals() {
    setEvents(anomalyEventsFromDocuments(documents));
    toast.success('Risk signals refreshed from the live register.');
  }

  function escalate() {
    toast('Escalation is not exposed by the current backend. Route this incident through the authorised senior-review workflow.', { icon: 'i' });
  }

  return <div className="anomalies-page"><PageHeader eyebrow="SECURITY MONITORING" icon={ShieldAlert} title="AI-Assisted Risk Signals" description="MVP uses explainable rule-based detection; human review remains required." actions={<><div className={cn('security-score', maxScore === null && events.length && 'security-score--review')}><span>LIVE RISK</span><strong>{riskLabel}</strong><i>{maxScore === null ? 'Score not returned' : `${maxScore} / 100`}</i></div><button className="button button--secondary" type="button" onClick={refreshSignals}><RefreshCw size={15} />Refresh signals</button></>} /><section className="anomaly-overview"><div className="security-overview-card"><div className="security-overview-card__top"><div><SectionEyebrow icon={ShieldCheck}>SECURITY POSTURE</SectionEyebrow><h2>{events.length ? 'Review signals from live records' : 'Monitoring is active'}</h2></div><div className="security-radar"><span /><span /><span /><CircleDot size={17} /></div></div><p>Signals below are derived from the custody records and security incidents returned by the SAKSHYA backend. They support review; they do not replace an authorised investigation.</p><div className="security-overview-card__metrics"><span><strong>{compliant}%</strong> events without a signal</span><span><strong>{open.toString().padStart(2, '0')}</strong> open signals</span><span><strong>{documents.length.toString().padStart(2, '0')}</strong> records monitored</span></div></div><div className="anomaly-stat-stack"><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--red"><ShieldAlert size={17} /></span><div><strong>{open.toString().padStart(2, '0')}</strong><span>Open alerts</span></div></div><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--amber"><Activity size={17} /></span><div><strong>{flaggedToday.toString().padStart(2, '0')}</strong><span>Flagged today</span></div></div><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--green"><CheckCircle2 size={17} /></span><div><strong>{escalated.toString().padStart(2, '0')}</strong><span>Escalated by backend</span></div></div></div></section><p className="anomaly-disclaimer">This metadata supports lawful authorised investigation; it does not identify a person automatically.</p><section className="security-panel"><div className="panel-header"><div><SectionEyebrow icon={AlertTriangle}>BACKEND SECURITY INCIDENTS &amp; ANOMALIES</SectionEyebrow><h2>Review queue <span className="title-count">{events.length}</span></h2></div><div className="filter-tabs"><button className={cn('filter-tab', filter === 'all' && 'filter-tab--active')} type="button" onClick={() => setFilter('all')}>All <span>{events.length}</span></button><button className={cn('filter-tab', filter === 'open' && 'filter-tab--active')} type="button" onClick={() => setFilter('open')}>Open <span>{open}</span></button><button className={cn('filter-tab', filter === 'escalated' && 'filter-tab--active')} type="button" onClick={() => setFilter('escalated')}>Escalated <span>{escalated}</span></button></div></div><div className="anomaly-list">{visibleEvents.length ? visibleEvents.map((event, index) => <motion.article className={cn('anomaly-card', expanded === event.id && 'anomaly-card--expanded')} key={event.id} {...motionProps(index * 0.03)}><button className="anomaly-card__summary" type="button" onClick={() => setExpanded(expanded === event.id ? null : event.id)}><span className="anomaly-card__score"><strong>{event.score ?? '—'}</strong><small>{event.score === null ? 'score' : '/100'}</small></span><span className="anomaly-card__signal"><span><RiskBadge risk={event.risk} /><code>{event.id}</code></span><strong>{event.type}</strong><small><code>{event.docId}</code> · {event.actor}</small></span><span className="anomaly-card__when"><strong>{event.when}</strong><small>{event.status}</small></span><ChevronDown size={17} className={expanded === event.id ? 'rotate-180' : ''} /></button><AnimatePresence initial={false}>{expanded === event.id && <motion.div className="anomaly-card__details" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><div className="anomaly-card__explanation"><SectionEyebrow icon={Info}>WHY THIS WAS FLAGGED</SectionEyebrow><p>{event.summary}</p><IncidentMetadata event={event} /><ul>{event.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div><div className="anomaly-card__actions"><span><MapPin size={14} />Authorised location context only</span><span><Clock3 size={14} />Rule evaluation recorded</span><button className="button button--danger" type="button" onClick={() => escalate(event.id)} disabled={event.status === 'Escalated'} title="Escalation write route is not exposed by the current backend"><Send size={14} />{event.status === 'Escalated' ? 'Escalated by backend' : 'Escalate to Senior Authority'}</button></div></motion.div>}</AnimatePresence></motion.article>) : <EmptyState icon={ShieldCheck} title="No active risk signals" text="The live backend has not reported an anomaly or security incident for the current evidence register." />}</div></section></div>;
}


function ReportProofCard({ label, value, detail, status = 'pending' }) {
  return <div className={cn('report-proof-card', `report-proof-card--${status}`)}><span className="report-proof-card__label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function ReportsPage({ documents, onReportGenerated, apiOnline, apiError }) {
  const params = new URLSearchParams(window.location.search);
  const [selectedId, setSelectedId] = useState(params.get('doc') || documents[0]?.docId || '');
  const [reportData, setReportData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const document = documents.find((item) => item.docId === selectedId) || documents[0];
  const reportId = document?.docId;
  const subject = reportData?.evidence ? normalizeDocument(reportData.evidence) || document : document;
  const assessment = reportData?.integrityAssessment;
  const reportLoaded = Boolean(reportData);
  const evidenceHashValid = assessment?.evidenceHashValid ?? (reportLoaded ? subject?.originalHash === subject?.currentHash : null);
  const auditChainValid = assessment?.auditChainValid ?? (reportLoaded ? subject?.auditChainValid : null);
  const overallValid = assessment?.overallValid ?? (reportLoaded ? subject?.status === 'valid' : null);
  const verdictLabel = overallValid === null ? 'PENDING' : overallValid ? 'VERIFIED' : 'COMPROMISED';
  const hashLabel = evidenceHashValid === null ? 'PENDING' : evidenceHashValid ? 'MATCH' : 'MISMATCH';
  const chainLabel = auditChainValid === null ? 'PENDING' : auditChainValid ? 'VALID' : 'BROKEN';
  const incidentCount = reportData?.evidence?.securityIncidents?.length ?? subject?.securityIncidents?.length ?? 0;
  const source = sourceProvenanceFromRecord(subject);

  useEffect(() => {
    if (!selectedId && documents[0]?.docId) setSelectedId(documents[0].docId);
  }, [documents, selectedId]);

  useEffect(() => {
    let active = true;
    if (!reportId) {
      setReportData(null);
      return undefined;
    }
    setBusy(true);
    setReportError('');
    api.getDocumentReport(reportId).then((next) => {
      if (!active) return;
      setReportData(next);
      onReportGenerated?.(reportId);
    }).catch((error) => {
      if (active) setReportError(error.message || 'The forensic report could not be loaded.');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [reportId, document?.lastActivity]);

  async function loadReport() {
    if (!reportId) throw new Error('Select an evidence record first.');
    const next = await api.getDocumentReport(reportId);
    setReportData(next);
    onReportGenerated?.(reportId);
    return next;
  }

  async function exportJson() {
    try {
      const report = await loadReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = documentCreateLink(url, `${reportId}-court-ready-report.json`);
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Court-ready report downloaded from the live backend.');
    } catch (error) {
      toast.error(error.message || 'Could not generate the forensic report.');
    }
  }

  async function printReport() {
    try {
      await loadReport();
      toast.success('Opening the live report in print view.');
      window.setTimeout(() => window.print(), 150);
    } catch (error) {
      toast.error(error.message || 'Could not prepare the forensic report.');
    }
  }

  async function downloadPdf() {
    if (!reportId || !apiOnline) return;
    setPdfBusy(true);
    try {
      const { blob, filename } = await api.downloadEvidenceReportPdf(reportId);
      const url = URL.createObjectURL(blob);
      const anchor = documentCreateLink(url, filename);
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Court-ready PDF downloaded from the live backend.');
    } catch (error) {
      const message = actionErrorMessage(error, 'Could not download the court-ready PDF.');
      setReportError(message);
      toast.error(message);
    } finally {
      setPdfBusy(false);
    }
  }

  if (!document) return <div className="reports-page"><PageHeader eyebrow="JUDICIAL OUTPUT" icon={FileText} title="Forensic report generator" description="Select a live evidence record to prepare its custody proof." /><div className="panel"><EmptyState icon={FileText} title="No evidence record selected" text="Seal an evidence record first. The report workspace will use only the live backend record." /></div></div>;

  return <div className="reports-page"><PageHeader eyebrow="JUDICIAL OUTPUT" icon={FileText} title="Forensic report generator" description="Assemble a court-ready evidence report with custody proof, integrity results and the complete audit timeline." actions={<><button className="button button--secondary" type="button" onClick={exportJson} disabled={busy || !apiOnline}><FileJson size={15} />Download report JSON</button><button className="button button--secondary" type="button" onClick={downloadPdf} disabled={busy || pdfBusy || !apiOnline}><Download size={15} />{pdfBusy ? 'Preparing PDF…' : 'Download court PDF'}</button><button className="button button--primary" type="button" onClick={printReport} disabled={busy || !apiOnline}><Printer size={15} />Print court copy</button></>} />{!apiOnline && <OfflineBanner message={apiError} />}<BackendActionError message={reportError} /><section className="report-proof-summary"><ReportProofCard label="Integrity verdict" value={busy ? 'LOADING' : verdictLabel} detail={busy ? 'Requesting report…' : overallValid === null ? 'Awaiting backend assessment' : overallValid ? 'Hash and chain match' : 'Review before submission'} status={busy || overallValid === null ? 'pending' : overallValid ? 'valid' : 'bad'} /><ReportProofCard label="Content hash" value={busy ? '—' : hashLabel} detail="Original vs current SHA-256" status={busy || evidenceHashValid === null ? 'pending' : evidenceHashValid ? 'valid' : 'bad'} /><ReportProofCard label="Audit chain" value={busy ? '—' : chainLabel} detail="Linked event verification" status={busy || auditChainValid === null ? 'pending' : auditChainValid ? 'valid' : 'bad'} /><ReportProofCard label="Security incidents" value={String(incidentCount).padStart(2, '0')} detail={reportData ? 'Returned by backend report' : 'Awaiting report endpoint'} status={incidentCount ? 'bad' : reportData ? 'valid' : 'pending'} /><ReportProofCard label="Source provenance" value={source.status.replaceAll('_', ' ')} detail={source.available ? 'Backend status returned' : 'Not exposed by backend'} status={source.status === 'SOURCE_VERIFIED' ? 'valid' : source.status === 'REVIEW_REQUIRED' ? 'bad' : 'pending'} /><ReportProofCard label="Report status" value={reportData ? 'READY' : busy ? 'LOADING' : apiOnline ? 'UNAVAILABLE' : 'OFFLINE'} detail={reportData ? `Generated ${formatTime(reportData.generatedAt)}` : reportError || 'Live report not loaded'} status={reportData ? 'valid' : 'pending'} /></section><div className="report-layout"><aside className="report-selector panel"><SectionEyebrow icon={FileCheck2}>REPORT SUBJECT</SectionEyebrow><h2>Select document</h2><FormField label="Evidence record"><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setReportData(null); setReportError(''); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId}</option>)}</select></FormField><div className="report-subject"><FileText size={18} /><div><strong>{subject?.name}</strong><span>{subject?.caseId}</span><code>{subject?.docId}</code></div></div><div className="report-checks"><div><CheckCircle2 size={15} /><span>Custody timeline included</span></div><div><CheckCircle2 size={15} /><span>Hash proof attached</span></div><div><CheckCircle2 size={15} /><span>{reportData ? 'Backend attestation included' : 'Awaiting backend attestation'}</span></div></div><div className="signature-badge"><BadgeCheck size={19} /><div><strong>Integrity attestation available</strong><span>{reportData ? 'Generated from the live SQLite audit record' : 'Report endpoint required'}</span></div></div></aside><section className="report-paper-wrap"><div className="report-paper"><div className="report-paper__top"><div className="report-paper__emblem"><span>भारत सरकार</span><strong>सत्यमेव जयते</strong></div><div className="report-paper__title"><span>GOVERNMENT OF INDIA</span><strong>MINISTRY OF HOME AFFAIRS</strong><small>SECURE DIGITAL EVIDENCE DIRECTORATE</small></div><div className="report-paper__classification">RESTRICTED<br /><span>COURT COPY</span></div></div><div className="report-paper__rule" /><div className="report-paper__heading"><span>CRYPTOGRAPHIC CUSTODY REPORT</span><h2>{subject?.docId}</h2><p>{reportData ? `Generated by SAKSHYA Secure Evidence Custody Grid · ${formatTime(reportData.generatedAt)}` : 'Live report is being requested from the evidence node.'}</p></div><div className="report-paper__facts"><div><span>Case reference</span><strong>{subject?.caseId}</strong></div><div><span>Evidence item</span><strong>{subject?.name}</strong></div><div><span>Classification</span><strong>{subject?.classification}</strong></div><div><span>Integrity verdict</span><strong className={overallValid === true ? 'text-success' : overallValid === false ? 'text-danger' : ''}>{overallValid === null ? 'PENDING ASSESSMENT' : overallValid ? 'VERIFIED / INTACT' : 'COMPROMISED / REVIEW'}</strong></div></div><div className="report-paper__section"><span className="report-section-number">01</span><div><h3>Custody chain summary</h3><p>The following actions were returned by the live report endpoint. Each block includes its fingerprint and the preceding block reference.</p></div></div><div className="report-table"><div className="report-table__row report-table__head"><span>Block</span><span>Timestamp / officer</span><span>Action</span><span>Fingerprint</span></div>{subject?.chain?.map((entry) => <div className="report-table__row" key={entry.index}><span className="mono">{String(entry.index).padStart(2, '0')}</span><span><strong>{formatTime(entry.timestamp)}</strong><small>{entry.officer} · {entry.badge}</small></span><span>{entry.action.replaceAll('_', ' ')}</span><span><HashChip hash={entry.hash} copyable={false} label="" /></span></div>)}</div><div className="report-paper__section"><span className="report-section-number">02</span><div><h3>Hash verification proof</h3><p>These values are taken from the selected evidence record and the backend integrity assessment.</p></div></div><div className="report-paper__hashes"><div><span>ORIGINAL SHA-256</span><code>{subject?.originalHash || '—'}</code></div><div><span>CURRENT SHA-256</span><code>{subject?.currentHash || '—'}</code></div><div><span>AUDIT ROOT</span><code>{subject?.auditChainHead || '—'}</code></div></div><div className="report-paper__signature"><div><div className="signature-line" /><span>System attestation</span><strong>SAKSHYA INTEGRITY ENGINE</strong><small>{reportData?.attestation || 'Awaiting backend attestation.'}</small></div><div className="report-seal-stamp"><BadgeCheck size={24} /><span>{overallValid === null ? 'PENDING' : overallValid ? 'VERIFIED' : 'REVIEW'}</span></div></div><div className="report-paper__footer">This report is a prototype output for Smart India Hackathon 2026 · SIH26190 · Page 1 of 1</div></div></section></div></div>;
}

function documentCreateLink(url, filename) {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  return anchor;
}


function TransferPage({ documents, onRequestTransferOtp, onTransfer, apiOnline }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [stage, setStage] = useState('details');
  const [form, setForm] = useState({ from: '', fromBadge: '', to: '', toBadge: '', reason: 'Forensic examination', otp: '' });
  const [otpTicket, setOtpTicket] = useState(null);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [success, setSuccess] = useState(false);
  const document = documents.find((item) => item.docId === selectedId);
  const currentHolder = document?.custodyHolder || document?.chain.at(-1)?.officer || '';

  useEffect(() => {
    if (!selectedId && documents[0]?.docId) setSelectedId(documents[0].docId);
  }, [documents, selectedId]);

  useEffect(() => {
    if (stage === 'success') return;
    setForm((current) => ({ ...current, from: currentHolder, fromBadge: document?.chain.at(-1)?.badge || '' }));
  }, [selectedId, currentHolder, stage]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocation(`${coords.latitude.toFixed(5)}° ${coords.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(coords.longitude).toFixed(5)}° ${coords.longitude >= 0 ? 'E' : 'W'}`);
    }, () => setLocation(''));
    return undefined;
  }, []);

  function resetTransferState() {
    setStage('details');
    setSuccess(false);
    setOtpTicket(null);
    setTransferError('');
    setForm((current) => ({ ...current, to: '', toBadge: '', otp: '' }));
  }

  async function continueToConfirm(event) {
    event.preventDefault();
    if (!apiOnline) { toast.error('Backend unavailable. Reconnect before preparing a custody handover.'); return; }
    if (!document) { toast.error('Select a live evidence record.'); return; }
    if (!form.from || !form.to.trim()) { toast.error('Current holder and recipient officer are required.'); return; }
    setTransferError('');
    setBusy(true);
    try {
      const ticket = await onRequestTransferOtp(selectedId, form.to.trim());
      setOtpTicket(ticket);
      setStage('confirm');
      toast.success('Backend OTP generated for this custody handover.');
    } catch (error) {
      const message = actionErrorMessage(error, 'Could not prepare the custody handover.');
      setTransferError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmTransfer(event) {
    event.preventDefault();
    if (!apiOnline) { setTransferError('Backend unavailable. The handover was not submitted.'); return; }
    if (!/^\d{6}$/.test(form.otp)) { setTransferError('Enter the 6-digit OTP returned by the backend.'); return; }
    setTransferError('');
    setBusy(true);
    try {
      await onTransfer(selectedId, form.to.trim(), form.otp);
      setSuccess(true);
      setStage('success');
      toast.success('OTP-verified custody handover completed.');
    } catch (error) {
      const message = actionErrorMessage(error, 'Custody transfer was blocked.');
      setTransferError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="transfer-page"><PageHeader eyebrow="CUSTODY HANDOVER" icon={Send} title="Transfer evidence" description="A backend-issued OTP binds the authenticated officer to the recipient handover." actions={<span className="transfer-context"><LockKeyhole size={14} />Location is optional and consent-based</span>} /><div className="transfer-layout"><section className="panel transfer-flow"><div className="stepper"><Step number="01" label="Evidence & reason" active={stage === 'details'} complete={stage !== 'details'} /><Step number="02" label="OTP confirmation" active={stage === 'confirm'} complete={stage === 'success'} /><Step number="03" label="Transfer sealed" active={stage === 'success'} /></div>{stage === 'details' && <form className="transfer-form" onSubmit={continueToConfirm}><div className="panel-header"><div><SectionEyebrow icon={QrCode}>EVIDENCE IDENTIFIER</SectionEyebrow><h2>Select a live record</h2></div><span className="backend-capability-note">QR linking not exposed by backend</span></div><div className="qr-select-row"><div className="qr-preview qr-preview--unavailable"><QrCode size={52} /><span>QR UNAVAILABLE</span><small>Use the live record selector</small></div><div className="qr-select-copy"><FormField label="Document / evidence ID" required><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); resetTransferState(); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></FormField><small className="field-hint">Physical evidence QR linking will appear through an authorised backend integration.</small></div></div><div className="form-divider" /><div className="form-grid form-grid--two"><FormField label="Current holder" required hint="Returned by the live record"><input value={form.from} readOnly placeholder="No holder returned" /></FormField><FormField label="Holder badge / ID"><input value={form.fromBadge} readOnly placeholder="Not returned" /></FormField></div><div className="form-grid form-grid--two"><FormField label="Recipient officer" required><input value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} placeholder="Recipient officer name" /></FormField><FormField label="Recipient badge / ID"><input value={form.toBadge} onChange={(event) => setForm({ ...form, toBadge: event.target.value })} placeholder="Badge or department ID" /></FormField></div><FormField label="Transfer reason" required><select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}><option>Forensic examination</option><option>Court production</option><option>Inter-departmental review</option><option>Secure storage relocation</option></select></FormField><LocationCard location={location} /><div className="form-submit-row"><span><LockKeyhole size={14} /> The backend will issue a time-bound OTP for this recipient.</span><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />}{busy ? 'Requesting OTP…' : 'Request handover OTP'}</button></div></form>}{stage === 'confirm' && <form className="transfer-form" onSubmit={confirmTransfer}><div className="handover-banner"><div className="handover-banner__icon"><KeyRound size={20} /></div><div><SectionEyebrow icon={ClipboardCheck}>BACKEND OTP CONFIRMATION</SectionEyebrow><h2>Confirm the custody handover</h2><p>{document?.docId} · {form.reason}</p></div></div>{transferError && <div className="warning-callout warning-callout--error" role="alert"><ShieldAlert size={17} /><div><strong>Transfer was not sealed</strong><p>{transferError}</p><small>The backend may record blocked OTP attempts as security incidents.</small></div></div>}{otpTicket?.otp && <div className="otp-ticket"><span>DEMO OTP RETURNED BY BACKEND</span><code>{otpTicket.otp}</code><small>This value is shown because the local prototype has no SMS/identity provider. It expires at {formatTime(otpTicket.expiresAt)}.</small></div>}<div className="officer-confirm-grid"><div className="officer-confirm"><span className="officer-confirm__label">AUTHENTICATED HANDOVER</span><div className="officer-confirm__identity"><div className="avatar avatar--small">{String(form.from || '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{form.from || 'Officer not returned'}</strong><span>{form.fromBadge || 'Badge not returned'}</span></div><StatusBadge status="pending" label="OTP required" /></div><label className="otp-label"><span>Enter backend OTP</span><input value={form.otp} onChange={(event) => setForm({ ...form, otp: event.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" pattern="[0-9]{6}" placeholder="••••••" aria-label="Six digit backend transfer OTP" /></label><small className="otp-hint">The backend validates this time-bound code against the selected recipient.</small></div><div className="officer-confirm officer-confirm--recipient"><span className="officer-confirm__label">RECIPIENT</span><div className="officer-confirm__identity"><div className="avatar avatar--small">{String(form.to || '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{form.to || 'Recipient not supplied'}</strong><span>{form.toBadge || 'Badge not supplied'}</span></div><StatusBadge status="pending" label="Recipient bound" /></div><small className="otp-hint">Recipient is sent to the backend with the OTP request.</small></div></div><LocationCard location={location} /><div className="form-submit-row"><button className="button button--secondary" type="button" onClick={() => setStage('details')}><ArrowLeft size={15} />Back</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}{busy ? 'Sealing transfer…' : 'Confirm & seal handover'}</button></div></form>}{stage === 'success' && <div className="transfer-success"><div className="transfer-success__icon"><CheckCircle2 size={34} /></div><SectionEyebrow icon={ShieldCheck}>CUSTODY UPDATED</SectionEyebrow><h2>Transfer successfully sealed</h2><p>The authenticated officer and backend OTP confirmation have been recorded as a new TRANSFERRED event.</p><div className="success-transfer-card"><span>{document?.docId}</span><strong>{form.from} <ArrowRight size={15} /> {form.to}</strong><small>{formatTime(document?.lastActivity)} · {location ? 'Authorised location context attached' : 'No location supplied'} · OTP verified</small></div><div><Link to={`/document/${selectedId}`} className="button button--primary">View updated chain <ArrowRight size={15} /></Link><button className="button button--secondary" type="button" onClick={resetTransferState}>Start another handover</button></div></div>}</section><aside className="transfer-aside"><section className="panel transfer-record"><SectionEyebrow icon={FileCheck2}>SELECTED RECORD</SectionEyebrow><h2>{document?.docId || 'No record selected'}</h2><p>{document?.name || 'Choose a live evidence record to begin.'}</p><div className="transfer-record__status"><StatusBadge status={document?.status || 'pending'} /><span>{document?.chain.length || 0} existing blocks</span></div><div className="transfer-record__hash"><span>Latest linked hash</span><HashChip hash={document?.chain.at(-1)?.hash || 'GENESIS'} /></div><div className="transfer-record__holder"><span>Current custody holder</span><strong>{currentHolder || 'Not returned'}</strong></div></section><section className="panel security-note"><div className="security-note__icon"><ShieldCheck size={18} /></div><div><strong>Why OTP protection?</strong><p>The authenticated officer, selected recipient and time-bound backend OTP are bound to one custody event.</p></div></section></aside></div></div>;
}

function Step({ number, label, active, complete }) {
  return <div className={cn('step', active && 'step--active', complete && 'step--complete')}><span>{complete ? <Check size={13} /> : number}</span><strong>{label}</strong></div>;
}




function OfficerConfirm({ label, officer, badge, otp, onChange }) {
  const initials = String(officer || '?').split(' ').map((part) => part[0]).join('').slice(0, 2);
  return <div className="officer-confirm"><span className="officer-confirm__label">{label}</span><div className="officer-confirm__identity"><div className="avatar avatar--small">{initials}</div><div><strong>{officer || 'Officer not supplied'}</strong><span>{badge || 'Badge not supplied'}</span></div><StatusBadge status="pending" label="OTP required" /></div><label className="otp-label"><span>Enter 4-digit OTP</span><input value={otp} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]{4}" placeholder="••••" aria-label={`${label} four digit OTP`} /></label><small className="otp-hint">The backend validates both confirmation codes.</small></div>;
}

function LocationCard({ location }) {
  const available = Boolean(location);
  return <div className="location-card"><div className="location-card__icon"><MapPin size={16} /></div><div><span>LOCATION CONTEXT</span><strong>{available ? location : 'Not voluntarily provided'}</strong><small>{available ? 'Browser-provided location context · accuracy depends on device permission' : 'Browser geolocation unavailable or declined; no GPS value is asserted.'}</small></div><StatusBadge status={available ? 'valid' : 'pending'} label={available ? 'Captured with consent' : 'Not provided'} /></div>;
}

function AdminPage({ documents, apiOnline, apiError }) {
  const officers = officerStatsFromDocuments(documents);
  const chartData = chartDataFromDocuments(documents);
  const totalAccess = officers.reduce((sum, officer) => sum + officer.accesses, 0);
  const validCount = documents.filter((document) => document.status === 'valid').length;
  const authorityAlerts = anomalyEventsFromDocuments(documents).filter((event) => event.status === 'Open');
  const roles = new Set(officers.map((officer) => officer.role)).size;
  return <div className="admin-page"><PageHeader eyebrow="SENIOR AUTHORITY VIEW" icon={Users} title="Authority console" description="Live department posture from the evidence register: officer access, custody volume and unresolved security signals." actions={<Link className="button button--primary" to="/anomalies"><ShieldAlert size={15} />Review live signals</Link>} />{!apiOnline && <OfflineBanner message={apiError} />}<div className="admin-live-note"><span className={cn('pulse-dot', apiOnline ? 'pulse-dot--green' : 'pulse-dot--amber')} />{apiOnline ? 'Figures below are calculated from the live backend register.' : 'Backend unavailable; figures reflect the last successful register snapshot.'}</div><section className="stats-grid"><StatsCard label="Observed officers" value={String(officers.length).padStart(2, '0')} helper={`${roles} recorded role groups`} icon={Users} tone="navy" /><StatsCard label="Recorded actions" value={String(totalAccess).padStart(2, '0')} helper="Across all live custody chains" icon={Eye} tone="blue" /><StatsCard label="Evidence records" value={String(documents.length).padStart(2, '0')} helper={`${validCount} currently verified`} icon={Network} tone="teal" /><StatsCard label="Open incidents" value={String(authorityAlerts.length).padStart(2, '0')} helper="Requires authority review" icon={ShieldAlert} tone="amber" /></section><section className="admin-layout"><div className="panel officer-panel"><div className="panel-header"><div><SectionEyebrow icon={Users}>OFFICER DIRECTORY</SectionEyebrow><h2>Access and record signals</h2></div><span className="panel-period">{officers.length} observed</span></div>{officers.length ? <div className="officer-table"><div className="officer-table__row officer-table__head"><span>Officer</span><span>Role</span><span>Actions</span><span>Record signal</span><span>Data state</span></div>{officers.map((officer) => <div className="officer-table__row" key={`${officer.name}-${officer.badge}`}><span className="officer-cell"><div className="avatar avatar--small">{officer.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{officer.name}</strong><code>{officer.badge}</code></div></span><span><strong>{officer.unit}</strong><small>{officer.role}</small></span><span><strong>{officer.accesses}</strong><small>last {officer.lastSeen}</small></span><span className="trust-cell">{officer.review ? <StatusBadge status="review" label="Review required" /> : <span className="record-signal-clear"><CheckCircle2 size={13} />No exception returned</span>}</span><span><StatusBadge status={apiOnline ? 'valid' : 'pending'} label={apiOnline ? 'Live observation' : 'Last snapshot'} /></span></div>)}</div> : <EmptyState icon={Users} title="No officer activity" text="Officer access patterns will appear after a live custody action is recorded." />}</div><div className="panel access-chart-panel"><div className="panel-header"><div><SectionEyebrow icon={BarChart3}>ACCESS PATTERNS</SectionEyebrow><h2>Custody activity by day</h2></div><span className="panel-period">Last seven days</span></div><div className="admin-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 0, left: -28, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border-subtle)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel)', fontSize: 11 }} /><Bar dataKey="sealed" fill="#2563eb" radius={[3, 3, 0, 0]} /><Bar dataKey="verified" fill="#0f6e56" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-square legend-square--sealed" />sealed</span><span><i className="legend-square legend-square--verified" />verified</span></div></div></section><section className="authority-alerts"><div className="section-toolbar"><div><SectionEyebrow icon={ShieldAlert}>ESCALATION MANAGEMENT</SectionEyebrow><h2>Alerts requiring authority review</h2></div><Link to="/anomalies" className="text-link">View all signals <ArrowRight size={14} /></Link></div><div className="authority-alert-grid">{authorityAlerts.length ? authorityAlerts.slice(0, 3).map((event) => <AuthorityAlert key={event.id} title={event.type} doc={event.docId} text={event.summary} severity={event.risk === 'critical' ? 'critical' : event.risk === 'medium' ? 'warning' : 'info'} />) : <EmptyState icon={ShieldCheck} title="No active escalations" text="No backend anomaly signals require authority review." />}</div></section></div>;
}

function AuthorityAlert({ title, doc, text, severity }) {
  return <article className={cn('authority-alert', `authority-alert--${severity}`)}><span className="authority-alert__icon">{severity === 'critical' ? <ShieldAlert size={17} /> : severity === 'warning' ? <AlertTriangle size={17} /> : <ClipboardCheck size={17} />}</span><div><span className="authority-alert__severity">{severity}</span><h3>{title}</h3><code>{doc}</code><p>{text}</p></div><button className="icon-button" type="button" aria-label="Open alert"><ArrowUpRight size={16} /></button></article>;
}

function NotFoundPage({ compact = false }) {
  return <div className={cn('not-found', compact && 'not-found--compact')}><div className="not-found__mark"><Fingerprint size={31} /></div><SectionEyebrow>404 · RECORD NOT FOUND</SectionEyebrow><h1>This route is outside the grid.</h1><p>The requested evidence view does not exist or is not available to this role.</p><Link to="/dashboard" className="button button--primary">Return to command centre <ArrowRight size={15} /></Link></div>;
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <div className="error-screen"><ShieldAlert size={32} /><h1>SAKSHYA encountered an issue.</h1><p>Retry the workspace to restore the secure evidence view.</p><button className="button button--primary" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} />Retry workspace</button></div>;
    return this.props.children;
  }
}

export default App;
