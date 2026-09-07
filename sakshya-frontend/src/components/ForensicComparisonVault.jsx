import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, Download, FileCheck2, FileText, Fingerprint, Info, LockKeyhole, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, isApiUnavailable } from '../lib/api';
import { CopyableValue, EmptyState, HashChip, LoadingSkeleton, PageHeader, SectionEyebrow, StatusBadge, cn, formatTime, shortHash } from './ui';

function formatVaultSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function vaultError(error, fallback) {
  const status = Number(error?.status) || 0;
  const message = isApiUnavailable(error)
    ? 'The live SAKSHYA backend could not be reached. Protected vault operations are paused.'
    : status === 401
      ? 'The backend session is missing or expired. Sign in again to continue.'
      : status === 403
        ? 'The backend denied this vault operation. Senior Authority or System Admin access is required.'
        : error?.message || fallback;
  return { status, message };
}

function vaultStatus(status) {
  if (status === 'SUSPICIOUS_QUARANTINED') return { badge: 'alert', label: 'SUSPICIOUS QUARANTINED' };
  if (status === 'ORIGINAL_SEALED') return { badge: 'valid', label: 'ORIGINAL SEALED' };
  return { badge: 'pending', label: status ? status.replaceAll('_', ' ') : 'NOT ARCHIVED' };
}

function humanizeAction(action) {
  return String(action || 'VAULT EVENT').replaceAll('_', ' ');
}

function VaultNotice({ error, apiOnline }) {
  if (!error && apiOnline) return null;
  const offline = !apiOnline || isApiUnavailable(error);
  const denied = error?.status === 403;
  const title = denied ? 'Vault access denied' : offline ? 'Vault backend unavailable' : 'Vault request could not be completed';
  const message = error?.message || 'The live backend must be reachable before protected comparison operations can run.';
  return <div className={cn('vault-notice', offline && 'vault-notice--offline', denied && 'vault-notice--denied')} role="alert"><span className="vault-notice__icon">{denied ? <LockKeyhole size={17} /> : offline ? <ShieldAlert size={17} /> : <Info size={17} />}</span><div><strong>{title}</strong><span>{message}</span></div><code>{denied ? '403 · ROLE POLICY' : offline ? 'NOT CONNECTED' : `HTTP ${error?.status || 'ERROR'}`}</code></div>;
}

function VaultVersionCard({ kind, version, comparison, downloading, onDownload, apiOnline }) {
  const original = kind === 'original';
  const label = original ? 'Immutable original' : 'Quarantined suspicious copy';
  const hash = comparison?.hash || version?.hash;
  const size = comparison?.size ?? version?.size;
  const timestamp = comparison?.timestamp || version?.storedAt;
  return <article className={cn('vault-version-card', original ? 'vault-version-card--original' : 'vault-version-card--suspicious', !version && 'vault-version-card--empty')}><div className="vault-version-card__head"><div><span className="vault-version-card__index">{original ? '01 · SOURCE' : '02 · QUARANTINE'}</span><h3>{label}</h3></div>{version ? <StatusBadge status={original ? 'valid' : 'alert'} label={original ? 'SEALED' : 'REVIEW'} /> : <StatusBadge status="pending" label="NOT AVAILABLE" />}</div>{version ? <><div className="vault-version-card__hash"><span>SHA-256 fingerprint</span><HashChip hash={hash} /></div><div className="vault-version-card__facts"><span><small>File size</small><strong>{formatVaultSize(size)}</strong></span><span><small>{original ? 'Sealed at' : 'Quarantined at'}</small><strong>{formatTime(timestamp)}</strong></span></div>{!original && version.reason && <p className="vault-version-card__reason"><strong>Quarantine reason</strong>{version.reason}</p>}<button className="button button--secondary button--full" type="button" onClick={() => onDownload(kind)} disabled={!apiOnline || downloading === kind}>{downloading === kind ? <><LoaderCircle size={15} className="spin" />Preparing protected download…</> : <><Download size={15} />Download {original ? 'original' : 'suspicious'} file</>}</button></> : <div className="vault-version-card__empty"><FileText size={22} /><strong>No {original ? 'immutable original' : 'suspicious version'} available</strong><span>{original ? 'This record was created without private multipart bytes. A protected comparison cannot start.' : 'Upload a suspicious copy below to create the comparison pair.'}</span></div>}</article>;
}

function VaultAuditTrail({ entries = [] }) {
  const audit = [...entries].reverse();
  return <section className="panel vault-audit-panel"><div className="panel-header"><div><SectionEyebrow icon={Clock3}>PROTECTED AUDIT TRAIL</SectionEyebrow><h2>Vault access history</h2></div><span className="panel-counter">{entries.length} events</span></div>{audit.length ? <ol className="vault-audit-list">{audit.map((entry, index) => <li className="vault-audit-item" key={`${entry.id || entry.action}-${entry.at || index}`}><span className="vault-audit-item__marker">{index === 0 ? <Check size={12} /> : <span />}</span><div className="vault-audit-item__body"><div><strong>{humanizeAction(entry.action)}</strong><time>{formatTime(entry.at || entry.timestamp)}</time></div><span>{entry.actor || 'Authorised operator'} · {entry.role || 'Protected vault reviewer'}{entry.badge ? ` · ${entry.badge}` : ''}</span>{(entry.details || entry.reason) && <p>{entry.details || entry.reason}</p>}{entry.hash && <HashChip hash={entry.hash} copyable={false} label="SHA-256" />}{entry.evidenceEventHash && <code className="vault-audit-item__link">Evidence event · {shortHash(entry.evidenceEventHash)}</code>}</div></li>)}</ol> : <EmptyState icon={Clock3} title="No vault audit entries" text="Protected access records will appear here after the backend returns them." />}</section>;
}

export function ForensicComparisonVaultPage({ documents = [], apiOnline, apiError }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [vault, setVault] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState(null);
  const selectedRecord = useMemo(() => documents.find((document) => document.docId === selectedId), [documents, selectedId]);

  useEffect(() => {
    if (!documents.some((document) => document.docId === selectedId)) setSelectedId(documents[0]?.docId || '');
  }, [documents, selectedId]);

  useEffect(() => {
    let active = true;
    if (!selectedId || !apiOnline) {
      setLoading(false);
      if (!selectedId) {
        setVault(null);
        setComparison(null);
      }
      return () => { active = false; };
    }

    async function loadVault() {
      setLoading(true);
      setLoadError(null);
      setComparison(null);
      try {
        const metadata = await api.getEvidenceVault(selectedId);
        if (!active) return;
        setVault(metadata);
        if (metadata?.suspicious?.hash) {
          try {
            const result = await api.compareEvidenceVault(selectedId);
            if (active) setComparison(result);
          } catch (error) {
            if (active && error?.status !== 409) setLoadError(vaultError(error, 'The backend returned vault metadata but comparison could not be loaded.'));
          }
        }
      } catch (error) {
        if (active) {
          setVault(null);
          setLoadError(vaultError(error, 'The backend did not return vault metadata for this evidence.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadVault();
    return () => { active = false; };
  }, [selectedId, apiOnline, refreshKey]);

  function selectFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setUploadError(null);
  }

  async function submitSuspicious(event) {
    event.preventDefault();
    if (!file) {
      setUploadError({ message: 'Select the suspicious file before submitting it.', status: 400 });
      return;
    }
    if (!reason.trim()) {
      setUploadError({ message: 'A clear quarantine reason is required for the audit record.', status: 400 });
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      const metadata = await api.uploadSuspiciousVaultFile(selectedId, { file, reason: reason.trim() });
      setVault(metadata);
      setComparison(null);
      setFile(null);
      setReason('');
      setRefreshKey((value) => value + 1);
      toast.success('Suspicious version quarantined in the protected vault.');
    } catch (error) {
      const next = vaultError(error, 'The suspicious file could not be quarantined.');
      setUploadError(next);
      toast.error(next.message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function downloadVersion(kind) {
    setDownloading(kind);
    setDownloadError(null);
    try {
      const result = await api.downloadVaultFile(selectedId, kind);
      const objectUrl = window.URL.createObjectURL(result.blob);
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
      toast.success(`${kind === 'original' ? 'Original' : 'Suspicious'} vault file downloaded.`);
    } catch (error) {
      const next = vaultError(error, 'The protected download could not be prepared.');
      setDownloadError(next);
      toast.error(next.message);
    } finally {
      setDownloading('');
    }
  }

  const status = vaultStatus(vault?.status);
  const difference = comparison?.verdict === 'DIFFERENT';
  const hasOriginal = Boolean(vault?.original?.hash);

  return <div className="vault-page"><PageHeader eyebrow="RESTRICTED FORENSIC OPERATIONS" icon={Fingerprint} title="Forensic Comparison Vault" description="Compare an immutable source capture with a quarantined suspicious copy using protected, backend-authorised file access." actions={<><button className="button button--secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={!apiOnline || loading}><RefreshCw size={15} className={loading ? 'spin' : ''} />Refresh vault</button>{selectedRecord && <Link className="button button--primary" to={`/document/${encodeURIComponent(selectedRecord.docId)}`}><FileCheck2 size={15} />Open evidence record</Link>}</>} />{!apiOnline && <VaultNotice error={{ message: apiError || 'Live evidence API is not connected.' }} apiOnline={false} />}{apiOnline && loadError && <VaultNotice error={loadError} apiOnline />}{documents.length ? <><section className="vault-selector panel"><div><SectionEyebrow icon={FileCheck2}>EVIDENCE SELECTOR</SectionEyebrow><h2>Choose a live evidence record</h2><p>Only records returned by the authenticated backend are available. No comparison sample is generated in the browser.</p></div><div className="vault-selector__controls"><label className="form-field"><span>Evidence record</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setVault(null); setComparison(null); setLoadError(null); setUploadError(null); }}>{documents.map((document) => <option key={document.docId} value={document.docId}>{document.docId} · {document.name}</option>)}</select></label><span className="vault-policy"><LockKeyhole size={13} /> Senior Authority / System Admin · backend policy still required</span></div></section>{loading ? <section className="panel vault-loading"><LoadingSkeleton lines={7} /></section> : vault && selectedRecord ? <><section className="vault-record panel"><div className="vault-record__top"><div className="vault-record__identity"><span className="document-hero-icon"><FileText size={22} /></span><div><SectionEyebrow>SELECTED EVIDENCE</SectionEyebrow><h2>{selectedRecord.name}</h2><div className="vault-record__id"><span>Evidence ID</span><CopyableValue>{selectedRecord.docId}</CopyableValue></div></div></div><StatusBadge status={status.badge} label={status.label} /></div><div className="vault-record__facts"><span><small>Case reference</small><strong>{selectedRecord.caseId || 'Not returned'}</strong></span><span><small>File type</small><strong>{selectedRecord.mimeType || 'Not returned'}</strong></span><span><small>Registered size</small><strong>{selectedRecord.size || 'Not returned'}</strong></span><span><small>Current custody</small><strong>{selectedRecord.custodyHolder || 'Not returned'}</strong></span></div></section><section className="vault-comparison panel"><div className="panel-header"><div><SectionEyebrow icon={Fingerprint}>HASH COMPARISON</SectionEyebrow><h2>Original versus suspicious version</h2></div><span className="vault-metadata-only"><Info size={13} /> Metadata verdict · file bytes excluded</span></div><div className="vault-version-grid"><VaultVersionCard kind="original" version={vault.original} comparison={comparison?.original} downloading={downloading} onDownload={downloadVersion} apiOnline={apiOnline} /><VaultVersionCard kind="suspicious" version={vault.suspicious} comparison={comparison?.suspicious} downloading={downloading} onDownload={downloadVersion} apiOnline={apiOnline} /></div>{comparison ? <div className={cn('vault-verdict', difference ? 'vault-verdict--different' : 'vault-verdict--match')} role="status"><span className="vault-verdict__icon">{difference ? <ShieldAlert size={23} /> : <ShieldCheck size={23} />}</span><div><SectionEyebrow>{difference ? 'REVIEW REQUIRED' : 'COMPARISON RESULT'}</SectionEyebrow><h3>{difference ? 'VERSIONS DIFFER' : 'HASHES MATCH'}</h3><p>{difference ? 'The original and suspicious SHA-256 fingerprints are different. Keep the suspicious copy quarantined and route the discrepancy for authorised review.' : 'The submitted versions have the same SHA-256 fingerprint. Review the metadata and custody context before making a legal determination.'}</p></div><code>{comparison.verdict}</code></div> : <div className="vault-awaiting"><Info size={16} /><div><strong>{vault.suspicious ? 'Comparison result unavailable' : 'Awaiting suspicious version'}</strong><span>{vault.suspicious ? 'The backend returned a suspicious artifact but not a comparison verdict.' : 'Upload a suspicious or tampered copy below. The backend will calculate the metadata-only verdict.'}</span></div></div>}{downloadError && <VaultNotice error={downloadError} apiOnline />}</section><div className="vault-lower-grid"><section className="panel vault-upload-panel"><div className="panel-header"><div><SectionEyebrow icon={UploadCloud}>CONTROLLED INTAKE</SectionEyebrow><h2>Quarantine suspicious file</h2></div><span className="vault-protected-label"><LockKeyhole size={12} /> Protected upload</span></div><p className="vault-panel-intro">The original stays immutable. The submitted copy is stored separately in the private vault and its reason becomes part of the protected audit trail.</p><form onSubmit={submitSuspicious}><label className={cn('vault-dropzone', dragging && 'vault-dropzone--dragging', !hasOriginal && 'vault-dropzone--disabled')} onDragOver={(event) => { event.preventDefault(); if (hasOriginal) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (hasOriginal) selectFile(event.dataTransfer.files?.[0]); }}><input type="file" disabled={!hasOriginal || uploadBusy} onChange={(event) => selectFile(event.target.files?.[0])} /><span className="vault-dropzone__icon"><UploadCloud size={21} /></span><strong>{file ? file.name : hasOriginal ? 'Drop suspicious file here' : 'Private original required first'}</strong><span>{file ? `${formatVaultSize(file.size)} · ${file.type || 'application/octet-stream'}` : 'Browse a quarantined comparison copy'}</span><small>Upload is authenticated and limited by the backend policy.</small></label>{file && <div className="vault-selected-file"><FileText size={15} /><span><strong>{file.name}</strong><small>Ready for protected quarantine</small></span><button className="icon-button" type="button" onClick={() => setFile(null)} aria-label="Remove suspicious file"><X size={15} /></button></div>}<label className="form-field vault-reason-field"><span>Quarantine reason<i>*</i></span><textarea value={reason} onChange={(event) => { setReason(event.target.value); setUploadError(null); }} placeholder="Explain why this copy requires forensic comparison…" disabled={!hasOriginal || uploadBusy} /></label>{uploadError && <VaultNotice error={uploadError} apiOnline />}{!hasOriginal && <p className="vault-field-hint"><Info size={13} /> This record has no private original file. The backend cannot perform a safe comparison for metadata-only intake records.</p>}<button className="button button--primary button--full" type="submit" disabled={!apiOnline || !hasOriginal || uploadBusy}>{uploadBusy ? <><LoaderCircle size={15} className="spin" />Quarantining file…</> : <><LockKeyhole size={15} />Quarantine suspicious version</>}</button></form></section><VaultAuditTrail entries={Array.isArray(vault.audit) ? vault.audit : []} /></div></> : !loadError && <section className="panel vault-loading"><EmptyState icon={FileCheck2} title="Vault metadata unavailable" text="The authenticated backend did not return a comparison-vault record for this evidence." /></section>}</> : <section className="panel vault-empty-page"><EmptyState icon={FileCheck2} title="No live evidence records" text="Register evidence through the backend before opening the protected comparison vault." /></section>}<div className="vault-safety-note"><ShieldCheck size={15} /><span>Raw vault bytes are requested only through authenticated protected download routes. This page never uses a public QR endpoint for files, hashes, network metadata, OTPs or personal data.</span></div></div>;
}
