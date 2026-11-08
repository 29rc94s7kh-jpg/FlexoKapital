// Cloudflare Worker: liefert die Website als statische Dateien aus und
// beantwortet nur /api/* selbst (Push-Benachrichtigung bei neuem Lead)
// und verschickt per Cron To-do-Erinnerungen.
import { handleLeadNotify } from './lead-notify.js';
import { runReminders } from './reminders.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead-notify') return handleLeadNotify(request, env);
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
  // alle 5 Minuten: fällige To-do-Erinnerungen verschicken
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(event.scheduledTime, env));
  }
};
