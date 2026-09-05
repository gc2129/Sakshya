import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Fingerprint, LoaderCircle, ShieldCheck, Upload, Zap } from 'lucide-react';

const API = 'http://localhost:3001/api';

const formatTime = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const shortHash = (hash) => `${hash.slice(0, 18)}…${hash.slice(-8)}`;

export default function App() {
  const input = useRef();
  const [record, setRecord] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function request(path, options) {
    setBusy(true);
    try {
      const response = await fetch(`${API}${path}`, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong.');
      setRecord(data);
      return data;
    } catch (error) {
      setStatus({ type: 'error', text: error.message.includes('fetch') ? 'Backend is not running. Start it on port 3001.' : error.message });
      return null;
    } finally { setBusy(false); }
  }

  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    const data = await request('/evidence/upload', { method: 'POST', body: form });
    if (data) setStatus({ type: 'success', text: 'Evidence sealed with SHA-256 and added to chain of custody.' });
  }
  async function verify() {
    if (!record) return;
    const data = await request(`/evidence/${record.id}/verify`, { method: 'POST' });
    if (data) setStatus({ type: data.valid ? 'success' : 'error', text: data.message });
  }
  async function tamper() {
    if (!record) return;
    const data = await request(`/evidence/${record.id}/tamper`, { method: 'POST' });
    if (data) setStatus({ type: 'warning', text: 'Tamper simulation complete. Run verification to detect the breach.' });
  }

  return <main>
    <header><div className="brand"><span className="brand-mark"><Fingerprint size={23}/></span><span>Sakshya</span></div><div className="header-tag"><ShieldCheck size={16}/> Digital Evidence Integrity</div></header>
    <section className="hero"><p className="eyebrow">CHAIN OF CUSTODY · MADE VERIFIABLE</p><h1>Proof that holds.<br/><em>Evidence you can trust.</em></h1><p className="lead">Seal digital evidence, track every custody event, and detect a single unauthorized change instantly.</p></section>
    <section className="grid">
      <div className="panel upload-panel"><div className="panel-title"><FileUp/> Add evidence</div><button className="dropzone" disabled={busy} onClick={() => input.current.click()}><Upload size={30}/><strong>{record ? 'Upload another evidence file' : 'Choose a file to seal'}</strong><span>Any file type · SHA-256 fingerprint created instantly</span></button><input ref={input} hidden type="file" onChange={(e) => uploadFile(e.target.files?.[0])}/></div>
      <div className={`panel integrity ${status?.type === 'error' ? 'danger' : ''}`}><div className="panel-title"><Fingerprint/> Integrity check</div>{record ? <><div className="file-name">{record.name}</div><code>{shortHash(record.originalHash)}</code><div className="actions"><button className="primary" disabled={busy} onClick={verify}>{busy ? <LoaderCircle className="spin"/> : <ShieldCheck/>} Verify integrity</button><button className="secondary" disabled={busy} onClick={tamper}><Zap/> Simulate tamper</button></div></> : <p className="empty">Upload evidence to create its tamper-proof fingerprint.</p>}</div>
    </section>
    {status && <section className={`notice ${status.type}`}><span>{status.type === 'success' ? <CheckCircle2/> : <AlertTriangle/>}</span><div><strong>{status.type === 'success' ? 'Verified' : status.type === 'warning' ? 'Simulation ready' : 'Attention required'}</strong><p>{status.text}</p></div></section>}
    <section className="panel timeline"><div className="panel-title"><ShieldCheck/> Chain of custody</div>{record ? <div className="events">{record.timeline.map((item) => <article className="event" key={item.id}><span className="dot"></span><div><strong>{item.action}</strong><p>{item.details}</p><small>{item.actor} · {formatTime(item.at)}</small></div></article>)}</div> : <p className="empty">The verified evidence journey will appear here.</p>}</section>
    <footer>SAKSHYA · FORENSIC EVIDENCE PROTOTYPE</footer>
  </main>;
}
