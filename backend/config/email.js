import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env (supports running from repo root)
dotenv.config();
if (!process.env.SMTP_HOST) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const fromEmail = process.env.FROM_EMAIL || 'no-reply@example.com';

const mailTransport = (process.env.MAIL_TRANSPORT || '').trim().toLowerCase();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lastEmailFilePath = path.resolve(__dirname, '..', '.last-ethereal-email.json');

let transporter = null;
let etherealInitPromise = null;
let lastEmail = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

async function getTransporter() {
  if (transporter) return transporter;

  // Dev/test helper: no real email account needed.
  // Usage: MAIL_TRANSPORT=ethereal
  if (mailTransport === 'ethereal') {
    if (!etherealInitPromise) {
      etherealInitPromise = (async () => {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('[email] Using Ethereal test account:', testAccount.user);
        return transporter;
      })();
    }
    return etherealInitPromise;
  }

  return null;
}

export function isEmailConfigured() {
  if (mailTransport === 'ethereal') return true;
  return !!transporter;
}

export function getLastEmailDebugInfo() {
  if (lastEmail) return lastEmail;
  // Best-effort: persist last Ethereal email so devs can retrieve it even after restarts.
  try {
    if (mailTransport === 'ethereal' && fs.existsSync(lastEmailFilePath)) {
      const raw = fs.readFileSync(lastEmailFilePath, 'utf8');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function sendMail({ to, subject, text, html }) {
  const t = await getTransporter();
  if (!t) {
    console.warn('Email not configured. Skipping send to', to, 'subject:', subject);
    return { skipped: true };
  }

  const info = await t.sendMail({ from: fromEmail, to, subject, text, html });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('[email] Preview URL:', previewUrl);
  }
  lastEmail = {
    to,
    subject,
    previewUrl: previewUrl || null,
    messageId: info.messageId || null,
    sentAt: new Date().toISOString(),
  };

  if (mailTransport === 'ethereal') {
    try {
      fs.writeFileSync(lastEmailFilePath, JSON.stringify(lastEmail, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
  return { messageId: info.messageId, previewUrl };
}
