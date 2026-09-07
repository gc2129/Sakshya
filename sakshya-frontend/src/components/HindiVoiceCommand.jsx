import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Info,
  LoaderCircle,
  Mic,
  MicOff,
  ShieldAlert,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, isApiUnavailable } from '../lib/api';
import { cn } from './ui';

function speechRecognitionApi() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const SAFE_HINGLISH_EXAMPLES = [
  'Case 102 ki evidence verify karo',
  'Evidence DOC-2026-001 ka report kholo',
];

function isRomanText(value) {
  return /^[\x00-\x7F]*$/.test(String(value));
}

function intentLabel(intent) {
  if (intent === 'VERIFY_EVIDENCE_BY_CASE') return 'Verify evidence by case';
  if (intent === 'OPEN_FORENSIC_REPORT') return 'Open forensic report';
  return intent?.replaceAll('_', ' ') || 'Supported command';
}

export function HindiVoiceCommand({ apiOnline, user }) {
  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [examples, setExamples] = useState([]);

  useEffect(() => {
    setSupported(Boolean(speechRecognitionApi()));
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  function resetCommand() {
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setStatus('idle');
    setTranscript('');
    setParsed(null);
    setError('');
    setExamples([]);
  }

  async function parseTranscript(text) {
    const clean = text.trim();
    if (!clean) return;
    if (!isRomanText(clean)) {
      setError('Use Roman Hinglish text only. No transliteration was applied.');
      setStatus('idle');
      return;
    }
    setStatus('parsing');
    setError('');
    setParsed(null);
    try {
      const result = await api.parseVoiceCommand(clean);
      setParsed(result);
      setExamples([]);
      setStatus('ready');
    } catch (requestError) {
      const message = requestError.payload?.error || requestError.message || 'The voice command could not be parsed.';
      setError(isApiUnavailable(requestError) ? 'The backend is unavailable. Reconnect before parsing a voice command.' : message);
      setExamples((requestError.payload?.supportedExamples || SAFE_HINGLISH_EXAMPLES).filter((example) => SAFE_HINGLISH_EXAMPLES.includes(example)));
      setStatus('idle');
    }
  }

  function startListening() {
    if (!apiOnline) {
      setError('Backend unavailable. Voice commands remain paused until the live API reconnects.');
      return;
    }
    const Recognition = speechRecognitionApi();
    if (!Recognition) {
      setError('Roman Hinglish speech input is not available in this browser. Use the typed command field below.');
      return;
    }

    recognitionRef.current?.abort?.();
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setError('');
      setParsed(null);
      setTranscript('');
      setStatus('listening');
    };
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      if (!isRomanText(text)) {
        setTranscript('');
        setStatus('idle');
        setError('Speech recognition returned non-Roman text. Nothing was transliterated; type a supported Roman Hinglish command instead.');
        return;
      }
      setTranscript(text);
      parseTranscript(text);
    };
    recognition.onerror = (event) => {
      setStatus('idle');
      setError(event.error === 'not-allowed'
        ? 'Microphone permission was not granted. You can type a supported Roman Hinglish command instead.'
        : 'The browser could not capture a Roman Hinglish command. Try again or use the typed field.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus((current) => current === 'listening' ? 'idle' : current);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function confirmCommand() {
    if (!parsed) return;
    const requiredRoles = Array.isArray(parsed.requiredRoles) ? parsed.requiredRoles : [];
    if (requiredRoles.length && !requiredRoles.includes(user?.role)) {
      setError('You do not have permission to open this action with the current backend role.');
      return;
    }
    if (!parsed.requiresConfirmation) {
      setError('The backend did not require confirmation. The action was not executed.');
      return;
    }
    if (parsed.intent === 'VERIFY_EVIDENCE_BY_CASE' && parsed.caseId) {
      toast.success('Opening the live case verifier. Run verification there.');
      setOpen(false);
      navigate(`/verify?case=${encodeURIComponent(parsed.caseId)}`);
      return;
    }
    if (parsed.intent === 'OPEN_FORENSIC_REPORT' && parsed.evidenceId) {
      toast.success('Opening the live forensic report.');
      setOpen(false);
      navigate(`/reports?doc=${encodeURIComponent(parsed.evidenceId)}`);
      return;
    }
    setError('This safe intent is not mapped to an available frontend route. No action was executed.');
  }

  return (
    <div className="voice-command">
      <button
        className={cn('voice-command__trigger', open && 'voice-command__trigger--active', status === 'listening' && 'voice-command__trigger--listening')}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open Hinglish voice assist"
        aria-expanded={open}
        title="Hinglish voice assist"
      >
        {status === 'listening' ? <MicOff size={17} /> : <Mic size={17} />}
        <span>Hinglish voice assist</span>
      </button>
      {open && (
        <div className="voice-command__popover" role="dialog" aria-label="Hinglish voice assist">
          <div className="voice-command__header">
            <div>
              <span className="voice-command__eyebrow">ASSISTED ACTIONS</span>
              <strong>Hinglish voice assist</strong>
            </div>
            <button className="icon-button" type="button" onClick={() => { setOpen(false); resetCommand(); }} aria-label="Close Hinglish voice assist"><X size={16} /></button>
          </div>

          {!supported && <div className="voice-command__notice voice-command__notice--muted"><Info size={15} /><span>This browser does not expose speech recognition. Type one of the supported Roman Hinglish commands instead.</span></div>}
          {!apiOnline && <div className="voice-command__notice voice-command__notice--alert"><ShieldAlert size={15} /><span>Backend offline. No voice intent can be parsed or executed.</span></div>}

          <div className="voice-command__controls">
            <button className="button button--primary" type="button" onClick={startListening} disabled={!supported || !apiOnline || status === 'listening' || status === 'parsing'}>
              {status === 'listening' ? <><MicOff size={15} />Listening…</> : status === 'parsing' ? <><LoaderCircle size={15} className="spin" />Parsing command…</> : <><Mic size={15} />Speak Roman Hinglish</>}
            </button>
            {(transcript || parsed || error) && <button className="button button--secondary" type="button" onClick={resetCommand}>Clear</button>}
          </div>

          <label className="voice-command__input">
            <span>Recognised or typed Roman Hinglish command</span>
            <input value={transcript} onChange={(event) => { const next = event.target.value; if (!isRomanText(next)) { setError('Use Roman Hinglish text only. Automatic transliteration is not provided.'); return; } setTranscript(next); setParsed(null); setError(''); }} placeholder="Case 102 ki evidence verify karo" lang="en-IN" inputMode="text" />
          </label>
          {transcript && !parsed && status !== 'parsing' && <button className="text-button voice-command__parse" type="button" onClick={() => parseTranscript(transcript)} disabled={!apiOnline}>Send to backend parser <ArrowRight size={14} /></button>}

          {error && <div className="voice-command__notice voice-command__notice--alert" role="alert"><ShieldAlert size={15} /><span>{error}</span></div>}
          {examples.length > 0 && <div className="voice-command__examples"><span>Supported examples</span>{examples.map((example) => <button type="button" key={example} onClick={() => { setTranscript(example); parseTranscript(example); }}>{example}</button>)}</div>}

          {parsed && <div className="voice-command__preview">
            <div className="voice-command__preview-head"><CheckCircle2 size={15} /><span>Backend intent preview</span></div>
            <strong>{intentLabel(parsed.intent)}</strong>
            <dl>
              {parsed.caseId && <><dt>Case reference</dt><dd>{parsed.caseId}</dd></>}
              {parsed.evidenceId && <><dt>Evidence ID</dt><dd>{parsed.evidenceId}</dd></>}
              <dt>Required role</dt><dd>{parsed.requiredRoles?.join(', ') || 'Backend policy'}</dd>
              <dt>Execution</dt><dd><code>{parsed.execution || 'No execution route returned'}</code></dd>
            </dl>
            <p>Voice input only prepares the next screen. Confirm the visible action there; sensitive or irreversible actions are never executed directly from voice.</p>
            <button className="button button--primary button--full" type="button" onClick={confirmCommand}>Confirm and open <ArrowRight size={15} /></button>
          </div>}
        </div>
      )}
    </div>
  );
}
