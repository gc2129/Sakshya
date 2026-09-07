import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileWarning,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api, isApiUnavailable } from '../lib/api';
import { cn, EmptyState, SectionEyebrow, StatusBadge, formatTime } from './ui';

function replayErrorMessage(error) {
  if (error?.status === 403) return 'This replay is restricted to Senior Authority and System Admin roles.';
  if (isApiUnavailable(error)) return 'Backend unavailable. Incident replay will load after the live API reconnects.';
  return error?.message || 'The incident replay could not be loaded.';
}

export function IncidentReplayPanel({ evidenceId, apiOnline }) {
  const [replay, setReplay] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  async function loadReplay() {
    if (!apiOnline || !evidenceId) return;
    setState('loading');
    setError('');
    try {
      const result = await api.getIncidentReplay(evidenceId);
      setReplay(result);
      setState('ready');
    } catch (requestError) {
      setState('error');
      setError(replayErrorMessage(requestError));
    }
  }

  const timeline = Array.isArray(replay?.timeline) ? replay.timeline : [];
  const anomalies = Array.isArray(replay?.anomalies) ? replay.anomalies : [];
  return (
    <section className="incident-replay panel">
      <div className="panel-header">
        <div>
          <SectionEyebrow icon={Eye}>INCIDENT REPLAY</SectionEyebrow>
          <h2>Review the live event sequence</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={loadReplay} disabled={!apiOnline || state === 'loading'}>
          {state === 'loading' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
          {state === 'loading' ? 'Loading replay…' : replay ? 'Refresh replay' : 'Open incident replay'}
        </button>
      </div>
      <p className="incident-replay__intro">A backend-generated, demo-safe sequence of custody events and rule-based signals. Raw evidence, OTPs, full IP addresses and user agents are never shown here.</p>
      {!apiOnline && <div className="capability-state capability-state--offline" role="status"><ShieldAlert size={16} /><span>Backend offline. Replay access is paused.</span></div>}
      {error && <div className="capability-state capability-state--error" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}
      {state === 'idle' && apiOnline && <EmptyState icon={FileWarning} title="Replay not opened" text="Open the live replay when a judge needs to inspect the order of events behind a security signal." />}
      {state === 'ready' && <>
        <div className="incident-replay__summary">
          <span><strong>{timeline.length}</strong> custody events</span>
          <span><strong>{anomalies.length}</strong> backend signals</span>
          <span><strong>{replay?.traceabilitySummary?.networkEvents ?? '—'}</strong> network events</span>
          <span className="incident-replay__safe"><ShieldCheck size={13} />Raw network data excluded</span>
        </div>
        {replay?.notice && <p className="incident-replay__notice">{replay.notice}</p>}
        {anomalies.length > 0 && <div className="incident-replay__signals"><SectionEyebrow icon={ShieldAlert}>RULE-BASED SIGNALS</SectionEyebrow>{anomalies.map((item) => <article className="incident-replay__signal" key={item.id}><span className={cn('incident-replay__signal-icon', String(item.severity).toLowerCase() === 'high' && 'incident-replay__signal-icon--high')}><AlertTriangle size={15} /></span><div><div><strong>{item.rule || 'Security signal'}</strong><StatusBadge status={String(item.status).toLowerCase() === 'open' ? 'alert' : 'pending'} label={item.status || 'Review'} /></div><p>{item.summary || 'The backend returned a rule-based signal for review.'}</p><small>{item.attemptedAction || 'Attempted action not supplied'} · {formatTime(item.timestamp)}</small></div></article>)}</div>}
        <div className="incident-replay__timeline"><SectionEyebrow icon={Clock3}>CUSTODY SEQUENCE</SectionEyebrow>{timeline.length ? timeline.map((item) => { const compromised = item.integrityState === 'COMPROMISED'; return <div className="incident-replay__event" key={`${item.index}-${item.timestamp}`}><span className={cn('incident-replay__event-marker', compromised && 'incident-replay__event-marker--bad')}>{compromised ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</span><div><div><strong>Block {String(item.index).padStart(2, '0')} · {String(item.action || 'EVENT').replaceAll('_', ' ')}</strong><time>{formatTime(item.timestamp)}</time></div><span>{item.actor || 'Authorised officer'} · {item.role || 'Role not returned'}</span></div></div>; }) : <p className="incident-replay__empty">No timeline entries were returned by the backend.</p>}</div>
      </>}
    </section>
  );
}
