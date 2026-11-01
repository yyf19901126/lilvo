// GET /api/stats  (header x-stats-key)  ->  aggregate numbers only, never emails.
import { json, ensure, sha256, STATS_KEY_SHA256 } from '../../lib/fn.js';

export async function onRequestGet({ request, env }) {
  const key = request.headers.get('x-stats-key') || '';
  if (!key || (await sha256(key)) !== STATS_KEY_SHA256) return json({ ok: false, error: 'key' }, 401);
  await ensure(env.DB);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then(r => r.results);
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();

  const totals = await one(`SELECT
      (SELECT COUNT(DISTINCT day||vid) FROM visits) AS visitors,
      (SELECT COUNT(*) FROM visits) AS pageviews,
      (SELECT COUNT(*) FROM subscribers) AS subscribers,
      (SELECT COUNT(DISTINCT day||vid) FROM visits WHERE day >= date('now','-6 days')) AS visitors7,
      (SELECT COUNT(*) FROM subscribers WHERE created_at >= datetime('now','-7 days')) AS subscribers7`);
  const daily = await q(`WITH d(day) AS (SELECT date('now','-29 days') UNION ALL SELECT date(day,'+1 day') FROM d WHERE day < date('now'))
      SELECT d.day,
        (SELECT COUNT(DISTINCT vid) FROM visits v WHERE v.day = d.day) AS visitors,
        (SELECT COUNT(*) FROM subscribers s WHERE substr(s.created_at,1,10) = d.day) AS subs
      FROM d ORDER BY d.day`);
  const bySource = await q(`SELECT src, SUM(visitors) AS visitors, SUM(subs) AS subs FROM (
        SELECT src, COUNT(DISTINCT day||vid) AS visitors, 0 AS subs FROM visits GROUP BY src
        UNION ALL SELECT COALESCE(source,'unknown'), 0, COUNT(*) FROM subscribers GROUP BY 1)
      GROUP BY src ORDER BY visitors DESC, subs DESC`);
  const byCampaign = await q(`SELECT camp, SUM(visitors) AS visitors, SUM(subs) AS subs FROM (
        SELECT camp, COUNT(DISTINCT day||vid) AS visitors, 0 AS subs FROM visits WHERE camp IS NOT NULL GROUP BY camp
        UNION ALL SELECT campaign, 0, COUNT(*) FROM subscribers WHERE campaign IS NOT NULL GROUP BY campaign)
      GROUP BY camp ORDER BY visitors DESC`);
  const want = await q(`SELECT want, COUNT(*) AS n FROM subscribers GROUP BY want ORDER BY want`);
  const countries = await q(`SELECT country, COUNT(DISTINCT day||vid) AS visitors FROM visits GROUP BY country ORDER BY visitors DESC LIMIT 10`);
  const pages = await q(`SELECT path, COUNT(*) AS views FROM visits GROUP BY path ORDER BY views DESC LIMIT 10`);
  return json({ ok: true, totals, daily, bySource, byCampaign, want, countries, pages, generated: new Date().toISOString() });
}
export const onRequest = () => json({ ok: false, error: 'method' }, 405);
