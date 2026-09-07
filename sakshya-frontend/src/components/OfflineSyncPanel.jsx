import { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Info, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, isApiUnavailable } from '../lib/api';
import { cn, EmptyState, formatTime, HashChip, SectionEyebrow } from './ui';

function queueStatusLabel(status) {
  if (status === 'ACCEPTED') return 'Accepted by backend';
  if (status === 'DUPLICATE') return 'Already queued';
  if (status === 'REJECTED') return 'Rejected by backend';
  return status || 'Awaiting response';
}

function syncError(error) {
  if (isApiUnavailable(error)) return 'Backend unavailable. Live queue status could not be loaded.';
  if (error?.status === 401) return 'The backend session is missing or expired. Sign in again to inspect the queue.';
  if (error?.status === 403) return 'The backend role policy does not permit this queue operation.';
  return error?.message || 'Offline sync status could not be loaded.';
}

export function OfflineSyncPanel({ documents = [], apiOnline, canQueue = false }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.docId || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueScope, setQueueScope] = useState('');
  const [queueState, setQueueState] = useState('idle');
  const selected = documents.find((item) => item.docId === selectedId);

  useEffect(() => {
    if (!selectedId && documents[0]?.docId) setSelectedId(documents[0].docId);
    if (selectedId && !selected) setSelectedId(documents[0]?.docId || '');
  }, [documents, selectedId, selected]);

  async function loadQueue() {
    if (!apiOnline) {
      setStatus(null);
      setQueue([]);
      setQueueScope('');
      setQueueState('offline');
      return;
    }
    setQueueState('loading');
    setError('');
    try {
      const [nextStatus, nextQueue] = await Promise.all([
        api.getOfflineSyncStatus(),
        api.getOfflineSyncQueue(),
      ]);
      setStatus(nextStatus || null);
      setQueue(Array.isArray(nextQueue?.items) ? nextQueue.items : []);
      setQueueScope(nextQueue?.scope || '');
      setQueueState('ready');
    } catch (requestError) {
      setStatus(null);
      setQueue([]);
      setQueueScope('');
      setQueueState('error');
      setError(syncError(requestError));
    }
  }

  useEffect(() => {
    loadQueue();
  }, [apiOnline]);

  async function queueEvidence() {
    if (!selected || !apiOnline || !canQueue) return;
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
      await loadQueue();
      toast.success(next.status === 'DUPLICATE' ? 'The evidence metadata was already queued.' : 'Evidence metadata accepted by the backend.');
    } catch (requestError) {
      setError(syncError(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="offline-sync panel">
      <div className="panel-header">
        <div>
          <SectionEyebrow icon={CloudOff}>OFFLINE SYNC</SectionEyebrow>
          <h2>Reconciliation status</h2>
        </div>
        <div className="offline-sync__header-actions"><span className={cn('capability-badge', apiOnline && queueState === 'ready' ? 'capability-badge--available' : 'capability-badge--offline')}>{!apiOnline ? 'Offline' : queueState === 'loading' ? 'Loading' : queueState === 'ready' ? 'Live' : 'Unavailable'}</span><button className="icon-button" type="button" onClick={loadQueue} disabled={!apiOnline || queueState === 'loading'} aria-label="Refresh offline sync status" title="Refresh offline sync status"><RefreshCw size={15} className={queueState === 'loading' ? 'spin' : ''} /></button></div>
      </div>
      <p className="offline-sync__intro">Metadata and hash reconciliation queue. This prototype does not claim offline signing or cloud replication.</p>
      {queueState === 'loading' && <div className="offline-sync__loading"><LoaderCircle size={16} className="spin" />Loading live reconciliation status…</div>}
      {error && <div className="capability-state capability-state--error" role="alert"><ShieldAlert size={15} /><span>{error}</span><button className="text-button" type="button" onClick={loadQueue} disabled={!apiOnline || queueState === 'loading'}>Retry</button></div>}
      {apiOnline && queueState === 'ready' && <div className="offline-sync__summary"><span><strong>{status?.queuedForActor ?? '—'}</strong><small>Queued for current actor</small></span><span><strong>{queue.length}</strong><small>Items returned</small></span><span><strong>{queue[0]?.receivedAt ? formatTime(queue[0].receivedAt) : '—'}</strong><small>Latest backend receipt</small></span></div>}
      {queueState === 'ready' && queue.length > 0 && <div className="offline-sync__queue"><div className="offline-sync__queue-heading"><SectionEyebrow icon={RefreshCw}>BACKEND QUEUE</SectionEyebrow><span>{queueScope || 'Authorised queue items'}</span></div>{queue.slice(0, 4).map((item) => <div className="offline-sync__queue-item" key={item.idempotencyKey}><div><strong>{item.evidenceId || 'Metadata-only item'}</strong><span>{item.status || 'Status not returned'} · received {formatTime(item.receivedAt)}</span></div><HashChip hash={item.originalHash} copyable={false} /></div>)}</div>}
      {queueState === 'ready' && !queue.length && <div className="offline-sync__empty"><CheckCircle2 size={16} /><span>No reconciliation items returned by the backend for the authorised queue scope.</span></div>}
      {!documents.length ? <EmptyState icon={CloudOff} title="No live record to queue" text="Register an evidence record before preparing offline metadata." /> : <div className="offline-sync__body">
        <label className="form-field"><span>Live evidence record</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null); setError(''); }}>{documents.map((item) => <option key={item.docId} value={item.docId}>{item.docId} · {item.name}</option>)}</select></label>
        {selected && <div className="offline-sync__record"><div><strong>{selected.name}</strong><span>{selected.caseId || 'Case reference not returned'} · {selected.size}</span></div><HashChip hash={selected.originalHash} copyable={false} /></div>}
        {result && <div className="offline-sync__result" role="status"><CheckCircle2 size={16} /><div><strong>{queueStatusLabel(result.status)}</strong><span>{result.notice || `Server sync time: ${result.serverSyncedAt || 'not returned'}`}</span></div></div>}
        {canQueue ? <button className="button button--secondary" type="button" onClick={queueEvidence} disabled={!apiOnline || !selected || busy}>{busy ? <><LoaderCircle size={15} className="spin" />Sending metadata…</> : <><RefreshCw size={15} />Queue metadata with backend</>}</button> : <div className="offline-sync__permission"><ShieldAlert size={14} /><span>Queue submission is limited by backend policy to Investigating Officer and Senior Authority. The current role can inspect only the authorised queue response.</span></div>}
      </div>}
      <div className="offline-sync__note"><Info size={14} /><span>Only the documented metadata queue is shown. Offline signing, encrypted browser storage and cloud replication are not claimed.</span></div>
    </section>
  );
}
