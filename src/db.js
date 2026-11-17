// SQLite storage (node:sqlite, no dependency). One file, WAL mode, foreign keys on.
// Every business row carries tenant_id and every query filters on it: the tenant id
// always comes from the authenticated session, never from the request body.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

let db;

const MIGRATIONS = [
  `CREATE TABLE tenants (
     id TEXT PRIMARY KEY,
     slug TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     country TEXT NOT NULL,
     plan TEXT NOT NULL,
     interval TEXT NOT NULL DEFAULT 'month',
     status TEXT NOT NULL DEFAULT 'pending',      -- pending | trialing | active | past_due | canceled | suspended
     seats INTEGER NOT NULL,
     company_code_hash TEXT,
     stripe_customer TEXT,
     stripe_subscription TEXT,
     trial_end TEXT,
     current_period_end TEXT,
     past_due_since TEXT,
     created_at TEXT NOT NULL
   );`,
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     email TEXT NOT NULL,
     name TEXT NOT NULL,
     role TEXT NOT NULL,                           -- admin | member | reader
     password_hash TEXT,
     status TEXT NOT NULL DEFAULT 'active',        -- invited | active | disabled
     failed_attempts INTEGER NOT NULL DEFAULT 0,
     locked_until TEXT,
     last_login TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (tenant_id, email)
   );`,
  `CREATE TABLE sessions (
     id_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     csrf TEXT NOT NULL,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     ip TEXT, ua TEXT
   );`,
  `CREATE TABLE tokens (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     purpose TEXT NOT NULL,                        -- invite | reset
     expires_at TEXT NOT NULL,
     used_at TEXT
   );`,
  `CREATE TABLE docs (
     tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,                           -- meta | record
     id TEXT NOT NULL,
     type TEXT,
     number TEXT,
     body TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     updated_by TEXT,
     PRIMARY KEY (tenant_id, kind, id)
   );`,
  `CREATE INDEX docs_updated ON docs(tenant_id, updated_at);`,
  `CREATE INDEX docs_number ON docs(tenant_id, type, number);`,
  `CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     tenant_id TEXT, user_id TEXT, actor TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT, at TEXT NOT NULL
   );`,
  `CREATE TABLE support (
     tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     tickets TEXT NOT NULL DEFAULT '[]',
     replies TEXT NOT NULL DEFAULT '{}',
     updated_at TEXT NOT NULL,
     PRIMARY KEY (tenant_id, user_id)
   );`,
  `CREATE TABLE platform_admins (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
     failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL
   );`,
  `CREATE TABLE platform_sessions (
     id_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
     csrf TEXT NOT NULL, expires_at TEXT NOT NULL
   );`,
  `CREATE TABLE stripe_events (id TEXT PRIMARY KEY, type TEXT, received_at TEXT NOT NULL);`,
  `CREATE TABLE ai_usage (tenant_id TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, day));`,
  `CREATE TABLE contact_requests (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, slug TEXT, category TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'open', replies TEXT NOT NULL DEFAULT '[]', ip TEXT, created_at TEXT NOT NULL
   );`,
];

export function openDb(file = join(config.dataDir, 'jumtoo.sqlite')) {
  if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = db.prepare('SELECT v FROM schema_version').get();
  let v = row ? row.v : 0;
  if (!row) db.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  while (v < MIGRATIONS.length) {
    tx(() => { db.exec(MIGRATIONS[v]); db.prepare('UPDATE schema_version SET v = ?').run(v + 1); });
    v += 1;
  }
  return db;
}

export const getDb = () => db;
export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

let depth = 0;
/** Runs fn in a transaction (nested calls join the outer one). */
export function tx(fn) {
  if (depth > 0) return fn();
  depth += 1;
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth -= 1; }
}

export const nowIso = () => new Date().toISOString();

export function auditLog({ tenantId = null, userId = null, actor = 'user', action, detail = '', ip = '' }) {
  run('INSERT INTO audit (tenant_id, user_id, actor, action, detail, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    tenantId, userId, actor, action, String(detail).slice(0, 500), ip, nowIso());
}
