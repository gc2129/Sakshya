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
