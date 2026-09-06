# Sakshya backend API

The service persists evidence metadata and audit events in local SQLite (`data/sakshya.sqlite` by default), so records survive server restarts. Use `SAKSHYA_DB_PATH` to set a different database path. Raw uploaded file bytes are never stored; the service retains only the file metadata and SHA-256 digest. Every audit entry contains the preceding entry's hash and its own SHA-256 hash, forming a cryptographically linked audit chain.

Base URL: `http://localhost:5000`

## `GET /api/health`

Returns service status, the configured upload limit, and the seeded document count.

## Frontend-compatible custody routes

These routes are used by the React command centre:

- `GET /api/documents` — list all records with `valid`/`compromised` status.
- `POST /api/documents/upload` — register JSON metadata without a file.
- `GET /api/documents/:id/chain` — return the full chronological chain.
- `POST /api/documents/:id/verify` — verify and append an integrity event.
- `POST /api/documents/:id/action` — append `VIEWED`, `EDITED`, or `COURT_ACCESSED`.
- `POST /api/documents/:id/simulate-tamper` — demo-only block mutation.
- `POST /api/documents/:id/reset-demo` — restore the pre-demo baseline.
- `GET /api/documents/:id/report` — return a court-ready JSON report.

For `TRANSFERRED`, the action body must include `fromOfficer`, `toOfficer`, `fromOtp`, and `toOtp`; both OTP values are any four-digit demo strings. An invalid dual confirmation is blocked with `403`, creates an `OPEN` `INVALID_TRANSFER_OTP` security incident, and returns the refreshed evidence record in `evidence`.

## `POST /api/evidence/upload`

Uploads one file as multipart form data. The form field must be named `file`. Files larger than 25 MB receive `413` with a clear error.

```bash
curl -F "file=@evidence.pdf" http://localhost:5000/api/evidence/upload
```

Returns `201` and stores the evidence metadata, SHA-256 hashes, anomaly flags, and audit timeline in SQLite. The uploaded file contents are not persisted.

Optional multipart or JSON provenance fields are `officerName`, `officerBadge`, `officerRole`, `attestationStatement`, `sourceSystemDeviceId`, `sourceType` (`CCTV/DVR`, `forensic lab`, `mobile capture`, `document system`, or `manual upload`), `officialSourceHash`, `sourceSignatureReference`, and `authorisedActionLocation`.

Each response includes `provenance` with a status of `SOURCE_VERIFIED`, `SOURCE_UNKNOWN`, or `REVIEW_REQUIRED` and explainable flags. A source is marked `SOURCE_VERIFIED` only when non-manual source identity and trusted source hash/signature evidence are provided without flags. The service does not claim to detect every edit made before upload.

## `GET /api/evidence/:id`

Returns the current evidence record and its audit timeline (newest first).

## Persistent storage

`evidence_records` stores evidence metadata, hashes, custody state, and temporary OTP transfer state. `audit_events` stores the append-only cryptographically linked timeline. The SQLite database and its WAL/SHM files are ignored by Git.

## `POST /api/evidence/:id/verify`

Verifies that the current evidence hash still equals the original SHA-256 hash and that every audit event correctly links to its predecessor. It creates an `Integrity verified` audit event and returns `valid`.

## `POST /api/evidence/:id/transfer/request-otp`

Starts an OTP-protected custody transfer. Send JSON:

```json
{ "recipient": "Investigating Officer" }
```

The OTP is valid for five minutes. This self-contained demo returns the OTP in its response; a production deployment must deliver it out of band.

## `POST /api/evidence/:id/transfer`

Completes a custody transfer only after OTP verification. Send JSON:

```json
{ "recipient": "Investigating Officer", "otp": "123456" }
```

The OTP is single-use. Invalid, expired, or mismatched OTPs return clear `400` or `401` errors. An invalid OTP is blocked, creates a persistent `OPEN` `INVALID_TRANSFER_OTP` security incident, and returns the refreshed evidence record in `evidence`.

## `POST /api/evidence/:id/tamper`

Demo-only endpoint that intentionally changes the current evidence hash and records the simulated integrity breach. A subsequent verification must fail.

## `GET /api/evidence/:id/report`

Produces a court-ready JSON forensic report containing the evidence metadata, hashes, full linked audit timeline, integrity assessment, custody holder, and anomaly flags.

## Anomaly flags

Each record and report expose these booleans:

- `offHoursActivity`: at least one audit event occurred between 20:00 and 05:59 UTC.
- `hashMismatch`: the current evidence hash differs from the original SHA-256 hash.
- `brokenAuditChain`: an audit entry's previous hash or event hash no longer verifies.
- `intrusionAttempt`: one or more blocked invalid-transfer incidents exist.

## Security incidents

Every evidence record and forensic report includes `securityIncidents`. For blocked invalid transfers, each incident records a unique ID, rule, attempted action, summary, timestamp, source network, browser/device context, and an action location only if the client voluntarily sends one. This is authorised investigation context only; it does not identify a person automatically or perform GPS tracking.

## Source provenance

Forensic reports also include the persisted provenance result and its flags. Typical flags include `unregistered source device`, `source hash unavailable`, `source hash mismatch`, `missing uploader attestation`, and `upload outside authorised location`. These flags are source-assessment context, not a claim that the system can identify a person or reconstruct every pre-upload edit.

## Common errors

`404` is returned for an unknown evidence ID, `400` for invalid requests, `401` for an invalid OTP, `413` for files above 25 MB, and `500` for unexpected server errors.
