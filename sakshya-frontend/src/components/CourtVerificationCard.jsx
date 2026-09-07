import { ExternalLink, Info, QrCode, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { SectionEyebrow } from './ui';

export function CourtVerificationCard({ qrVerification }) {
  const verificationUrl = api.publicVerificationUrl(qrVerification?.verificationUrl);
  return (
    <section className="court-verification-card panel">
      <div className="court-verification-card__icon"><QrCode size={20} /></div>
      <div className="court-verification-card__body">
        <SectionEyebrow icon={ShieldCheck}>COURT QR VERIFICATION</SectionEyebrow>
        <h2>Read-only verification link</h2>
        {verificationUrl ? <><p>The backend supplied a signed public verification path for this report. It exposes the verification verdict only.</p><a className="button button--secondary" href={verificationUrl} target="_blank" rel="noreferrer">Open court verification <ExternalLink size={14} /></a></> : <><p>Court QR verification is unavailable until the live report returns a safe verification URL. No QR result is generated in the browser.</p><span className="court-verification-card__unavailable"><Info size={14} />This verification view never exposes raw evidence.</span></>}
      </div>
    </section>
  );
}
