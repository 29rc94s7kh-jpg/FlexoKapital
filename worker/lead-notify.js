// Schickt eine Push-Benachrichtigung an alle Geräte, auf denen Raphael
// im Dashboard die Benachrichtigungen aktiviert hat.
// Aufruf: POST /api/lead-notify  { "src": "funnel" | "kontakt" | "test" }
import { sendPush } from './push-lib.js';

const FIRESTORE_DOC = 'https://firestore.googleapis.com/v1/projects/flexokapital/databases/(default)/documents/push/subscriptions';
const FIREBASE_API_KEY = 'AIzaSyAAM0T4LjFNpm8K3pohfJVB5w8LA3zHrWQ';
const VAPID_PUBLIC_KEY = 'BHl_Jyy4DgvIaQpphE_GkVcx2IcQYnY2MhAEhH1K4f5wh7f_LYxOX_B4pK37rNkTU7i5fvJ3LN0H4o-zo3IevPA';
const ALLOWED_ORIGINS = ['https://www.flexokapital.at', 'https://flexokapital.at'];

// Der Text kommt nie aus der Anfrage, sondern nur aus dieser Liste.
const MESSAGES = {
  funnel: { title: 'Neuer Lead', body: 'Jemand hat den Erstgespräch-Fragebogen abgeschickt.' },
  kontakt: { title: 'Neue Nachricht', body: 'Jemand hat das Kontaktformular abgeschickt.' },
  test: { title: 'Test', body: 'Benachrichtigungen funktionieren auf diesem Gerät.' }
};

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function loadSubscriptions() {
  const res = await fetch(FIRESTORE_DOC + '?key=' + FIREBASE_API_KEY);
  if (!res.ok) return [];
  const doc = await res.json();
  const subs = (((doc.fields || {}).subs || {}).mapValue || {}).fields || {};
  return Object.keys(subs).map(function (id) {
    const f = (subs[id].mapValue || {}).fields || {};
    const val = function (k) { return f[k] && f[k].stringValue; };
    return { id, endpoint: val('endpoint'), keys: { p256dh: val('p256dh'), auth: val('auth') } };
  }).filter(function (s) {
    return s.endpoint && /^https:\/\//.test(s.endpoint) && s.keys.p256dh && s.keys.auth;
  });
}

export async function handleLeadNotify(request, env) {
  if (request.method !== 'POST') return json(405, { error: 'POST erwartet' });
  const origin = request.headers.get('Origin');
  if (!ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Herkunft nicht erlaubt' });
  if (!env.VAPID_PRIVATE_KEY) return json(500, { error: 'VAPID_PRIVATE_KEY fehlt in Cloudflare' });

  let src = 'funnel';
  try { const body = await request.json(); if (body && MESSAGES[body.src]) src = body.src; } catch (e) {}
  const msg = MESSAGES[src];

  const subs = await loadSubscriptions();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: '/dashboard#leads', tag: 'lead-' + Date.now() });
  const vapid = { publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: 'mailto:office@flexokapital.at' };

  const results = await Promise.all(subs.map(async function (s) {
    try {
      const r = await sendPush(s, payload, vapid);
      return { id: s.id, status: r.status };
    } catch (e) {
      return { id: s.id, error: String(e && e.message || e) };
    }
  }));
  return json(200, { sent: results.filter(function (r) { return r.status >= 200 && r.status < 300; }).length, results });
}
