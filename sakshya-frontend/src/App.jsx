import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  Fingerprint,
  FolderOpen,
  Info,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Moon,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { api, isApiUnavailable } from './lib/api';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const VIEW_TO_HASH = {
  overview: 'dashboard',
  upload: 'upload',
  integrity: 'verify',
  transfer: 'transfer',
  report: 'report',
};

const HASH_TO_VIEW = {
  dashboard: 'overview',
  overview: 'overview',
  upload: 'upload',
  verify: 'integrity',
  integrity: 'integrity',
  demo: 'integrity',
  transfer: 'transfer',
  report: 'report',
  reports: 'report',
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Command centre', hint: 'Live register & posture', icon: LayoutDashboard },
  { id: 'upload', label: 'Seal evidence', hint: 'Register a new file', icon: UploadCloud },
  { id: 'integrity', label: 'Verify integrity', hint: 'Hash & custody chain', icon: Fingerprint },
  { id: 'transfer', label: 'Transfer custody', hint: 'OTP-protected handover', icon: ArrowLeftRight },
  { id: 'report', label: 'Forensic report', hint: 'Court-ready evidence pack', icon: FileCheck2 },
];

const ACTION_ICONS = {
  UPLOADED: UploadCloud,
  VIEWED: Eye,
  TRANSFERRED: ArrowLeftRight,
  EDITED: FileText,
  COURT_ACCESSED: Landmark,
  VERIFIED: ShieldCheck,
};

const ACTION_LABELS = {
  UPLOADED: 'Evidence uploaded',
  VIEWED: 'Evidence viewed',
  TRANSFERRED: 'Custody transferred',
  EDITED: 'Evidence edited',
  COURT_ACCESSED: 'Court access granted',
  VERIFIED: 'Integrity verified',
};

function resolveInitialView() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return HASH_TO_VIEW[hash] || 'overview';
}

function setHash(view) {
  const nextHash = `#/${VIEW_TO_HASH[view] || 'dashboard'}`;
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
}

function formatSize(value) {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(Number(value))) return '—';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value, includeSeconds = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: includeSeconds ? 'medium' : 'short',
  }).format(date);
}

function relativeTime(value) {
  if (!value) return '—';
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function greetingForCurrentHour() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function shortHash(value, length = 10) {
  if (!value) return '—';
  const raw = String(value).replace(/^sha256:/i, '');
  if (raw.length <= length * 2) return raw;
  return `${raw.slice(0, length)}…${raw.slice(-8)}`;
}

function recordStatus(record, verification) {
  if (verification?.valid === false || record?.valid === false || record?.status === 'compromised' || record?.tampered) return 'compromised';
  if (verification?.valid === true) return 'verified';
  return 'sealed';
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action || 'Custody event';
}

function initials(value) {
  return String(value || 'SAKSHYA')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('sakshya-theme') || 'light');
  const [activeView, setActiveView] = useState(resolveInitialView);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [health, setHealth] = useState({ state: 'checking', data: null, error: null });
  const [records, setRecords] = useState([]);
  const [evidence, setEvidence] = useState(null);
  const [verification, setVerification] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [lastOperation, setLastOperation] = useState(null);
  const [search, setSearch] = useState('');
  const evidenceRef = useRef(null);

  const [uploadForm, setUploadForm] = useState({ caseId: '', officer: '', description: '', classification: 'Sensitive', file: null });
  const [uploadErrors, setUploadErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const [transferForm, setTransferForm] = useState({ recipient: '', otp: '' });
  const [otpChallenge, setOtpChallenge] = useState(null);

  useEffect(() => {
    window.localStorage.setItem('sakshya-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => setActiveView(resolveInitialView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const markBusy = useCallback((key, value) => {
    setBusy((current) => ({ ...current, [key]: value }));
  }, []);

  const mergeEvidence = useCallback((record, select = true) => {
    if (!record?.id) return;
    setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    if (select) {
      evidenceRef.current = record;
      setEvidence(record);
    }
  }, []);

  const syncLiveData = useCallback(async () => {
    try {
      const healthResult = await api.getHealth();
      if (healthResult?.ok !== true) {
        throw new Error('SAKSHYA backend health check did not return an online state.');
      }
      const list = await api.listEvidence();
      const nextRecords = Array.isArray(list) ? list : [];
      if (evidenceRef.current?.id) {
        const selected = await api.getEvidence(evidenceRef.current.id);
        evidenceRef.current = selected;
        setEvidence(selected);
      }
      setHealth({ state: 'online', data: healthResult, error: null });
      setRecords(nextRecords);
      setLastSync(new Date());
    } catch (error) {
      // Never leave a disconnected production workspace looking live. The
      // next successful poll repopulates the register from the backend.
      evidenceRef.current = null;
      setEvidence(null);
      setRecords([]);
      setVerification(null);
      setReport(null);
      setHealth({
        state: 'offline',
        data: null,
        error: isApiUnavailable(error)
          ? 'The SAKSHYA backend is unavailable. Live records are hidden until the connection returns.'
          : error.message,
      });
    }
  }, []);

  useEffect(() => {
    syncLiveData();
    const interval = window.setInterval(syncLiveData, 5000);
    return () => window.clearInterval(interval);
  }, [syncLiveData]);

  const navigateView = useCallback((view) => {
    setActiveView(view);
    setMobileNavOpen(false);
    setHash(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const fail = useCallback((error, fallback) => {
    const message = isApiUnavailable(error)
      ? 'The SAKSHYA backend is unavailable. This action was not completed.'
      : error?.message || fallback;
    setGlobalError(message);
    toast.error(message);
  }, []);

  const selectEvidence = useCallback(async (id) => {
    if (!id) return;
    markBusy('select', true);
    setGlobalError('');
    try {
      const selected = await api.getEvidence(id);
      mergeEvidence(selected);
      setVerification(null);
      setReport(null);
      setLastOperation(null);
      navigateView('overview');
      toast.success('Evidence record loaded from the live register.');
    } catch (error) {
      fail(error, 'Unable to load this evidence record.');
    } finally {
      markBusy('select', false);
    }
  }, [fail, markBusy, mergeEvidence, navigateView]);

  const chooseFile = useCallback((file) => {
    if (!file) return;
    if (file.size > (health.data?.uploadLimitBytes || MAX_UPLOAD_BYTES)) {
      setUploadErrors({ file: `File exceeds the ${formatSize(health.data?.uploadLimitBytes || MAX_UPLOAD_BYTES)} upload limit.` });
      setUploadForm((current) => ({ ...current, file: null }));
      return;
    }
    setUploadErrors((current) => ({ ...current, file: '' }));
    setUploadForm((current) => ({ ...current, file }));
  }, [health.data?.uploadLimitBytes]);

  const handleUpload = useCallback(async (event) => {
    event.preventDefault();
    const errors = {};
    if (!uploadForm.file) errors.file = 'Select an evidence file before sealing.';
    if (!uploadForm.caseId.trim()) errors.caseId = 'Case ID is required for custody registration.';
    if (!uploadForm.officer.trim()) errors.officer = 'Officer name is required for the initial custody event.';
    if (Object.values(errors).some(Boolean)) {
      setUploadErrors(errors);
      return;
    }
    markBusy('upload', true);
    setGlobalError('');
    try {
      const created = await api.uploadEvidence(uploadForm);
      mergeEvidence(created);
      setVerification(null);
      setReport(null);
      setLastOperation('upload');
      setUploadForm({ caseId: '', officer: '', description: '', classification: 'Sensitive', file: null });
      setUploadErrors({});
      if (fileInputRef.current) fileInputRef.current.value = '';
      navigateView('overview');
      toast.success('Evidence sealed and registered on the live backend.');
    } catch (error) {
      fail(error, 'Evidence upload failed.');
    } finally {
      markBusy('upload', false);
    }
  }, [fail, mergeEvidence, markBusy, navigateView, uploadForm]);

  const verifyEvidence = useCallback(async () => {
    if (!evidence?.id) {
      toast.error('Select an evidence record first.');
      return;
    }
    markBusy('verify', true);
    setVerification(null);
    setGlobalError('');
    try {
      const result = await api.verifyEvidence(evidence.id);
      mergeEvidence(result);
      const verified = {
        valid: result.valid === true,
        brokenAtIndex: Number.isInteger(result.brokenAtIndex) ? result.brokenAtIndex : null,
        details: result.details || result.message || 'Verification completed.',
        alertMessage: result.alertMessage || null,
      };
      setVerification(verified);
      setLastOperation('verify');
      if (verified.valid) toast.success('Integrity verified: hash and audit chain match.');
      else toast.error(verified.alertMessage || 'Integrity verification failed.');
    } catch (error) {
      fail(error, 'Integrity verification failed.');
    } finally {
      markBusy('verify', false);
    }
  }, [evidence?.id, fail, markBusy, mergeEvidence]);

  const tamperEvidence = useCallback(async () => {
    if (!evidence?.id) {
      toast.error('Select an evidence record first.');
      return;
    }
    markBusy('tamper', true);
    setGlobalError('');
    try {
      const mutated = await api.tamperEvidence(evidence.id);
      mergeEvidence(mutated);
      setVerification(null);
      setReport(null);
      setLastOperation('tamper');
      toast('Demo mutation applied by the backend. Verify the record to expose the break.', { icon: '⚠' });
    } catch (error) {
      fail(error, 'The demo mutation could not be applied.');
    } finally {
      markBusy('tamper', false);
    }
  }, [evidence?.id, fail, markBusy, mergeEvidence]);

  const resetDemo = useCallback(async () => {
    if (!evidence?.id) return;
    markBusy('reset', true);
    setGlobalError('');
    try {
      const restored = await api.resetDemo(evidence.id);
      mergeEvidence(restored);
      setVerification(null);
      setReport(null);
      setLastOperation('reset');
      toast.success('Backend demo baseline restored.');
    } catch (error) {
      fail(error, 'The backend demo baseline could not be restored.');
    } finally {
      markBusy('reset', false);
    }
  }, [evidence?.id, fail, markBusy, mergeEvidence]);

  const requestOtp = useCallback(async () => {
    if (!evidence?.id) return;
    if (!transferForm.recipient.trim()) {
      toast.error('Enter the receiving officer before requesting an OTP.');
      return;
    }
    markBusy('otp', true);
    setGlobalError('');
    try {
      const challenge = await api.requestTransferOtp(evidence.id, transferForm.recipient.trim());
      setOtpChallenge(challenge);
      setTransferForm((current) => ({ ...current, otp: challenge.otp || '' }));
      toast.success('Transfer OTP generated by the backend demo service.');
    } catch (error) {
      fail(error, 'Unable to start the custody transfer.');
    } finally {
      markBusy('otp', false);
    }
  }, [evidence?.id, fail, markBusy, transferForm.recipient]);

  const transferEvidence = useCallback(async (event) => {
    event.preventDefault();
    if (!evidence?.id) return;
    if (!transferForm.recipient.trim() || !/^\d{6}$/.test(transferForm.otp)) {
      toast.error('Enter a recipient and the six-digit verification code.');
      return;
    }
    markBusy('transfer', true);
    setGlobalError('');
    try {
      const updated = await api.transferEvidence(evidence.id, {
        recipient: transferForm.recipient.trim(),
        otp: transferForm.otp,
      });
      mergeEvidence(updated);
      setOtpChallenge(null);
      setTransferForm({ recipient: '', otp: '' });
      setVerification(null);
      setReport(null);
      setLastOperation('transfer');
      toast.success('Custody handover sealed after OTP verification.');
      navigateView('overview');
    } catch (error) {
      fail(error, 'Custody transfer failed.');
    } finally {
      markBusy('transfer', false);
    }
  }, [evidence?.id, fail, markBusy, mergeEvidence, navigateView, transferForm]);

  const loadReport = useCallback(async () => {
    if (!evidence?.id) {
      toast.error('Select an evidence record first.');
      return null;
    }
    markBusy('report', true);
    setGlobalError('');
    try {
      const generated = await api.getEvidenceReport(evidence.id);
      setReport(generated);
      return generated;
    } catch (error) {
      fail(error, 'Forensic report could not be generated.');
      return null;
    } finally {
      markBusy('report', false);
    }
  }, [evidence?.id, fail, markBusy]);

  const downloadReport = useCallback(async () => {
    const generated = report || await loadReport();
    if (!generated) return;
    const fileId = generated.evidence?.id || evidence?.id || 'record';
    const blob = new Blob([JSON.stringify(generated, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `SAKSHYA-${fileId}-court-ready-report.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success('Court-ready evidence report downloaded.');
  }, [evidence?.id, loadReport, report]);

  const startNewEvidence = useCallback(() => {
    evidenceRef.current = null;
    setEvidence(null);
    setVerification(null);
    setReport(null);
    setLastOperation('new');
    setGlobalError('');
    setUploadErrors({});
    navigateView('upload');
  }, [navigateView]);

  return (
    <ErrorBoundary>
      <div className={`app-root ${theme === 'dark' ? 'theme-dark' : ''}`}>
        <Toaster position="bottom-right" toastOptions={{ duration: 3600, style: { background: theme === 'dark' ? '#10253b' : '#0a2540', color: '#fff', borderRadius: '7px', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px' } }} />
        <Sidebar activeView={activeView} onNavigate={navigateView} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="app-content">
          <Topbar health={health} lastSync={lastSync} theme={theme} onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onMenu={() => setMobileNavOpen(true)} onNavigate={navigateView} />
          <main className="workspace">
            <div className="workspace-toolbar"><div className="breadcrumb"><span>SAKSHYA</span><ChevronRight size={13} /><strong>{NAV_ITEMS.find((item) => item.id === activeView)?.label || 'Command centre'}</strong></div><span className="workspace-classification"><LockKeyhole size={12} /> RESTRICTED SYSTEM · SIH26190</span></div>
            <AnimatePresence initial={false} mode="wait">
              <motion.div key={activeView} className="view-transition" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                {activeView === 'overview' && <OverviewView evidence={evidence} verification={verification} records={records} onSelect={selectEvidence} onNavigate={navigateView} onVerify={verifyEvidence} onReport={loadReport} onNew={startNewEvidence} search={search} onSearch={setSearch} busy={busy} />}
                {activeView === 'upload' && <UploadView form={uploadForm} errors={uploadErrors} onChange={setUploadForm} onSubmit={handleUpload} onChooseFile={chooseFile} dragActive={dragActive} setDragActive={setDragActive} fileInputRef={fileInputRef} busy={busy.upload} onBack={() => navigateView('overview')} />}
                {activeView === 'integrity' && <IntegrityView evidence={evidence} verification={verification} busy={busy} onVerify={verifyEvidence} onTamper={tamperEvidence} onReset={resetDemo} onNavigate={navigateView} onSelect={selectEvidence} records={records} />}
                {activeView === 'transfer' && <TransferView evidence={evidence} form={transferForm} onChange={setTransferForm} challenge={otpChallenge} onRequestOtp={requestOtp} onSubmit={transferEvidence} busy={busy} onNavigate={navigateView} />}
                {activeView === 'report' && <ReportView evidence={evidence} report={report} onLoad={loadReport} onDownload={downloadReport} busy={busy.report} onNavigate={navigateView} />}
              </motion.div>
            </AnimatePresence>
            {globalError && <div className="system-error" role="alert"><CircleAlert size={16} /><span>{globalError}</span><button type="button" aria-label="Dismiss error" onClick={() => setGlobalError('')}><X size={15} /></button></div>}
          </main>
          <Footer />
        </div>
      </div>
    </ErrorBoundary>
  );
}

function Sidebar({ activeView, onNavigate, open, onClose }) {
  return <><div className={`sidebar-backdrop ${open ? 'is-visible' : ''}`} onClick={onClose} /><aside className={`app-sidebar ${open ? 'is-open' : ''}`} aria-label="Primary navigation"><div className="sidebar-brand"><LogoMark /><div><strong>SAKSHYA</strong><span>Digital Evidence Integrity Platform</span></div><button className="sidebar-close" type="button" aria-label="Close navigation" onClick={onClose}><X size={17} /></button></div><div className="sidebar-official"><OfficialEmblem /><div><span>Government of India</span><strong>Ministry of Home Affairs</strong></div></div><div className="sidebar-divider" /><nav className="sidebar-nav"><span className="sidebar-nav__label">WORKSPACE</span>{NAV_ITEMS.slice(0, 1).map((item) => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />)}<span className="sidebar-nav__label">OPERATIONS</span>{NAV_ITEMS.slice(1, 4).map((item) => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />)}<span className="sidebar-nav__label">DOCUMENTATION</span>{NAV_ITEMS.slice(4).map((item) => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />)}</nav><div className="sidebar-spacer" /><div className="sidebar-security"><ShieldCheck size={16} /><div><strong>Integrity engine</strong><span>SHA-256 chaining enabled</span></div></div><div className="sidebar-footer"><span>RESTRICTED SYSTEM</span><code>v1.0 · SIH26190</code></div></aside></>;
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? 'is-active' : ''}`} type="button" onClick={onClick} aria-current={active ? 'page' : undefined}><span className="nav-item__icon"><Icon size={17} strokeWidth={active ? 2.2 : 1.8} /></span><span className="nav-item__copy"><strong>{item.label}</strong><small>{item.hint}</small></span>{active && <ChevronRight size={14} className="nav-item__arrow" />}</button>;
}

function Topbar({ health, lastSync, theme, onThemeToggle, onMenu, onNavigate }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  return <header className="topbar"><button className="mobile-menu" type="button" aria-label="Open navigation" onClick={onMenu}><Menu size={20} /></button><div className="topbar-title"><span className="topbar-title__eyebrow">SECURE OPERATIONS</span><strong>{greetingForCurrentHour()}, Rajiv</strong><small className="topbar-title__support">Evidence custody command centre · Human review remains in control</small></div><div className="topbar-actions"><BackendStatus health={health} lastSync={lastSync} /><div className="topbar-control"><button className="topbar-icon" type="button" aria-label="Open notifications" onClick={() => setNotificationsOpen((value) => !value)}><Bell size={17} /><i /></button>{notificationsOpen && <div className="topbar-popover notification-popover"><span className="popover-label">NOTIFICATIONS <b>1 new</b></span><div className="notification-row"><span className="notification-icon notification-icon--amber"><AlertTriangle size={15} /></span><div><strong>Review live evidence register</strong><small>Open a record to verify its current custody state.</small></div></div><button className="popover-link" type="button" onClick={() => { setNotificationsOpen(false); onNavigate('overview'); }}>Open command centre <ArrowUpRight size={13} /></button></div>}</div><button className="topbar-icon" type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onThemeToggle}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><div className="topbar-control"><button className="user-chip" type="button" onClick={() => setProfileOpen((value) => !value)}><span className="avatar">RM</span><span><strong>Rajiv Menon</strong><small>Senior Authority</small></span><ChevronRight size={13} /></button>{profileOpen && <div className="topbar-popover user-popover"><span className="popover-label">AUTHORITY PROFILE</span><div className="profile-row"><span className="avatar avatar--large">RM</span><div><strong>Rajiv Menon</strong><small>Senior Authority · MHA-001</small></div></div><div className="profile-meta"><span><Database size={12} /> Department register</span><span><LockKeyhole size={12} /> MFA verified</span></div></div>}</div></div></header>;
}

function BackendStatus({ health, lastSync }) {
  const state = health.state === 'online' ? 'online' : health.state === 'checking' ? 'checking' : 'offline';
  const label = state === 'online' ? 'Backend online' : state === 'checking' ? 'Checking API' : 'Backend offline';
  return <div className={`backend-status backend-status--${state}`} title={health.error || (lastSync ? `Last sync ${formatDate(lastSync)}` : 'Live API health check')} role="status" aria-live="polite"><span className="backend-status__dot" /><span>{label}</span>{state === 'online' && <small>{health.data?.documentCount ?? 0} records</small>}</div>;
}

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><Fingerprint size={21} /><i /></span>;
}

function OfficialEmblem({ small = false }) {
  return <span className={`official-emblem ${small ? 'official-emblem--small' : ''}`} aria-label="Government seal placeholder"><span>सत्यमेव</span><strong>जयते</strong></span>;
}

function PageHeader({ eyebrow, title, description, actions }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-header__actions">{actions}</div>}</div>;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function StatusBadge({ status, label }) {
  const map = { verified: { text: label || 'VERIFIED', icon: CheckCircle2 }, compromised: { text: label || 'COMPROMISED', icon: ShieldAlert }, sealed: { text: label || 'SEALED', icon: LockKeyhole }, pending: { text: label || 'PENDING', icon: Clock3 }, warning: { text: label || 'REVIEW', icon: AlertTriangle }, online: { text: label || 'ONLINE', icon: Check }, offline: { text: label || 'OFFLINE', icon: CircleAlert } };
  const item = map[status] || map.pending;
  const Icon = item.icon;
  return <span className={`status-badge status-badge--${status}`}><Icon size={12} />{item.text}</span>;
}

function HashChip({ value, label, full = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast.success(`${label || 'Hash'} copied.`);
      window.setTimeout(() => setCopied(false), 1400);
    } else toast.error('Clipboard access is unavailable.');
  };
  return <button className="hash-chip" type="button" onClick={copy} title={value || 'No hash available'}><code>{full ? value || '—' : shortHash(value)}</code>{copied ? <Check size={12} /> : <Copy size={12} />}</button>;
}

function MetricCard({ label, value, helper, icon: Icon, tone = 'navy' }) {
  return <motion.article className={`metric-card metric-card--${tone}`} whileHover={{ y: -2 }} transition={{ duration: 0.18 }}><span className="metric-card__icon"><Icon size={18} /></span><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></motion.article>;
}

function OverviewView({ evidence, verification, records, onSelect, onNavigate, onVerify, onReport, onNew, search, onSearch, busy }) {
  const verifiedCount = records.filter((item) => item.valid === true).length;
  const compromisedCount = records.filter((item) => item.valid === false || item.status === 'compromised').length;
  const totalEvents = records.reduce((sum, item) => sum + Number(item.chainLength || item.chain?.length || 0), 0);
  return <div className="view-stack"><PageHeader eyebrow="OPERATIONS OVERVIEW" title="Digital evidence command centre" description="A live integrity and custody view for evidence registered on the SAKSHYA backend." actions={<><button className="button button--secondary" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} />Refresh view</button><button className="button button--primary" type="button" onClick={onNew}><FilePlus2 size={15} />Seal evidence</button></>} /><OperatorCue evidence={evidence} /><section className="metric-grid"><MetricCard label="Live evidence records" value={String(records.length).padStart(2, '0')} helper="Fetched from the custody register" icon={Database} tone="navy" /><MetricCard label="Valid backend state" value={String(verifiedCount).padStart(2, '0')} helper="Current hash and chain match" icon={ShieldCheck} tone="green" /><MetricCard label="Integrity incidents" value={String(compromisedCount).padStart(2, '0')} helper={compromisedCount ? 'Verification review required' : 'No compromised records'} icon={ShieldAlert} tone={compromisedCount ? 'red' : 'slate'} /><MetricCard label="Linked audit events" value={String(totalEvents).padStart(2, '0')} helper="Across the live register" icon={Link2} tone="blue" /></section>{!evidence ? <EmptySelection onUpload={onNew} records={records.length} /> : <ActiveEvidenceOverview evidence={evidence} verification={verification} onVerify={onVerify} onNavigate={onNavigate} onReport={onReport} onNew={onNew} busy={busy} />}<section className="register-section card"><SectionHeading eyebrow="LIVE EVIDENCE REGISTER" title="Select an active record" description="Every row below is loaded from GET /api/documents and opens the full evidence response." action={<div className="register-search"><Search size={15} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter ID, case or file" aria-label="Filter evidence register" /></div>} /><EvidenceRegister records={records} selectedId={evidence?.id} onSelect={onSelect} search={search} busy={busy.select} /></section></div>;
}

function OperatorCue({ evidence }) {
  const selectedCopy = evidence
    ? `The current record is held by ${evidence.custodyHolder || 'the assigned officer'}. Take a moment to review the latest event before you act.`
    : 'Begin with the file in front of you. SAKSHYA will keep the people, decisions and evidence trail visible at every step.';
  return <aside className="operator-cue card" aria-label="Officer review guidance"><span className="operator-cue__avatar"><UserRound size={17} /></span><div><span className="eyebrow">OFFICER REVIEW</span><strong>{evidence ? 'You are viewing a live custody record.' : 'Ready when you are, Officer.'}</strong><p>{selectedCopy}</p></div><span className="operator-cue__tag"><ShieldCheck size={13} />Human sign-off stays in control</span></aside>;
}

function EmptySelection({ onUpload, records }) {
  return <section className="empty-selection card"><span className="empty-selection__mark"><Fingerprint size={28} /></span><div><span className="eyebrow">NO ACTIVE RECORD SELECTED</span><h2>Let’s begin with a live evidence record.</h2><p>Upload a file to seal it on the backend, or select one of the {records || 'available'} registered records below. SAKSHYA keeps the officer, decision and evidence trail visible—nothing is simulated in this workflow.</p><button className="button button--primary" type="button" onClick={onUpload}><UploadCloud size={15} />Seal new evidence <ArrowRight size={14} /></button></div><div className="empty-selection__protocol"><span><Check size={13} /> SHA-256 source hash</span><span><Check size={13} /> Linked audit chain</span><span><Check size={13} /> Court-ready report</span></div></section>;
}

function ActiveEvidenceOverview({ evidence, verification, onVerify, onNavigate, onNew, busy }) {
  const status = recordStatus(evidence, verification);
  const lastEvent = evidence.timeline?.[0] || evidence.chain?.at(-1);
  return <div className="active-evidence"><section className="active-evidence__header card"><div className="file-symbol"><FileText size={25} /></div><div className="active-evidence__identity"><span className="eyebrow">ACTIVE EVIDENCE RECORD</span><h2>{evidence.name || evidence.fileName || evidence.id}</h2><div className="inline-meta"><code>{evidence.id}</code><span>·</span><span>{evidence.mimeType || 'Unknown file type'}</span><span>·</span><span>{formatSize(evidence.size)}</span></div></div><div className="active-evidence__status"><StatusBadge status={status} label={status === 'sealed' ? 'SEALED · VERIFY' : undefined} /><small>Last event {relativeTime(lastEvent?.at || evidence.lastActivity)}</small></div><div className="active-evidence__actions"><button className="button button--primary" type="button" onClick={onVerify} disabled={busy.verify}>{busy.verify ? <><LoaderCircle size={15} className="spin" />Verifying…</> : <><ShieldCheck size={15} />Verify integrity</>}</button><button className="button button--secondary" type="button" onClick={() => onNavigate('transfer')}><ArrowLeftRight size={15} />Transfer</button><button className="button button--quiet" type="button" onClick={() => onNavigate('report')}><FileCheck2 size={15} />Report</button><button className="button button--icon" type="button" aria-label="Start new evidence" title="Start new evidence" onClick={onNew}><FilePlus2 size={16} /></button></div></section><section className="overview-facts"><Fact label="Case ID" value={evidence.caseId} mono /><Fact label="Custody holder" value={evidence.custodyHolder} /><Fact label="Evidence type" value={evidence.evidenceType || evidence.mimeType} /><Fact label="Created" value={formatDate(evidence.createdAt)} /></section><section className="overview-hash-panel card"><SectionHeading eyebrow="CRYPTOGRAPHIC PROOF" title="Sealed fingerprints" description="Copyable values returned by the live evidence record." /><div className="overview-hash-grid"><div><span>ORIGINAL SHA-256</span><HashChip value={evidence.originalHash} label="Original SHA-256" full /></div><div><span>CURRENT SHA-256</span><HashChip value={evidence.currentHash} label="Current SHA-256" full /></div><div><span>AUDIT CHAIN ROOT / HEAD</span><HashChip value={evidence.auditChainHead} label="Audit chain head" full /></div></div></section><div className="overview-columns"><IntegritySnapshot evidence={evidence} verification={verification} onVerify={onVerify} busy={busy.verify} /><LatestEvent evidence={evidence} onNavigate={onNavigate} /></div><section className="chain-summary card"><SectionHeading eyebrow="AUDIT CHAIN SNAPSHOT" title="Linked custody events" description="The latest event is shown first; open Verify Integrity for the complete chain and visual link map." action={<button className="text-button" type="button" onClick={() => onNavigate('integrity')}>Open full chain <ArrowUpRight size={14} /></button>} /><Timeline evidence={evidence} compact /></section></div>;
}

function Fact({ label, value, mono = false }) {
  return <div className="fact"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value || '—'}</strong></div>;
}

function IntegritySnapshot({ evidence, verification, onVerify, busy }) {
  const status = recordStatus(evidence, verification);
  const isVerified = status === 'verified';
  const isCompromised = status === 'compromised';
  return <section className={`integrity-snapshot card integrity-snapshot--${status}`}><div className="snapshot-heading"><div><span className="eyebrow">INTEGRITY CONTROL</span><h2>{isVerified ? 'Chain verified' : isCompromised ? 'Review required' : 'Ready to verify'}</h2></div><span className="integrity-ring"><span>{isVerified ? '100' : isCompromised ? '00' : '—'}</span><small>TRUST</small></span></div><p>{isVerified ? 'Hash and audit chain match the backend record.' : isCompromised ? 'The evidence or its linked custody record no longer matches the sealed state.' : 'Run the backend verification before treating this record as verified.'}</p><div className="snapshot-checks"><span className={evidence.originalHash === evidence.currentHash ? 'is-ok' : 'is-bad'}>{evidence.originalHash === evidence.currentHash ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}Content hash {evidence.originalHash === evidence.currentHash ? 'matches' : 'differs'}</span><span className={evidence.auditChainValid ? 'is-ok' : 'is-bad'}>{evidence.auditChainValid ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}Audit chain {evidence.auditChainValid ? 'valid' : 'broken'}</span></div><button className="button button--secondary button--full" type="button" onClick={onVerify} disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin" />Recomputing chain…</> : <><Fingerprint size={15} />Verify against backend</>}</button></section>;
}

function LatestEvent({ evidence, onNavigate }) {
  const event = evidence.timeline?.[0] || evidence.chain?.at(-1);
  const Icon = ACTION_ICONS[event?.action] || Activity;
  return <section className="latest-event card"><SectionHeading eyebrow="LATEST CUSTODY EVENT" title="Most recent activity" action={<button className="icon-button" type="button" aria-label="Open full timeline" onClick={() => onNavigate('integrity')}><ArrowUpRight size={16} /></button>} />{event ? <div className="latest-event__body"><span className="event-icon event-icon--blue"><Icon size={17} /></span><div><div className="latest-event__top"><strong>{actionLabel(event.action)}</strong><time>{relativeTime(event.at || event.timestamp)}</time></div><p>{event.details || 'No event details provided.'}</p><span className="event-actor"><UserRound size={12} />{event.actor || event.officer || 'Authorised Officer'} <code>{event.badge || '—'}</code></span><HashChip value={event.eventHash || event.hash} label="Event hash" /></div></div> : <p className="muted-copy">Once the first officer event is recorded, it will appear here for the next reviewer.</p>}</section>;
}

function EvidenceRegister({ records, selectedId, onSelect, search, busy }) {
  const filtered = useMemo(() => records.filter((item) => `${item.id} ${item.caseId} ${item.name} ${item.custodyHolder}`.toLowerCase().includes(search.toLowerCase())), [records, search]);
  if (!records.length) return <div className="register-empty"><Database size={20} /><strong>Your register is ready for its first record.</strong><span>Upload an evidence file and SAKSHYA will create the first custody entry for you.</span></div>;
  if (!filtered.length) return <div className="register-empty"><Search size={20} /><strong>We couldn’t find that record.</strong><span>Try a document ID, case reference or file name.</span></div>;
  return <div className="evidence-table"><div className="evidence-table__head"><span>Record</span><span>Custody</span><span>Chain</span><span>Current state</span><span /></div>{filtered.map((record, index) => <motion.button className={`evidence-row ${selectedId === record.id ? 'is-selected' : ''}`} type="button" key={record.id} onClick={() => onSelect(record.id)} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }} disabled={busy}><span className="evidence-row__record"><span className="table-file-icon"><FileText size={15} /></span><span><strong>{record.name || record.fileName || record.id}</strong><code>{record.id}</code></span></span><span><strong>{record.custodyHolder || '—'}</strong><small>{record.caseId || 'No case ID'}</small></span><span><strong>{record.chainLength ?? record.chain?.length ?? 0} blocks</strong><small>{relativeTime(record.lastActivity)}</small></span><span><StatusBadge status={record.valid === false || record.status === 'compromised' ? 'compromised' : 'verified'} label={record.valid === false || record.status === 'compromised' ? 'COMPROMISED' : 'VALID'} /></span><ChevronRight size={15} /></motion.button>)}</div>;
}

function Timeline({ evidence, compact = false }) {
  const events = evidence?.timeline || [...(evidence?.chain || [])].reverse();
  if (!events.length) return <div className="timeline-empty"><Clock3 size={18} />No custody events returned by the backend.</div>;
  return <div className={`timeline ${compact ? 'timeline--compact' : ''}`}>{events.map((event, index) => { const compromised = event.compromised || event.verified === false; const Icon = ACTION_ICONS[event.action] || Activity; return <motion.article className={`timeline-item ${compromised ? 'is-compromised' : ''} ${index === 0 ? 'is-latest' : ''}`} key={event.id || `${event.index}-${event.at}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.045 }}><div className="timeline-rail"><span className="timeline-node">{compromised ? <ShieldAlert size={15} /> : <Icon size={15} />}</span>{index < events.length - 1 && <i />}</div><div className="timeline-card"><div className="timeline-card__top"><div><span className="block-index">BLOCK {String(event.index ?? index).padStart(2, '0')}</span><strong>{actionLabel(event.action)}</strong></div><div className="timeline-card__right">{index === 0 && <span className="latest-label">LATEST</span>}<time>{formatDate(event.at || event.timestamp, true)}</time></div></div><div className="timeline-card__actor"><span className="avatar avatar--small">{initials(event.actor || event.officer)}</span><span><strong>{event.actor || event.officer || 'Authorised Officer'}</strong><small>{event.role || 'Custody Officer'} · <code>{event.badge || '—'}</code></small></span></div>{!compact && <p>{event.details || 'Custody event recorded.'}</p>}{!compact && event.location && <span className="timeline-location"><Landmark size={12} />{event.location}</span>}<div className="timeline-hashes"><span><small>EVENT HASH</small><HashChip value={event.eventHash || event.hash} label="Event hash" /></span><span><small>PREVIOUS LINK</small><HashChip value={event.previousHash} label="Previous hash" /></span>{compromised && <StatusBadge status="compromised" label="INTEGRITY BREAK" />}</div></div></motion.article>; })}</div>;
}

function HashChain({ evidence }) {
  const chain = evidence?.chain || [];
  if (!chain.length) return <div className="chain-empty"><Network size={20} />The backend returned no chain blocks for this evidence.</div>;
  return <div className="hash-chain" aria-label="Visual audit chain"><div className="hash-chain__intro"><span><span className="chain-dot chain-dot--ok" />Verified link</span><span><Link2 size={13} />Each block stores the previous event hash</span></div><div className="hash-chain__track">{chain.map((block, index) => { const compromised = block.compromised || block.verified === false; const Icon = ACTION_ICONS[block.action] || Activity; return <div className="hash-chain__unit" key={block.id || `${block.index}-${block.timestamp}`}><div className={`hash-block ${compromised ? 'is-compromised' : ''}`}><div className="hash-block__top"><span>#{String(block.index ?? index).padStart(2, '0')}</span>{compromised ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</div><Icon size={17} /><strong>{block.action || 'EVENT'}</strong><HashChip value={block.eventHash || block.hash} label="Block hash" /></div>{index < chain.length - 1 && <div className={`hash-connector ${compromised ? 'is-compromised' : ''}`}><span /><Link2 size={13} /></div>}</div>; })}</div></div>;
}

function IntegrityView({ evidence, verification, busy, onVerify, onTamper, onReset, onNavigate, onSelect, records }) {
  const status = recordStatus(evidence, verification);
  return <div className="view-stack"><PageHeader eyebrow="INTEGRITY CONTROL CENTRE" title="Verify the chain, prove the state" description="Recompute the evidence fingerprint and every linked custody event against the live backend response." actions={<div className="button-row"><button className="button button--primary" type="button" onClick={onVerify} disabled={!evidence || busy.verify}>{busy.verify ? <><LoaderCircle size={15} className="spin" />Checking every link…</> : <><Fingerprint size={15} />Verify integrity</>}</button>{evidence && <button className="button button--demo" type="button" onClick={onTamper} disabled={busy.tamper}><ShieldAlert size={15} />Simulate tamper <small>DEMO</small></button>}</div>} />{!evidence ? <NoEvidencePanel records={records} onSelect={onSelect} onNavigate={onNavigate} /> : <><VerificationResult evidence={evidence} result={verification} status={status} busy={busy.verify} /><section className="chain-map-section card"><SectionHeading eyebrow="CRYPTOGRAPHIC LINK MAP" title="Every event remembers the one before it" description="The visual chain is rendered from the backend chain array; a compromised block and its downstream links are marked in red." /><HashChain evidence={evidence} /></section><section className="timeline-section card"><SectionHeading eyebrow="FULL CUSTODY TIMELINE" title={`${evidence.chainLength ?? evidence.chain?.length ?? 0} linked events`} description="Actor, badge, action, timestamp, location and hash metadata returned by the evidence API." action={status === 'compromised' ? <button className="button button--quiet" type="button" onClick={onReset} disabled={busy.reset}>{busy.reset ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}Reset demo record</button> : null} /><Timeline evidence={evidence} /></section><RiskSignals evidence={evidence} /></>}</div>;
}

function VerificationResult({ evidence, result, status, busy }) {
  const compromised = status === 'compromised';
  const verified = result?.valid === true;
  return <section className={`verification-result verification-result--${busy ? 'checking' : verified ? 'verified' : compromised ? 'compromised' : 'pending'}`} aria-live="polite"><div className="verification-result__icon">{busy ? <LoaderCircle size={27} className="spin" /> : verified ? <CheckCircle2 size={27} /> : compromised ? <ShieldAlert size={27} /> : <Fingerprint size={27} />}</div><div className="verification-result__copy"><span className="eyebrow">BACKEND VERIFICATION RESULT</span><h2>{busy ? 'Recomputing integrity…' : verified ? 'CHAIN VALID' : compromised ? 'TAMPERING DETECTED' : 'VERIFICATION REQUIRED'}</h2><p>{busy ? 'SHA-256 fingerprint, current hash and audit-chain links are being checked.' : verified ? 'Hash and audit chain match the live evidence record.' : compromised ? (result?.details || 'The returned evidence no longer matches its sealed state.') : 'No green result is shown until POST /api/evidence/:id/verify confirms the chain.'}</p>{result?.brokenAtIndex !== null && result?.brokenAtIndex !== undefined && !verified && <span className="break-callout"><ShieldAlert size={14} /> Broken block {String(result.brokenAtIndex).padStart(2, '0')} {result.alertMessage ? `· ${result.alertMessage}` : ''}</span>}</div><div className="verification-result__meta"><span>Evidence hash</span><HashChip value={evidence?.currentHash} label="Current evidence hash" /><span>Audit chain</span><StatusBadge status={evidence?.auditChainValid ? 'verified' : 'compromised'} label={evidence?.auditChainValid ? 'VALID' : 'BROKEN'} /></div></section>;
}

function RiskSignals({ evidence }) {
  const flags = evidence?.anomalyFlags || {};
  const signals = [{ key: 'hashMismatch', severity: 'critical', title: 'Evidence hash mismatch', text: 'Current content hash differs from the original sealed fingerprint.', icon: ShieldAlert }, { key: 'brokenAuditChain', severity: 'critical', title: 'Broken audit-chain link', text: 'An event hash or previous-hash pointer failed validation.', icon: Link2 }, { key: 'offHoursActivity', severity: 'medium', title: 'Off-hours activity', text: 'At least one custody event occurred outside the monitored operating window.', icon: Clock3 }].filter((signal) => flags[signal.key]);
  return <section className="risk-section card"><SectionHeading eyebrow="SECURITY MONITORING" title="AI-Assisted Risk Signals" description="MVP uses explainable rule-based detection; human review remains required." action={<span className="signal-source"><Activity size={13} />Backend flags</span>} />{signals.length ? <div className="risk-list">{signals.map((signal) => { const Icon = signal.icon; return <article className={`risk-row risk-row--${signal.severity}`} key={signal.key}><span className="risk-row__icon"><Icon size={16} /></span><div><div><strong>{signal.title}</strong><span className={`severity severity--${signal.severity}`}>{signal.severity}</span></div><p>{signal.text}</p><code>{signal.key}: true</code></div><button className="icon-button" type="button" aria-label="Open risk detail"><ArrowUpRight size={15} /></button></article>; })}</div> : <div className="no-risk"><span><CheckCircle2 size={18} /></span><div><strong>No active risk signals returned.</strong><p>The selected record currently reports a clean evidence hash, valid audit chain and no off-hours flag.</p></div></div>}</section>;
}

function NoEvidencePanel({ records, onSelect, onNavigate }) {
  return <section className="no-evidence card"><span className="empty-selection__mark"><Fingerprint size={27} /></span><div><span className="eyebrow">NO ACTIVE EVIDENCE</span><h2>Choose a record when you’re ready to review it.</h2><p>Upload a new file or open one of the live records loaded from the backend register. SAKSHYA will show you exactly what happened and who handled it.</p><div className="button-row"><button className="button button--primary" type="button" onClick={() => onNavigate('upload')}><UploadCloud size={15} />Seal new evidence</button>{records.slice(0, 3).map((record) => <button className="button button--secondary" type="button" key={record.id} onClick={() => onSelect(record.id)}>{record.id} <ArrowRight size={13} /></button>)}</div></div></section>;
}

function UploadView({ form, errors, onChange, onSubmit, onChooseFile, dragActive, setDragActive, fileInputRef, busy, onBack }) {
  const setField = (key, value) => onChange((current) => ({ ...current, [key]: value }));
  return <div className="view-stack"><PageHeader eyebrow="EVIDENCE INTAKE" title="Seal new evidence" description="Upload the source file and register its first custody event on the live SAKSHYA backend." actions={<button className="button button--quiet" type="button" onClick={onBack}><ArrowRight size={14} className="rotate-180" />Back to command centre</button>} /><div className="upload-layout"><section className="upload-panel card"><form onSubmit={onSubmit} noValidate><div className="form-section"><SectionHeading eyebrow="01 · SOURCE FILE" title="Select evidence file" description="Files are hashed by the backend before the record is returned." /><div className={`dropzone ${dragActive ? 'is-dragging' : ''} ${errors.file ? 'has-error' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); onChooseFile(event.dataTransfer.files?.[0]); }}><input ref={fileInputRef} type="file" onChange={(event) => onChooseFile(event.target.files?.[0])} aria-label="Choose evidence file" /><span className="dropzone__icon"><UploadCloud size={24} /></span><strong>{form.file ? form.file.name : 'Drop evidence file here'}</strong><span>{form.file ? `${formatSize(form.file.size)} · ${form.file.type || 'application/octet-stream'}` : 'or browse from this device · maximum 25 MB'}</span><button className="button button--secondary" type="button" onClick={() => fileInputRef.current?.click()}><FolderOpen size={14} />{form.file ? 'Choose a different file' : 'Browse file'}</button></div>{errors.file && <FieldError text={errors.file} />}{form.file && <div className="selected-file"><span className="selected-file__icon"><FileText size={16} /></span><div><strong>{form.file.name}</strong><small>{formatSize(form.file.size)} · {form.file.type || 'Unknown MIME type'}</small></div><button className="icon-button" type="button" aria-label="Remove selected file" onClick={() => { onChange((current) => ({ ...current, file: null })); if (fileInputRef.current) fileInputRef.current.value = ''; }}><X size={15} /></button></div>}</div><div className="form-section"><SectionHeading eyebrow="02 · CUSTODY METADATA" title="Register first officer event" description="These values become part of the first audit entry and evidence record." /><div className="form-grid form-grid--two"><FormField label="Case ID" required error={errors.caseId}><input value={form.caseId} onChange={(event) => setField('caseId', event.target.value)} placeholder="CASE/DEL/26-0001" autoComplete="off" />{errors.caseId && <FieldError text={errors.caseId} />}</FormField><FormField label="Officer name" required error={errors.officer}><input value={form.officer} onChange={(event) => setField('officer', event.target.value)} placeholder="Officer registering evidence" autoComplete="name" />{errors.officer && <FieldError text={errors.officer} />}</FormField><FormField label="Classification"><select value={form.classification} onChange={(event) => setField('classification', event.target.value)}><option>Sensitive</option><option>Normal</option><option>Classified</option></select></FormField><FormField label="Evidence type"><input value="Digital evidence file" readOnly /></FormField></div><FormField label="Description"><textarea rows="3" value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Briefly describe the evidence and its relevance to the case." /></FormField></div><div className="form-submit"><span><LockKeyhole size={14} />The backend will create the SHA-256 source hash and first audit block.</span><button className="button button--primary" type="submit" disabled={busy || !form.file}>{busy ? <><LoaderCircle size={16} className="spin" />Sealing file…</> : <><Fingerprint size={16} />Seal evidence on backend <ArrowRight size={14} /></>}</button></div></form></section><aside className="upload-aside"><ProtocolCard /><UploadNote /></aside></div></div>;
}

function FormField({ label, required, children }) {
  return <label className="form-field"><span>{label}{required && <b>*</b>}</span>{children}</label>;
}

function FieldError({ text }) {
  return <small className="field-error"><CircleAlert size={12} />{text}</small>;
}

function ProtocolCard() {
  return <section className="protocol-card card"><span className="eyebrow">SEAL PROTOCOL</span><h2>What happens after submit?</h2><ol><li><span>01</span><div><strong>Source hash</strong><p>Backend computes a SHA-256 digest from the uploaded file bytes.</p></div></li><li><span>02</span><div><strong>Audit block</strong><p>Officer, time, case and file hash become the first custody event.</p></div></li><li><span>03</span><div><strong>Record returned</strong><p>Frontend selects the live response and renders its chain immediately.</p></div></li></ol><div className="protocol-foot"><ShieldCheck size={14} />No client-side evidence result is fabricated.</div></section>;
}

function UploadNote() {
  return <section className="upload-note card"><Info size={17} /><div><strong>A clear handover for the next officer</strong><p>Use a small PDF, image or text file. Add enough context for another authorised reviewer to understand why this evidence matters.</p></div></section>;
}

function TransferView({ evidence, form, onChange, challenge, onRequestOtp, onSubmit, busy, onNavigate }) {
  if (!evidence) return <div className="view-stack"><PageHeader eyebrow="SECURE CUSTODY HANDOVER" title="Transfer custody" description="When you are ready, select an evidence record to begin an OTP-protected handover." /><NoEvidencePanel records={[]} onSelect={() => {}} onNavigate={onNavigate} /></div>;
  return <div className="view-stack"><PageHeader eyebrow="SECURE CUSTODY HANDOVER" title="Transfer custody" description="Request a backend OTP, confirm the receiving officer, then seal the handover in the audit chain." actions={<StatusBadge status="verified" label="OTP REQUIRED" />} /><div className="transfer-layout"><section className="transfer-panel card"><div className="transfer-subject"><span className="file-symbol file-symbol--small"><FileText size={19} /></span><div><span className="eyebrow">SELECTED EVIDENCE</span><strong>{evidence.name || evidence.id}</strong><code>{evidence.id} · {evidence.caseId}</code></div><StatusBadge status={evidence.valid === false ? 'compromised' : 'sealed'} /></div><div className="handover-steps"><HandoverStep number="01" title="Receiving officer" active={!challenge} done={Boolean(challenge)} /><HandoverStep number="02" title="OTP verification" active={Boolean(challenge)} done={false} /><HandoverStep number="03" title="Chain event sealed" active={false} done={false} /></div><form onSubmit={onSubmit}><div className="form-grid form-grid--two"><FormField label="Current custody holder"><input value={evidence.custodyHolder || '—'} readOnly /></FormField><FormField label="Receiving officer" required><input value={form.recipient} onChange={(event) => onChange((current) => ({ ...current, recipient: event.target.value }))} placeholder="Name or officer ID" autoComplete="off" /></FormField></div><div className="transfer-security-card"><div className="transfer-security-card__icon"><KeyRound size={17} /></div><div><strong>Backend OTP challenge</strong><p>Confirm the receiving officer's identity before the handover. In this MVP, the backend returns the code for judge demonstration.</p>{challenge && <div className="otp-return"><span>DEMO OTP</span><code>{challenge.otp}</code><small>expires {formatDate(challenge.expiresAt)}</small></div>}</div><button className="button button--secondary" type="button" onClick={onRequestOtp} disabled={busy.otp || !form.recipient.trim()}>{busy.otp ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />}{challenge ? 'Request new OTP' : 'Request OTP'}</button></div><FormField label="6-digit verification code" required><input className="otp-input" value={form.otp} onChange={(event) => onChange((current) => ({ ...current, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" pattern="[0-9]{6}" placeholder="· · · · · ·" disabled={!challenge} autoComplete="one-time-code" /></FormField><div className="form-submit"><span><ShieldCheck size={14} />Transfer writes a new TRANSFERRED event to the live audit chain.</span><button className="button button--primary" type="submit" disabled={busy.transfer || !challenge || form.otp.length !== 6}>{busy.transfer ? <><LoaderCircle size={15} className="spin" />Sealing handover…</> : <><Send size={15} />Confirm custody transfer <ArrowRight size={14} /></>}</button></div></form></section><aside className="transfer-aside"><section className="custody-card card"><span className="eyebrow">CURRENT STATE</span><h2>{evidence.custodyHolder || '—'}</h2><p>is the recorded custody holder before this handover.</p><div className="custody-card__hash"><span>AUDIT HEAD</span><HashChip value={evidence.auditChainHead} label="Audit chain head" /></div></section><section className="handover-note card"><ArrowLeftRight size={17} /><div><strong>Dual accountability</strong><p>Take a moment to confirm the person standing on the other side of this handover. Use the recipient's official name or badge ID; both identities are preserved in the custody chain.</p></div></section></aside></div></div>;
}

function HandoverStep({ number, title, active, done }) {
  return <div className={`handover-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}><span>{done ? <Check size={12} /> : number}</span><strong>{title}</strong></div>;
}

function ReportView({ evidence, report, onLoad, onDownload, busy, onNavigate }) {
  if (!evidence) return <div className="view-stack"><PageHeader eyebrow="COURT-READY DOCUMENTATION" title="Forensic report" description="Select a live evidence record before generating its backend report." /><NoEvidencePanel records={[]} onSelect={() => {}} onNavigate={onNavigate} /></div>;
  const assessment = report?.integrityAssessment;
  return <div className="view-stack"><PageHeader eyebrow="COURT-READY DOCUMENTATION" title="Forensic report generator" description="Preview the backend-generated evidence report, then download the returned JSON package for case documentation." actions={<div className="button-row"><button className="button button--secondary" type="button" onClick={onLoad} disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin" />Generating…</> : <><RefreshCw size={15} />Refresh preview</>}</button><button className="button button--primary" type="button" onClick={onDownload} disabled={busy}><Download size={15} />Download Court-Ready Report</button></div>} /><div className="report-layout"><section className="report-status card"><span className="eyebrow">REPORT STATUS</span><div className="report-status__verdict"><span className={`verdict-mark ${assessment?.overallValid === false ? 'is-bad' : assessment?.overallValid === true ? 'is-good' : ''}`}>{assessment?.overallValid === false ? <ShieldAlert size={22} /> : assessment?.overallValid === true ? <CheckCircle2 size={22} /> : <FileClock size={22} />}</span><div><h2>{assessment ? assessment.overallValid ? 'Integrity confirmed' : 'Review required' : 'Preview not generated'}</h2><p>{assessment ? assessment.overallValid ? 'The report reflects a matching content hash and valid audit chain.' : 'The report preserves the incident state and broken-block evidence for review.' : 'Generate the live report to populate its assessment and custody chain.'}</p></div></div><div className="report-check-list"><span className={assessment?.evidenceHashValid ? 'is-good' : ''}><CheckCircle2 size={14} />Content-hash match <b>{assessment ? assessment.evidenceHashValid ? 'YES' : 'NO' : '—'}</b></span><span className={assessment?.auditChainValid ? 'is-good' : ''}><Link2 size={14} />Audit-chain validity <b>{assessment ? assessment.auditChainValid ? 'VALID' : 'BROKEN' : '—'}</b></span><span><FileCheck2 size={14} />Report endpoint <b>{report ? 'READY' : 'WAITING'}</b></span></div><div className="signature-badge"><BadgeCheck size={17} /><div><strong>Backend attestation present</strong><span>{report?.attestation || 'Generated from the live evidence report endpoint.'}</span></div></div></section><section className="report-paper-wrap"><ReportPaper report={report} evidence={evidence} /></section></div></div>;
}

function ReportPaper({ report, evidence }) {
  const subject = report?.evidence || evidence;
  const assessment = report?.integrityAssessment;
  const events = subject?.timeline || [];
  return <article className="report-paper"><div className="report-paper__masthead"><OfficialEmblem small /><div><span>GOVERNMENT OF INDIA</span><strong>MINISTRY OF HOME AFFAIRS</strong><small>SAKSHYA · DIGITAL EVIDENCE INTEGRITY PLATFORM</small></div><span className="report-classification">{subject?.classification || 'CONTROLLED'}<small>OFFICIAL RECORD</small></span></div><div className="report-rule" /><div className="report-paper__title"><span>FORENSIC EVIDENCE REPORT</span><h2>{report?.reportType || 'Sakshya Court-Ready Forensic Evidence Report'}</h2><p>{report ? `Generated ${formatDate(report.generatedAt, true)}` : 'Generate preview from the live report endpoint.'}</p></div><div className="report-facts"><Fact label="Evidence ID" value={subject?.id} mono /><Fact label="Case ID" value={subject?.caseId} mono /><Fact label="File" value={subject?.name || subject?.fileName} /><Fact label="Custody holder" value={subject?.custodyHolder} /></div><div className="report-section"><span>01</span><div><h3>Integrity assessment</h3><p>{assessment ? assessment.overallValid ? 'The evidence content hash equals the sealed source hash and all audit events recompute successfully.' : 'The evidence record requires review because the content hash or linked audit chain does not match the sealed state.' : 'The integrity assessment will appear after the backend report is generated.'}</p><div className="report-assessment-grid"><span><small>CONTENT HASH</small><b>{assessment ? assessment.evidenceHashValid ? 'MATCH' : 'MISMATCH' : '—'}</b></span><span><small>AUDIT CHAIN</small><b>{assessment ? assessment.auditChainValid ? 'VALID' : 'BROKEN' : '—'}</b></span><span><small>VERDICT</small><b>{assessment ? assessment.overallValid ? 'VERIFIED' : 'COMPROMISED' : '—'}</b></span></div></div></div><div className="report-section"><span>02</span><div><h3>Custody chain</h3><p>Chronological events returned by the evidence service, presented newest first.</p><div className="report-table"><div className="report-table__row report-table__row--head"><span>Block</span><span>Action / actor</span><span>Timestamp</span><span>Event hash</span></div>{events.length ? events.map((event) => <div className="report-table__row" key={event.id || `${event.index}-${event.at}`}><span className="mono">{String(event.index ?? '—').padStart(2, '0')}</span><span><b>{actionLabel(event.action)}</b><small>{event.actor || event.officer || '—'} · {event.badge || '—'}</small></span><span>{formatDate(event.at || event.timestamp)}</span><span><HashChip value={event.eventHash || event.hash} label="Report event hash" /></span></div>) : <div className="report-table__empty">No timeline returned yet.</div>}</div></div></div><div className="report-section"><span>03</span><div><h3>Cryptographic proof</h3><div className="report-hashes"><span><small>ORIGINAL SHA-256</small><HashChip value={subject?.originalHash} label="Original hash" full /></span><span><small>CURRENT SHA-256</small><HashChip value={subject?.currentHash} label="Current hash" full /></span><span><small>AUDIT CHAIN HEAD</small><HashChip value={subject?.auditChainHead} label="Audit head" full /></span></div></div></div><div className="report-signature"><div><span className="signature-line" /><small>Authorised SAKSHYA integrity service</small><strong>Digital verification record</strong></div><div className="report-stamp"><CheckCircle2 size={20} /><span>{assessment?.overallValid ? 'VERIFIED' : 'CONTROLLED'}</span></div></div><footer>SAKSHYA · Secure evidence custody grid · This prototype report is generated from the in-memory backend service.</footer></article>;
}

function Footer() {
  return <footer className="app-footer"><div><OfficialEmblem small /><span><strong>SAKSHYA</strong> · Digital Evidence Integrity Platform</span></div><span>Smart India Hackathon 2026 · SIH26190 · Ministry of Home Affairs</span></footer>;
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="error-screen"><ShieldAlert size={32} /><span className="eyebrow">SAKSHYA WORKSPACE</span><h1>Something interrupted the evidence view.</h1><p>Reload the workspace to reconnect to the live command centre.</p><button className="button button--primary" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} />Retry workspace</button></div>;
    return this.props.children;
  }
}

export default App;
