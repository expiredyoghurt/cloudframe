const E = new TextEncoder();
const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
let WX = { k: '', t: 0, v: null }; // weather cache (lite frame gets weather via the Worker)
async function weatherFor(S) {
  if (S.lat === '' || S.lon === '') return null;
  const k = S.lat + ',' + S.lon + S.units;
  if (WX.k === k && Date.now() - WX.t < 6e5) return WX.v;
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(S.lat)}&longitude=${encodeURIComponent(S.lon)}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=2&timezone=auto&temperature_unit=${S.units === 'F' ? 'fahrenheit' : 'celsius'}`)).json();
    WX = { k, t: Date.now(), v: { t: Math.round(r.current.temperature_2m), c: WMO[r.current.weather_code] || '', tm: r.daily && r.daily.time && r.daily.time.length > 1 ? { c: WMO[r.daily.weather_code[1]] || '', hi: Math.round(r.daily.temperature_2m_max[1]), lo: Math.round(r.daily.temperature_2m_min[1]), p: r.daily.precipitation_probability_max ? r.daily.precipitation_probability_max[1] : null } : null } };
  } catch { if (WX.k !== k) return null; }
  return WX.v;
}
// Official NEA 24-hour PSI (the readings shown on haze.gov.sg), read from data.gov.sg and cached
const PSI_BANDS = [[50, 'Good'], [100, 'Moderate'], [200, 'Unhealthy'], [300, 'Very unhealthy'], [Infinity, 'Hazardous']];
let PSIC = { t: 0, v: null };
async function psiFor(S, env) {
  if (Date.now() - PSIC.t > 15 * 6e4) {
    let ok = false;
    for (const url of ['https://api-open.data.gov.sg/v2/real-time/api/psi', 'https://api.data.gov.sg/v1/environment/psi']) {
      try {
        const r = await fetch(url, env.DATA_GOV_SG_API_KEY ? { headers: { 'x-api-key': env.DATA_GOV_SG_API_KEY } } : {});
        if (!r.ok) continue;
        const j = await r.json(), d = j.data || j, it = (d.items || [])[0], rd = it && it.readings && it.readings.psi_twenty_four_hourly;
        if (rd) { PSIC = { t: Date.now(), v: { rd, at: it.updatedTimestamp || it.update_timestamp || it.timestamp } }; ok = true; break; }
      } catch {}
    }
    if (!ok) PSIC.t = Date.now() - 10 * 6e4; // retry in ~5 minutes, keep the last good reading
  }
  const v = PSIC.v;
  if (!v || Date.now() - new Date(v.at) > 4 * 36e5) return null;
  const vals = ['north', 'south', 'east', 'west', 'central'].map(k => v.rd[k]).filter(x => typeof x === 'number');
  const val = S.psi_region === 'national' ? (typeof v.rd.national === 'number' ? v.rd.national : vals.length ? Math.max(...vals) : null) : v.rd[S.psi_region];
  if (typeof val !== 'number') return null;
  return { v: val, band: PSI_BANDS.find(b => val <= b[0])[1], region: S.psi_region, at: v.at };
}
// ---- NEA 2-hour nowcast and UV index (official data via data.gov.sg), cached about 10 minutes
const NEA = 'https://api-open.data.gov.sg/v2/real-time/api/';
const neaGet = async (env, path) => {
  const r = await fetch(NEA + path, env.DATA_GOV_SG_API_KEY ? { headers: { 'x-api-key': env.DATA_GOV_SG_API_KEY } } : {});
  if (!r.ok) throw new Error('NEA ' + r.status);
  return (await r.json()).data;
};
let NCC = { t: 0, d: null }, UVC = { t: 0, d: null };
async function nowcastData(env) {
  if (Date.now() - NCC.t > 10 * 6e4) {
    try { const d = await neaGet(env, 'two-hr-forecast'), it = d.items[0]; NCC = { t: Date.now(), d: { meta: d.area_metadata, fc: it.forecasts, vp: it.valid_period } }; }
    catch { NCC.t = Date.now() - 5 * 6e4; } // retry in ~5 minutes, keep the last good data
  }
  return NCC.d;
}
async function nowcastFor(S, env) {
  const d = await nowcastData(env);
  if (!d || Date.now() - new Date(d.vp.end) > 30 * 6e4) return null;
  let area = S.nowcast_area && (d.fc.find(f => f.area.toLowerCase() === String(S.nowcast_area).trim().toLowerCase()) || {}).area;
  if (!area && S.lat !== '' && S.lon !== '') { // otherwise the forecast area nearest the weather location
    let best = 1e9;
    for (const a of d.meta) { const dd = (a.label_location.latitude - +S.lat) ** 2 + (a.label_location.longitude - +S.lon) ** 2; if (dd < best) { best = dd; area = a.name; } }
  }
  const f = area && d.fc.find(x => x.area === area);
  return f ? { area, forecast: f.forecast.replace(/\s*\((Day|Night)\)\s*/i, ''), until: (d.vp.text || '').split(' to ')[1] || '' } : null;
}
const uvBand = v => v <= 2 ? 'Low' : v <= 5 ? 'Moderate' : v <= 7 ? 'High' : v <= 10 ? 'Very high' : 'Extreme';
async function uvFor(env) {
  if (Date.now() - UVC.t > 10 * 6e4) {
    try {
      const d = await neaGet(env, 'uv'), idx = ((d.records || [])[0] || {}).index || [];
      const last = idx.slice().sort((a, b) => new Date(b.hour) - new Date(a.hour))[0];
      UVC = { t: Date.now(), d: last ? { v: last.value, hour: last.hour } : null };
    } catch { UVC.t = Date.now() - 5 * 6e4; }
  }
  const d = UVC.d;
  if (!d || Date.now() - new Date(d.hour) > 3 * 36e5) return null; // readings run 7am-7pm
  return { v: d.v, band: uvBand(d.v), hour: d.hour };
}
function tzOffset(tz) { // minutes east of UTC, so the lite page can show the right local time without Intl
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date());
    const g = t => +p.find(x => x.type === t).value;
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Date.now()) / 6e4);
  } catch { return 0; }
}
const liteForm = msg => new Response(`<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>CloudFrame Lite</title><style>body{margin:0;background:#14161a;color:#e8e8ea;font:18px Helvetica,Arial,sans-serif}form{max-width:320px;margin:15vh auto;padding:0 20px}h1{font-size:24px}input,button{display:block;width:100%;box-sizing:border-box;font:inherit;padding:12px;margin:10px 0;border-radius:10px;border:1px solid #444;background:#2a2f38;color:#fff}button{background:#3b6ef5;border-color:#3b6ef5}p{color:#ff8a8a;min-height:1.2em}</style></head><body><form method=post action=/lite/login><h1>CloudFrame</h1><input name=username placeholder=Username autocapitalize=off autocorrect=off required><input name=pin type=password pattern="[0-9]*" maxlength=8 placeholder="8-digit PIN" required><button>Start frame</button><p>${msg || ''}</p></form></body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const reserved = k => /^[0-9a-f-]{36}(-t)?$/.test(k); // photo files, managed from the Photos tab
const badKey = k => !k || k.length > 400 || k.startsWith('/') || /[\u0000-\u001f\\]/.test(k) ||
  k.split('/').some((s, i, a) => s === '..' || s === '.' || (s === '' && i < a.length - 1));
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };
const H = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; media-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com; frame-ancestors 'none'",
};
const D = { overlay: true, position: 'bl', opacity: 0.35, units: 'C', h24: true, show_time: true, show_date: true,
  show_weather: true, show_temp: true, show_meta: true, interval: 15, order: 'shuffle', fit: 'cover', lat: '', lon: '', tz: 'UTC', hide_albums: [], music: false, music_volume: 0.5, music_shuffle: true, content: 'all', video_sound: false, video_max: 0, lite_videos: false, sleep_on: true, sleep_start: '20:00', sleep_end: '06:00', sleep_level: 5, show_psi: true, psi_region: 'national', sleep_music_off: true, light_sensor: false, light_min: 25, show_nowcast: true, nowcast_area: '', show_uv: true, overlay_scale: 100 };
const ENUM = { position: ['tl', 'tr', 'bl', 'br', 'split'], units: ['C', 'F'], order: ['shuffle', 'sequential'], fit: ['cover', 'contain'], content: ['all', 'photos', 'videos'], psi_region: ['national', 'north', 'south', 'east', 'west', 'central'] };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const hmac = async (k, m) => new Uint8Array(await crypto.subtle.sign('HMAC',
  await crypto.subtle.importKey('raw', E.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), E.encode(m)));
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
async function same(a, b) { // constant-time compare via fixed-length HMACs
  const [x, y] = await Promise.all([hmac('cmp', a), hmac('cmp', b)]);
  let d = 0; for (let i = 0; i < 32; i++) d |= x[i] ^ y[i]; return d === 0;
}
async function authed(req, env) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|; )pf=(\d+)\.([af])\.([0-9a-f]+)/);
  if (!m || +m[1] < Date.now()) return null;
  return (await same(m[3], hex(await hmac(env.SESSION_SECRET, m[1] + '.' + m[2])))) ? m[2] : null;
}
const num = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };

async function login(req, env) {
  const lite = new URL(req.url).pathname === '/lite/login'; // plain form post for old browsers (frame mode only)
  const res = (st, o, h = {}) => !lite ? json(o, st, h) : o.ok ? new Response(null, { status: 302, headers: { Location: '/lite', ...h } })
    : liteForm(o.error === 'locked' ? 'Too many attempts. Try again in ' + Math.ceil(o.retry / 60) + ' min.' : 'Invalid credentials');
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown', now = Date.now();
  const row = await env.DB.prepare('SELECT * FROM login_attempts WHERE ip=?').bind(ip).first();
  if (row && row.locked_until > now) return res(429, { error: 'locked', retry: Math.ceil((row.locked_until - now) / 1000) });
  const b = lite ? Object.fromEntries(await req.formData().then(f => [...f.entries()]).catch(() => [])) : await req.json().catch(() => ({}));
  const fm = lite || b.mode === 'frame'; // frame mode: username + PIN only, view-only session
  const checks = await Promise.all([
    same(String(b.username || ''), env.FRAME_USERNAME), same(String(b.pin || ''), env.FRAME_PIN),
    fm ? true : same(String(b.password || ''), env.FRAME_PASSWORD)]);
  if (checks.every(Boolean)) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();
    const days = fm ? 90 : 30, sc = fm ? 'f' : 'a', exp = String(now + days * 864e5);
    const tok = `${exp}.${sc}.${hex(await hmac(env.SESSION_SECRET, exp + '.' + sc))}`;
    return res(200, { ok: true, next: fm ? '/' : '/admin' }, { 'Set-Cookie': `pf=${tok}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${days * 86400}` });
  }
  const win = num(env.FAIL_WINDOW_MINUTES, 15) * 6e4, lock = num(env.LOCK_MINUTES, 30) * 6e4, max = num(env.MAX_FAILS, 5);
  const inWin = row && now - row.first_fail < win;
  const fails = inWin ? row.fails + 1 : 1, first = inWin ? row.first_fail : now, until = fails >= max ? now + lock : 0;
  await env.DB.prepare(`INSERT INTO login_attempts(ip,fails,first_fail,locked_until) VALUES(?1,?2,?3,?4)
    ON CONFLICT(ip) DO UPDATE SET fails=?2, first_fail=?3, locked_until=?4`).bind(ip, fails, first, until).run();
  await new Promise(r => setTimeout(r, 400));
  return until ? res(429, { error: 'locked', retry: Math.ceil(lock / 1000) }) : res(401, { error: 'Invalid credentials' });
}

const getSettings = async env => {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='config'").first();
  return { ...D, ...(r ? JSON.parse(r.value) : {}) };
};
const page = async (env, req, n) => {
  const r = await env.ASSETS.fetch(new Request(new URL(`/${n}.html`, req.url)));
  const o = new Response(r.body, r); o.headers.set('Cache-Control', 'no-store'); return o;
};

async function route(req, env) {
  const u = new URL(req.url), p = u.pathname, m = req.method;
  if (m !== 'GET' && m !== 'HEAD' && p !== '/lite/login') { const o = req.headers.get('Origin'); let oh = ''; try { oh = new URL(o).host; } catch {} if (o && oh !== u.host) return json({ error: 'Bad origin' }, 403); }
  if (m === 'GET' && (p === '/manifest.webmanifest' || p === '/sw.js' || p === '/icon.svg')) { // public PWA assets
    const r = await env.ASSETS.fetch(req), o = new Response(r.body, r);
    if (p === '/sw.js') o.headers.set('Cache-Control', 'no-cache');
    if (p === '/manifest.webmanifest') o.headers.set('Content-Type', 'application/manifest+json');
    return o;
  }
  if (p === '/login' && m === 'GET') return page(env, req, 'login');
  if (p === '/lite/login') return m === 'POST' ? login(req, env) : liteForm('');
  if (p === '/api/login' && m === 'POST') return login(req, env);
  const sc = await authed(req, env);
  if (!sc) return p.startsWith('/api/') ? json({ error: 'auth' }, 401) : Response.redirect(u.origin + (p.startsWith('/lite') ? '/lite/login' : '/login'), 302);
  if (p === '/api/me') return json({ scope: sc === 'a' ? 'admin' : 'frame', version: '1.5' });
  const viewOk = m === 'GET' && (p === '/' || p === '/lite' || p === '/api/lite' || p === '/api/psi' || p === '/api/nowcast' || p === '/api/uv' || p === '/lite/logout' || p === '/api/photos' || p === '/api/settings' || p === '/api/albums' || p === '/api/music' || p.startsWith('/api/music/') || /^\/api\/(photo|video)\/[0-9a-f-]{36}$/.test(p));
  if (sc === 'f' && !viewOk && p !== '/api/logout')
    return p.startsWith('/api/') ? json({ error: 'forbidden' }, 403) : Response.redirect(u.origin + '/login?mode=admin', 302);

  if (p === '/' ) return page(env, req, 'frame');
  if (p === '/admin') return page(env, req, 'admin');
  if (p === '/lite') return page(env, req, 'lite');
  if (p === '/lite/logout') return new Response(null, { status: 302, headers: { Location: '/lite/login', 'Set-Cookie': 'pf=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' } });
  if (p === '/api/logout') return json({ ok: true }, 200, { 'Set-Cookie': 'pf=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });

  if (p === '/api/settings' && m === 'GET') return json(await getSettings(env));
  if (p === '/api/settings' && m === 'PUT') {
    const b = await req.json().catch(() => ({})), cur = await getSettings(env);
    for (const k in D) {
      if (!(k in b)) continue;
      if (Array.isArray(D[k])) { cur[k] = (Array.isArray(b[k]) ? b[k] : []).map(String).filter(x => /^([0-9a-f-]{36}|none)$/.test(x)).slice(0, 100); continue; }
      const t = typeof D[k]; let v = b[k];
      if (t === 'boolean') v = !!v; else if (t === 'number') { v = Number(v); if (!isFinite(v)) continue; } else v = String(v).slice(0, 64);
      if (ENUM[k] && !ENUM[k].includes(v)) continue;
      cur[k] = v;
    }
    cur.opacity = Math.min(0.9, Math.max(0.05, cur.opacity)); cur.interval = Math.min(3600, Math.max(3, cur.interval));
    cur.music_volume = Math.min(1, Math.max(0, cur.music_volume));
    cur.video_max = Math.min(300, Math.max(0, cur.video_max));
    cur.sleep_level = Math.min(50, Math.max(0, cur.sleep_level));
    cur.light_min = Math.min(100, Math.max(5, cur.light_min));
    cur.overlay_scale = Math.min(180, Math.max(60, cur.overlay_scale));
    for (const k of ['sleep_start', 'sleep_end']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cur[k])) cur[k] = D[k];
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('config',?1) ON CONFLICT(key) DO UPDATE SET value=?1").bind(JSON.stringify(cur)).run();
    return json(cur);
  }

  if (p === '/api/photos' && m === 'GET')
    return json((await env.DB.prepare('SELECT id,album_id,kind,duration,bytes,uploaded_at,caption,taken_at FROM photos ORDER BY uploaded_at DESC').all()).results);
  if (p === '/api/photos' && m === 'POST') {
    const fd = await req.formData().catch(() => null), f = fd?.get('file');
    if (!f || typeof f === 'string') return json({ error: 'No file' }, 400);
    if (f.size > 20e6) return json({ error: 'File too large (20MB max)' }, 413);
    const buf = await f.arrayBuffer(), u8 = new Uint8Array(buf.slice(0, 12));
    const type = u8[0] === 0xFF && u8[1] === 0xD8 ? 'image/jpeg' : u8[0] === 0x89 && u8[1] === 0x50 ? 'image/png'
      : u8[0] === 0x52 && u8[8] === 0x57 ? 'image/webp' : null;
    if (!type) return json({ error: 'Only JPEG, PNG or WebP' }, 415);
    const id = crypto.randomUUID(), al = String(fd.get('album') || '');
    const aid = /^[0-9a-f-]{36}$/.test(al) && await env.DB.prepare('SELECT 1 x FROM albums WHERE id=?').bind(al).first() ? al : null;
    const taken = String(fd?.get('taken_at') || '').slice(0, 10), w = num(fd?.get('w'), 0), h = num(fd?.get('h'), 0);
    await env.BUCKET.put(id, buf, { httpMetadata: { contentType: type } });
    const th = fd.get('thumb');
    if (th && typeof th !== 'string' && th.size < 1e6) {
      const tb = await th.arrayBuffer(), t8 = new Uint8Array(tb.slice(0, 2));
      if (t8[0] === 0xFF && t8[1] === 0xD8) await env.BUCKET.put(id + '-t', tb, { httpMetadata: { contentType: 'image/jpeg' } });
    }
    await env.DB.prepare('INSERT INTO photos(id,album_id,caption,taken_at,width,height,bytes,uploaded_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, aid, '', taken, w, h, buf.byteLength, Date.now()).run();
    return json({ id });
  }
  // ---- video: chunked multipart upload through the Worker, and range playback
  if (p === '/api/video/start' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!VIDEO_MIME.includes(b.mime)) return json({ error: 'Unsupported video type' }, 415);
    if (!(b.size > 0) || b.size > 500e6) return json({ error: 'Video too large (500 MB max)' }, 413);
    const id = crypto.randomUUID(), mp = await env.BUCKET.createMultipartUpload(id, { httpMetadata: { contentType: b.mime } });
    return json({ id, uploadId: mp.uploadId });
  }
  if (p === '/api/video/part' && m === 'PUT') {
    const id = u.searchParams.get('id'), uid = u.searchParams.get('uploadId'), n = +u.searchParams.get('n');
    if (!/^[0-9a-f-]{36}$/.test(id) || !uid || !(n >= 1 && n <= 10000)) return json({ error: 'Bad part' }, 400);
    const part = await env.BUCKET.resumeMultipartUpload(id, uid).uploadPart(n, await req.arrayBuffer());
    return json({ partNumber: part.partNumber, etag: part.etag });
  }
  if (p === '/api/video/thumb' && m === 'PUT') {
    const id = u.searchParams.get('id'), tb = await req.arrayBuffer(), t8 = new Uint8Array(tb.slice(0, 2));
    if (!/^[0-9a-f-]{36}$/.test(id) || tb.byteLength > 1e6 || t8[0] !== 0xFF || t8[1] !== 0xD8) return json({ error: 'Bad thumbnail' }, 400);
    await env.BUCKET.put(id + '-t', tb, { httpMetadata: { contentType: 'image/jpeg' } }); return json({ ok: true });
  }
  if (p === '/api/video/abort' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (/^[0-9a-f-]{36}$/.test(b.id) && b.uploadId) { try { await env.BUCKET.resumeMultipartUpload(b.id, b.uploadId).abort(); } catch {} await env.BUCKET.delete(b.id + '-t'); }
    return json({ ok: true });
  }
  if (p === '/api/video/complete' && m === 'POST') {
    const b = await req.json().catch(() => ({})), d = +b.duration;
    if (!/^[0-9a-f-]{36}$/.test(b.id) || !b.uploadId || !Array.isArray(b.parts) || !b.parts.length) return json({ error: 'Bad request' }, 400);
    if (!(d > 0 && d <= 301)) return json({ error: 'Video must be under 5 minutes' }, 400);
    const al = String(b.album || ''), aid = /^[0-9a-f-]{36}$/.test(al) && await env.DB.prepare('SELECT 1 x FROM albums WHERE id=?').bind(al).first() ? al : null;
    let obj; try { obj = await env.BUCKET.resumeMultipartUpload(b.id, b.uploadId).complete(b.parts.map(x => ({ partNumber: +x.partNumber, etag: String(x.etag) }))); }
    catch { return json({ error: 'Upload could not be completed' }, 400); }
    await env.DB.prepare("INSERT INTO photos(id,album_id,kind,duration,mime,caption,taken_at,width,height,bytes,uploaded_at) VALUES(?,?,'video',?,?,'',?,?,?,?,?)")
      .bind(b.id, aid, d, String(b.mime || '').slice(0, 40), String(b.taken_at || '').slice(0, 10), num(b.w, 0), num(b.h, 0), obj.size, Date.now()).run();
    return json({ id: b.id });
  }
  const dm = p.match(/^\/api\/dl\/([0-9a-f-]{36})$/); // full-size download for the admin export (not cached by the service worker)
  if (dm && m === 'GET') {
    const o = await env.BUCKET.get(dm[1]);
    if (!o) return json({ error: 'Not found' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'application/octet-stream', 'Content-Length': String(o.size), 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment' } });
  }
  const vm = p.match(/^\/api\/video\/([0-9a-f-]{36})$/);
  if (vm && m === 'GET') {
    const o = await env.BUCKET.get(vm[1], { range: req.headers });
    if (!o) return json({ error: 'Not found' }, 404);
    const h = { 'Content-Type': o.httpMetadata?.contentType || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
    if (o.range) {
      const off = o.range.offset ?? 0, len = o.range.length ?? o.size - off;
      h['Content-Range'] = `bytes ${off}-${off + len - 1}/${o.size}`; h['Content-Length'] = String(len);
      return new Response(o.body, { status: 206, headers: h });
    }
    h['Content-Length'] = String(o.size); return new Response(o.body, { headers: h });
  }
  if (p === '/api/nowcast/areas' && m === 'GET') return json(((await nowcastData(env)) || { meta: [] }).meta.map(a => a.name));
  if (p === '/api/nowcast' && m === 'GET') return json(await nowcastFor(await getSettings(env), env));
  if (p === '/api/uv' && m === 'GET') return json(await uvFor(env));
  if (p === '/api/psi' && m === 'GET') return json(await psiFor(await getSettings(env), env));
  if (p === '/api/lite' && m === 'GET') { // everything the lite frame needs in one small response
    const S = await getSettings(env), hid = S.hide_albums || [];
    const rows = (await env.DB.prepare('SELECT id,album_id,kind,duration,bytes,uploaded_at,caption,taken_at FROM photos ORDER BY uploaded_at DESC').all()).results
      .filter(r => !hid.includes(r.album_id || 'none') && (r.kind === 'video' ? (S.lite_videos && S.content !== 'photos') : S.content !== 'videos'))
      .map(r => ({ id: r.id, caption: r.caption, taken_at: r.taken_at, kind: r.kind, duration: r.duration }));
    const { hide_albums, music, music_volume, music_shuffle, lat, lon, tz, ...pub } = S;
    const [w, psi, nc, uv] = await Promise.all([weatherFor(S), S.show_psi ? psiFor(S, env) : null, S.show_nowcast ? nowcastFor(S, env) : null, S.show_uv ? uvFor(env) : null]);
    return json({ s: pub, p: rows, w, psi, nc, uv, off: tzOffset(S.tz) });
  }
  if (p === '/api/stats' && m === 'GET') {
    const s = await env.DB.prepare("SELECT COUNT(*) photos, COALESCE(SUM(bytes),0) bytes, COALESCE(SUM(kind='video'),0) videos FROM photos").first();
    const a = await env.DB.prepare('SELECT COUNT(*) n FROM albums').first();
    return json({ photos: s.photos, bytes: s.bytes, videos: s.videos, albums: a.n });
  }
  // ---- R2 storage browser (admin only: frame sessions are blocked by the view-only gate above)
  if (p === '/api/storage' && m === 'GET') {
    const prefix = u.searchParams.get('prefix') || '';
    if (prefix && (badKey(prefix) || !prefix.endsWith('/'))) return json({ error: 'Bad folder' }, 400);
    const folders = new Set(), files = []; let hidden = 0, cursor, pages = 0;
    do {
      const l = await env.BUCKET.list({ prefix, delimiter: '/', cursor });
      l.delimitedPrefixes.forEach(f => folders.add(f));
      for (const o of l.objects) {
        if (reserved(o.key)) { hidden++; continue; }
        if (o.key !== prefix) files.push({ key: o.key, name: o.key.slice(prefix.length), size: o.size, uploaded: o.uploaded });
      }
      cursor = l.truncated ? l.cursor : null;
    } while (cursor && ++pages < 10);
    return json({ prefix, folders: [...folders].sort(), files, hidden, more: !!cursor });
  }
  if (p === '/api/storage/folder' && m === 'POST') {
    const b = await req.json().catch(() => ({})); let k = String(b.path || '').trim().replace(/^\/+/, '');
    if (!k.endsWith('/')) k += '/';
    if (badKey(k) || k.length < 2) return json({ error: 'Bad folder name' }, 400);
    await env.BUCKET.put(k, new Uint8Array(0)); return json({ ok: true });
  }
  const sm = p.match(/^\/api\/storage\/(.+)$/);
  if (sm) {
    let k; try { k = decodeURIComponent(sm[1]); } catch { return json({ error: 'Bad key' }, 400); }
    if (badKey(k) || reserved(k)) return json({ error: 'Not allowed' }, 400);
    const ext = k.split('.').pop().toLowerCase();
    if (m === 'PUT') {
      if (k.endsWith('/') || !MIME[ext]) return json({ error: 'Only audio files (mp3, m4a, aac, ogg, wav, flac) can be uploaded' }, 415);
      const len = +req.headers.get('Content-Length');
      if (!len) return json({ error: 'Empty file or unknown size' }, 411);
      if (len > 90e6) return json({ error: 'File too large (90 MB max)' }, 413);
      await env.BUCKET.put(k, req.body, { httpMetadata: { contentType: MIME[ext] } }); return json({ ok: true });
    }
    if (m === 'DELETE') {
      if (k.endsWith('/') && (await env.BUCKET.list({ prefix: k, limit: 2 })).objects.some(o => o.key !== k)) return json({ error: 'Folder is not empty' }, 409);
      await env.BUCKET.delete(k); return json({ ok: true });
    }
    if (m === 'GET' && !k.endsWith('/')) {
      const o = await env.BUCKET.get(k, { range: req.headers });
      if (!o) return json({ error: 'Not found' }, 404);
      const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
        'Content-Disposition': MIME[ext] ? 'inline' : 'attachment' };
      if (o.range) {
        const off = o.range.offset ?? 0, len = o.range.length ?? o.size - off;
        h['Content-Range'] = `bytes ${off}-${off + len - 1}/${o.size}`; h['Content-Length'] = String(len);
        return new Response(o.body, { status: 206, headers: h });
      }
      h['Content-Length'] = String(o.size); return new Response(o.body, { headers: h });
    }
  }
  if (p === '/api/music' && m === 'GET') { // files in the R2 "BGM/" folder
    const out = []; let cursor;
    do {
      const l = await env.BUCKET.list({ prefix: 'BGM/', cursor });
      for (const o of l.objects) { const n = o.key.slice(4); if (!n.includes('/') && MIME[n.split('.').pop().toLowerCase()]) out.push({ name: n, size: o.size }); }
      cursor = l.truncated ? l.cursor : null;
    } while (cursor);
    return json(out);
  }
  const mm = p.match(/^\/api\/music\/(.+)$/);
  if (mm && m === 'GET') {
    let n; try { n = decodeURIComponent(mm[1]); } catch { return json({ error: 'Bad name' }, 400); }
    const ext = n.split('.').pop().toLowerCase();
    if (!MIME[ext] || n.includes('/') || n.startsWith('.')) return json({ error: 'Not found' }, 404);
    const o = await env.BUCKET.get('BGM/' + n, { range: req.headers });
    if (!o) return json({ error: 'Not found' }, 404);
    const h = { 'Content-Type': MIME[ext], 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
    if (o.range) {
      const off = o.range.offset ?? 0, len = o.range.length ?? o.size - off;
      h['Content-Range'] = `bytes ${off}-${off + len - 1}/${o.size}`; h['Content-Length'] = String(len);
      return new Response(o.body, { status: 206, headers: h });
    }
    h['Content-Length'] = String(o.size); return new Response(o.body, { headers: h });
  }
  const tm = p.match(/^\/api\/thumb\/([0-9a-f-]{36})$/);
  if (tm && m === 'GET') {
    const o = (await env.BUCKET.get(tm[1] + '-t')) || (await env.BUCKET.get(tm[1]));
    if (!o) return json({ error: 'Not found' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata.contentType, 'Cache-Control': 'private, max-age=86400, immutable' } });
  }
  if (p === '/api/photos/bulk' && m === 'POST') {
    const b = await req.json().catch(() => ({})), ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter(x => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200);
    if (b.action === 'delete') for (const id of ids) {
      await env.BUCKET.delete(id); await env.BUCKET.delete(id + '-t'); await env.DB.prepare('DELETE FROM photos WHERE id=?').bind(id).run();
    } else if (b.action === 'move') {
      const a = String(b.album_id || ''), ok = /^[0-9a-f-]{36}$/.test(a) && await env.DB.prepare('SELECT 1 x FROM albums WHERE id=?').bind(a).first();
      for (const id of ids) await env.DB.prepare('UPDATE photos SET album_id=? WHERE id=?').bind(ok ? a : null, id).run();
    } else return json({ error: 'Bad action' }, 400);
    return json({ ok: true, n: ids.length });
  }
  if (p === '/api/albums' && m === 'GET') {
    const a = (await env.DB.prepare('SELECT a.id,a.name,(SELECT COUNT(*) FROM photos WHERE album_id=a.id) n,(SELECT id FROM photos WHERE album_id=a.id ORDER BY uploaded_at DESC LIMIT 1) cover FROM albums a ORDER BY a.name COLLATE NOCASE').all()).results;
    const u0 = await env.DB.prepare('SELECT COUNT(*) n,(SELECT id FROM photos WHERE album_id IS NULL ORDER BY uploaded_at DESC LIMIT 1) cover FROM photos WHERE album_id IS NULL').first();
    return json({ albums: a, unsorted: u0.n, ucover: u0.cover });
  }
  if (p === '/api/albums' && m === 'POST') {
    const b = await req.json().catch(() => ({})), name = String(b.name || '').trim().slice(0, 60);
    if (!name) return json({ error: 'Name required' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO albums(id,name,created_at) VALUES(?,?,?)').bind(id, name, Date.now()).run();
    return json({ id });
  }
  const am = p.match(/^\/api\/albums\/([0-9a-f-]{36})$/);
  if (am && m === 'PATCH') {
    const b = await req.json().catch(() => ({})), name = String(b.name || '').trim().slice(0, 60);
    if (!name) return json({ error: 'Name required' }, 400);
    await env.DB.prepare('UPDATE albums SET name=? WHERE id=?').bind(name, am[1]).run(); return json({ ok: true });
  }
  if (am && m === 'DELETE') { // photos move to Unsorted
    await env.DB.prepare('UPDATE photos SET album_id=NULL WHERE album_id=?').bind(am[1]).run();
    await env.DB.prepare('DELETE FROM albums WHERE id=?').bind(am[1]).run(); return json({ ok: true });
  }
  const pm = p.match(/^\/api\/photos?\/([0-9a-f-]{36})$/);
  if (pm) {
    const id = pm[1];
    if (m === 'GET') {
      const o = await env.BUCKET.get(id); if (!o) return json({ error: 'Not found' }, 404);
      return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata.contentType, 'Cache-Control': 'private, max-age=86400, immutable' } });
    }
    if (m === 'PATCH') {
      const b = await req.json().catch(() => ({}));
      if ('caption' in b) await env.DB.prepare('UPDATE photos SET caption=? WHERE id=?').bind(String(b.caption || '').slice(0, 200), id).run();
      if ('album_id' in b) {
        const a = String(b.album_id || ''), ok = /^[0-9a-f-]{36}$/.test(a) && await env.DB.prepare('SELECT 1 x FROM albums WHERE id=?').bind(a).first();
        await env.DB.prepare('UPDATE photos SET album_id=? WHERE id=?').bind(ok ? a : null, id).run();
      }
      return json({ ok: true });
    }
    if (m === 'DELETE') { await env.BUCKET.delete(id); await env.BUCKET.delete(id + '-t'); await env.DB.prepare('DELETE FROM photos WHERE id=?').bind(id).run(); return json({ ok: true }); }
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const r = await route(req, env), o = new Response(r.body, r);
    for (const k in H) o.headers.set(k, H[k]);
    return o;
  },
};
