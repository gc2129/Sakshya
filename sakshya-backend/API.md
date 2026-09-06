# Sakshya backend API

The service stores evidence in memory for the running process. Every uploaded file is sealed with a SHA-256 hash. Every audit entry contains the preceding entry's hash and its own SHA-256 hash, forming a cryptographically linked audit chain.

Base URL: `http://localhost:3001`

## `GET /api/health`

Returns service status and the configured upload limit.

## `POST /api/evidence/upload`

Uploads one file as multipart form data. The form field must be named `file`. Files larger than 25 MB receive `413` with a clear error.

```bash
curl -F "file=@evidence.pdf" http://localhost:3001/api/evidence/upload
```

Returns `201` and evidence metadata, SHA-256 hashes, anomaly flags, and the audit timeline.

## `GET /api/evidence/:id`

Returns the current evidence record and its audit timeline (newest first).

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

The OTP is single-use. Invalid, expired, or mismatched OTPs return clear `400` or `401` errors.

## `POST /api/evidence/:id/tamper`

Demo-only endpoint that intentionally changes the current evidence hash and records the simulated integrity breach. A subsequent verification must fail.

## `GET /api/evidence/:id/report`

Produces a court-ready JSON forensic report containing the evidence metadata, hashes, full linked audit timeline, integrity assessment, custody holder, and anomaly flags.

## Anomaly flags

Each record and report expose these booleans:

- `offHoursActivity`: at least one audit event occurred between 20:00 and 05:59 UTC.
- `hashMismatch`: the current evidence hash differs from the original SHA-256 hash.
- `brokenAuditChain`: an audit entry's previous hash or event hash no longer verifies.

## Common errors

`404` is returned for an unknown evidence ID, `400` for invalid requests, `401` for an invalid OTP, `413` for files above 25 MB, and `500` for unexpected server errors.
