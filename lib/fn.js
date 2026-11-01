// Shared helpers for the Pages Functions in functions/api.
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// SHA-256 of the dashboard key. The key itself is not in this repo.
export const STATS_KEY_SHA256 = 'dc8c2e84983f5c7ad56d1e5d7e6c948d27b3739eec3342687fb8d60d85745e39';

export async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export const isBot = ua => /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|monitor|curl|wget|python/i.test(ua || '');

export const clean = (v, n = 40) => String(v || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, n) || null;

let ready = false;
export async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, vid TEXT NOT NULL, path TEXT NOT NULL, src TEXT, camp TEXT, country TEXT,
      ts TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (day, vid, path))`),
    db.prepare('CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL)'),
  ]);
  const cols = (await db.prepare('PRAGMA table_info(subscribers)').all()).results.map(c => c.name);
  if (cols.length) {
    for (const [name, type] of [['source', 'TEXT'], ['campaign', 'TEXT']]) {
      if (!cols.includes(name)) await db.prepare(`ALTER TABLE subscribers ADD COLUMN ${name} ${type}`).run();
    }
  }
  ready = true;
}

// Daily random salt, deleted after two days, so visitor ids can't be linked across days or reversed later.
export async function dailySalt(db, day) {
  const row = await db.prepare('SELECT salt FROM salts WHERE day = ?').bind(day).first();
  if (row) return row.salt;
  const s = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)').bind(day, s).run();
  await db.prepare("DELETE FROM salts WHERE day < date('now', '-2 days')").run();
  return (await db.prepare('SELECT salt FROM salts WHERE day = ?').bind(day).first()).salt;
}
