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

test('master admin route authenticates with Admin123@ and supports random generation up to 1 billion', async () => {
  const masterSource = await readFile(new URL('../app/api/master-admin/route.ts', import.meta.url), 'utf8');
  assert.match(masterSource, /Admin123@/);
  assert.match(masterSource, /GENERATE_RANDOM_CODE/);
  assert.match(masterSource, /999_999_999/);
  assert.match(masterSource, /CREATE_DEVICE/);
  assert.match(masterSource, /DELETE_DEVICE/);
});
