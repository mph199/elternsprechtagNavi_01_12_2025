import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
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

let transporter = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

export function isEmailConfigured() {
  return !!transporter;
}

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.warn('Email not configured. Skipping send to', to, 'subject:', subject);
    return { skipped: true };
  }
  const info = await transporter.sendMail({ from: fromEmail, to, subject, text, html });
  return { messageId: info.messageId };
}
