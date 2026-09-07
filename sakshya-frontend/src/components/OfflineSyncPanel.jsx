import { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Info, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, isApiUnavailable } from '../lib/api';
import { cn, EmptyState, HashChip, SectionEyebrow } from './ui';

function queueStatusLabel(status) {
  if (status === 'ACCEPTED') return 'Accepted by backend';
  if (status === 'DUPLICATE') return 'Already queued';
  if (status === 'REJECTED') return 'Rejected by backend';
  return status || 'Awaiting response';
}

export function OfflineSyncPanel({ documents = [], apiOnline }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const selected = documents.find((item) => item.docId === selectedId);

  useEffect(() => {
    if (!selectedId && documents[0]?.docId) setSelectedId(documents[0].docId);
    if (selectedId && !selected) setSelectedId(documents[0]?.docId || '');
  }, [documents, selectedId, selected]);

  async function queueEvidence() {
    if (!selected || !apiOnline) return;
    if (!/^[a-f0-9]{64}$/i.test(String(selected.originalHash || ''))) {
      setError('This record has no backend-returned SHA-256 original hash, so it cannot be queued safely.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    const idempotencyKey = typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `offline-${Date.now()}`;
    try {
      const next = await api.queueOfflineEvidence({
        idempotencyKey,
        evidenceId: selected.docId,
        originalHash: selected.originalHash,
        clientCapturedAt: new Date().toISOString(),
        metadata: {
          fileName: selected.name,
          caseId: selected.caseId,
          evidenceType: selected.evidenceType,
          classification: selected.classification,
        },
      });
      setResult(next);
      toast.success(next.status === 'DUPLICATE' ? 'The evidence metadata was already queued.' : 'Evidence metadata accepted by the backend.');
    } catch (requestError) {
      setError(isApiUnavailable(requestError) ? 'Backend unavailable. The metadata was not queued.' : requestError.message || 'Offline metadata could not be queued.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="offline-sync panel">
      <div className="panel-header">
        <div>
          <SectionEyebrow icon={CloudOff}>OFFLINE SYNC</SectionEyebrow>
          <h2>Queue authorised metadata</h2>
        </div>
        <span className={cn('capability-badge', apiOnline ? 'capability-badge--available' : 'capability-badge--offline')}>{apiOnline ? 'Available' : 'Offline'}</span>
      </div>
      <p className="offline-sync__intro">Use the supported backend queue when an authorised client has captured evidence metadata without a live connection. Acceptance remains auditable and does not trust an offline client automatically.</p>
      {!documents.length ? <EmptyState icon={CloudOff} title="No live record to queue" text="Register an evidence record before preparing offline metadata." /> : <div className="offline-sync__body">
        <label className="form-field"><span>Live evidence record</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null); setError(''); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></label>
        {selected && <div className="offline-sync__record"><div><strong>{selected.name}</strong><span>{selected.caseId || 'Case reference not returned'} · {selected.size}</span></div><HashChip hash={selected.originalHash} copyable={false} /></div>}
        {error && <div className="capability-state capability-state--error" role="alert"><ShieldAlert size={15} /><span>{error}</span></div>}
        {result && <div className="offline-sync__result" role="status"><CheckCircle2 size={16} /><div><strong>{queueStatusLabel(result.status)}</strong><span>{result.notice || `Server sync time: ${result.serverSyncedAt || 'not returned'}`}</span></div></div>}
        <button className="button button--secondary" type="button" onClick={queueEvidence} disabled={!apiOnline || !selected || busy}>{busy ? <><LoaderCircle size={15} className="spin" />Sending metadata…</> : <><RefreshCw size={15} />Queue metadata with backend</>}</button>
      </div>}
      <div className="offline-sync__note"><Info size={14} /><span>Only the documented metadata queue is used here. No fake sync count or offline cryptographic signature is shown.</span></div>
    </section>
  );
}
