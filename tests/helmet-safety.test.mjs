import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cảnh báo mũ được tách theo tài khoản và có thời gian xác nhận chống báo giả', async () => {
  const [schema, migration, telemetry, settings] = await Promise.all([
    readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
    readFile(new URL('../drizzle/0004_helmet_safety.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/device/telemetry/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/settings/route.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(schema, /helmetDetectionEnabled/);
  assert.match(migration, /helmet_detection_enabled/);
  assert.match(telemetry, /helmet_missing_since/);
  assert.match(telemetry, /helmet_grace_seconds/);
  assert.match(telemetry, /helmet_sms_jobs/);
  assert.match(settings, /helmet_min_speed_kmh/);
});
