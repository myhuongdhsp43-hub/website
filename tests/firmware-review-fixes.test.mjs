import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const firmwareName = (await readdir(new URL('../', import.meta.url))).find((f) => f.endsWith('.ino'));
const firmware = await readFile(new URL(`../${firmwareName}`, import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../app/master-admin/page.tsx', import.meta.url), 'utf8');
const realStatus = await readFile(new URL('../app/api/device/real-status/route.ts', import.meta.url), 'utf8');

test('firmware never prints a full device token', () => {
  const lines = firmware.split('\n').filter((l) => l.includes('DEVICE_TOKEN') && l.includes('c_str()'));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.match(line, /maskSecret\(activeDeviceToken\)/);
});

test('firmware reports version 2.7.0 with the alarm-ack marker the server checks', () => {
  assert.match(firmware, /2\.7\.0-local-overspeed-helmet-sms-alarm-ack-v1/);
});

test('firmware returns to SMS polling before touching the modem again', () => {
  const loopStart = firmware.indexOf('void loop()');
  const guard = firmware.indexOf('if (smsWaiting) {', loopStart);
  const pair = firmware.indexOf('checkPairButton();', loopStart);
  assert.ok(guard > loopStart && pair > guard, 'SMS guard must come before pair-button/token sync');
});

test('master admin page has no hardcoded key and checks login on the server', () => {
  assert.doesNotMatch(pageSource, /Admin123@/);
  assert.match(pageSource, /loadMasterData\(adminKey\)/);
});

test('online window is two minutes', () => {
  assert.match(realStatus, /2 \* 60 \* 1000/);
});
