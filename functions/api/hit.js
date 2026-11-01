// POST /api/hit { path, src, camp }  ->  one row per visitor per page per day. No cookies, no IP stored.
import { json, ensure, dailySalt, sha256, isBot, clean } from '../../lib/fn.js';

export async function onRequestPost({ request, env }) {
  const ua = request.headers.get('user-agent') || '';
  if (isBot(ua)) return json({ ok: true, skipped: true });
  let d = {};
  try { d = await request.json(); } catch {}
  const path = String(d.path || '/').slice(0, 120);
  const day = new Date().toISOString().slice(0, 10);
  try {
    await ensure(env.DB);
    const salt = await dailySalt(env.DB, day);
    const ip = request.headers.get('cf-connecting-ip') || '';
    const vid = (await sha256(salt + '|' + ip + '|' + ua)).slice(0, 16);
    const country = (request.cf && request.cf.country) || null;
    await env.DB.prepare('INSERT OR IGNORE INTO visits (day, vid, path, src, camp, country) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(day, vid, path, clean(d.src) || 'direct', clean(d.camp), country).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false }, 500);
  }
}
export const onRequest = () => json({ ok: false, error: 'method' }, 405);
