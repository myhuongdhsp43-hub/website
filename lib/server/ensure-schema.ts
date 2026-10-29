import { env } from 'cloudflare:workers';
import m0 from '../../drizzle/0000_fantastic_bishop.sql?raw';
import m1 from '../../drizzle/0001_dizzy_the_captain.sql?raw';
import m2 from '../../drizzle/0002_password_admin_sessions.sql?raw';
import m3 from '../../drizzle/0003_school_scoped_device_ids.sql?raw';
import m4 from '../../drizzle/0004_helmet_safety.sql?raw';
import m5 from '../../drizzle/0005_device_pairing.sql?raw';
import m6 from '../../drizzle/0006_account_and_device_tokens.sql?raw';
import m7 from '../../drizzle/0007_realtime_hardware_sync.sql?raw';
import m8 from '../../drizzle/0008_account_types_and_student_subaccounts.sql?raw';
import m9 from '../../drizzle/0009_student_sessions_fk_fix.sql?raw';
import m10 from '../../drizzle/0010_chat_groups_and_messages.sql?raw';

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;

  try {
    if (!env?.DB) return;
    await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
    await env.DB.prepare('SELECT 1 FROM app_sessions LIMIT 1').first();
    // Verify columns and tables exist
    await env.DB.prepare('SELECT verify_code, device_token, token_synced_at, api_url FROM devices LIMIT 1').first();
    await env.DB.prepare('SELECT account_token, account_type FROM schools LIMIT 1').first();
    await env.DB.prepare('SELECT 1 FROM student_accounts LIMIT 1').first();
    await env.DB.prepare('SELECT 1 FROM chat_conversations LIMIT 1').first();

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

    // Auto-backfill account_type on schools
    try {
      await env.DB.prepare(`
        UPDATE schools 
        SET account_type = 'school'
        WHERE account_type IS NULL OR account_type = ''
      `).run();
    } catch {}

    // Ensure app_sessions has no foreign key constraint to users (allowing student sub-account sessions)
    try {
      const fkList = await env.DB.prepare('PRAGMA foreign_key_list(app_sessions)').all<{ table: string }>();
      const hasUserFk = fkList.results?.some((r) => r.table === 'users');
      if (hasUserFk) {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS app_sessions_new (
            id text PRIMARY KEY NOT NULL,
            user_id text NOT NULL,
            token_hash text NOT NULL,
            expires_at text NOT NULL,
            created_at text NOT NULL
          )
        `).run();
        await env.DB.prepare(`
          INSERT OR IGNORE INTO app_sessions_new (id, user_id, token_hash, expires_at, created_at)
          SELECT id, user_id, token_hash, expires_at, created_at FROM app_sessions
        `).run();
        await env.DB.prepare('DROP TABLE app_sessions').run();
        await env.DB.prepare('ALTER TABLE app_sessions_new RENAME TO app_sessions').run();
        await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_sessions_token_hash ON app_sessions (token_hash)').run();
        await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_sessions_user_expires ON app_sessions (user_id, expires_at)').run();
      }
    } catch {}

    initialized = true;
    return;
  } catch {
    // Tables or columns not ready yet, continue to apply migration statements
  }

  const migrations = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10];
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

  try {
    await env.DB.prepare(`
      UPDATE schools 
      SET account_type = 'school'
      WHERE account_type IS NULL OR account_type = ''
    `).run();
  } catch {}

  initialized = true;
}
