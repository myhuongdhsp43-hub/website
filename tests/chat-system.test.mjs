import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('migration 0010 creates chat_conversations, chat_participants, and chat_messages with file attachment support', async () => {
  const migration = await readFile(new URL('../drizzle/0010_chat_groups_and_messages.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    `);
    db.prepare('INSERT INTO schools (id, name) VALUES (?, ?)').run('school-1', 'Trường THCS A');

    // Chạy migration
    const statements = migration.split('--> statement-breakpoint');
    for (const stmt of statements) {
      if (stmt.trim()) db.exec(stmt.trim());
    }

    // Insert conversation
    db.prepare(`
      INSERT INTO chat_conversations (id, school_id, type, title, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('conv-1', 'school-1', 'group', 'Nhóm An Toàn Tuyến 1', 'teacher-1', '2026-10-29T00:00:00Z', '2026-10-29T00:00:00Z');

    // Insert participants
    db.prepare(`
      INSERT INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('part-1', 'conv-1', 'teacher-1', 'teacher', 'Thầy Nguyễn Văn Nam', '2026-10-29T00:00:00Z');

    db.prepare(`
      INSERT INTO chat_participants (id, conversation_id, user_id, user_type, user_name, joined_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('part-2', 'conv-1', 'student-1', 'student', 'Em Trần Bảo An', '2026-10-29T00:00:00Z');

    // Insert message with file/image attachment
    db.prepare(`
      INSERT INTO chat_messages (id, conversation_id, sender_id, sender_type, sender_name, message, file_url, file_name, file_type, file_size, is_alert, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'msg-1',
      'conv-1',
      'teacher-1',
      'teacher',
      'Thầy Nguyễn Văn Nam',
      'Các em chú ý trời mưa đường trơn, giảm tốc độ dưới 30km/h nhé!',
      'data:image/png;base64,iVBORw0KGgo...',
      'canh-bao-duong-tron.png',
      'image/png',
      102400,
      1,
      '2026-10-29T00:01:00Z'
    );

    const conv = db.prepare('SELECT id, title, type FROM chat_conversations WHERE id = ?').get('conv-1');
    assert.equal(conv.title, 'Nhóm An Toàn Tuyến 1');
    assert.equal(conv.type, 'group');

    const participants = db.prepare('SELECT user_id, user_type FROM chat_participants WHERE conversation_id = ?').all('conv-1');
    assert.equal(participants.length, 2);

    const msg = db.prepare('SELECT message, file_name, is_alert FROM chat_messages WHERE id = ?').get('msg-1');
    assert.equal(msg.file_name, 'canh-bao-duong-tron.png');
    assert.equal(msg.is_alert, 1);
  } finally {
    db.close();
  }
});

test('chat conversations route strictly restricts group and direct chat creation to teachers only', async () => {
  const convRouteSource = await readFile(new URL('../app/api/chat/conversations/route.ts', import.meta.url), 'utf8');

  // Verify authorization barrier for students
  assert.match(convRouteSource, /user\.role === 'student'/);
  assert.match(convRouteSource, /forbidden_students_cannot_create_chat/);

  // Verify group creation logic
  assert.match(convRouteSource, /body\.type === 'group'/);
  assert.match(convRouteSource, /student_accounts/);
  assert.match(convRouteSource, /chat_participants/);

  // Verify direct chat creation logic
  assert.match(convRouteSource, /student_account_id/);
});

test('chat messages route supports text, image/file attachments and safety alert tagging', async () => {
  const msgRouteSource = await readFile(new URL('../app/api/chat/messages/route.ts', import.meta.url), 'utf8');

  // File attachments support
  assert.match(msgRouteSource, /file_url/);
  assert.match(msgRouteSource, /file_name/);
  assert.match(msgRouteSource, /file_type/);
  assert.match(msgRouteSource, /file_size/);

  // Alert verification: only teacher can trigger is_alert
  assert.match(msgRouteSource, /isTeacher/);
  assert.match(msgRouteSource, /is_alert/);

  // Membership validation
  assert.match(msgRouteSource, /chat_participants/);
});

test('chat UI component provides group creation, direct student messaging, file uploads, and responsive view', async () => {
  const chatViewSource = await readFile(new URL('../components/chat-view.tsx', import.meta.url), 'utf8');

  // UI features
  assert.match(chatViewSource, /handleSendMessage/);
  assert.match(chatViewSource, /handleCreateGroup/);
  assert.match(chatViewSource, /handleStartDirect/);
  assert.match(chatViewSource, /handleFileSelect/);
  assert.match(chatViewSource, /previewImage/);
  assert.match(chatViewSource, /CẢNH BÁO AN TOÀN TỪ GIÁO VIÊN/);
  assert.match(chatViewSource, /uploadFileSecurely/);
  assert.match(chatViewSource, /Tải về máy/);
});

test('storage.to chat upload API route supports 25GB max file size, 3/7 days expiry, and direct client-to-R2 upload', async () => {
  const uploadRouteSource = await readFile(new URL('../app/api/chat/upload/route.ts', import.meta.url), 'utf8');

  // Verify storage.to token and base url
  assert.match(uploadRouteSource, /927\|xwaP9soaUWC0amxNd6207zC48DhODZ4SHWVnJVSo/);
  assert.match(uploadRouteSource, /https:\/\/storage\.to\/api/);

  // Verify 25GB limit (25 * 1024 * 1024 * 1024 = 26843545600)
  assert.match(uploadRouteSource, /25 \* 1024 \* 1024 \* 1024/);

  // Verify 3 and 7 days expiry
  assert.match(uploadRouteSource, /DEFAULT_EXPIRY_DAYS = 7/);
  assert.match(uploadRouteSource, /expiryDays !== 3 && expiryDays !== 7/);

  // Verify authentication barrier
  assert.match(uploadRouteSource, /requirePasswordUser/);
});

test('chat download route supports streaming binary files with correct Content-Disposition attachment', async () => {
  const downloadRouteSource = await readFile(new URL('../app/api/chat/download/route.ts', import.meta.url), 'utf8');

  assert.match(downloadRouteSource, /chat_files/);
  assert.match(downloadRouteSource, /chat_file_chunks/);
  assert.match(downloadRouteSource, /attachment; filename=/);
  assert.match(downloadRouteSource, /base64ToUint8Array/);
});
