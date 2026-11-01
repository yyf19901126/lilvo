// POST /api/subscribe  { email, want, src, camp }  ->  one row per email in D1 (binding: DB)
import { json, ensure, clean } from '../../lib/fn.js';

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }

  const email = String(data.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'email' }, 400);

  const w = parseInt(data.want, 10);
  const want = w >= 1 && w <= 5 ? w : null;
  const country = (request.cf && request.cf.country) || null;
  const src = clean(data.src) || 'direct', camp = clean(data.camp);

  try {
    await ensure(env.DB);
    const prev = await env.DB.prepare('SELECT id FROM subscribers WHERE email = ?').bind(email).first();
    await env.DB.prepare(
      `INSERT INTO subscribers (email, want, country, source, campaign) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(email) DO UPDATE SET want = COALESCE(?2, want), updated_at = datetime('now')`
    ).bind(email, want, country, src, camp).run();
    return json({ ok: true, returning: !!prev });
  } catch (e) {
    return json({ ok: false, error: 'server' }, 500);
  }
}

export const onRequest = () => json({ ok: false, error: 'method' }, 405);
