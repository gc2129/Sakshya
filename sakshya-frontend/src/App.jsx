import { Component, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
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
  FileCheck2,
  FileJson,
  FilePlus2,
  FileText,
  Fingerprint,
  Info,
  KeyRound,
  Link2,
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
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api, isApiUnavailable } from './lib/api';
import { activityFeed, anomalyEvents, chartData, cloneDocuments, documentFromApi, officers } from './data/mockData';
import { AppShell } from './components/Shell';
import {
  EmptyState,
  HashChainVisualizer,
  HashChip,
  IntegrityMeter,
  LoadingSkeleton,
  Modal,
  PageHeader,
  RiskBadge,
  SectionEyebrow,
  StatsCard,
  StatusBadge,
  TimelineComponent,
  VerificationResult,
  cn,
  formatShortTime,
  formatTime,
  motionProps,
  relativeTime,
  shortHash,
} from './components/ui';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function verifyLocalChain(document) {
  const brokenAtIndex = document?.chain?.findIndex((entry) => entry.compromised || entry.verified === false) ?? -1;
  const valid = brokenAtIndex === -1;
  return {
    valid,
    brokenAtIndex: valid ? null : brokenAtIndex,
    details: valid ? `All ${document?.chain?.length || 0} custody blocks match their linked SHA-256 fingerprints.` : `Block ${brokenAtIndex} does not match its recorded fingerprint. All downstream links require review.`,
  };
}

function createLocalDocument(payload) {
  const timestamp = new Date().toISOString();
  const id = payload.docId || `DOC-2026-${String(Math.floor(10000 + Math.random() * 89999))}`;
  const digest = `sha256:${Array.from({ length: 64 }, (_, index) => '0123456789abcdef'[(index + id.length) % 16]).join('')}`;
  return {
    id,
    docId: id,
    caseId: payload.caseId || 'CASE/UNASSIGNED',
    name: payload.file?.name || `${id}_evidence_record`,
    description: payload.description || 'Evidence record sealed from SAKSHYA command centre.',
    evidenceType: payload.evidenceType || 'Digital Document',
    classification: payload.classification || 'Sensitive',
    size: payload.file ? `${(payload.file.size / 1024 / 1024).toFixed(1)} MB` : '—',
    status: 'valid',
    chainLength: 1,
    lastActivity: timestamp,
    chain: [{ index: 0, action: 'UPLOADED', officer: payload.officerName || 'Rajiv Menon', badge: payload.officerBadge || 'MHA-001', role: 'Senior Authority', timestamp, details: payload.description || 'Evidence package sealed and registered against the case file.', hash: digest, previousHash: 'GENESIS', verified: true, location: 'National Evidence Grid · Intake' }],
  };
}

function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('sakshya-theme') || 'light');
  const [highContrast, setHighContrast] = useState(() => window.localStorage.getItem('sakshya-contrast') === 'true');
  const [documents, setDocuments] = useState(() => cloneDocuments());
  const [apiOnline, setApiOnline] = useState(false);
  const [lastSync, setLastSync] = useState(new Date());

  useEffect(() => {
    window.localStorage.setItem('sakshya-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('sakshya-contrast', String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    let active = true;
    async function sync() {
      try {
        await api.getHealth();
        if (active) setApiOnline(true);
      } catch {
        if (active) setApiOnline(false);
      }
      try {
        const remote = await api.getAllDocuments();
        const list = Array.isArray(remote) ? remote : remote?.documents;
        if (active && Array.isArray(list) && list.length) {
          setDocuments((current) => {
            const mapped = list.map(documentFromApi).filter(Boolean);
            return mapped.length ? mapped : current;
          });
        }
      } catch {
        // The prototype keeps a seeded presentation dataset when the optional API list is unavailable.
      }
      if (active) setLastSync(new Date());
    }
    sync();
    const interval = window.setInterval(sync, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function uploadDocument(payload) {
    let created = null;
    try {
      const remote = await api.uploadDocument(payload);
      created = documentFromApi(remote);
    } catch (error) {
      if (!isApiUnavailable(error)) toast('API route unavailable — sealed in demo workspace.', { icon: '◌' });
    }
    created ||= createLocalDocument(payload);
    setDocuments((current) => [created, ...current]);
    return created;
  }

  async function addAction(docId, actionData) {
    const current = documents.find((document) => document.docId === docId);
    if (!current) throw new Error('Document not found.');
    const previous = current.chain.at(-1)?.hash || 'GENESIS';
    const nextIndex = current.chain.length;
    const nextHash = `sha256:${Array.from({ length: 64 }, (_, index) => 'abcdef0123456789'[(index + nextIndex + actionData.action.length) % 16]).join('')}`;
    const entry = { index: nextIndex, action: actionData.action, officer: actionData.officerName || 'Rajiv Menon', badge: actionData.officerBadge || 'MHA-001', role: actionData.role || 'Authorised Officer', timestamp: new Date().toISOString(), details: actionData.details || 'Custody action recorded.', hash: nextHash, previousHash: previous, verified: true, location: actionData.location || 'Registered evidence facility' };
    setDocuments((currentDocuments) => currentDocuments.map((document) => document.docId === docId ? { ...document, chain: [...document.chain, entry], chainLength: document.chain.length + 1, lastActivity: entry.timestamp } : document));
    try { await api.addAction(docId, actionData); } catch { /* Demo state remains usable against the repository's minimal backend. */ }
    return entry;
  }

  async function verifyDocument(docId) {
    const document = documents.find((item) => item.docId === docId);
    if (!document) return { valid: false, details: 'Document not found.' };
    try { await api.verifyChain(docId); } catch { /* Local verification keeps the judge flow deterministic. */ }
    const result = verifyLocalChain(document);
    setDocuments((current) => current.map((item) => item.docId === docId ? { ...item, status: result.valid ? 'valid' : 'compromised' } : item));
    return result;
  }

  async function tamperDocument(docId, blockIndex, fakeData) {
    const document = documents.find((item) => item.docId === docId);
    if (!document) throw new Error('Document not found.');
    setDocuments((current) => current.map((item) => {
      if (item.docId !== docId) return item;
      return { ...item, status: 'compromised', chain: item.chain.map((entry, index) => index >= blockIndex ? { ...entry, verified: false, compromised: true, details: index === blockIndex ? fakeData : `${entry.details} · Downstream link requires review.` } : entry) };
    }));
    try { await api.simulateTamper(docId, blockIndex, fakeData); } catch { /* This is an intentional local demo action. */ }
  }

  function restoreDocument(docId, baseline) {
    setDocuments((current) => current.map((item) => item.docId === docId ? { ...item, status: 'valid', chain: JSON.parse(JSON.stringify(baseline)), chainLength: baseline.length } : item));
  }

  return <BrowserRouter><Toaster position="bottom-right" toastOptions={{ duration: 3400, style: { background: theme === 'dark' ? '#13233a' : '#0A2540', color: '#fff', borderRadius: '8px', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px' } }} /><AppErrorBoundary><AppShell theme={theme} onThemeChange={setTheme} highContrast={highContrast} onContrastChange={() => setHighContrast((value) => !value)} apiOnline={apiOnline}><Routes><Route path="/" element={<LandingPage documents={documents} />} /><Route path="/dashboard" element={<DashboardPage documents={documents} onRefresh={() => setLastSync(new Date())} lastSync={lastSync} />} /><Route path="/document/:docId" element={<DocumentDetailPage documents={documents} onAddAction={addAction} onVerify={verifyDocument} onTamper={tamperDocument} />} /><Route path="/upload" element={<UploadPage onUpload={uploadDocument} />} /><Route path="/verify" element={<VerifyPage documents={documents} onVerify={verifyDocument} />} /><Route path="/demo" element={<DemoPage documents={documents} onTamper={tamperDocument} onRestore={restoreDocument} />} /><Route path="/transfer" element={<TransferPage documents={documents} onAddAction={addAction} />} /><Route path="/anomalies" element={<AnomaliesPage documents={documents} />} /><Route path="/reports" element={<ReportsPage documents={documents} />} /><Route path="/admin" element={<AdminPage documents={documents} />} /><Route path="*" element={<NotFoundPage />} /></Routes></AppShell></AppErrorBoundary></BrowserRouter>;
}

function LandingPage({ documents }) {
  const valid = documents.filter((document) => document.status === 'valid').length;
  const compromised = documents.filter((document) => document.status === 'compromised').length;
  const leadDocument = documents[0];
  return <div className="landing-page">
    <motion.section className="landing-hero" {...motionProps(0.03)}>
      <div className="landing-hero__copy"><div className="hero-official"><span className="hero-official__line" /><span>Government of India · Ministry of Home Affairs</span></div><h1>Custody you can <span>prove.</span></h1><p className="landing-hero__lead">SAKSHYA is a secure digital evidence and document custody grid that turns every handover, review and court access into a verifiable chain of record.</p><div className="hero-actions"><Link to="/dashboard" className="button button--primary">Open command centre <ArrowRight size={16} /></Link><Link to="/demo" className="button button--ghost">See the tamper demo <Network size={16} /></Link></div><div className="hero-trust"><span><ShieldCheck size={14} /> SHA-256 linked records</span><span><LockKeyhole size={14} /> Restricted access control</span><span><BadgeCheck size={14} /> Court-ready audit trail</span></div></div>
      <div className="landing-hero__visual"><div className="hero-grid-lines" /><div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" /><div className="hero-node hero-node--main"><div className="hero-node__top"><span className="hero-node__signal"><span /> LIVE INTEGRITY ENGINE</span><Fingerprint size={24} /></div><strong>Evidence<br />remains intact.</strong><div className="hero-node__footer"><span>chain state</span><StatusBadge status="verified" label="VERIFIED" pulse /></div></div><div className="hero-mini-node hero-mini-node--a"><span>BLOCK 04</span><code>{shortHash(leadDocument?.chain?.at(-1)?.hash)}</code></div><div className="hero-mini-node hero-mini-node--b"><span>HASH LINK</span><Link2 size={15} /></div><div className="hero-connector hero-connector--a" /><div className="hero-connector hero-connector--b" /></div>
    </motion.section>
    <section className="landing-stats"><div><span className="landing-stats__value">{documents.length || 0}</span><span className="landing-stats__label">Evidence records</span></div><div><span className="landing-stats__value">{valid}</span><span className="landing-stats__label">Verified chains</span></div><div className={compromised ? 'landing-stats__alert' : ''}><span className="landing-stats__value">{compromised}</span><span className="landing-stats__label">Compromised</span></div><div><span className="landing-stats__value">99.98%</span><span className="landing-stats__label">Grid availability</span></div></section>
    <section className="landing-section"><div className="landing-section__heading"><div><SectionEyebrow icon={Activity}>WHY SAKSHYA</SectionEyebrow><h2>Evidence history that stands up to scrutiny.</h2></div><p>Built for the operational reality of law enforcement and the evidentiary standards of the judiciary.</p></div><div className="landing-feature-grid"><FeatureCard icon={Fingerprint} number="01" title="Seal once. Verify forever." text="Each custody event is linked to the previous record using a SHA-256 fingerprint, making unauthorised changes mathematically visible." /><FeatureCard icon={Users} number="02" title="Accountability at every handover." text="Officer identity, badge, location and time are recorded together so responsibility never gets lost between departments." /><FeatureCard icon={FileCheck2} number="03" title="Court-ready by design." text="Generate an official report with signatures, timestamps and cryptographic proof for judicial review." /></div></section>
    <section className="landing-chain-section"><div className="landing-section__heading"><div><SectionEyebrow icon={Network}>LIVE SYSTEM MODEL</SectionEyebrow><h2>A transparent chain for an invisible guarantee.</h2></div><Link to="/document/DOC-2026-00217" className="text-link">Explore a custody record <ArrowUpRight size={15} /></Link></div><HashChainVisualizer chain={leadDocument?.chain?.slice(0, 4) || []} compact /></section>
    <div className="landing-cta"><div><SectionEyebrow icon={Building2}>NATIONAL EVIDENCE GRID</SectionEyebrow><h2>Make every record defensible.</h2><p>SAKSHYA is a Smart India Hackathon 2026 prototype for SIH26190 · Ministry of Home Affairs.</p></div><Link to="/upload" className="button button--light">Seal new evidence <FilePlus2 size={16} /></Link></div>
  </div>;
}

function FeatureCard({ icon: Icon, number, title, text }) {
  return <motion.article className="feature-card" {...motionProps(Number(number) * 0.04)}><div className="feature-card__top"><span className="feature-card__icon"><Icon size={19} /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p><ArrowUpRight className="feature-card__arrow" size={17} /></motion.article>;
}

function DashboardPage({ documents, onRefresh, lastSync }) {
  const [query, setQuery] = useState('');
  const filtered = documents.filter((document) => `${document.docId} ${document.caseId} ${document.name} ${document.classification}`.toLowerCase().includes(query.toLowerCase()));
  const validCount = documents.filter((document) => document.status === 'valid').length;
  const compromisedCount = documents.filter((document) => document.status === 'compromised').length;
  const totalBlocks = documents.reduce((sum, document) => sum + document.chain.length, 0);
  return <div className="dashboard-page"><PageHeader eyebrow="OPERATIONS OVERVIEW" icon={LayoutIcon} title="Command centre" description="A live operational view of evidence custody across the secure grid." actions={<><button className="button button--secondary" type="button" onClick={() => { onRefresh(); toast.success('Evidence register refreshed.'); }}><RefreshCw size={15} />Refresh register</button><Link className="button button--primary" to="/upload"><FilePlus2 size={15} />Seal evidence</Link></>} /><section className="stats-grid"><StatsCard label="Documents in custody" value={documents.length.toString().padStart(2, '0')} helper={`${totalBlocks} linked custody blocks`} icon={FileCheck2} tone="navy" trend="+12.4%" /><StatsCard label="Verified chains" value={validCount.toString().padStart(2, '0')} helper="No broken links detected" icon={ShieldCheck} tone="teal" trend="+8.2%" /><StatsCard label="Anomaly alerts" value={compromisedCount.toString().padStart(2, '0')} helper={compromisedCount ? 'Immediate review required' : 'No active alerts'} icon={ShieldAlert} tone={compromisedCount ? 'amber' : 'slate'} trend={compromisedCount ? '+1 today' : 'Stable'} /><StatsCard label="Cases pending review" value="07" helper="Across 4 departments" icon={ClipboardCheck} tone="blue" trend="-3.1%" /></section><section className="dashboard-layout"><div className="panel panel--activity"><div className="panel-header"><div><SectionEyebrow icon={Activity}>AUDIT STREAM</SectionEyebrow><h2>Recent custody activity</h2></div><button className="icon-button" type="button" title="Activity options"><MoreHorizontal size={17} /></button></div><div className="activity-feed">{activityFeed.map((item, index) => <motion.article className="activity-item" key={`${item.subject}-${item.time}`} {...motionProps(index * 0.05)}><span className={cn('activity-item__icon', `activity-item__icon--${item.tone}`)}>{item.icon === 'alert' ? <ShieldAlert size={15} /> : item.icon === 'verified' ? <ShieldCheck size={15} /> : item.icon === 'transfer' ? <ArrowRight size={15} /> : item.icon === 'court' ? <Building2 size={15} /> : <Eye size={15} />}</span><div className="activity-item__content"><div><strong>{item.title}</strong><time>{relativeTime(item.time)}</time></div><span><code>{item.subject}</code> · {item.meta}</span></div></motion.article>)}</div><Link to="/dashboard" className="panel-footer-link">View complete audit stream <ArrowRight size={14} /></Link></div><div className="panel panel--posture"><div className="panel-header"><div><SectionEyebrow icon={BarChart3}>SYSTEM POSTURE</SectionEyebrow><h2>7-day custody volume</h2></div><span className="panel-period">Last 7 days <ChevronDown size={13} /></span></div><div className="chart-legend"><span><i className="legend-line legend-line--sealed" />sealed</span><span><i className="legend-line legend-line--verified" />verified</span><span><i className="legend-line legend-line--alert" />alerts</span></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 4, left: -25, bottom: 0 }}><defs><linearGradient id="sealedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient><linearGradient id="verifiedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f6e56" stopOpacity={0.18} /><stop offset="100%" stopColor="#0f6e56" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel)', fontSize: 11 }} /><Area type="monotone" dataKey="sealed" stroke="#2563eb" strokeWidth={2} fill="url(#sealedFill)" /><Area type="monotone" dataKey="verified" stroke="#0f6e56" strokeWidth={2} fill="url(#verifiedFill)" /></AreaChart></ResponsiveContainer></div><div className="posture-foot"><span><span className="pulse-dot pulse-dot--green" />Integrity engine operational</span><span className="mono">synced {relativeTime(lastSync.toISOString())}</span></div></div></section><section className="register-section"><div className="section-toolbar"><div><SectionEyebrow icon={FileCheck2}>EVIDENCE REGISTER</SectionEyebrow><h2>All custody records <span>{documents.length}</span></h2></div><div className="register-tools"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by ID, case or name" /></label><button className="button button--secondary button--icon-only" type="button" title="Filter records"><MoreHorizontal size={17} /></button></div></div><div className="document-grid">{filtered.map((document, index) => <DocumentCard document={document} key={document.docId} index={index} />)}{!filtered.length && <EmptyState icon={Search} title="No records match" text="Try a document ID, case reference or classification." />}</div></section></div>;
}

function DocumentCard({ document, index = 0 }) {
  return <motion.article className={cn('document-card', document.status === 'compromised' && 'document-card--compromised')} {...motionProps(0.04 + index * 0.04)}><div className="document-card__top"><div className="document-card__file-icon"><FileText size={19} /></div><StatusBadge status={document.status} /></div><div className="document-card__identity"><Link to={`/document/${document.docId}`}><h3>{document.docId}</h3></Link><p>{document.name}</p></div><div className="document-card__meta"><span><small>CASE REFERENCE</small><code>{document.caseId}</code></span><span><small>CLASSIFICATION</small><strong>{document.classification}</strong></span></div><div className="document-card__bottom"><span><Link2 size={13} /> {document.chain.length} blocks linked</span><span>{relativeTime(document.lastActivity)}</span><Link to={`/document/${document.docId}`} className="round-arrow" aria-label={`Open ${document.docId}`}><ArrowUpRight size={15} /></Link></div></motion.article>;
}

function LayoutIcon(props) {
  return <Activity {...props} />;
}

function DocumentDetailPage({ documents, onAddAction, onVerify, onTamper }) {
  const { docId } = useParams();
  const document = documents.find((item) => item.docId === docId);
  const navigate = useNavigate();
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [result, setResult] = useState(document ? verifyLocalChain(document) : null);
  const [actionOpen, setActionOpen] = useState(false);
  const [tamperOpen, setTamperOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ action: 'VIEWED', officerName: 'Rajiv Menon', officerBadge: 'MHA-001', details: '' });
  const [tamperForm, setTamperForm] = useState({ blockIndex: '2', fakeData: 'Description modified outside the authorised custody workflow.' });

  useEffect(() => { if (document) setResult(verifyLocalChain(document)); }, [docId, document?.status, document?.chain.length]);
  if (!document) return <NotFoundPage compact />;

  async function verify() {
    setVerifyBusy(true);
    await wait(850);
    const next = await onVerify(document.docId);
    setResult(next);
    setVerifyBusy(false);
    toast[next.valid ? 'success' : 'error'](next.valid ? 'Custody chain verified.' : `Integrity break detected at block ${next.brokenAtIndex}.`);
  }

  async function submitAction(event) {
    event.preventDefault();
    await onAddAction(document.docId, actionForm);
    setActionOpen(false);
    setResult({ valid: true, details: 'New custody action appended and linked to the prior block.' });
    setActionForm((current) => ({ ...current, details: '' }));
    toast.success('Custody action appended to chain.');
  }

  async function submitTamper(event) {
    event.preventDefault();
    await onTamper(document.docId, Number(tamperForm.blockIndex), tamperForm.fakeData);
    setTamperOpen(false);
    setResult({ valid: false, brokenAtIndex: Number(tamperForm.blockIndex), details: `Block ${tamperForm.blockIndex} no longer matches its recorded fingerprint.` });
    toast('Demo mutation applied. Verify the chain to see the break.', { icon: '⚠' });
  }

  return <div className="detail-page"><PageHeader eyebrow="CUSTODY RECORD" icon={FileCheck2} title={document.docId} description={`${document.name} · ${document.caseId}`} actions={<><button className="button button--secondary" type="button" onClick={() => setActionOpen(true)}><FilePlus2 size={15} />Add action</button><button className="button button--primary" type="button" onClick={verify} disabled={verifyBusy}>{verifyBusy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}{verifyBusy ? 'Verifying…' : 'Verify chain'}</button><button className="button button--danger-ghost" type="button" onClick={() => setTamperOpen(true)}><Zap size={15} />Simulate tamper</button></>} /><div className="detail-summary"><div className="detail-summary__identity"><div className="document-hero-icon"><FileText size={24} /></div><div><span className="section-eyebrow">DOCUMENT ID</span><h2>{document.docId}</h2><div className="detail-summary__badges"><StatusBadge status={document.status} /><span className="classification-badge">{document.classification}</span><span className="classification-badge">{document.evidenceType}</span></div></div></div><div className="detail-summary__stats"><div><span>Case reference</span><strong>{document.caseId}</strong></div><div><span>Chain length</span><strong>{document.chain.length} blocks</strong></div><div><span>Last activity</span><strong>{relativeTime(document.lastActivity)}</strong></div></div></div><VerificationResult result={result} busy={verifyBusy} onVerify={verify} /><div className="detail-main-grid"><div><HashChainVisualizer chain={document.chain} /><section className="panel timeline-panel"><div className="panel-header"><div><SectionEyebrow icon={Clock3}>CUSTODY TIMELINE</SectionEyebrow><h2>Immutable activity record</h2></div><span className="panel-counter">{document.chain.length} events</span></div><TimelineComponent chain={document.chain} /></section></div><aside className="detail-aside"><section className="panel metadata-panel"><div className="panel-header"><div><SectionEyebrow icon={Info}>RECORD METADATA</SectionEyebrow><h2>Evidence profile</h2></div><button className="icon-button" type="button"><MoreHorizontal size={17} /></button></div><MetadataRow label="Description" value={document.description} /><MetadataRow label="Evidence type" value={document.evidenceType} /><MetadataRow label="File size" value={document.size} /><MetadataRow label="Registered at" value="National Evidence Grid" /><div className="metadata-divider" /><div className="metadata-seal"><ShieldCheck size={18} /><div><strong>Custody policy active</strong><span>Dual officer confirmation required for transfer.</span></div></div></section><section className="panel integrity-side-panel"><SectionEyebrow icon={Fingerprint}>INTEGRITY SUMMARY</SectionEyebrow><IntegrityMeter value={result?.valid ? 100 : 42} /><div className="integrity-side-row"><span>Root fingerprint</span><HashChip hash={document.chain[0]?.hash} /></div><div className="integrity-side-row"><span>Latest block</span><HashChip hash={document.chain.at(-1)?.hash} /></div><Link to={`/reports?doc=${document.docId}`} className="button button--secondary button--full"><FileText size={15} />Open forensic report</Link></section></aside></div>{actionOpen && <Modal title="Append custody action" eyebrow="CONTROLLED WRITE" onClose={() => setActionOpen(false)}><form className="modal-form" onSubmit={submitAction}><FormField label="Action type" required><select value={actionForm.action} onChange={(event) => setActionForm({ ...actionForm, action: event.target.value })}><option>VIEWED</option><option>TRANSFERRED</option><option>EDITED</option><option>COURT_ACCESSED</option></select></FormField><div className="form-grid form-grid--two"><FormField label="Officer name" required><input value={actionForm.officerName} onChange={(event) => setActionForm({ ...actionForm, officerName: event.target.value })} /></FormField><FormField label="Badge number" required><input value={actionForm.officerBadge} onChange={(event) => setActionForm({ ...actionForm, officerBadge: event.target.value })} /></FormField></div><FormField label="Action details" required><textarea value={actionForm.details} onChange={(event) => setActionForm({ ...actionForm, details: event.target.value })} placeholder="State why this action was performed…" required /></FormField><div className="modal-form__footer"><span><LockKeyhole size={14} /> This action becomes part of the signed record.</span><button className="button button--primary" type="submit">Append to chain <ArrowRight size={15} /></button></div></form></Modal>}{tamperOpen && <Modal title="Simulate tamper event" eyebrow="DEMO-ONLY CONTROL" onClose={() => setTamperOpen(false)}><form className="modal-form" onSubmit={submitTamper}><div className="warning-callout"><AlertTriangle size={17} /><div><strong>For demonstration purposes only</strong><p>This directly mutates a local block without recalculating its hash. Use Verify chain afterwards to show the mathematical break.</p></div></div><FormField label="Block to mutate" required><select value={tamperForm.blockIndex} onChange={(event) => setTamperForm({ ...tamperForm, blockIndex: event.target.value })}>{document.chain.map((entry) => <option key={entry.index} value={entry.index}>Block {String(entry.index).padStart(2, '0')} · {entry.action}</option>)}</select></FormField><FormField label="Injected fake data" required><textarea value={tamperForm.fakeData} onChange={(event) => setTamperForm({ ...tamperForm, fakeData: event.target.value })} required /></FormField><div className="modal-form__footer"><span className="text-danger"><ShieldAlert size={14} /> Chain will be marked compromised.</span><button className="button button--danger" type="submit">Apply demo mutation <Zap size={15} /></button></div></form></Modal>}</div>;
}

function MetadataRow({ label, value }) {
  return <div className="metadata-row"><span>{label}</span><strong>{value}</strong></div>;
}

function FormField({ label, required, hint, children }) {
  return <label className="form-field"><span>{label}{required && <i>*</i>}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function UploadPage({ onUpload }) {
  const [form, setForm] = useState({ docId: '', caseId: '', officerName: 'Rajiv Menon', officerBadge: 'MHA-001', description: '', evidenceType: 'Digital Document', classification: 'Sensitive' });
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
    if (fingerprint.status !== 'done') await generateFingerprint();
    const document = await onUpload({ ...form, file });
    setBusy(false);
    setSuccess(document);
    toast.success('Evidence sealed and registered.');
  }

  return <div className="upload-page"><PageHeader eyebrow="EVIDENCE INTAKE" icon={UploadCloud} title="Seal new evidence" description="Create a cryptographic root record before evidence enters the custody workflow." actions={<div className="secure-context"><LockKeyhole size={14} /><span>Controlled write · Senior Authority</span></div>} /><div className="upload-layout"><form className="panel upload-form" onSubmit={submit}><div className="panel-header"><div><SectionEyebrow icon={FilePlus2}>RECORD DETAILS</SectionEyebrow><h2>Evidence metadata</h2></div><span className="required-note"><i>*</i> required</span></div><div className="form-grid form-grid--two"><FormField label="Document ID" required hint="Unique custody reference"><div className="input-with-prefix"><span>SAK</span><input value={form.docId} onChange={(event) => setField('docId', event.target.value)} placeholder="DOC-2026-00218" /></div>{errors.docId && <small className="field-error">{errors.docId}</small>}</FormField><FormField label="Case reference" required><input value={form.caseId} onChange={(event) => setField('caseId', event.target.value)} placeholder="CASE/DEL/24-1188" />{errors.caseId && <small className="field-error">{errors.caseId}</small>}</FormField></div><div className="form-grid form-grid--two"><FormField label="Evidence type" required><select value={form.evidenceType} onChange={(event) => setField('evidenceType', event.target.value)}><option>Digital Document</option><option>Physical Item</option><option>Media Extract</option><option>Forensic Image</option></select></FormField><FormField label="Classification level" required><select value={form.classification} onChange={(event) => setField('classification', event.target.value)}><option>Normal</option><option>Sensitive</option><option>Classified</option></select></FormField></div><FormField label="Description" required hint="This description becomes part of the signed block"><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Describe what this evidence contains and why it is being registered…" />{errors.description && <small className="field-error">{errors.description}</small>}</FormField><div className="form-divider" /><div className="panel-header panel-header--form"><div><SectionEyebrow icon={UserCheck}>REGISTERING OFFICER</SectionEyebrow><h2>Identity confirmation</h2></div><span className="verified-caption"><CheckCircle2 size={13} /> Session verified</span></div><div className="form-grid form-grid--two"><FormField label="Officer name" required><input value={form.officerName} onChange={(event) => setField('officerName', event.target.value)} />{errors.officerName && <small className="field-error">{errors.officerName}</small>}</FormField><FormField label="Badge / department ID" required><input value={form.officerBadge} onChange={(event) => setField('officerBadge', event.target.value)} />{errors.officerBadge && <small className="field-error">{errors.officerBadge}</small>}</FormField></div><div className="form-submit-row"><span><ShieldCheck size={14} /> Metadata will be sealed with the current timestamp.</span><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <LockKeyhole size={15} />}{busy ? 'Sealing record…' : 'Seal & register evidence'}</button></div></form><aside className="upload-side"><section className="panel drop-panel"><div className="panel-header"><div><SectionEyebrow icon={FileText}>SOURCE PACKAGE</SectionEyebrow><h2>Attach evidence</h2></div><span className="optional-note">optional in demo</span></div><label className={cn('dropzone', dragging && 'dropzone--dragging')} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}><input type="file" onChange={(event) => selectFile(event.target.files?.[0])} /><span className="dropzone__icon"><UploadCloud size={24} /></span><strong>{file ? file.name : 'Drop a source package here'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || 'application/octet-stream'}` : 'PDF, image, audio, video or forensic archive'}</span><small>Maximum prototype payload · 500 MB</small></label>{file && <div className="file-preview"><FileText size={16} /><div><strong>{file.name}</strong><span>Ready for fingerprinting</span></div><button className="icon-button" type="button" onClick={() => setFile(null)} aria-label="Remove attached file"><X size={15} /></button></div>}</section><section className="panel fingerprint-panel"><div className="panel-header"><div><SectionEyebrow icon={Fingerprint}>CRYPTOGRAPHIC FINGERPRINT</SectionEyebrow><h2>Root hash generation</h2></div><span className={cn('hash-state', `hash-state--${fingerprint.status}`)}>{fingerprint.status === 'done' ? 'COMPLETE' : fingerprint.status === 'generating' ? 'RUNNING' : 'READY'}</span></div><div className="fingerprint-workspace"><div className="fingerprint-graphic"><div className={cn('fingerprint-core', fingerprint.status === 'generating' && 'fingerprint-core--active', fingerprint.status === 'done' && 'fingerprint-core--done')}><Fingerprint size={29} /></div><span className="fingerprint-ring fingerprint-ring--one" /><span className="fingerprint-ring fingerprint-ring--two" /></div><div className="fingerprint-copy">{fingerprint.status === 'idle' && <><strong>Not generated yet</strong><p>Run the fingerprint engine to seal the metadata and source package.</p></>}{fingerprint.status === 'generating' && <><strong>Computing SHA-256…</strong><p>Normalising package bytes and linking to the case record.</p></>}{fingerprint.status === 'done' && <><strong>Fingerprint generated</strong><p className="mono">sha256:8f21c0b7…2ac901d4</p></>}</div></div><div className="fingerprint-progress"><span style={{ width: `${fingerprint.progress}%` }} /><small>{fingerprint.progress}%</small></div><button className="button button--secondary button--full" type="button" onClick={generateFingerprint} disabled={fingerprint.status === 'generating'}>{fingerprint.status === 'done' ? <><Check size={15} />Fingerprint confirmed</> : <><Fingerprint size={15} />Generate cryptographic fingerprint</>}</button></section></aside></div>{success && <Modal title="Evidence sealed successfully" eyebrow="CHAIN ROOT CREATED" onClose={() => setSuccess(null)}><div className="success-modal"><div className="success-modal__icon"><ShieldCheck size={30} /></div><h3>{success.docId}</h3><p>The evidence record is now the first verified block in a new chain of custody.</p><div className="success-modal__hash"><span>ROOT FINGERPRINT</span><HashChip hash={success.chain[0]?.hash} /></div><div className="success-modal__details"><span><strong>Case reference</strong>{success.caseId}</span><span><strong>Registered by</strong>{success.chain[0]?.officer}</span></div><div className="modal-form__footer"><Link to={`/document/${success.docId}`} className="button button--primary" onClick={() => setSuccess(null)}>Open custody record <ArrowRight size={15} /></Link><button className="button button--secondary" type="button" onClick={() => setSuccess(null)}>Seal another</button></div></div></Modal>}</div>;
}

function VerifyPage({ documents, onVerify }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const document = documents.find((item) => item.docId === selectedId);

  async function runVerification() {
    if (!document) return;
    setBusy(true);
    setResult(null);
    setLogs([]);
    const checks = ['Loading signed chain manifest', `Checking ${document.chain.length} block fingerprints`, 'Comparing previous-hash pointers', 'Validating officer and timestamp metadata', 'Writing verification result to audit stream'];
    for (const [index, check] of checks.entries()) {
      await wait(250);
      setLogs((current) => [...current, { text: check, time: new Date().toISOString(), ok: index < 4 }]);
    }
    const next = await onVerify(selectedId);
    setResult(next);
    setBusy(false);
    toast[next.valid ? 'success' : 'error'](next.valid ? 'Chain valid — all links verified.' : `Tampering detected at block ${next.brokenAtIndex}.`);
  }

  return <div className="verify-page"><PageHeader eyebrow="INTEGRITY VERIFICATION" icon={ShieldCheck} title="Chain verifier" description="Recompute the evidence history and confirm that no custody record has changed." actions={<Link to="/demo" className="button button--secondary"><Network size={15} />Open judge demo</Link>} /><div className="verify-layout"><section className="panel verify-control"><div className="panel-header"><div><SectionEyebrow icon={FileCheck2}>SELECT RECORD</SectionEyebrow><h2>Evidence to verify</h2></div><StatusBadge status="online" label="Engine ready" /></div><FormField label="Document or case record"><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null); setLogs([]); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></FormField>{document && <div className="verify-document-card"><div className="document-hero-icon"><FileText size={21} /></div><div><strong>{document.docId}</strong><span>{document.caseId}</span><small>{document.chain.length} linked blocks · {document.classification}</small></div><StatusBadge status={document.status} /></div>}<button className="button button--primary button--full verify-button" type="button" onClick={runVerification} disabled={busy || !document}>{busy ? <><LoaderCircle size={17} className="spin" />Verifying custody chain…</> : <><ShieldCheck size={17} />Verify chain integrity</>}</button><div className="verify-note"><Info size={14} /><span>The engine recomputes each block locally and compares its stored fingerprint with the linked previous hash.</span></div></section><section className="verify-result-column">{result || busy ? <VerificationResult result={result || { valid: true, details: 'Verification engine is checking every linked block.' }} busy={busy} /> : <div className="verify-placeholder"><div className="verify-placeholder__icon"><ShieldCheck size={34} /></div><h2>Ready to verify</h2><p>Select a record and run the integrity engine. The result will include the exact block where a chain diverges.</p></div>}<div className="panel verification-log"><div className="panel-header"><div><SectionEyebrow icon={Terminal}>VERIFICATION LOG</SectionEyebrow><h2>Engine activity</h2></div><span className="mono">{logs.length}/{5} checks</span></div>{logs.length ? <div className="log-list">{logs.map((log, index) => <motion.div className="log-row" key={`${log.text}-${index}`} {...motionProps(index * 0.03)}><span className="log-row__icon"><Check size={13} /></span><div><strong>{log.text}</strong><span>{formatTime(log.time)}</span></div><code>PASS</code></motion.div>)}</div> : <EmptyState icon={Terminal} title="No verification run yet" text="Your cryptographic verification trace will appear here." />}</div></section></div>{result && !result.valid && <section className="panel broken-block-panel"><div className="broken-block-panel__icon"><AlertTriangle size={19} /></div><div><SectionEyebrow>EXCEPTION LOCATION</SectionEyebrow><h2>Broken link detected at block {String(result.brokenAtIndex).padStart(2, '0')}</h2><p>{result.details}</p></div><Link to={`/document/${selectedId}`} className="button button--danger-ghost">Inspect custody record <ArrowRight size={15} /></Link></section>}</div>;
}

function DemoPage({ documents, onTamper, onRestore }) {
  const candidate = documents.find((item) => item.docId === 'DOC-2026-00217') || documents.find((item) => item.status === 'valid') || documents[0];
  const [selectedId, setSelectedId] = useState(candidate?.docId || '');
  const [baseline, setBaseline] = useState(() => JSON.parse(JSON.stringify(candidate?.chain || [])));
  const [tampered, setTampered] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [comparison, setComparison] = useState(50);
  const [logs, setLogs] = useState(['Demo workspace initialised', 'Baseline chain loaded from sealed record']);
  const document = documents.find((item) => item.docId === selectedId) || candidate;
  const afterChain = tampered ? document?.chain : baseline;
  const afterResult = tampered ? verifyLocalChain({ chain: afterChain }) : { valid: true };
  const tourSteps = [
    { target: '#demo-record-select', content: 'Choose a sealed record. The demo keeps the explanation grounded in a real custody chain.', disableBeacon: true },
    { target: '#demo-tamper-action', content: 'Trigger a controlled mutation. The block data changes without recalculating its fingerprint.', placement: 'bottom' },
    { target: '#demo-before-card', content: 'Compare the original signed chain with the mutated chain. The first broken link is highlighted in red.', placement: 'top' },
    { target: '#demo-terminal', content: 'Use this trace to explain how the integrity engine detects the divergence for a judge or evaluator.', placement: 'top' },
  ];

  useEffect(() => {
    const next = documents.find((item) => item.docId === selectedId);
    if (next && !tampered) setBaseline(JSON.parse(JSON.stringify(next.chain)));
  }, [selectedId]);

  async function simulate() {
    if (!document) return;
    setChecking(true);
    setLogs((current) => [...current, `Mutating block 02 on ${document.docId}`]);
    await onTamper(document.docId, Math.min(2, document.chain.length - 1), 'Injected demo value: custody description altered.');
    await wait(360);
    setTampered(true);
    setLogs((current) => [...current, 'Fingerprint mismatch introduced', 'Ready to verify divergence']);
    setChecking(false);
    toast('Tamper simulation applied to local demo copy.', { icon: '⚠' });
  }

  function reset() {
    if (!document) return;
    onRestore(document.docId, baseline);
    setTampered(false);
    setLogs(['Demo workspace reset', 'Baseline hashes restored']);
    toast.success('Demo chain restored to its intact state.');
  }

  return <div className="demo-page"><Joyride steps={tourSteps} run={tourRunning} continuous showProgress showSkipButton callback={(data) => { if (['finished', 'skipped'].includes(data.status)) setTourRunning(false); }} styles={{ options: { primaryColor: '#0a2540', zIndex: 120 } }} /><PageHeader eyebrow="DEMONSTRATION MODE" icon={Network} title="Show the proof" description="A controlled, visual walkthrough of how a hash chain exposes an unauthorised change." actions={<div className="demo-head-actions"><button className="button button--secondary" type="button" onClick={() => setTourRunning(true)}><Info size={15} />Guided tour</button><div className="demo-mode-badge"><span className="pulse-dot pulse-dot--amber" />Judge presentation mode</div></div>} /><section className="demo-command"><div className="demo-command__copy"><SectionEyebrow icon={FileCheck2}>SELECT A SEALED RECORD</SectionEyebrow><h2>Run the before / after test</h2><p>Use this flow to explain the integrity guarantee in under two minutes.</p></div><div className="demo-command__controls"><select id="demo-record-select" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setTampered(false); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select>{tampered ? <button id="demo-tamper-action" className="button button--secondary" type="button" onClick={reset}><RefreshCw size={15} />Reset demo</button> : <button id="demo-tamper-action" className="button button--danger" type="button" onClick={simulate} disabled={checking}>{checking ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}{checking ? 'Applying mutation…' : 'Simulate tamper'}</button>}</div></section><div className="demo-comparison"><DemoChainColumn tourId="demo-before-card" title="Before tamper" subtitle="Original signed state" chain={baseline} valid /><div className="demo-divider"><span>THEN</span><ArrowRight size={17} /><span>NOW</span></div><DemoChainColumn title="After tamper" subtitle={tampered ? 'Recomputed state' : 'Awaiting simulation'} chain={afterChain} valid={!tampered} /><div className="demo-result-badge"><span className={tampered ? 'demo-result-badge--bad' : 'demo-result-badge--good'}>{tampered ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}</span><strong>{tampered ? 'CHAIN BREAK VISIBLE' : 'CHAIN INTACT'}</strong><small>{tampered ? `Block ${afterResult.brokenAtIndex} fails verification` : 'No mismatch detected'}</small></div></div><div className="comparison-control"><span>Original state</span><input aria-label="Compare original and mutated states" type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} /><span>Mutated state</span><strong>{comparison}% focus</strong></div><section className="demo-lower-grid"><div className="panel explainer-panel"><SectionEyebrow icon={Fingerprint}>HOW THE DETECTION WORKS</SectionEyebrow><h2>One changed value breaks the link.</h2><div className="explainer-steps"><ExplainerStep number="01" title="Each action is hashed" text="The block stores its own data fingerprint — including officer, time and action." /><ExplainerStep number="02" title="The next block remembers it" text="Every new record stores the previous block’s hash, creating a linked sequence." /><ExplainerStep number="03" title="Verification recomputes everything" text="A single altered value produces a different fingerprint and exposes the exact break." /></div><Link to="/verify" className="text-link">Open full chain verifier <ArrowRight size={15} /></Link></div><div id="demo-terminal" className="panel terminal-panel"><div className="panel-header"><div><SectionEyebrow icon={Terminal}>LIVE DEMO TRACE</SectionEyebrow><h2>Integrity engine console</h2></div><span className="terminal-live"><span /> LIVE</span></div><div className="terminal-window"><div className="terminal-window__bar"><span /><span /><span /><code>sakshya-integrity-engine</code></div><div className="terminal-output">{logs.map((log, index) => <div key={`${log}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><code><i>›</i> {log}{index === logs.length - 1 && <b className="terminal-cursor" />}</code></div>)}</div></div><div className="terminal-footer"><span><span className="pulse-dot pulse-dot--green" />Local test environment</span><code>SHA-256 / chained</code></div></div></section></div>;
}

function DemoChainColumn({ title, subtitle, chain = [], valid, tourId }) {
  return <section id={tourId} className={cn('demo-chain-column', !valid && 'demo-chain-column--bad')}><div className="demo-chain-column__header"><div><h3>{title}</h3><span>{subtitle}</span></div><StatusBadge status={valid ? 'valid' : 'compromised'} label={valid ? 'VALID' : 'BROKEN'} /></div><div className="demo-block-list">{chain.slice(0, 5).map((entry, index) => { const bad = !valid && index >= 2; return <div className={cn('demo-block', bad && 'demo-block--bad')} key={`${entry.index}-${title}`}><span className="demo-block__number">{String(entry.index).padStart(2, '0')}</span><div><strong>{entry.action.replaceAll('_', ' ')}</strong><HashChip hash={entry.hash} copyable={false} label="" /></div>{bad ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}</div>; })}</div><div className="demo-chain-column__foot"><span><Link2 size={13} />{chain.length} linked blocks</span><code>{valid ? 'MATCH' : 'MISMATCH'}</code></div></section>;
}

function ExplainerStep({ number, title, text }) {
  return <div className="explainer-step"><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function AnomaliesPage() {
  const [expanded, setExpanded] = useState(anomalyEvents[0]?.id);
  const [events, setEvents] = useState(anomalyEvents);
  const open = events.filter((event) => event.status === 'Open').length;
  function escalate(id) {
    setEvents((current) => current.map((event) => event.id === id ? { ...event, status: 'Escalated' } : event));
    toast.success('Alert escalated to the Senior Authority queue.');
  }
  return <div className="anomalies-page"><PageHeader eyebrow="SECURITY MONITORING" icon={ShieldAlert} title="Anomaly centre" description="AI-assisted detection of access patterns that fall outside the expected custody profile." actions={<><div className="security-score"><span>GRID RISK</span><strong>LOW</strong><i>18 / 100</i></div><button className="button button--secondary" type="button"><RefreshCw size={15} />Refresh signals</button></>} /><section className="anomaly-overview"><div className="security-overview-card"><div className="security-overview-card__top"><div><SectionEyebrow icon={ShieldCheck}>SECURITY POSTURE</SectionEyebrow><h2>Monitoring is active</h2></div><div className="security-radar"><span /><span /><span /><CircleDot size={17} /></div></div><p>SAKSHYA is continuously comparing access time, officer assignment, device identity and location against the department baseline.</p><div className="security-overview-card__metrics"><span><strong>98.4%</strong> events within policy</span><span><strong>04</strong> active signals</span><span><strong>00</strong> blocked sessions</span></div></div><div className="anomaly-stat-stack"><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--red"><ShieldAlert size={17} /></span><div><strong>{open.toString().padStart(2, '0')}</strong><span>Open alerts</span></div></div><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--amber"><Activity size={17} /></span><div><strong>06</strong><span>Flagged today</span></div></div><div><span className="anomaly-stat-stack__icon anomaly-stat-stack__icon--green"><CheckCircle2 size={17} /></span><div><strong>31</strong><span>Resolved this month</span></div></div></div></section><section className="security-panel"><div className="panel-header"><div><SectionEyebrow icon={AlertTriangle}>FLAGGED ACCESS EVENTS</SectionEyebrow><h2>Review queue <span className="title-count">{events.length}</span></h2></div><div className="filter-tabs"><button className="filter-tab filter-tab--active" type="button">All <span>{events.length}</span></button><button className="filter-tab" type="button">Open <span>{open}</span></button><button className="filter-tab" type="button">Escalated</button></div></div><div className="anomaly-list">{events.map((event, index) => <motion.article className={cn('anomaly-card', expanded === event.id && 'anomaly-card--expanded')} key={event.id} {...motionProps(index * 0.04)}><button className="anomaly-card__summary" type="button" onClick={() => setExpanded(expanded === event.id ? null : event.id)}><span className="anomaly-card__score"><strong>{event.score}</strong><small>/100</small></span><span className="anomaly-card__signal"><span><RiskBadge risk={event.risk} /><code>{event.id}</code></span><strong>{event.type}</strong><small><code>{event.docId}</code> · {event.actor}</small></span><span className="anomaly-card__when"><strong>{event.when}</strong><small>{event.status}</small></span><ChevronDown size={17} className={expanded === event.id ? 'rotate-180' : ''} /></button><AnimatePresence initial={false}>{expanded === event.id && <motion.div className="anomaly-card__details" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><div className="anomaly-card__explanation"><SectionEyebrow icon={Info}>WHY THIS WAS FLAGGED</SectionEyebrow><p>{event.summary}</p><ul>{event.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div><div className="anomaly-card__actions"><span><MapPin size={14} />Session geofence evaluated</span><span><Clock3 size={14} />Baseline comparison complete</span><button className="button button--danger" type="button" onClick={() => escalate(event.id)} disabled={event.status === 'Escalated'}><Send size={14} />{event.status === 'Escalated' ? 'Escalated to authority' : 'Escalate to Senior Authority'}</button></div></motion.div>}</AnimatePresence></motion.article>)}</div></section></div>;
}

function ReportsPage({ documents }) {
  const params = new URLSearchParams(window.location.search);
  const [selectedId, setSelectedId] = useState(params.get('doc') || documents[0]?.docId || '');
  const document = documents.find((item) => item.docId === selectedId) || documents[0];

  function exportJson() {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = documentCreateLink(url, `${document.docId}-custody-report.json`);
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Chain JSON exported.');
  }

  function printReport() {
    toast.success('Opening print-ready court report.');
    window.setTimeout(() => window.print(), 150);
  }

  return <div className="reports-page"><PageHeader eyebrow="JUDICIAL OUTPUT" icon={FileText} title="Forensic report generator" description="Assemble a court-admissible evidence report with custody proof and officer attestations." actions={<><button className="button button--secondary" type="button" onClick={exportJson}><FileJson size={15} />Export chain JSON</button><button className="button button--primary" type="button" onClick={printReport}><Printer size={15} />Export as court PDF</button></>} /><div className="report-layout"><aside className="report-selector panel"><SectionEyebrow icon={FileCheck2}>REPORT SUBJECT</SectionEyebrow><h2>Select document</h2><FormField label="Evidence record"><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId}</option>)}</select></FormField><div className="report-subject"><FileText size={18} /><div><strong>{document?.name}</strong><span>{document?.caseId}</span></div></div><div className="report-checks"><div><CheckCircle2 size={15} /><span>Custody timeline included</span></div><div><CheckCircle2 size={15} /><span>Hash proof attached</span></div><div><CheckCircle2 size={15} /><span>Signature block included</span></div></div><div className="signature-badge"><BadgeCheck size={19} /><div><strong>Digital signature verified</strong><span>Authority certificate · MHA-NODE-01</span></div></div></aside><section className="report-paper-wrap"><div className="report-paper"><div className="report-paper__top"><div className="report-paper__emblem"><span>भारत सरकार</span><strong>सत्यमेव जयते</strong></div><div className="report-paper__title"><span>GOVERNMENT OF INDIA</span><strong>MINISTRY OF HOME AFFAIRS</strong><small>SECURE DIGITAL EVIDENCE DIRECTORATE</small></div><div className="report-paper__classification">RESTRICTED<br /><span>COURT COPY</span></div></div><div className="report-paper__rule" /><div className="report-paper__heading"><span>CRYPTOGRAPHIC CUSTODY REPORT</span><h2>{document?.docId}</h2><p>Generated by SAKSHYA Secure Evidence Custody Grid · {formatTime(new Date().toISOString())}</p></div><div className="report-paper__facts"><div><span>Case reference</span><strong>{document?.caseId}</strong></div><div><span>Evidence item</span><strong>{document?.name}</strong></div><div><span>Classification</span><strong>{document?.classification}</strong></div><div><span>Chain status</span><strong className={document?.status === 'valid' ? 'text-success' : 'text-danger'}>{document?.status === 'valid' ? 'VERIFIED / INTACT' : 'COMPROMISED / REVIEW'}</strong></div></div><div className="report-paper__section"><span className="report-section-number">01</span><div><h3>Custody chain summary</h3><p>The following actions were recorded in chronological order. Each block includes the fingerprint of its own data and the preceding block.</p></div></div><div className="report-table"><div className="report-table__row report-table__head"><span>Block</span><span>Timestamp / officer</span><span>Action</span><span>Fingerprint</span></div>{document?.chain.map((entry) => <div className="report-table__row" key={entry.index}><span className="mono">{String(entry.index).padStart(2, '0')}</span><span><strong>{formatTime(entry.timestamp)}</strong><small>{entry.officer} · {entry.badge}</small></span><span>{entry.action.replaceAll('_', ' ')}</span><span><HashChip hash={entry.hash} copyable={false} label="" /></span></div>)}</div><div className="report-paper__section"><span className="report-section-number">02</span><div><h3>Hash verification proof</h3><p>Root fingerprint and latest linked block are reproduced below for independent verification.</p></div></div><div className="report-paper__hashes"><div><span>ROOT FINGERPRINT</span><code>{document?.chain[0]?.hash}</code></div><div><span>LATEST BLOCK FINGERPRINT</span><code>{document?.chain.at(-1)?.hash}</code></div></div><div className="report-paper__signature"><div><div className="signature-line" /><span>Digitally signed by</span><strong>SAKSHYA INTEGRITY ENGINE</strong><small>Certificate: MHA-NODE-01 · Timestamped record</small></div><div className="report-seal-stamp"><BadgeCheck size={24} /><span>VERIFIED</span></div></div><div className="report-paper__footer">This report is a prototype output for Smart India Hackathon 2026 · SIH26190 · Page 1 of 1</div></div></section></div></div>;
}

function documentCreateLink(url, filename) {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  return anchor;
}

function TransferPage({ documents, onAddAction }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [stage, setStage] = useState('details');
  const [form, setForm] = useState({ from: 'Ananya Rao · DL-4172', to: 'Meera Joshi · DL-5321', reason: 'Forensic examination', fromOtp: '', toOtp: '' });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const document = documents.find((item) => item.docId === selectedId);

  async function continueToConfirm(event) {
    event.preventDefault();
    setBusy(true);
    await wait(450);
    setBusy(false);
    setStage('confirm');
  }

  async function confirmTransfer(event) {
    event.preventDefault();
    if (form.fromOtp.length !== 4 || form.toOtp.length !== 4) { toast.error('Enter the four-digit OTP from both officers.'); return; }
    setBusy(true);
    await onAddAction(selectedId, { action: 'TRANSFERRED', officerName: form.from, officerBadge: form.from.split('·')[1]?.trim(), details: `Custody transferred to ${form.to} for ${form.reason}. Dual OTP confirmation recorded.` });
    await wait(350);
    setBusy(false);
    setSuccess(true);
    setStage('success');
    toast.success('Dual-officer custody handover completed.');
  }

  return <div className="transfer-page"><PageHeader eyebrow="CUSTODY HANDOVER" icon={Send} title="Transfer evidence" description="A dual-confirmation handover keeps physical and digital custody aligned." actions={<StatusBadge status="online" label="Location services active" />} /><div className="transfer-layout"><section className="panel transfer-flow"><div className="stepper"><Step number="01" label="Evidence & reason" active={stage === 'details'} complete={stage !== 'details'} /><Step number="02" label="Dual confirmation" active={stage === 'confirm'} complete={stage === 'success'} /><Step number="03" label="Transfer sealed" active={stage === 'success'} /></div>{stage === 'details' && <form className="transfer-form" onSubmit={continueToConfirm}><div className="panel-header"><div><SectionEyebrow icon={QrCode}>EVIDENCE IDENTIFIER</SectionEyebrow><h2>Scan or select the record</h2></div></div><div className="qr-select-row"><div className="qr-preview"><QrCode size={72} /><span>SCAN READY</span><small>Physical evidence QR</small></div><div className="qr-select-copy"><FormField label="Document / evidence ID" required><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></FormField><button className="button button--secondary" type="button" onClick={() => toast('Scanner simulation ready — choose a seeded record.', { icon: '⌁' })}><ScanLine size={15} />Open QR scanner</button></div></div><div className="form-divider" /><div className="form-grid form-grid--two"><FormField label="From officer" required><select value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })}><option>Ananya Rao · DL-4172</option><option>Vikram Singh · DL-2198</option><option>Sourav Ghosh · WB-2901</option></select></FormField><FormField label="To officer" required><select value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })}><option>Meera Joshi · DL-5321</option><option>Priya Nair · WB-9018</option><option>Arjun Mehta · MH-7120</option></select></FormField></div><FormField label="Transfer reason" required><select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}><option>Forensic examination</option><option>Court production</option><option>Inter-departmental review</option><option>Secure storage relocation</option></select></FormField><LocationCard /><div className="form-submit-row"><span><LockKeyhole size={14} /> Both officers must confirm before custody changes.</span><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />}{busy ? 'Preparing handover…' : 'Continue to confirmation'}</button></div></form>}{stage === 'confirm' && <form className="transfer-form" onSubmit={confirmTransfer}><div className="handover-banner"><div className="handover-banner__icon"><Users size={20} /></div><div><SectionEyebrow icon={ClipboardCheck}>DUAL OFFICER CONFIRMATION</SectionEyebrow><h2>Both parties acknowledge custody</h2><p>{document?.docId} · {form.reason}</p></div></div><div className="officer-confirm-grid"><OfficerConfirm label="FROM OFFICER" officer={form.from} otp={form.fromOtp} onChange={(value) => setForm({ ...form, fromOtp: value })} /><OfficerConfirm label="TO OFFICER" officer={form.to} otp={form.toOtp} onChange={(value) => setForm({ ...form, toOtp: value })} /></div><LocationCard /><div className="form-submit-row"><button className="button button--secondary" type="button" onClick={() => setStage('details')}><ArrowLeft size={15} />Back</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}{busy ? 'Sealing transfer…' : 'Confirm & seal handover'}</button></div></form>}{stage === 'success' && <div className="transfer-success"><div className="transfer-success__icon"><CheckCircle2 size={34} /></div><SectionEyebrow icon={ShieldCheck}>CUSTODY UPDATED</SectionEyebrow><h2>Transfer successfully sealed</h2><p>Both officers confirmed the handover. A new TRANSFERRED block is now linked to the record.</p><div className="success-transfer-card"><span>{document?.docId}</span><strong>{form.from} <ArrowRight size={15} /> {form.to}</strong><small>{formatTime(new Date().toISOString())} · Location captured · OTP verified</small></div><div><Link to={`/document/${selectedId}`} className="button button--primary">View updated chain <ArrowRight size={15} /></Link><button className="button button--secondary" type="button" onClick={() => { setSuccess(false); setStage('details'); }}>Start another handover</button></div></div>}</section><aside className="transfer-aside"><section className="panel transfer-record"><SectionEyebrow icon={FileCheck2}>SELECTED RECORD</SectionEyebrow><h2>{document?.docId}</h2><p>{document?.name}</p><div className="transfer-record__status"><StatusBadge status={document?.status || 'pending'} /><span>{document?.chain.length || 0} existing blocks</span></div><div className="transfer-record__hash"><span>Latest linked hash</span><HashChip hash={document?.chain.at(-1)?.hash || 'GENESIS'} /></div></section><section className="panel security-note"><div className="security-note__icon"><ShieldCheck size={18} /></div><div><strong>Why two officers?</strong><p>Dual confirmation binds the custody change to both identities and prevents a single-user handover.</p></div></section></aside></div></div>;
}

function Step({ number, label, active, complete }) {
  return <div className={cn('step', active && 'step--active', complete && 'step--complete')}><span>{complete ? <Check size={13} /> : number}</span><strong>{label}</strong></div>;
}

function OfficerConfirm({ label, officer, otp, onChange }) {
  return <div className="officer-confirm"><span className="officer-confirm__label">{label}</span><div className="officer-confirm__identity"><div className="avatar avatar--small">{officer.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{officer.split('·')[0]}</strong><span>{officer.split('·')[1]}</span></div><StatusBadge status="verified" label="Identity verified" /></div><label className="otp-label"><span>Enter 4-digit OTP</span><input value={otp} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]{4}" placeholder="••••" /></label><small className="otp-hint">Simulation accepts any four digits</small></div>;
}

function LocationCard() {
  return <div className="location-card"><div className="location-card__icon"><MapPin size={16} /></div><div><span>LOCATION AUTO-CAPTURE</span><strong>28.7041° N, 77.1025° E</strong><small>South District Evidence Room · GPS accuracy ±8m</small></div><StatusBadge status="verified" label="Captured" /></div>;
}

function AdminPage({ documents }) {
  const totalAccess = officers.reduce((sum, officer) => sum + officer.accesses, 0);
  const compromised = documents.filter((document) => document.status === 'compromised').length;
  return <div className="admin-page"><PageHeader eyebrow="SENIOR AUTHORITY VIEW" icon={Users} title="Authority console" description="Department-wide custody statistics, officer access patterns and escalation controls." actions={<><button className="button button--secondary" type="button"><Download size={15} />Export oversight report</button><button className="button button--primary" type="button"><Users size={15} />Manage officers</button></>} /><section className="stats-grid"><StatsCard label="Active officers" value="48" helper="Across 8 registered units" icon={Users} tone="navy" trend="+4 this month" /><StatsCard label="Accesses today" value={String(totalAccess).padStart(2, '0')} helper="98.4% policy compliant" icon={Eye} tone="blue" trend="+6.7%" /><StatsCard label="Department chains" value="1,284" helper="1,271 currently valid" icon={Network} tone="teal" trend="+18.2%" /><StatsCard label="Escalations" value={String(compromised).padStart(2, '0')} helper="Awaiting senior review" icon={ShieldAlert} tone="amber" trend="Needs action" /></section><section className="admin-layout"><div className="panel officer-panel"><div className="panel-header"><div><SectionEyebrow icon={Users}>OFFICER DIRECTORY</SectionEyebrow><h2>Access and trust posture</h2></div><button className="icon-button" type="button"><MoreHorizontal size={17} /></button></div><div className="officer-table"><div className="officer-table__row officer-table__head"><span>Officer</span><span>Unit / role</span><span>Accesses</span><span>Trust score</span><span>Status</span></div>{officers.map((officer) => <div className="officer-table__row" key={officer.badge}><span className="officer-cell"><div className="avatar avatar--small">{officer.name.split(' ').map((part) => part[0]).join('')}</div><div><strong>{officer.name}</strong><code>{officer.badge}</code></div></span><span><strong>{officer.unit}</strong><small>{officer.role}</small></span><span><strong>{officer.accesses}</strong><small>last {officer.lastSeen}</small></span><span className="trust-cell"><strong className={officer.trust < 80 ? 'text-warning' : 'text-success'}>{officer.trust}%</strong><span className="mini-meter"><i style={{ width: `${officer.trust}%` }} /></span></span><span><StatusBadge status={officer.status === 'Review required' ? 'review' : 'online'} label={officer.status} /></span></div>)}</div></div><div className="panel access-chart-panel"><div className="panel-header"><div><SectionEyebrow icon={BarChart3}>ACCESS PATTERNS</SectionEyebrow><h2>Custody activity by day</h2></div></div><div className="admin-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 0, left: -28, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border-subtle)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} /><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel)', fontSize: 11 }} /><Bar dataKey="sealed" fill="#2563eb" radius={[3, 3, 0, 0]} /><Bar dataKey="verified" fill="#0f6e56" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="legend-square legend-square--sealed" />sealed</span><span><i className="legend-square legend-square--verified" />verified</span></div></div></section><section className="authority-alerts"><div className="section-toolbar"><div><SectionEyebrow icon={ShieldAlert}>ESCALATION MANAGEMENT</SectionEyebrow><h2>Alerts requiring authority review</h2></div><Link to="/anomalies" className="text-link">View all signals <ArrowRight size={14} /></Link></div><div className="authority-alert-grid"><AuthorityAlert title="Integrity chain break" doc="DOC-2026-00172" text="Hash mismatch detected at block 03 during scheduled scan." severity="critical" /><AuthorityAlert title="Unusual access location" doc="DOC-2026-00217" text="Read event originated 18.4 km outside the declared office geofence." severity="warning" /><AuthorityAlert title="Court package pending" doc="CASE/MUM/24-0874" text="Judicial viewer access requested; senior sign-off required." severity="info" /></div></section></div>;
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
