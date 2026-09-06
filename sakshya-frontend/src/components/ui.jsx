import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Copy,
  Fingerprint,
  Hash,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { useState } from 'react';

export const cn = (...classes) => classes.filter(Boolean).join(' ');

export const formatTime = (iso, options = {}) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...options,
  });
};

export const formatShortTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const relativeTime = (iso) => {
  if (!iso) return '—';
  const delta = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

export const shortHash = (value = '') => {
  const clean = String(value).replace(/^sha256:/, '');
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}…${clean.slice(-8)}`;
};

export const motionProps = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, delay: Math.min(delay, 0.12), ease: [0.22, 1, 0.36, 1] },
});

export function BrandMark({ small = false }) {
  return (
    <span className={cn('brand-mark', small && 'brand-mark--small')} aria-hidden="true">
      <Fingerprint size={small ? 17 : 21} strokeWidth={1.75} />
    </span>
  );
}

export function OfficialSeal({ compact = false }) {
  return (
    <div className={cn('official-seal', compact && 'official-seal--compact')} aria-label="Government of India seal placeholder">
      <div className="official-seal__ring"><span>सत्यमेव</span><span>जयते</span></div>
      <div className="official-seal__core"><ShieldCheck size={compact ? 17 : 23} /></div>
    </div>
  );
}

export function StatusBadge({ status = 'pending', label, pulse = false }) {
  const map = {
    valid: { label: 'Verified', icon: CheckCircle2 },
    verified: { label: 'Verified', icon: CheckCircle2 },
    pending: { label: 'Pending', icon: CircleDashed },
    alert: { label: 'Alert', icon: AlertTriangle },
    compromised: { label: 'Compromised', icon: ShieldAlert },
    review: { label: 'Review required', icon: CircleAlert },
    online: { label: 'Online · Synced', icon: Check },
    offline: { label: 'Offline', icon: CircleDashed },
  };
  const item = map[status] || map.pending;
  const Icon = item.icon;
  return <span className={cn('status-badge', `status-badge--${status}`, pulse && 'status-badge--pulse')}><Icon size={13} />{label || item.label}</span>;
}

export function RiskBadge({ risk }) {
  const label = risk === 'review' ? 'Review signal' : `${risk?.[0]?.toUpperCase() + risk?.slice(1)} risk`;
  return <span className={cn('risk-badge', `risk-badge--${risk || 'review'}`)}><span className="risk-dot" />{label}</span>;
}

export function HashChip({ hash, copyable = true, label = 'SHA-256' }) {
  const [copied, setCopied] = useState(false);
  async function copyHash() {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(String(hash || ''));
      setCopied(true);
      toast.success('Hash copied to clipboard.', { id: 'sakshya-hash-copy', duration: 1400 });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permissions are optional in a local demo.
    }
  }
  return (
    <button className={cn('hash-chip', !copyable && 'hash-chip--static')} onClick={copyHash} title={copyable ? (copied ? 'Hash copied to clipboard' : 'Copy full hash') : hash} type="button" aria-label={copyable ? `${label || 'Hash'} ${copied ? 'copied' : 'copy'}` : `${label || 'Hash'} ${shortHash(hash)}`}>
      <Hash size={13} /><span className="hash-chip__label">{label}</span><code>{shortHash(hash)}</code>{copyable && (copied ? <Check size={12} /> : <Copy size={12} />)}
    </button>
  );
}

export function SectionEyebrow({ children, icon: Icon }) {
  return <div className="section-eyebrow">{Icon && <Icon size={13} />}{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions, icon: Icon }) {
  return (
    <motion.div className="page-header" {...motionProps(0.02)}>
      <div>
        {eyebrow && <SectionEyebrow icon={Icon}>{eyebrow}</SectionEyebrow>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </motion.div>
  );
}

export function StatsCard({ label, value, helper, icon: Icon, tone = 'navy', trend, onClick }) {
  const Component = onClick ? motion.button : motion.article;
  const trendClass = trend === 'Offline' || trend === 'Unavailable' || trend === '—'
    ? 'stats-trend--neutral'
    : trend?.startsWith('-') ? 'stats-trend--down' : 'stats-trend--up';
  return (
    <Component className={cn('stats-card', `stats-card--${tone}`, onClick && 'stats-card--interactive')} onClick={onClick} type={onClick ? 'button' : undefined} {...motionProps(0.06)}>
      <div className="stats-card__top"><span className="stats-card__icon"><Icon size={18} /></span>{trend && <span className={cn('stats-trend', trendClass)}>{trend}</span>}</div>
      <strong>{value}</strong><span className="stats-card__label">{label}</span>{helper && <span className="stats-card__helper">{helper}</span>}
    </Component>
  );
}

export function LoadingSkeleton({ lines = 4 }) {
  return <div className="loading-skeleton" aria-label="Loading"><span className="skeleton-block skeleton-block--wide" />{Array.from({ length: lines }).map((_, index) => <span key={index} className="skeleton-block" />)}</div>;
}

const actionIcon = { UPLOADED: '↑', VIEWED: '◉', TRANSFERRED: '↔', EDITED: '✎', COURT_ACCESSED: '⌂', VERIFIED: '✓', ALERT_RAISED: '!' };

export function ActionCard({ entry, isLast = false, expanded: initialExpanded = false }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const compromised = entry.compromised || entry.verified === false;
  const verified = !compromised && entry.verified === true;
  return (
    <motion.article className={cn('timeline-entry', compromised && 'timeline-entry--compromised')} {...motionProps(0.04 + (entry.index || 0) * 0.035)}>
      <div className="timeline-entry__rail"><span className="timeline-entry__node">{compromised ? <ShieldAlert size={15} /> : <span>{actionIcon[entry.action] || '•'}</span>}</span>{!isLast && <span className="timeline-entry__line" />}</div>
      <div className="timeline-entry__body">
        <div className="timeline-entry__topline"><div><span className="timeline-entry__index">BLOCK {String(entry.index).padStart(2, '0')}</span><h3>{entry.action.replaceAll('_', ' ')}</h3></div><div className="timeline-entry__state">{compromised ? <StatusBadge status="compromised" label="INTEGRITY COMPROMISED" pulse /> : verified ? <StatusBadge status="verified" /> : <StatusBadge status="pending" label="Verification not returned" />}</div></div>
        <div className="timeline-entry__meta"><span>{formatTime(entry.timestamp)}</span><span className="meta-separator">•</span><span>{entry.officer}</span><span className="meta-separator">•</span><code>{entry.badge}</code></div>
        <p>{entry.details}</p>
        <div className="timeline-entry__footer"><HashChip hash={entry.hash} /><button className="text-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide block data' : 'View block data'}{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></div>
        <AnimatePresence initial={false}>{expanded && <motion.div className="block-data" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><div><span>Officer role</span><strong>{entry.role || 'Authorised officer'}</strong></div><div><span>Location</span><strong>{entry.location || 'Not returned by backend'}</strong></div><div><span>Previous hash</span><code>{entry.previousHash || 'GENESIS'}</code></div><div><span>Verification</span><strong className={compromised ? 'text-danger' : verified ? 'text-success' : ''}>{compromised ? 'Hash mismatch' : verified ? 'Hash match confirmed' : 'Verification not returned'}</strong></div></motion.div>}</AnimatePresence>
      </div>
    </motion.article>
  );
}

export function TimelineComponent({ chain = [], compact = false }) {
  return <div className={cn('timeline', compact && 'timeline--compact')}>{chain.length ? chain.map((entry, index) => <ActionCard key={`${entry.index}-${entry.timestamp}`} entry={entry} isLast={index === chain.length - 1} />) : <EmptyState icon={Clock3} title="No custody events" text="The backend has not returned a timeline for this record." />}</div>;
}

export function HashChainVisualizer({ chain = [], compact = false, animated = true }) {
  return (
    <div className={cn('chain-visualizer', compact && 'chain-visualizer--compact')} aria-label="Hash chain visualizer">
      <div className="chain-visualizer__header"><div><SectionEyebrow icon={Fingerprint}>HASH CHAIN MAP</SectionEyebrow><h3>Every block seals the next</h3></div><span className="chain-visualizer__legend"><span className="legend-dot legend-dot--ok" />verified link</span></div>
      <div className="chain-track">{chain.map((entry, index) => { const bad = entry.compromised || entry.verified === false; return <div className="chain-unit" key={`${entry.index}-map`}><div className={cn('chain-block', bad && 'chain-block--bad')}><span className="chain-block__index">{String(entry.index).padStart(2, '0')}</span><span className="chain-block__action">{entry.action.replaceAll('_', ' ')}</span><HashChip hash={entry.hash} copyable={false} label="" /></div>{index < chain.length - 1 && <div className={cn('chain-link', bad && 'chain-link--bad')}><span /><span /><ChevronRight size={14} /></div>}</div>; })}</div>
      {!compact && <div className="chain-visualizer__foot"><span><LockKeyhole size={13} /> SHA-256 chained custody record</span><span className="mono">{chain.length} linked blocks · {chain.every((entry) => entry.verified !== false) ? '0 breaks' : 'chain break detected'}</span></div>}
    </div>
  );
}

export function VerificationResult({ result, busy = false, onVerify }) {
  const valid = result?.valid === true;
  const invalid = result?.valid === false;
  return (
    <motion.section className={cn('verification-result', valid && 'verification-result--valid', invalid && 'verification-result--bad', !valid && !invalid && 'verification-result--pending')} animate={busy ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }} transition={busy ? { repeat: Infinity, duration: 1.15 } : { duration: 0.2 }}>
      <div className="verification-result__icon">{busy ? <CircleDashed className="spin" size={34} /> : valid ? <ShieldCheck size={36} /> : invalid ? <ShieldAlert size={36} /> : <CircleDashed size={36} />}</div>
      <div className="verification-result__copy"><span className="section-eyebrow">CHAIN INTEGRITY STATUS</span><h2>{busy ? 'VERIFYING CHAIN…' : valid ? 'CHAIN VALID' : invalid ? 'TAMPERING DETECTED' : 'READY TO VERIFY'}</h2><p>{busy ? 'Recomputing each block and comparing linked hashes.' : result?.details || (valid ? 'All custody records are intact and cryptographically linked.' : invalid ? 'The evidence history no longer matches its signed hash chain.' : 'Run a backend verification before treating this record as verified.')}</p></div>
      {onVerify && <button className="button button--secondary" type="button" onClick={onVerify} disabled={busy}>{busy ? 'Checking…' : 'Verify again'}</button>}
    </motion.section>
  );
}

export function IntegrityMeter({ value = 100, label = 'Chain integrity' }) {
  const numericValue = Number.isFinite(value) ? value : null;
  const displayValue = numericValue === null ? '—' : `${numericValue}%`;
  return <div className="integrity-meter"><div className="integrity-meter__labels"><span>{label}</span><strong className={numericValue === null ? '' : numericValue < 70 ? 'text-danger' : numericValue < 100 ? 'text-warning' : 'text-success'}>{displayValue}</strong></div><div className="meter-track"><motion.span initial={{ width: 0 }} animate={{ width: `${numericValue ?? 0}%` }} transition={{ duration: 0.2 }} className={cn(numericValue === null ? 'meter-fill--pending' : numericValue < 70 ? 'meter-fill--danger' : numericValue < 100 ? 'meter-fill--warning' : 'meter-fill--success')} /></div><small>{numericValue === null ? 'Awaiting backend verification' : numericValue === 100 ? 'All linked records verified' : 'Review required before court submission'}</small></div>;
}

export function Modal({ title, eyebrow, onClose, children, wide = false }) {
  return <AnimatePresence><motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className={cn('modal', wide && 'modal--wide')} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.22 }} role="dialog" aria-modal="true"><div className="modal__header"><div>{eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}<h2>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</motion.div></motion.div></AnimatePresence>;
}

export function EmptyState({ icon: Icon = Terminal, title, text }) {
  return <div className="empty-state"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p></div>;
}

export function CopyableValue({ children }) {
  const [copied, setCopied] = useState(false);
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(String(children));
      setCopied(true);
      toast.success('Identifier copied to clipboard.', { id: 'sakshya-identifier-copy', duration: 1400 });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permissions are optional in a local demo.
    }
  }
  return <button className="copyable-value" type="button" onClick={copyValue} title={copied ? 'Identifier copied' : 'Copy identifier'} aria-label={copied ? 'Identifier copied' : 'Copy identifier'}><code>{children}</code>{copied ? <Check size={12} /> : <Copy size={12} />}</button>;
}
