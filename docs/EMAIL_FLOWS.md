# Email flows (Verification / Confirmation / Cancellation)

This document is intended as a quick orientation for future maintainers (including chat-based coding agents) to understand **when** and **why** emails are sent, which DB fields are involved, and which endpoints implement the flow.

## Concepts

### Booking lifecycle

A slot in `slots` moves through these practical states:

- **Available**: `booked = false`, `status = null`
- **Reserved (pending email verification)**: `booked = true`, `status = 'reserved'`, `verified_at = null`
- **Confirmed**: `booked = true`, `status = 'confirmed'`, `verified_at != null`
- **Cancelled**: implemented by resetting the slot to “Available” (clearing visitor data)

### Key DB fields (table: `slots`)

Email-related columns:

- `email`: recipient address provided during booking
- `verification_token_hash`: sha256 hash of verification token (best practice)
- `verification_token`: legacy plaintext token (kept for backwards compatibility during transition)
- `verification_sent_at`: timestamp when verification token was created/sent
- `verified_at`: timestamp when the email was verified
- `confirmation_sent_at`: timestamp when a “booking confirmed” email was sent
- `cancellation_sent_at`: timestamp when a “booking cancelled” email was sent

### Config / environment

Backend email is enabled if SMTP is configured (see `backend/config/email.js`). Required env vars:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `FROM_EMAIL` (display name + mailbox)
- `PUBLIC_BASE_URL` (frontend base URL used for verification link)
- `VERIFICATION_TOKEN_TTL_HOURS` (default: `72`)

If SMTP is not configured, `sendMail(...)` is skipped (best-effort).

### Dev/testing without a real email account (Ethereal)

For local development you can test the full booking flow (including verification / confirmation / cancellation emails)
without configuring a real SMTP mailbox.

Set this env var for the backend:

- `MAIL_TRANSPORT=ethereal`

Behavior:

- The backend creates an ephemeral Nodemailer Ethereal test account automatically.
- Every outgoing email prints a **preview URL** to the backend console (`[email] Preview URL: ...`).
- No real email is delivered; you open the preview URL in your browser.

Optional convenience endpoint (dev-only):

- If `MAIL_TRANSPORT=ethereal` and `NODE_ENV` is not `production`, you can fetch the last preview URL via:
  - `GET /api/dev/email/last`

## Where emails are sent

### 1) Verification email (double opt-in)

Trigger:
- A booking is created via **POST** `/api/bookings`.

Implementation:
- Endpoint in `backend/index.js` calls `reserveBooking(payload)`.
- `reserveBooking` (in `backend/services/slotsService.js`) generates a random token and stores only `verification_token_hash` (sha256), plus `verification_sent_at`.
- If SMTP is configured, an email is sent containing a link:
  - `${PUBLIC_BASE_URL}/verify?token=<plaintext-token>`

Notes:
- The plaintext token is only present in the URL (email); the DB stores its hash.

### 2) Verify email endpoint

Trigger:
- User opens verification link which calls **GET** `/api/bookings/verify/:token`.

Implementation:
- Endpoint in `backend/index.js` calls `verifyBookingToken(token)`.
- `verifyBookingToken`:
  - looks up the slot by `verification_token_hash` (sha256 of provided token)
  - supports legacy fallback to `verification_token` during transition
  - enforces TTL (`VERIFICATION_TOKEN_TTL_HOURS`) based on `verification_sent_at`
  - sets `verified_at`
  - **invalidates** token fields by setting `verification_token_hash = null` and `verification_token = null`

### 3) Confirmation email (booking confirmed)

Trigger A:
- Teacher confirms via **PUT** `/api/teacher/bookings/:slotId/accept`.

Implementation:
- In `backend/routes/teacher.js`:
  - requires `verified_at` to exist (email verified)
  - sets `status = 'confirmed'`
  - if `confirmation_sent_at` is empty and SMTP configured, sends confirmation email and sets `confirmation_sent_at`

Trigger B (catch-up):
- If teacher confirmed first and verification happens later, confirmation is sent after verification.

Implementation:
- In `backend/index.js` verify handler:
  - after `verifyBookingToken`, if slot is already `status === 'confirmed'` and `confirmation_sent_at` is empty, send confirmation and set `confirmation_sent_at`

### 4) Cancellation email

Trigger:
- Booking is cancelled by admin or teacher.

Implementation:
- Admin cancellation: **DELETE** `/api/admin/bookings/:slotId` (in `backend/index.js`)
- Teacher cancellation: **DELETE** `/api/teacher/bookings/:slotId` (in `backend/routes/teacher.js`)

Behavior:
- The slot is reset to “Available” by clearing visitor fields.
- Email is sent **best-effort** only when:
  - `current.email` exists and
  - `current.verified_at` exists (to avoid emailing unverified addresses)
- After successful send, `cancellation_sent_at` is written.

## Migrations

The email best-practice columns are introduced in:
- `backend/migrations/add_booking_email_best_practices.sql`

This migration also backfills `verification_token_hash` for legacy rows using `pgcrypto`.

## Troubleshooting checklist

- No emails sent:
  - Check SMTP env vars are set (Render/host)
  - Check spam/DMARC/SPF/DKIM configuration for the sender domain
- Verification link reports expired:
  - Increase `VERIFICATION_TOKEN_TTL_HOURS`
  - Ensure server clock is correct
- Confirmation email not sent:
  - Ensure the booking is verified (`verified_at` set)
  - Ensure `confirmation_sent_at` is not already set
- Cancellation email not sent:
  - Only sent if `verified_at` was set before cancelling
