import { ArrowRight, CheckCircle2, LockKeyhole, Network, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, SectionEyebrow } from './ui';

const flowSteps = [
  { label: 'Register', detail: 'Create a live record', permission: 'upload', to: '/upload' },
  { label: 'SHA-256 seal', detail: 'Review the fingerprint', permission: 'verify', to: '/verify' },
  { label: 'OTP custody', detail: 'Request a handover', permission: 'transfer', to: '/transfer' },
  { label: 'Tamper detected', detail: 'Run controlled demo', permission: 'tamper', to: '/demo' },
  { label: 'Anomaly flagged', detail: 'Review live signals', permission: 'incidents', to: '/anomalies' },
  { label: 'Court verification', detail: 'Prepare report output', permission: 'report', to: '/reports' },
];

export function JudgeDemoFlow({ permissions = {}, apiOnline, documents = [] }) {
  const hasLiveRecord = documents.length > 0;
  return (
    <section className="judge-flow" aria-label="Judge demo flow">
      <div className="judge-flow__intro">
        <SectionEyebrow icon={Network}>JUDGE DEMO MODE</SectionEyebrow>
        <h2>From registration to court review</h2>
        <p>This route strip uses live screens only. It does not claim that a step is complete until the backend returns its result.</p>
        <span className={cn('judge-flow__connection', apiOnline ? 'judge-flow__connection--online' : 'judge-flow__connection--offline')}>
          {apiOnline ? <CheckCircle2 size={13} /> : <WifiOff size={13} />}
          {apiOnline ? `${hasLiveRecord ? 'Live record available' : 'Awaiting first record'}` : 'Reconnect backend to continue'}
        </span>
      </div>
      <ol className="judge-flow__steps">
        {flowSteps.map((step, index) => {
          const allowed = Boolean(permissions[step.permission]);
          const unavailable = !apiOnline;
          const label = unavailable ? 'Backend offline' : allowed ? 'Open live screen' : 'Role restricted';
          const content = <><span className="judge-flow__number">{String(index + 1).padStart(2, '0')}</span><span className="judge-flow__copy"><strong>{step.label}</strong><small>{step.detail}</small><em>{label}</em></span>{allowed && apiOnline && <ArrowRight size={14} />}{!allowed && <LockKeyhole size={13} />}</>;
          return <li className={cn('judge-flow__step', !allowed && 'judge-flow__step--restricted', unavailable && 'judge-flow__step--offline')} key={step.label}>{allowed && apiOnline ? <Link to={step.to}>{content}</Link> : <div>{content}</div>}</li>;
        })}
      </ol>
    </section>
  );
}
