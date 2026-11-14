// Cal.com-Anbindung für das Leads-Dashboard und Kalender-Datei für Kunden.
//
// POST /api/cal     (nur Raphael, mit Firebase-Login-Token)
//   { action: 'eventtypes' }                                    -> Terminarten in Cal.com
//   { action: 'book', type, start, name, email, phone }         -> Buchung anlegen
//   { action: 'reschedule', uid, start }                        -> Buchung verschieben
//   { action: 'cancel', uid, reason }                           -> Buchung absagen
// Der Cal.com-Schlüssel liegt als Secret CAL_API_KEY in Cloudflare und verlässt den Worker nie.
//
// GET /api/kalender?s=<Start ISO>&d=<Minuten>&t=erst|beratung&v=<Videolink>
//   -> .ics-Datei zum Speichern im Kalender (keine persönlichen Daten in der Adresse)

const ALLOWED_EMAIL = 'raphi.fruehwirth@gmail.com';
const FIREBASE_PROJECT = 'flexokapital';
const ALLOWED_ORIGINS = ['https://www.flexokapital.at', 'https://flexokapital.at'];
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CAL_API = 'https://api.cal.com/v2';
const V_BOOKINGS = '2026-02-25';
const V_EVENT_TYPES = '2024-06-14';
const V_ME = '2024-06-11';

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// ---------- Firebase-Login prüfen (ID-Token, RS256) ----------
let jwkCache = { keys: null, until: 0 };
function b64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function googleKeys() {
  if (jwkCache.keys && Date.now() < jwkCache.until) return jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error('Google-Schlüssel nicht erreichbar');
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
  jwkCache = { keys: data.keys || [], until: Date.now() + (m ? Number(m[1]) * 1000 : 3600000) };
  return jwkCache.keys;
}
async function verifyFirebaseToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Kein gültiger Login');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
  } catch (e) { throw new Error('Kein gültiger Login'); }
  if (header.alg !== 'RS256') throw new Error('Kein gültiger Login');
  const jwk = (await googleKeys()).find(function (k) { return k.kid === header.kid; });
  if (!jwk) throw new Error('Login-Schlüssel unbekannt');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok) throw new Error('Login ungültig');
  if (payload.aud !== FIREBASE_PROJECT || payload.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT) throw new Error('Login gehört nicht zu diesem Projekt');
  if (!(payload.exp > now) || payload.iat > now + 300) throw new Error('Login abgelaufen, bitte Seite neu laden');
  if (payload.email !== ALLOWED_EMAIL || payload.email_verified !== true) throw new Error('Kein Zugriff');
  return payload;
}

// ---------- Cal.com ----------
async function cal(env, path, version, method, body) {
  const res = await fetch(CAL_API + path, {
    method: method || 'GET',
    headers: { 'Authorization': 'Bearer ' + env.CAL_API_KEY, 'cal-api-version': version, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || (data && data.status === 'error')) {
    const msg = data && data.error && (data.error.message || data.error.details && JSON.stringify(data.error.details)) || ('HTTP ' + res.status);
    throw new Error('Cal.com: ' + msg);
  }
  return data ? data.data : null;
}

let typeCache = { list: null, until: 0 };
async function eventTypes(env) {
  if (typeCache.list && Date.now() < typeCache.until) return typeCache.list;
  let list = await cal(env, '/event-types', V_EVENT_TYPES);
  if (!Array.isArray(list) || !list.length) {
    // Falls der Schlüssel allein keine Liste liefert: über den eigenen Benutzernamen abfragen
    const me = await cal(env, '/me', V_ME);
    if (me && me.username) list = await cal(env, '/event-types?username=' + encodeURIComponent(me.username), V_EVENT_TYPES);
  }
  list = (Array.isArray(list) ? list : []).map(function (t) {
    return { id: t.id, title: t.title || '', slug: t.slug || '', length: t.lengthInMinutes || t.length || 0, hidden: !!t.hidden };
  });
  typeCache = { list, until: Date.now() + 10 * 60 * 1000 };
  return list;
}
// Terminart per Name finden: "Kennenlerngespräch" (oder "Erstgespräch") bzw. "Folgeberatung" (oder "Beratung") im Titel oder in der Adresse
async function eventTypeFor(env, type) {
  const list = await eventTypes(env);
  // Erstgespräch: auch "Kennenlerngespräch" zählt dazu
  const want = type === 'beratung' ? /berat/i : /erst|kennenlern/i;
  const hits = list.filter(function (t) { return want.test(t.title) || want.test(t.slug); });
  hits.sort(function (a, b) { return (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0); });
  if (!hits.length) {
    throw new Error('In Cal.com gibt es keine Terminart mit „' + (type === 'beratung' ? 'Folgeberatung' : 'Kennenlerngespräch') + '“ im Namen. Vorhanden: ' +
      (list.map(function (t) { return t.title; }).join(', ') || 'keine'));
  }
  return hits[0];
}
function bookingResult(b) {
  b = Array.isArray(b) ? b[0] : b;
  if (!b) throw new Error('Cal.com hat keine Buchung zurückgegeben');
  const loc = typeof b.location === 'string' ? b.location : '';
  const url = /^https:\/\//.test(loc) ? loc : (/^https:\/\//.test(b.meetingUrl || '') ? b.meetingUrl : '');
  const dur = b.duration || (b.start && b.end ? Math.round((new Date(b.end) - new Date(b.start)) / 60000) : 0);
  return { uid: b.uid, start: b.start, end: b.end, status: b.status, meetUrl: url, dur: dur };
}

export async function handleCal(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST erwartet' });
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Herkunft nicht erlaubt' });
  try {
    await verifyFirebaseToken((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  } catch (e) {
    return json(401, { error: e.message });
  }
  if (!env.CAL_API_KEY) return json(500, { error: 'CAL_API_KEY fehlt in Cloudflare (Settings → Variables and secrets)' });
  let body;
  try { body = await request.json(); } catch (e) { return json(400, { error: 'Ungültige Anfrage' }); }
  try {
    if (body.action === 'eventtypes') return json(200, { types: await eventTypes(env) });

    if (body.action === 'book') {
      const start = new Date(body.start);
      if (isNaN(start)) return json(400, { error: 'Startzeit fehlt' });
      if (!body.email) return json(400, { error: 'Für Cal.com braucht der Lead eine E-Mail-Adresse.' });
      const et = await eventTypeFor(env, body.type);
      const attendee = { name: String(body.name || 'Interessent').slice(0, 120), email: String(body.email).slice(0, 200), timeZone: 'Europe/Vienna', language: 'de' };
      if (/^\+\d{8,15}$/.test(body.phone || '')) attendee.phoneNumber = body.phone;
      const b = await cal(env, '/bookings', V_BOOKINGS, 'POST', {
        start: start.toISOString(), eventTypeId: et.id, attendee: attendee,
        allowConflicts: true, allowBookingOutOfBounds: true, skipBookingLimits: true
      });
      return json(200, Object.assign(bookingResult(b), { eventType: et.title }));
    }

    if (body.action === 'reschedule') {
      const start = new Date(body.start);
      if (!body.uid || isNaN(start)) return json(400, { error: 'Buchung oder Startzeit fehlt' });
      const b = await cal(env, '/bookings/' + encodeURIComponent(body.uid) + '/reschedule', V_BOOKINGS, 'POST', {
        start: start.toISOString(), allowConflicts: true, allowBookingOutOfBounds: true, skipBookingLimits: true,
        reschedulingReason: 'Neuer Termin vereinbart'
      });
      return json(200, bookingResult(b));
    }

    if (body.action === 'cancel') {
      if (!body.uid) return json(400, { error: 'Buchung fehlt' });
      await cal(env, '/bookings/' + encodeURIComponent(body.uid) + '/cancel', V_BOOKINGS, 'POST', {
        cancellationReason: String(body.reason || 'Termin abgesagt').slice(0, 200)
      });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unbekannte Aktion' });
  } catch (e) {
    return json(502, { error: e.message || String(e) });
  }
}

// ---------- Kalender-Datei (.ics) ----------
const VIDEO_HOSTS = /^(?:[a-z0-9-]+\.)*(zoom\.us|meet\.google\.com|cal\.com|cal\.video|teams\.microsoft\.com|teams\.live\.com)$/i;
function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

export function handleIcs(request) {
  const q = new URL(request.url).searchParams;
  const start = new Date(q.get('s') || '');
  if (isNaN(start)) return new Response('Termin fehlt', { status: 400 });
  const dur = Math.min(Math.max(parseInt(q.get('d'), 10) || 30, 5), 240);
  const end = new Date(start.getTime() + dur * 60000);
  const type = q.get('t') === 'beratung' ? 'beratung' : 'erst';
  let video = '';
  try {
    const v = new URL(q.get('v') || '');
    if (v.protocol === 'https:' && VIDEO_HOSTS.test(v.hostname)) video = v.toString();
  } catch (e) { video = ''; }
  const title = (type === 'beratung' ? 'Folgeberatung' : 'Kennenlerngespräch') + ' mit flexo.kapital';
  const desc = (video ? 'Link zum Videocall: ' + video + '\n\n' : '') + 'Raphael Frühwirth, flexo.kapital\nhttps://www.flexokapital.at';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//flexo.kapital//Termin//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + icsDate(start) + '-' + type + '@flexokapital.at',
    'DTSTAMP:' + icsDate(new Date()),
    'DTSTART:' + icsDate(start),
    'DTEND:' + icsDate(end),
    'SUMMARY:' + icsText(title),
    'DESCRIPTION:' + icsText(desc),
    'LOCATION:' + icsText(video || 'Telefon'),
    video ? 'URL:' + video : null,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title + ' in einer Stunde'), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="flexo-kapital-termin.ics"',
      'Cache-Control': 'no-store'
    }
  });
}
