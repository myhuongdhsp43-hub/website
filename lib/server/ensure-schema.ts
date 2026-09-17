import { env } from 'cloudflare:workers';
import m0 from '../../drizzle/0000_fantastic_bishop.sql?raw';
import m1 from '../../drizzle/0001_dizzy_the_captain.sql?raw';
import m2 from '../../drizzle/0002_password_admin_sessions.sql?raw';
import m3 from '../../drizzle/0003_school_scoped_device_ids.sql?raw';
import m4 from '../../drizzle/0004_helmet_safety.sql?raw';
import m5 from '../../drizzle/0005_device_pairing.sql?raw';
import m6 from '../../drizzle/0006_account_and_device_tokens.sql?raw';

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;

  try {
    if (!env?.DB) return;
    await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
    await env.DB.prepare('SELECT 1 FROM app_sessions LIMIT 1').first();
    // Verify columns exist
    await env.DB.prepare('SELECT verify_code, device_token FROM devices LIMIT 1').first();
    await env.DB.prepare('SELECT account_token FROM schools LIMIT 1').first();

    // Auto-backfill verify_code
    try {
      await env.DB.prepare(`
        UPDATE devices 
        SET verify_code = CAST(ABS(RANDOM()) % 900000000 + 100000000 AS TEXT)
        WHERE verify_code IS NULL OR verify_code = ''
      `).run();
    } catch {}

    // Auto-backfill device_token
    try {
      await env.DB.prepare(`
        UPDATE devices 
        SET device_token = 'dt_' || lower(hex(randomblob(16)))
        WHERE device_token IS NULL OR device_token = ''
      `).run();
    } catch {}

    // Auto-backfill account_token on schools
    try {
      await env.DB.prepare(`
        UPDATE schools 
        SET account_token = 'acc_' || lower(hex(randomblob(12)))
        WHERE account_token IS NULL OR account_token = ''
      `).run();
    } catch {}

    initialized = true;
    return;
  } catch {
    // Tables or columns not ready yet, continue to apply migration statements
  }

  const migrations = [m0, m1, m2, m3, m4, m5, m6];
  for (const sqlFile of migrations) {
    const rawStatements = sqlFile.split('--> statement-breakpoint');
    for (const chunk of rawStatements) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      // Also handle multi-statement blocks separated by semicolon
      const subStatements = trimmed
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of subStatements) {
        try {
          await env.DB.prepare(stmt).run();
        } catch (err: unknown) {
          const msg = String((err as Error)?.message || err);
          if (
            !msg.includes('already exists') &&
            !msg.includes('duplicate column') &&
            !msg.includes('no such index')
          ) {
            console.warn('[Auto-migration statement]', msg, stmt.slice(0, 80));
          }
        }
      }
    }
  }

  // After migrations, run backfills
  try {
    await env.DB.prepare(`
      UPDATE devices 
      SET verify_code = CAST(ABS(RANDOM()) % 900000000 + 100000000 AS TEXT)
      WHERE verify_code IS NULL OR verify_code = ''
    `).run();
  } catch {}

  try {
    await env.DB.prepare(`
      UPDATE devices 
      SET device_token = 'dt_' || lower(hex(randomblob(16)))
      WHERE device_token IS NULL OR device_token = ''
    `).run();
  } catch {}

  try {
    await env.DB.prepare(`
      UPDATE schools 
      SET account_token = 'acc_' || lower(hex(randomblob(12)))
      WHERE account_token IS NULL OR account_token = ''
    `).run();
  } catch {}

  initialized = true;
}
