import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

async function applyAllMigrations(db) {
  for (const file of [
    '../drizzle/0000_fantastic_bishop.sql',
    '../drizzle/0001_dizzy_the_captain.sql',
    '../drizzle/0002_password_admin_sessions.sql',
    '../drizzle/0003_school_scoped_device_ids.sql',
    '../drizzle/0004_helmet_safety.sql',
    '../drizzle/0005_device_pairing.sql',
    '../drizzle/0006_account_and_device_tokens.sql',
    '../drizzle/0007_realtime_hardware_sync.sql',
    '../drizzle/0008_account_types_and_student_subaccounts.sql',
    '../drizzle/0009_student_sessions_fk_fix.sql',
  ]) {
    db.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
  }
}

test('migration 0008 adds account_type, api_url and student_accounts table', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await applyAllMigrations(db);

    // Verify schools has account_type column
    const schoolColumns = db.prepare(`PRAGMA table_info(schools)`).all();
    assert.ok(schoolColumns.some((c) => c.name === 'account_type'));

    // Verify devices has api_url column
    const deviceColumns = db.prepare(`PRAGMA table_info(devices)`).all();
    assert.ok(deviceColumns.some((c) => c.name === 'api_url'));

    // Verify student_accounts table exists
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    assert.ok(tables.some((t) => t.name === 'student_accounts'));

    // Test inserting school with account_type 'school' and 'personal'
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'sch_1',
      'THPT Nguyễn Huệ',
      'school',
      'ACC_SCH_1',
      'Asia/Ho_Chi_Minh',
      now,
      now
    );
    db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'sch_2',
      'Phụ Huynh An',
      'personal',
      'ACC_SCH_2',
      'Asia/Ho_Chi_Minh',
      now,
      now
    );

    const sch1 = db.prepare(`SELECT account_type FROM schools WHERE id = 'sch_1'`).get();
    assert.equal(sch1.account_type, 'school');

    const sch2 = db.prepare(`SELECT account_type FROM schools WHERE id = 'sch_2'`).get();
    assert.equal(sch2.account_type, 'personal');
  } finally {
    db.close();
  }
});

test('student_accounts scopes username uniqueness per school_id', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await applyAllMigrations(db);
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'sch_A',
      'Trường A',
      'school',
      'ACC_A',
      'Asia/Ho_Chi_Minh',
      now,
      now
    );
    db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'sch_B',
      'Trường B',
      'school',
      'ACC_B',
      'Asia/Ho_Chi_Minh',
      now,
      now
    );

    // Two different schools can have student with the exact same username "student01"
    db.prepare(`INSERT INTO student_accounts (id, school_id, username, password_hash, password_salt, full_name, class_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'sub_A_1',
      'sch_A',
      'student01',
      'hashA',
      'saltA',
      'Nguyễn Văn A',
      '10A1',
      now,
      now
    );

    db.prepare(`INSERT INTO student_accounts (id, school_id, username, password_hash, password_salt, full_name, class_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'sub_B_1',
      'sch_B',
      'student01',
      'hashB',
      'saltB',
      'Trần Văn B',
      '11B2',
      now,
      now
    );

    const countA = db.prepare(`SELECT COUNT(*) as count FROM student_accounts WHERE school_id = 'sch_A'`).get();
    const countB = db.prepare(`SELECT COUNT(*) as count FROM student_accounts WHERE school_id = 'sch_B'`).get();
    assert.equal(countA.count, 1);
    assert.equal(countB.count, 1);

    // Same school CANNOT insert duplicate username
    assert.throws(() => {
      db.prepare(`INSERT INTO student_accounts (id, school_id, username, password_hash, password_salt, full_name, class_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'sub_A_2',
        'sch_A',
        'student01',
        'hashA2',
        'saltA2',
        'Nguyễn Văn C',
        '10A2',
        now,
        now
      );
    }, /UNIQUE constraint failed/);
  } finally {
    db.close();
  }
});

test('activation page requires authentication barrier and supports dual pairing modes (BLE & WiFi/4G)', async () => {
  const activateSource = await readFile(new URL('../app/activate/page.tsx', import.meta.url), 'utf8');

  // Verify auth barrier
  assert.match(activateSource, /\/api\/auth\/me/);
  assert.match(activateSource, /Yêu cầu đăng nhập trước khi kích hoạt/);
  assert.match(activateSource, /return_to/);

  // Verify pairing modes
  assert.match(activateSource, /Ghép nối Wifi \/ 4G/);
  assert.match(activateSource, /Ghép nối Bluetooth \(BLE\)/);

  // Verify Web Bluetooth API
  assert.match(activateSource, /navigator.*bluetooth/);
  assert.match(activateSource, /4fafc201-1fb5-459e-8fcc-c5c9c331914b/i);
});

test('register route supports account_type selection (school vs personal)', async () => {
  const registerRoute = await readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8');
  const registerPage = await readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8');

  assert.match(registerRoute, /account_type/);
  assert.match(registerRoute, /personal/);
  assert.match(registerPage, /Giáo viên \/ Trường/);
  assert.match(registerPage, /Cá nhân/);
});

test('subaccounts API route handles student account creation and listing', async () => {
  const subaccountsRoute = await readFile(new URL('../app/api/subaccounts/route.ts', import.meta.url), 'utf8');
  assert.match(subaccountsRoute, /student_accounts/);
  assert.match(subaccountsRoute, /hashPassword/);
  assert.match(subaccountsRoute, /student_code/);
  assert.match(subaccountsRoute, /tài khoản học sinh con/i);
});

test('firmware includes BLE GATT service, verify_code characteristic, and Flash telemetryUrl', async () => {
  const firmware = await readFile(new URL('../../01_ESP_XE/TDM2421_FINAL/TDM2421_FINAL.ino', import.meta.url), 'utf8');

  assert.match(firmware, /BLEDevice\.h/);
  assert.match(firmware, /BLEServer\.h/);
  assert.match(firmware, /4fafc201-1fb5-459e-8fcc-c5c9c331914b/i);
  assert.match(firmware, /telemetryUrl/);
  assert.match(firmware, /preferences\.putString\("telemetryUrl"/);
  assert.match(firmware, /initBLEPairing/);
});

test('student deletion cleans up all foreign key references including student_accounts without constraint error', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  await applyAllMigrations(db);

  const now = new Date().toISOString();
  // 1. Create school
  db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'sch_test', 'THPT Test', 'school', 'acc_tok_test', 'Asia/Ho_Chi_Minh', now, now
  );

  // 2. Create student
  db.prepare(`INSERT INTO students (id, school_id, student_code, full_name, class_name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'stu_1', 'sch_test', 'HS-10A1-001', 'Nguyễn Văn Test', '10A1', 1, now, now
  );

  // 3. Create device assigned to student
  db.prepare(`INSERT INTO devices (id, school_id, student_id, device_id, device_name, device_token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'dev_1', 'sch_test', 'stu_1', 'XE-01', 'Xe 01', 'hash123', now, now
  );

  // 4. Create overspeed event for student
  db.prepare(`INSERT INTO overspeed_events (id, student_id, device_id, started_at, speed_limit, max_speed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'ev_1', 'stu_1', 'dev_1', now, 40, 55, now, now
  );

  // 5. Create alert referencing student
  db.prepare(`INSERT INTO alerts (id, school_id, device_id, student_id, event_id, type, severity, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'alt_1', 'sch_test', 'dev_1', 'stu_1', 'ev_1', 'overspeed', 'warning', 'Chạy quá tốc độ', '55 km/h', now
  );

  // 6. Create student sub-account referencing student
  db.prepare(`INSERT INTO student_accounts (id, school_id, student_id, username, password_hash, password_salt, full_name, class_name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sa_1', 'sch_test', 'stu_1', 'hsvantest', 'hash', 'salt', 'Nguyễn Văn Test', '10A1', 1, now, now
  );

  // 7. Create parent contact referencing student
  db.prepare(`INSERT INTO parent_contacts (id, student_id, name, relationship, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'pc_1', 'stu_1', 'Nguyễn Văn Phụ Huynh', 'Bố', '0912345678', now, now
  );

  // Verify that deleting students directly without unlinking fails due to FOREIGN KEY
  assert.throws(
    () => db.prepare(`DELETE FROM students WHERE id = 'stu_1'`).run(),
    /FOREIGN KEY constraint failed/i
  );

  // Execute the exact cascade / unlinking order from app/api/students/route.ts
  db.prepare('UPDATE devices SET student_id = NULL, updated_at = ? WHERE student_id = ? AND school_id = ?').run(now, 'stu_1', 'sch_test');
  db.prepare('UPDATE alerts SET student_id = NULL WHERE student_id = ? AND school_id = ?').run('stu_1', 'sch_test');
  db.prepare('UPDATE overspeed_events SET student_id = NULL WHERE student_id = ?').run('stu_1');
  db.prepare('DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM student_accounts WHERE student_id = ? AND school_id = ?)').run('stu_1', 'sch_test');
  db.prepare('DELETE FROM student_accounts WHERE student_id = ? AND school_id = ?').run('stu_1', 'sch_test');
  db.prepare('DELETE FROM parent_contacts WHERE student_id = ?').run('stu_1');
  db.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').run('stu_1', 'sch_test');

  // Verify student is deleted
  const student = db.prepare(`SELECT * FROM students WHERE id = 'stu_1'`).get();
  assert.equal(student, undefined);

  // Verify device is detached
  const dev = db.prepare(`SELECT student_id FROM devices WHERE id = 'dev_1'`).get();
  assert.equal(dev.student_id, null);

  // Verify alert student_id is set to NULL
  const alt = db.prepare(`SELECT student_id FROM alerts WHERE id = 'alt_1'`).get();
  assert.equal(alt.student_id, null);

  // Verify student account and parent contact are deleted
  const sa = db.prepare(`SELECT * FROM student_accounts WHERE id = 'sa_1'`).get();
  assert.equal(sa, undefined);
  const pc = db.prepare(`SELECT * FROM parent_contacts WHERE id = 'pc_1'`).get();
  assert.equal(pc, undefined);

  // Check students route code has these steps
  const studentsRoute = await readFile(new URL('../app/api/students/route.ts', import.meta.url), 'utf8');
  assert.match(studentsRoute, /DELETE FROM student_accounts WHERE student_id = \?/);
  assert.match(studentsRoute, /UPDATE alerts SET student_id = NULL/);
  assert.match(studentsRoute, /UPDATE overspeed_events SET student_id = NULL/);
});

test('migration 0009 allows student sub-account sessions without foreign key constraint failure', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  await applyAllMigrations(db);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO schools (id, name, account_type, account_token, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'sch_test2', 'THPT Test', 'school', 'ACC_TEST2', 'Asia/Ho_Chi_Minh', now, now
  );

  db.prepare(`INSERT INTO student_accounts (id, school_id, student_id, username, password_hash, password_salt, full_name, class_name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sa_student_123', 'sch_test2', null, 'hocsinhcon', 'hash', 'salt', 'Học Sinh Con', '10A1', 1, now, now
  );

  // Inserting session for student account should NOT fail foreign key check
  assert.doesNotThrow(() => {
    db.prepare(`INSERT INTO app_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      'sess_student_1', 'sa_student_123', 'token_hash_student', '2099-01-01T00:00:00Z', now
    );
  });

  const session = db.prepare(`SELECT * FROM app_sessions WHERE id = 'sess_student_1'`).get();
  assert.equal(session.user_id, 'sa_student_123');

  // Verify login regex pattern safely handles standard symbols without browser /v syntax errors
  const loginPage = await readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8');
  assert.match(loginPage, /pattern="\[A-Za-z0-9_\\.\\-\]\+"/);

  const registerPage = await readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8');
  assert.match(registerPage, /pattern="\[A-Za-z0-9_\\.\\-\]\+"/);
});
