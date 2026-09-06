# Sakshya backend API

Base URL: `http://localhost:5000`. Evidence metadata and audit events are persisted in SQLite; raw uploaded bytes are never stored. Evidence has SHA-256 original/current hashes and a cryptographically linked audit chain.

## Authentication and demo roles

`POST /api/auth/login` accepts `{ "username", "password" }` and returns an eight-hour signed Bearer session token. Passwords are salted scrypt hashes in SQLite; plaintext passwords are never stored. Send `Authorization: Bearer <token>` to protected endpoints. `GET /api/auth/me` returns the authenticated officer.

Demo-only credentials (replace or disable for deployment):

| Role | Username | Password |
| --- | --- | --- |
| Investigating Officer | `investigator` | `demo-investigator-2026` |
| Forensic Analyst | `analyst` | `demo-analyst-2026` |
| Senior Authority | `authority` | `demo-authority-2026` |
| Court Viewer | `court` | `demo-court-2026` |
| System Admin | `admin` | `demo-admin-2026` |

Role policy: Investigating Officers upload and can read their assigned evidence; Forensic Analysts verify and produce reports; Court Viewers have verification/report-only access; Senior Authorities review incidents, approve sensitive actions and run demo tamper; System Admin manages users/devices and has no endpoint to alter evidence history. Every authenticated evidence action records the actor, badge and role in the audit chain.

## Evidence and document routes

All routes below require a Bearer token unless noted.

- `GET /api/health` — public health and storage status.
- `GET /api/documents` — list evidence visible to the role.
- `POST /api/documents/upload` — Investigating Officer JSON intake. Existing frontend-compatible route.
- `GET /api/documents/:id/chain` — chronological audit chain.
- `POST /api/documents/:id/verify` — Forensic Analyst or Court Viewer integrity verification.
- `POST /api/documents/:id/action` — Investigating Officer/Senior Authority custody actions; transfer requires four-digit `fromOtp` and `toOtp`.
- `POST /api/documents/:id/simulate-tamper` — Senior Authority demo-only tamper simulation.
- `GET /api/documents/:id/report` — Forensic Analyst, Senior Authority or Court Viewer court-ready JSON report.
- `POST /api/evidence/upload` — Investigating Officer multipart upload using field `file`; 25 MB limit.
- `GET /api/evidence/:id` — evidence metadata and audit timeline.
- `POST /api/evidence/:id/verify` — Forensic Analyst or Court Viewer verification.
- `POST /api/evidence/:id/transfer/request-otp` — Investigating Officer/Senior Authority; demo response includes a five-minute OTP.
- `POST /api/evidence/:id/transfer` — completes OTP custody transfer.
- `POST /api/evidence/:id/tamper` — Senior Authority demo-only tamper simulation.
- `GET /api/evidence/:id/report` — court-ready forensic report.
- `GET /api/evidence/:id/incidents` — Senior Authority security-incident review.
- `POST /api/evidence/:id/incidents/:incidentId/approve` — Senior Authority approval; appends an audit event.

Invalid transfer OTPs are blocked with `401`/ `403`, create persistent `OPEN` `INVALID_TRANSFER_OTP` incidents, append a linked audit event with authenticated actor context, and return the refreshed evidence record.

## Administration

System Admin only:

- `GET /api/admin/users`
- `POST /api/admin/users` with username, password (minimum 12 characters), name, badge and role
- `GET /api/admin/devices`
- `POST /api/admin/devices` with a device label

Administration is deliberately separate from evidence mutation, so an administrator cannot alter evidence history.

## Provenance, anomalies and report fields

Upload supports `officerName`, `officerBadge`, `officerRole`, `attestationStatement`, `sourceSystemDeviceId`, `sourceType`, `officialSourceHash`, `sourceSignatureReference`, and `authorisedActionLocation`. Responses and reports include provenance status/flags, security incidents, integrity status, and anomaly flags: `offHoursActivity`, `hashMismatch`, `brokenAuditChain`, and `intrusionAttempt`.

Source provenance is an honest assessment, not a claim to detect every pre-upload edit. Incident metadata is authorised investigation context only: it does not automatically identify a person or perform GPS tracking.

## Errors

`400` invalid request, `401` missing/invalid session or OTP, `403` role or transfer denial, `404` missing evidence, `409` duplicate data, and `413` files over 25 MB.

## Final security extensions

### Registered source devices

System Admin endpoints: `GET /api/admin/source-devices`, `POST /api/admin/source-devices`, and `PATCH /api/admin/source-devices/:id`. A source device has an ID, supported type (`CCTV/DVR`, `forensic lab`, `mobile capture`, or `document system`), organisation/unit, ACTIVE/INACTIVE state and optional trusted hash/signature reference. Upload provenance checks the registry. Unknown, inactive, or reference-mismatched devices create review flags and cannot become falsely source-verified.

### Network-origin traceability and incidents

Sensitive actions, blocked OTP attempts, QR lookups and offline syncs persist source IP, user-agent/device context, timestamp, evidence ID and authenticated actor where available in `network_events`. Responses call this **“Approximate network-origin context for lawful authorised investigation.”** Private addresses are reported as local/private context. No external geolocation provider is configured, so the backend does not infer GPS, city, ISP, VPN status, or a person's identity.

Senior Authority can update an incident using `POST /api/evidence/:id/incidents/:incidentId/status` with `status` (`UNDER_REVIEW`, `RESOLVED`, or `DISMISSED`) and a required `reason`. The original incident facts remain preserved; the reviewer, time, decision and reason are added separately and audited.

### Rule-based risk and court verification

Evidence and reports expose `riskScore`: a deterministic, explainable 0–100 score, risk band and reasons. It is rule-based, not machine learning. Inputs include hash/audit failure, provenance review, source-device flags, invalid OTP incidents, unresolved incidents and off-hours activity.

`POST /api/evidence/:id/verification-token` creates a revocable, expiring, unguessable court-verification token (Forensic Analyst/Senior Authority). `GET /api/public/verify/:token` is read-only and public-safe: it returns only evidence ID, case ID, integrity verdict and expiry. `POST /api/evidence/:id/verification-token/:token/revoke` revokes a token (Senior Authority). `GET /api/evidence/:id/report.pdf` returns a simple local, court-friendly PDF summary. It contains no raw uploaded bytes.

### Physical QR evidence twins

`POST /api/physical-tags` creates a persistent physical tag mapping (Investigating Officer/System Admin) with physical tag ID, evidence ID, seal/package identifier and location. `GET /api/physical-tags` lists authorised mappings; `GET /api/physical-tags/:tag` performs an authorised read-safe lookup and records the lookup in the evidence audit chain.

### Offline sync and Hindi voice parsing

`POST /api/evidence/:id/sync-actions` accepts `actions` with `actionId`, `actionType` (`VIEWED` or `COURT_ACCESSED`) and monotonically increasing `sequenceNumber`. It is authenticated, idempotent, and returns `ACCEPTED`, `DUPLICATE`, `CONFLICT`, or `REVIEW_REQUIRED`; offline clients are not inherently trusted.

`POST /api/voice/parse` accepts `{ "text" }` and supports safe, narrow Hindi phrases such as “Case 102 ki evidence verify karo” and “Evidence DOC-2026-001 ka report kholo”. It returns intent and normal-role confirmation requirements only; it never executes irreversible or sensitive actions.
