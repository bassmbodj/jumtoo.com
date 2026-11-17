// Command line: create a platform administrator, back up the database.
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';
import { openDb, run, one, nowIso, getDb } from './db.js';
import { hashSecret, newId, normalizeEmail, validEmail, passwordProblem } from './security.js';

const [cmd, ...args] = process.argv.slice(2);
openDb();

if (cmd === 'create-platform-admin') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = normalizeEmail(args[0] || await rl.question('E-mail : '));
  const name = args[1] || await rl.question('Nom : ');
  const pw = process.env.PLATFORM_ADMIN_PASSWORD || await rl.question('Mot de passe (12 caractères min.) : ');
  rl.close();
  if (!validEmail(email)) { console.error('E-mail invalide'); process.exit(1); }
  if (pw.length < 12 || passwordProblem(pw)) { console.error(passwordProblem(pw) || '12 caractères minimum'); process.exit(1); }
  if (one('SELECT 1 FROM platform_admins WHERE email = ?', email)) run('UPDATE platform_admins SET password_hash = ?, name = ? WHERE email = ?', hashSecret(pw), name, email);
  else run('INSERT INTO platform_admins (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', newId(), email, name, hashSecret(pw), nowIso());
  console.log(`Administrateur plateforme prêt : ${email} → ${config.baseUrl}/plateforme`);
} else if (cmd === 'backup') {
  const dir = join(config.dataDir, 'backups'); mkdirSync(dir, { recursive: true });
  const file = join(dir, `jumtoo-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  console.log('Sauvegarde : ' + file);
} else {
  console.log('Usage : node src/cli.js create-platform-admin [email] [nom] | backup');
}
