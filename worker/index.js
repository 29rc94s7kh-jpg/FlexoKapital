// Cloudflare Worker: liefert die Website als statische Dateien aus und
// beantwortet nur /api/* selbst (Push-Benachrichtigung bei neuem Lead).
import { handleLeadNotify } from './lead-notify.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead-notify') return handleLeadNotify(request, env);
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
