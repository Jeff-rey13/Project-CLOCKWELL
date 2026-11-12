import { log } from './log.ts';

/**
 * Sends a plain email through Resend. Returns false (and sends nothing) when email is not configured,
 * e.g. on the local stack. Never logs the address or the content.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    log('error', { fn: 'email', status: res.status });
    return false;
  }
  return true;
}
