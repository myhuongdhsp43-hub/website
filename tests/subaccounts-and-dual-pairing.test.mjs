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
