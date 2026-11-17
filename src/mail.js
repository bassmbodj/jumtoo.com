// Transactional e-mail through an HTTP API (Resend or Brevo), or written to the log in development.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export const outbox = []; // last messages, for tests and the development log

export async function sendMail({ to, subject, text }) {
  const msg = { to, subject, text, at: new Date().toISOString() };
  outbox.push(msg); if (outbox.length > 200) outbox.shift();
  const { provider, apiKey, from } = config.mail;
  try {
    if (provider === 'resend' && apiKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    } else if (provider === 'brevo' && apiKey) {
      const m = /^(.*)<(.+)>$/.exec(from);
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: m ? { name: m[1].trim(), email: m[2].trim() } : { email: from }, to: [{ email: to }], subject, textContent: text }),
      });
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
    } else {
      mkdirSync(config.dataDir, { recursive: true });
      appendFileSync(join(config.dataDir, 'outbox.log'), `--- ${msg.at}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n\n`);
      if (config.dev) console.log(`[mail] ${to} — ${subject}`);
    }
    return true;
  } catch (e) {
    console.error('[mail] échec d’envoi :', e.message);
    return false;
  }
}
