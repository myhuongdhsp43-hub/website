import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

async function applyMigrations(db) {
  for (const file of [
    '../drizzle/0000_fantastic_bishop.sql',
    '../drizzle/0001_dizzy_the_captain.sql',
    '../drizzle/0002_password_admin_sessions.sql',
    '../drizzle/0003_school_scoped_device_ids.sql',
    '../drizzle/0004_helmet_safety.sql',
  ]) db.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
}

test('mỗi tài khoản nền tảng có vùng dữ liệu riêng', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await applyMigrations(db);
    const createWorkspace = ({ schoolId, userId, platformUserId, email }) => {
      const now = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO schools (id,name,timezone,created_at,updated_at) VALUES (?,?,?,?,?)')
          .run(schoolId, `Đơn vị ${schoolId}`, 'Asia/Ho_Chi_Minh', now, now);
        db.prepare('INSERT INTO users (id,school_id,platform_user_id,email,full_name,role,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(userId, schoolId, platformUserId, email, email, 'admin', 1, now, now);
        db.prepare('INSERT INTO system_settings (id,school_id,sms_enabled,send_location,sms_cooldown_minutes,sms_template,telemetry_retention_days,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(`settings-${schoolId}`, schoolId, 1, 1, 15, 'test', 90, now, now);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };

    createWorkspace({ schoolId: 'school-a', userId: 'user-a', platformUserId: 'platform-a', email: 'a@gmail.com' });
    createWorkspace({ schoolId: 'school-b', userId: 'user-b', platformUserId: 'platform-b', email: 'b@gmail.com' });

    assert.deepEqual(db.prepare('SELECT school_id FROM users ORDER BY id').all().map(row => row.school_id), ['school-a', 'school-b']);
    assert.deepEqual(db.prepare('SELECT school_id FROM system_settings ORDER BY school_id').all().map(row => row.school_id), ['school-a', 'school-b']);
    assert.throws(
      () => createWorkspace({ schoolId: 'school-c', userId: 'user-c', platformUserId: 'platform-a', email: 'c@gmail.com' }),
      /UNIQUE constraint failed/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schools').get().count, 2, 'tạo trùng không được để lại dữ liệu dở dang');
  } finally {
    db.close();
  }
});

test('giao diện và máy chủ dùng tài khoản, mật khẩu và phiên đăng nhập riêng', async () => {
  const [homePage, loginPage, registerPage, auth, passwordAuth, dashboard] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/password-auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/dashboard-app.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(homePage, /href="\/login/);
  assert.match(homePage, /href="\/register/);
  assert.match(loginPage, /action="\/api\/auth\/login"/);
  assert.match(registerPage, /action="\/api\/auth\/register"/);
  assert.match(auth, /requirePasswordUser/);
  assert.match(passwordAuth, /PBKDF2/);
  assert.match(passwordAuth, /school_admin_session/);
  assert.match(dashboard, /\/api\/auth\/logout/);
  assert.doesNotMatch(loginPage, /chatGPTSignInPath/);
});
