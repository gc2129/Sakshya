import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileKey2,
  Info,
  LockKeyhole,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, isApiUnavailable } from '../lib/api';
import { cn, SectionEyebrow, StatusBadge } from './ui';

function complianceError(error, fallback) {
  if (isApiUnavailable(error)) return 'The backend is unavailable. Protected compliance actions are paused.';
  if (error?.status === 401) return 'The backend session is missing or expired. Sign in again to continue.';
  if (error?.status === 403) return 'The current backend role is not authorised for this compliance action.';
  if (error?.status === 409) return 'The backend cannot create a watermarked copy for this file type. No original bytes were altered; download the access receipt instead.';
  return error?.message || fallback;
}

function startDownload({ blob, filename }) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

export function ComplianceAccessPanel({ document, apiOnline, permissions = {} }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [purpose, setPurpose] = useState('Officer review');
  const hasAccessRole = Boolean(permissions.accessCopy || permissions.accessReceipt);
  const bsaAvailable = Boolean(permissions.bsaCertificate);

  async function download(action) {
    if (!apiOnline || busy) return;
    const selectedPurpose = purpose.trim() || 'Officer review';
    setBusy(action);
    setError('');
    try {
      const result = action === 'bsa'
        ? await api.downloadBsa63Certificate(document.docId)
        : action === 'copy'
          ? await api.downloadAccessCopy(document.docId, selectedPurpose)
          : await api.downloadAccessReceipt(document.docId, selectedPurpose);
      startDownload(result);
      toast.success(action === 'bsa'
        ? 'BSA Section 63 certificate downloaded.'
        : action === 'copy' ? 'Watermarked access copy downloaded.' : 'Access receipt downloaded.');
    } catch (requestError) {
      const message = complianceError(requestError, action === 'bsa'
        ? 'The BSA Section 63 certificate could not be prepared.'
        : action === 'copy' ? 'The watermarked access copy could not be prepared.' : 'The access receipt could not be prepared.');
      setError(message);
      toast.error(message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="compliance-access panel">
      <div className="panel-header">
        <div>
          <SectionEyebrow icon={FileCheck2}>COMPLIANCE &amp; CONTROLLED ACCESS</SectionEyebrow>
          <h2>Authorised evidence outputs</h2>
        </div>
        <StatusBadge status={apiOnline ? 'online' : 'offline'} label={apiOnline ? 'Backend ready' : 'Unavailable'} />
      </div>
      <p className="compliance-access__intro">Download only the technical records permitted by the live backend role policy. These outputs do not alter the immutable evidence record.</p>
      {error && <div className="compliance-access__error" role="alert"><ShieldAlert size={16} /><span>{error}</span></div>}
      <div className="compliance-access__grid">
        <article className={cn('compliance-output', !bsaAvailable && 'compliance-output--restricted')}>
          <div className="compliance-output__head">
            <span className="compliance-output__icon"><FileKey2 size={18} /></span>
            <div><strong>BSA Section 63 certificate</strong><span>Officer-review certificate with sealed hash, provenance and integrity status.</span></div>
            <StatusBadge status={bsaAvailable && apiOnline ? 'valid' : 'pending'} label={bsaAvailable ? 'Role permitted' : 'Restricted'} />
          </div>
          {!bsaAvailable && <p className="compliance-output__restriction"><LockKeyhole size={13} /> Available only to Forensic Analyst and Senior Authority roles.</p>}
          <button className="button button--secondary" type="button" onClick={() => download('bsa')} disabled={!apiOnline || !bsaAvailable || Boolean(busy)}>
            {busy === 'bsa' ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
            {busy === 'bsa' ? 'Preparing certificate…' : 'Download BSA Section 63 Certificate'}
          </button>
        </article>
        <article className={cn('compliance-output', !hasAccessRole && 'compliance-output--restricted')}>
          <div className="compliance-output__head">
            <span className="compliance-output__icon compliance-output__icon--teal"><ShieldCheck size={18} /></span>
            <div><strong>Derived access record</strong><span>The immutable original is never modified. A derived copy carries the authorised viewer, badge and timestamp.</span></div>
            <StatusBadge status={hasAccessRole && apiOnline ? 'valid' : 'pending'} label={hasAccessRole ? 'Available' : 'Restricted'} />
          </div>
          <label className="compliance-purpose"><span>Purpose label</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={!hasAccessRole || Boolean(busy)} placeholder="Officer review" /></label>
          <div className="compliance-output__actions">
            <button className="button button--secondary" type="button" onClick={() => download('copy')} disabled={!apiOnline || !hasAccessRole || Boolean(busy)}>
              {busy === 'copy' ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
              {busy === 'copy' ? 'Preparing copy…' : 'Request watermarked access copy'}
            </button>
            <button className="button button--ghost" type="button" onClick={() => download('receipt')} disabled={!apiOnline || !hasAccessRole || Boolean(busy)}>
              {busy === 'receipt' ? <LoaderCircle size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {busy === 'receipt' ? 'Preparing receipt…' : 'Download access receipt'}
            </button>
          </div>
          {!hasAccessRole && <p className="compliance-output__restriction"><LockKeyhole size={13} /> The backend has not granted controlled access to this role.</p>}
        </article>
      </div>
      <div className="compliance-access__note"><Info size={14} /><span>Watermarked access copies are supported only for PDF or image evidence. Unsupported media returns a neutral backend response; no substitute download is created.</span></div>
    </section>
  );
}
