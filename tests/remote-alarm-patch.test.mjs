import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

test('ACK cũ không xóa lệnh mới, ACK đúng xóa đúng một lần', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE device_configs (device_id TEXT, remote_alarm INTEGER, remote_alarm_requested_at TEXT, last_alarm_sounded_at TEXT, updated_at TEXT)');
  db.prepare('INSERT INTO device_configs VALUES (?, 1, ?, NULL, NULL)').run('xe', 'new-id');
  const ack = db.prepare('UPDATE device_configs SET remote_alarm = 0, last_alarm_sounded_at = ?, updated_at = ? WHERE device_id = ? AND remote_alarm = 1 AND remote_alarm_requested_at = ?');
  assert.equal(ack.run('now', 'now', 'xe', 'old-id').changes, 0);
  assert.equal(db.prepare('SELECT remote_alarm FROM device_configs').get().remote_alarm, 1);
  assert.equal(ack.run('now', 'now', 'xe', 'new-id').changes, 1);
  assert.equal(ack.run('now', 'now', 'xe', 'new-id').changes, 0);
  db.close();
});

test('mã nguồn có chờ URC đầy đủ, ID lệnh và bảo vệ UART SMS', async () => {
  const ino = await readFile(new URL('../TDM2421_Full_SMS_VuotToc_Web_v2_7.ino', import.meta.url), 'utf8');
  const telemetry = await readFile(new URL('../app/api/device/telemetry/route.ts', import.meta.url), 'utf8');
  const ack = await readFile(new URL('../app/api/device/acknowledge-remote-alarm/route.ts', import.meta.url), 'utf8');
  assert.match(ino, /waitForUrcLine\("\+QHTTPPOST:"/);
  assert.match(ino, /readHttpBody\(responseBody/);
  assert.match(ino, /alarm-ack-v1/);
  assert.match(ino, /preferences\.putString\("alarmReqId"/);
  const loop = ino.slice(ino.indexOf('void loop() {'));
  assert.ok(loop.indexOf('if (smsWaiting)') < loop.indexOf('checkPairButton();'));
  assert.match(telemetry, /remote_alarm_requested_at = \?/);
  assert.match(telemetry, /body\.network_signal === 99 \? null/);
  assert.match(ack, /remote_alarm_requested_at = \?/);
});
