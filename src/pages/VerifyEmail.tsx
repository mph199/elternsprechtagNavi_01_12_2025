import { useEffect, useState } from 'react';
import api from '../services/api';

export function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get('token');

  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>(() => (token ? 'idle' : 'error'));
  const [message, setMessage] = useState<string>(() => (token ? '' : 'Ungültiger Link.'));

  useEffect(() => {
    if (!token) return;

    // In React StrictMode (dev) effects can run twice due to intentional remounting.
    // Verification links are one-time-use, so we cache the result per token in sessionStorage.
    const storageKey = `verifyEmail:${token}`;

    const readCached = () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw) as { status: 'pending' | 'ok' | 'error'; message?: string };
      } catch {
        return null;
      }
    };

    const cached = readCached();
    if (cached?.status === 'ok') {
      setStatus('ok');
      setMessage(cached.message || 'E-Mail bestätigt.');
      return;
    }
    if (cached?.status === 'error') {
      setStatus('error');
      setMessage(cached.message || 'Verifikation fehlgeschlagen.');
      return;
    }

    let cancelled = false;

    // If another mount already started the request, wait for its result.
    if (cached?.status === 'pending') {
      const startedAt = Date.now();
      const interval = window.setInterval(() => {
        const next = readCached();
        if (next?.status === 'ok') {
          window.clearInterval(interval);
          if (!cancelled) {
            setStatus('ok');
            setMessage(next.message || 'E-Mail bestätigt.');
          }
        } else if (next?.status === 'error') {
          window.clearInterval(interval);
          if (!cancelled) {
            setStatus('error');
            setMessage(next.message || 'Verifikation fehlgeschlagen.');
          }
        } else if (Date.now() - startedAt > 10_000) {
          window.clearInterval(interval);
          if (!cancelled) {
            setStatus('error');
            setMessage('Verifikation dauert ungewöhnlich lange. Bitte Seite neu laden.');
          }
        }
      }, 250);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ status: 'pending' }));
    } catch {
      // ignore
    }

    api.bookings.verifyEmail(token)
      .then((data: any) => {
        const nextMessage = data?.message || 'E-Mail bestätigt.';
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ status: 'ok', message: nextMessage }));
        } catch {
          // ignore
        }
        if (!cancelled) {
          setStatus('ok');
          setMessage(nextMessage);
        }
      })
      .catch((e: unknown) => {
        const nextMessage = e instanceof Error ? e.message : 'Verifikation fehlgeschlagen.';
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ status: 'error', message: nextMessage }));
        } catch {
          // ignore
        }
        if (!cancelled) {
          setStatus('error');
          setMessage(nextMessage);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '24px', background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <h2>E-Mail-Verifikation</h2>
      {status === 'idle' && <p>Bitte warten…</p>}
      {status === 'ok' && <p style={{ color: 'green' }}>{message}</p>}
      {status === 'error' && <p style={{ color: 'crimson' }}>{message}</p>}
    </div>
  );
}
