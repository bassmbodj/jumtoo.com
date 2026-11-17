// Server-side proxy to the Anthropic Messages API: the key never reaches the browser.
import { config } from './config.js';

let fetchImpl = (...a) => fetch(...a);
export function setAiFetch(fn) { fetchImpl = fn; }

const ROLES = new Set(['user', 'assistant']);
function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw Object.assign(new Error('Messages invalides.'), { status: 400, code: 'invalid' });
  return messages.map((m) => {
    if (!ROLES.has(m.role)) throw Object.assign(new Error('Rôle invalide.'), { status: 400, code: 'invalid' });
    return { role: m.role, content: m.content };
  });
}

/** body: { tier: 'quick'|'default', system?, messages, tools?, max_tokens? } → Anthropic response (content, stop_reason). */
export async function aiProxy(body) {
  const payload = {
    model: body.tier === 'quick' ? config.ai.quickModel : config.ai.model,
    max_tokens: Math.min(Number(body.max_tokens) || 1500, 4000),
    messages: cleanMessages(body.messages),
  };
  if (typeof body.system === 'string') payload.system = body.system.slice(0, 200000);
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = body.tools.slice(0, 20).map((t) => ({ name: String(t.name), description: String(t.description || ''), input_schema: t.input_schema || { type: 'object', properties: {} } }));
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.ai.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 429 ? 'Trop de demandes pour le moment.' : 'Le service IA n’a pas répondu.');
    e.status = r.status === 429 ? 429 : 502; e.code = r.status === 429 ? 'rate_limited' : 'ai_error';
    throw e;
  }
  return { content: data.content || [], stop_reason: data.stop_reason };
}
