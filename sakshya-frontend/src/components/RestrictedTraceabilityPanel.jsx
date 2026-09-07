import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  LockKeyhole,
  LoaderCircle,
  Network,
  ShieldAlert,
} from 'lucide-react';
import { api, isApiUnavailable } from '../lib/api';
import { cn, formatTime, SectionEyebrow } from './ui';

function traceabilityError(error) {
  if (isApiUnavailable(error)) return 'The backend is unavailable. Restricted traceability was not requested.';
  if (error?.status === 401) return 'The backend session is missing or expired. Sign in again to continue.';
  if (error?.status === 403) return 'The backend denied restricted traceability for this role.';
  if (error?.status === 404) return 'No persisted traceability event was found for this incident.';
  return error?.message || 'Restricted traceability could not be loaded.';
}

function traceabilityEventId(event) {
  const incident = event?.incident || event;
  return incident?.traceabilityEventId
    || incident?.networkEventId
    || incident?.networkOriginContext?.eventId
    || incident?.eventId
    || null;
}

function TraceValue({ label, value, technical = false }) {
  return <div className="traceability-value"><span>{label}</span><strong className={technical ? 'mono' : ''}>{value || 'Not supplied'}</strong></div>;
}

export function RestrictedTraceabilityPanel({ event, evidenceId, canView, apiOnline }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState('');
  const eventId = traceabilityEventId(event);
  const incident = event?.incident || {};

  async function viewTraceability() {
    if (!canView || !apiOnline || !eventId || busy) return;
    setExpanded(true);
    setBusy(true);
    setError('');
    try {
      const result = await api.getIncidentTraceability(evidenceId, eventId);
      setTrace(result);
    } catch (requestError) {
      setTrace(null);
      setError(traceabilityError(requestError));
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (canView && eventId) viewTraceability();
    else setExpanded(true);
  }

  const traceActor = trace?.actor;
  return (
    <div className={cn('restricted-traceability', expanded && 'restricted-traceability--expanded')}>
      <div className="restricted-traceability__header">
        <div><SectionEyebrow icon={Network}>RESTRICTED TRACEABILITY</SectionEyebrow><strong>Operational context</strong></div>
        <button className="traceability-toggle" type="button" onClick={toggle} aria-expanded={expanded} disabled={busy || (!canView && !apiOnline)}>
          {busy ? <LoaderCircle size={14} className="spin" /> : canView && eventId ? <Network size={14} /> : <LockKeyhole size={14} />}
          <span>{canView && eventId ? 'View traceability' : canView ? 'Traceability reference unavailable' : 'Operational identifiers restricted'}</span>
          <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>
      <p className="restricted-traceability__summary">
        {canView
          ? eventId
            ? 'Fetch the persisted network event only when an authorised reviewer requests it.'
            : 'The incident response did not return a persisted traceability event identifier. No identifier is guessed.'
          : 'Full source network and device context is limited to Senior Authority and System Admin roles.'}
      </p>
      {expanded && <div className="restricted-traceability__body">
        {!canView && <div className="traceability-locked"><LockKeyhole size={17} /><div><strong>Authorised visibility required</strong><span>Operational identifiers remain redacted for the current role. The backend remains the final access authority.</span></div></div>}
        {canView && !eventId && <div className="traceability-locked traceability-locked--review"><Info size={17} /><div><strong>Traceability reference not returned</strong><span>This incident includes safe summary data, but the current backend payload does not expose the event ID required by the restricted endpoint.</span></div></div>}
        {error && <div className="traceability-error" role="alert"><ShieldAlert size={15} /><span>{error}</span><button className="text-button" type="button" onClick={viewTraceability} disabled={!apiOnline || !eventId || busy}>Retry</button></div>}
        {trace && <>
          <div className="traceability-authorised"><CheckCircle2 size={14} /><strong>Authorised visibility</strong><span>Live backend traceability response</span></div>
          <div className="traceability-grid">
            <TraceValue label="Event ID" value={trace.eventId} technical />
            <TraceValue label="Evidence ID" value={trace.evidenceId || evidenceId} technical />
            <TraceValue label="Action" value={trace.action || incident.attemptedAction} />
            <TraceValue label="Timestamp" value={formatTime(trace.timestamp)} technical />
            <TraceValue label="Actor" value={traceActor?.name || 'Not supplied'} />
            <TraceValue label="Role" value={traceActor?.role || 'Not supplied'} />
            <TraceValue label="Source network" value={trace.sourceNetwork} technical />
            <TraceValue label="Device context" value={trace.deviceContext} />
            <TraceValue label="Voluntary location" value={trace.locationContext || 'Not voluntarily shared'} />
            <TraceValue label="Network origin" value={trace.networkOrigin} />
          </div>
          <div className="traceability-safety"><AlertTriangle size={14} /><span>This metadata supports lawful authorised investigation; it does not identify a person automatically.</span></div>
        </>}
      </div>}
    </div>
  );
}
