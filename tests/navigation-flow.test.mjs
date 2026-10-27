import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('luồng mới: trang chủ mở đăng ký, người cũ đăng nhập, quản trị đòi phiên hợp lệ', async () => {
  const [home, login, register, admin] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /href="\/register"/);
  assert.match(home, /Tạo tài khoản quản trị/);
  assert.match(login, /\/api\/auth\/login/);
  assert.match(login, /form action="\/register"/);
  assert.match(login, /Chưa có tài khoản\? Đăng ký/);
  assert.match(register, /\/api\/auth\/register/);
  assert.match(admin, /\/login\?return_to=%2Fadmin/);
});
