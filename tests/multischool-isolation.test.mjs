import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('device ID migration preserves existing rows and scopes uniqueness by school', async () => {
  const migration = await readFile(new URL('../drizzle/0003_school_scoped_device_ids.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_token_hash TEXT NOT NULL
      );
      CREATE UNIQUE INDEX uq_devices_device_id ON devices (device_id);
      INSERT INTO devices VALUES ('existing-device', 'existing-school', 'XE001', 'existing-token-hash');
    `);

    const before = db.prepare('SELECT * FROM devices').all();
    db.exec(migration.replaceAll('--> statement-breakpoint', ''));

    assert.deepEqual(db.prepare('SELECT * FROM devices').all(), before);
    db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?)').run('other-device', 'other-school', 'XE001', 'other-token-hash');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM devices WHERE device_id = ?').get('XE001').count, 2);
    assert.throws(
      () => db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?)').run('duplicate-device', 'existing-school', 'XE001', 'third-token-hash'),
      /UNIQUE constraint failed/,
    );

    const byDeviceAndToken = db.prepare('SELECT school_id FROM devices WHERE device_id = ? AND device_token_hash = ?');
    assert.equal(byDeviceAndToken.get('XE001', 'existing-token-hash').school_id, 'existing-school');
    assert.equal(byDeviceAndToken.get('XE001', 'other-token-hash').school_id, 'other-school');
    assert.equal(byDeviceAndToken.get('XE001', 'wrong-token-hash'), undefined);
  } finally {
    db.close();
  }
});

test('telemetry and remote-alarm acknowledgement authenticate with device ID plus token hash', async () => {
  const [telemetry, acknowledgement] = await Promise.all([
    readFile(new URL('../app/api/device/telemetry/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/device/acknowledge-remote-alarm/route.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(telemetry, /WHERE d\.device_id = \? AND d\.device_token_hash = \?/);
  assert.match(acknowledgement, /WHERE device_id = \? AND device_token_hash = \?/);
});
