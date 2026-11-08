// To-do-Erinnerungen: läuft alle 5 Minuten (Cron in wrangler.jsonc).
// Sucht in Firestore "reminders" alle Einträge, deren Zeitpunkt in den letzten
// 5 Minuten liegt, und schickt eine Mitteilung. Die Einträge enthalten nur
// einen Zeitpunkt, keinen Text und keine Namen.
import { notifyAll } from './lead-notify.js';

const FIREBASE_API_KEY = 'AIzaSyAAM0T4LjFNpm8K3pohfJVB5w8LA3zHrWQ';
const QUERY_URL = 'https://firestore.googleapis.com/v1/projects/flexokapital/databases/(default)/documents:runQuery?key=' + FIREBASE_API_KEY;
const WINDOW_MS = 5 * 60 * 1000;

export function buildReminderQuery(end) {
  const start = new Date(end.getTime() - WINDOW_MS);
  return {
    structuredQuery: {
      from: [{ collectionId: 'reminders' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN', value: { timestampValue: start.toISOString() } } },
        { fieldFilter: { field: { fieldPath: 'at' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: end.toISOString() } } }
      ] } }
    }
  };
}

export async function runReminders(scheduledTime, env) {
  if (!env.VAPID_PRIVATE_KEY) return { error: 'VAPID_PRIVATE_KEY fehlt' };
  const end = new Date(scheduledTime);
  const res = await fetch(QUERY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildReminderQuery(end)) });
  if (!res.ok) return { error: 'Firestore ' + res.status };
  const rows = await res.json();
  const n = (Array.isArray(rows) ? rows : []).filter(function (r) { return r.document; }).length;
  if (!n) return { due: 0 };
  return notifyAll(env, {
    title: n === 1 ? 'To-do fällig' : n + ' To-dos fällig',
    body: n === 1 ? 'Ein To-do im Dashboard ist jetzt fällig.' : n + ' To-dos im Dashboard sind jetzt fällig.',
    tag: 'todo-' + end.getTime()
  });
}
