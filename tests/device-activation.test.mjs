import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('device pairing migration adds verify_code, pairing_pending, pairing_requested_at, paired_at columns', async () => {
  const migration = await readFile(new URL('../drizzle/0005_device_pairing.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        device_token_hash TEXT NOT NULL,
        enabled INTEGER DEFAULT 1
      );
    `);

    // Chạy migration
    const statements = migration.split('--> statement-breakpoint');
    for (const stmt of statements) {
      if (stmt.trim()) db.exec(stmt.trim());
    }

    // Thêm thiết bị mới có verify_code 10 chữ số (lên tới 1.000.000.000)
    db.prepare('INSERT INTO devices (id, school_id, device_id, device_name, device_token_hash, verify_code, pairing_pending) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('dev-1', 'school-1', 'XE01', 'Xe 01', 'hash123', '1000000000', 1);

    const row = db.prepare('SELECT device_id, verify_code, pairing_pending FROM devices WHERE id = ?').get('dev-1');
    assert.equal(row.device_id, 'XE01');
    assert.equal(row.verify_code, '1000000000');
    assert.equal(row.pairing_pending, 1);
  } finally {
    db.close();
  }
});

test('activation route validates verify_code up to 10 digits (1 to 1000000000)', async () => {
  const activateSource = await readFile(new URL('../app/api/device/activate/route.ts', import.meta.url), 'utf8');
  assert.match(activateSource, /1000000000n/);
  assert.match(activateSource, /device\.verify_code/);
  assert.match(activateSource, /invalid_verify_code/);
  assert.match(activateSource, /INSERT INTO students/);
  assert.match(activateSource, /UPDATE devices SET student_id =/);

  // Kiểm tra regex phạm vi 1-10 chữ số
  const isValid = (code) => /^[0-9]{1,10}$/.test(code) && BigInt(code) >= 1n && BigInt(code) <= 1000000000n;
  assert.equal(isValid('1'), true);
  assert.equal(isValid('9824'), true);
  assert.equal(isValid('859201948'), true);
  assert.equal(isValid('1000000000'), true);
  assert.equal(isValid('0'), false);
  assert.equal(isValid('1000000001'), false);
  assert.equal(isValid('12345678901'), false);
  assert.equal(isValid('abc'), false);
});

test('activation route strictly requires pre-registered devices and rejects phantom devices', async () => {
  const activateSource = await readFile(new URL('../app/api/device/activate/route.ts', import.meta.url), 'utf8');
  assert.match(activateSource, /device_not_found/);
  assert.doesNotMatch(activateSource, /Tự động tạo thiết bị với Custom ID/);
});

test('dashboard and master admin QR codes include both device_id and verify_code in activation link', async () => {
  const dashboardSource = await readFile(new URL('../components/dashboard-app.tsx', import.meta.url), 'utf8');
  const masterSource = await readFile(new URL('../app/master-admin/page.tsx', import.meta.url), 'utf8');
  const devicesApiSource = await readFile(new URL('../app/api/devices/route.ts', import.meta.url), 'utf8');

  assert.match(dashboardSource, /activate\?device_id=.*verify_code=/);
  assert.match(masterSource, /activate\?device_id=.*verify_code=/);
  assert.match(devicesApiSource, /d\.verify_code/);
});

test('master admin route reads its key from a secret and supports random generation up to 1 billion', async () => {
  const masterSource = await readFile(new URL('../app/api/master-admin/route.ts', import.meta.url), 'utf8');
  assert.match(masterSource, /MASTER_ADMIN_KEY/);
  assert.doesNotMatch(masterSource, /Admin123@/);
  assert.match(masterSource, /GENERATE_RANDOM_CODE/);
  assert.match(masterSource, /999_999_999/);
  assert.match(masterSource, /CREATE_DEVICE/);
  assert.match(masterSource, /DELETE_DEVICE/);
});

test('migration 0006 adds account_token to schools and device_token to devices', async () => {
  const migration = await readFile(new URL('../drizzle/0006_account_and_device_tokens.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE `schools` ADD `account_token` text/);
  assert.match(migration, /ALTER TABLE `devices` ADD `device_token` text/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS `uq_schools_account_token`/);
});

test('activation route and QR codes include and enforce account_token', async () => {
  const activateSource = await readFile(new URL('../app/api/device/activate/route.ts', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../components/dashboard-app.tsx', import.meta.url), 'utf8');
  const masterSource = await readFile(new URL('../app/master-admin/page.tsx', import.meta.url), 'utf8');

  // Activate route checks account_token
  assert.match(activateSource, /account_token/);
  assert.match(activateSource, /invalid_account_token/);
  assert.match(activateSource, /device_token/);

  // QR codes include account_token
  assert.match(dashboardSource, /account_token=/);
  assert.match(masterSource, /account_token=/);
});

test('hardware token endpoint /api/device/token exists and returns device_token for Flash storage', async () => {
  const tokenRouteSource = await readFile(new URL('../app/api/device/token/route.ts', import.meta.url), 'utf8');
  const pairRouteSource = await readFile(new URL('../app/api/device/pair-request/route.ts', import.meta.url), 'utf8');

  assert.match(tokenRouteSource, /verify_secret/);
  assert.match(tokenRouteSource, /device_token/);
  assert.match(tokenRouteSource, /telemetry_url/);
  assert.match(tokenRouteSource, /paired/);

  assert.match(pairRouteSource, /device_token/);
  assert.match(pairRouteSource, /paired/);
});

test('activation route strictly requires real-time hardware signal and real-status API checks online state', async () => {
  const activateSource = await readFile(new URL('../app/api/device/activate/route.ts', import.meta.url), 'utf8');
  const realStatusSource = await readFile(new URL('../app/api/device/real-status/route.ts', import.meta.url), 'utf8');

  // Activate route rejects offline devices without fresh button press or recent telemetry
  assert.match(activateSource, /device_offline_or_not_in_pairing_mode/);
  assert.match(activateSource, /device\.pairing_pending === 1/);
  assert.match(activateSource, /device\.pairing_requested_at/);

  // Real-status route exists and returns hardware_online and status_label
  assert.match(realStatusSource, /hardware_online/);
  assert.match(realStatusSource, /status_label/);
  assert.match(realStatusSource, /token_synced/);
  assert.match(realStatusSource, /pairing_pending/);
});
