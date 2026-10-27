import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import * as helmet from '../lib/domain/helmet.mjs';
import * as overspeed from '../lib/domain/overspeed.mjs';

test('mũ: xác nhận liên tục, không báo khi dừng/đội/tắt/GPS lỗi; mất mạng phải tính lại', () => {
  const nowMs = Date.now();
  const s = { enabled: true, worn: false, gpsValid: true, speed: 12, minSpeed: 5, graceSeconds: 45, missingSince: new Date(nowMs - 45_000).toISOString(), lastSeenAt: new Date(nowMs - 5000).toISOString(), nowMs, active: false };
  assert.equal(helmet.helmetDecision(s), 'alert');
  assert.equal(helmet.helmetDecision({ ...s, nowMs: nowMs - 1 }), 'wait');
  for (const change of [{ enabled: false }, { worn: true }, { speed: 0 }]) assert.equal(helmet.helmetDecision({ ...s, ...change }), 'clear');
  assert.equal(helmet.helmetDecision({ ...s, active: true }), 'active');
  assert.equal(helmet.helmetDecision({ ...s, gpsValid: false }), 'unknown');
  assert.equal(helmet.helmetDecision({ ...s, lastSeenAt: new Date(nowMs - 90_000).toISOString() }), 'begin');
});
test('SMS: chuẩn hóa số VN, chặn lệnh AT chèn vào, gói tin GSM dưới 160 ký tự', () => {
  assert.equal(helmet.normalizeSmsPhone('090 123 4567'), '+84901234567');
  assert.equal(helmet.normalizeSmsPhone('abc"\rAT+CFUN=0'), null);
  const text = helmet.helmetSmsMessage('XE01', 12, 15.12345, 108.54321, true);
  assert.ok(text.length <= 160);
  assert.match(text, /^[\x20-\x7e]+$/);
});

async function load(path, imports) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (!(name in imports)) throw Error('Unexpected import ' + name); return imports[name]; }, exports);
  return exports;
}
async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const f of ['0000_fantastic_bishop', '0001_dizzy_the_captain', '0002_password_admin_sessions', '0003_school_scoped_device_ids', '0004_helmet_safety']) db.exec(await readFile(new URL('../drizzle/' + f + '.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const stmt = db.prepare(sql); let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return stmt.get(...values) ?? null; },
        async all() { return { results: stmt.all(...values) }; },
        async run() { return { meta: { changes: Number(stmt.run(...values).changes) } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  const http = await load('lib/server/http.ts', { 'next/server': { NextResponse: { json: Response.json.bind(Response) } } });
  const sms = await load('lib/server/helmet-sms.ts', { 'cloudflare:workers': { env: { DB } } });
  const imports = { 'cloudflare:workers': { env: { DB } }, '@/lib/server/http': http, '@/lib/server/auth': { requireSchoolUser: async () => ({ schoolId: 'a', userId: 'admin', role: 'admin' }), requireAdmin() {}, audit: async () => {} }, '@/lib/server/helmet-sms': sms, '@/lib/domain/helmet.mjs': helmet, '@/lib/domain/overspeed.mjs': overspeed, '@/lib/server/sms': { sendSms() { throw Error('Helmet SMS must use SIM'); }, renderSmsTemplate() {} } };
  const telemetry = await load('app/api/device/telemetry/route.ts', imports);
  const settings = await load('app/api/settings/route.ts', imports);
  const jobs = await load('app/api/helmet-sms/route.ts', imports);
  const timestamp = new Date().toISOString(), token = 'test-device-token-with-32-characters';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
  const tokenB = 'another-device-token-with-32-characters';
  const hashB = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokenB))).toString('hex');
  for (const school of ['a', 'b']) {
    db.prepare('INSERT INTO schools(id,name,created_at,updated_at) VALUES (?,?,?,?)').run(school, school, timestamp, timestamp);
    db.prepare('INSERT INTO students(id,school_id,student_code,full_name,class_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('s' + school, school, 'HS01', 'Test', '8A', timestamp, timestamp);
    db.prepare('INSERT INTO system_settings(id,school_id,sms_template,helmet_detection_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('set' + school, school, 'test', school === 'a' ? 1 : 0, timestamp, timestamp);
    db.prepare('INSERT INTO devices(id,school_id,student_id,device_id,device_name,device_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('d' + school, school, 's' + school, 'XE01', 'Test', school === 'a' ? hash : hashB, timestamp, timestamp);
    db.prepare('INSERT INTO device_configs(id,device_id,created_at,updated_at) VALUES (?,?,?,?)').run('cfg' + school, 'd' + school, timestamp, timestamp);
    db.prepare('INSERT INTO parent_contacts(id,student_id,name,relationship,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('p' + school, 's' + school, 'Parent', 'parent', school === 'a' ? '0901234567' : '0912345678', timestamp, timestamp);
  }
  const send = (extra = {}, authToken = token) => telemetry.POST(new Request('https://test/api/device/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken }, body: JSON.stringify({ device_id: 'XE01', sample_id: crypto.randomUUID(), speed: 12, gps_valid: true, latitude: 15.12, longitude: 108.54, overspeed_active: false, helmet_worn: false, firmware_version: '2.4.0-helmet-espnow', ...extra }) }));
  return { db, send, settings, jobs, tokenB };
}
test('telemetry + SQLite: cảnh báo, SMS đúng tài khoản, chống lặp, ghi kết quả và kết thúc', async () => {
  const { db, send, tokenB } = await fixture();
  try {
    assert.equal((await send({}, 'invalid-device-token-long-enough')).status, 401);
    assert.equal((await send()).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n, 0);
    db.prepare('UPDATE devices SET helmet_missing_since=? WHERE id=?').run(new Date(Date.now() - 46_000).toISOString(), 'da');
    const response = await send();
    assert.equal(response.status, 200);
    const config = (await response.json()).config;
    assert.equal(config.sms_phone, '+84901234567');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n, 1);
    assert.equal((await send({ sms_job_id: config.sms_job_id, sms_status: 'accepted' }, tokenB)).status, 200);
    assert.equal(db.prepare('SELECT status FROM helmet_sms_jobs').get().status, 'dispatched', 'valid account B cannot acknowledge account A job');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM helmet_sms_jobs WHERE school_id='b'").get().n, 0);
    assert.equal((await send()).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM helmet_sms_jobs').get().n, 1);
    await send({ sms_job_id: config.sms_job_id, sms_status: 'accepted' });
    assert.equal(db.prepare('SELECT status FROM helmet_sms_jobs').get().status, 'accepted');
    assert.equal((await send({ helmet_worn: true })).status, 200);
    assert.equal(db.prepare('SELECT status FROM alerts').get().status, 'resolved');
    assert.equal(db.prepare("SELECT helmet_alert_active FROM devices WHERE id='da'").get().helmet_alert_active, 0);
    assert.ok(db.prepare("SELECT helmet_alert_sent_at FROM devices WHERE id='da'").get().helmet_alert_sent_at);
  } finally { db.close(); }
});
test('cài đặt: lưu mũ không ghi đè SMS, lưu SMS không ghi đè mũ, vùng dữ liệu riêng', async () => {
  const { db, settings } = await fixture();
  const patch = body => settings.PATCH(new Request('https://test/api/settings', { method: 'PATCH', body: JSON.stringify(body) }));
  try {
    assert.equal((await patch({ helmet_detection_enabled: true, helmet_grace_seconds: 60, helmet_min_speed_kmh: 6 })).status, 200);
    let row = db.prepare("SELECT * FROM system_settings WHERE school_id='a'").get();
    assert.equal(row.sms_enabled, 1);
    assert.equal(row.helmet_grace_seconds, 60);
    assert.equal((await patch({ sms_enabled: false })).status, 200);
    row = db.prepare("SELECT * FROM system_settings WHERE school_id='a'").get();
    assert.equal(row.helmet_detection_enabled, 1);
    assert.equal(row.helmet_min_speed_kmh, 6);
    assert.equal((await patch({ helmet_detection_enabled: false })).status, 200);
    assert.equal(db.prepare("SELECT helmet_detection_enabled FROM system_settings WHERE school_id='b'").get().helmet_detection_enabled, 0);
  } finally { db.close(); }
});
test('SMS: chặn xe khác, yêu cầu firmware mới, giới hạn gửi thử và loại lệnh quá hạn', async () => {
  const { db, send, jobs } = await fixture();
  try {
    const req = device_id => new Request('https://test/api/helmet-sms', { method: 'POST', body: JSON.stringify({ device_id, phone: '0901234567' }) });
    assert.equal((await jobs.POST(req('db'))).status, 404);
    assert.equal((await jobs.POST(req('da'))).status, 400);
    await send();
    assert.equal((await jobs.POST(req('da'))).status, 200);
    assert.equal((await jobs.POST(req('da'))).status, 429);
    db.prepare('UPDATE helmet_sms_jobs SET created_at=?').run(new Date(Date.now() - 11 * 60_000).toISOString());
    const response = await send();
    assert.equal((await response.json()).config.sms_job_id, undefined);
    assert.equal(db.prepare('SELECT status FROM helmet_sms_jobs').get().status, 'expired');
  } finally { db.close(); }
});
