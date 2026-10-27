import { env } from 'cloudflare:workers';

const NAMES = ['Nguyễn Minh Anh', 'Trần Gia Hân', 'Lê Hoàng Nam', 'Phạm Khánh Linh', 'Vũ Đức Anh', 'Đặng Thu Hà', 'Bùi Quang Huy', 'Hoàng Bảo Ngọc', 'Đỗ Nhật Minh', 'Ngô Thanh Trúc'];

/** Seeds only a database explicitly marked as development. It never runs in production. */
export async function seedDevelopmentData(schoolId: string) {
  if (env.DEV_MODE !== 'true') return;
  const existing = await env.DB.prepare('SELECT id FROM students WHERE school_id = ? LIMIT 1').bind(schoolId).first();
  if (existing) return;

  const now = new Date();
  const createdAt = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < NAMES.length; index += 1) {
    const number = String(index + 1).padStart(3, '0');
    const studentId = `${schoolId}-demo-student-${number}`;
    const deviceId = `${schoolId}-demo-device-${number}`;
    const configId = `${schoolId}-demo-config-${number}`;
    const telemetryId = `${schoolId}-demo-telemetry-${number}`;
    const externalDeviceId = `DEMO${number}`;
    const speed = 22 + index * 2.4;
    const latitude = 21.0285 + index * 0.0012;
    const longitude = 105.8542 + index * 0.0011;
    const seenAt = new Date(now.getTime() - index * 4_000).toISOString();
    statements.push(
      env.DB.prepare('INSERT INTO students (id, school_id, student_code, full_name, class_name, grade, academic_year, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(studentId, schoolId, `HS${number}`, NAMES[index], `10A${(index % 5) + 1}`, '10', '2026–2027', 1, createdAt, createdAt),
      env.DB.prepare('INSERT INTO devices (id, school_id, student_id, device_id, device_name, device_token_hash, enabled, last_seen, last_latitude, last_longitude, current_speed, gps_valid, satellites, hdop, network_signal, firmware_version, last_telemetry_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(deviceId, schoolId, studentId, externalDeviceId, `Xe máy điện demo ${number}`, 'dev-demo-token-is-not-a-real-device-token-and-cannot-authenticate', 1, seenAt, latitude, longitude, speed, 1, 15, 0.9, 20, '2.0.0-demo', seenAt, createdAt, createdAt),
      env.DB.prepare('INSERT INTO device_configs (id, device_id, speed_limit, speed_alert_enabled, buzzer_enabled, remote_alarm, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(configId, deviceId, 40, 1, 1, 0, 1, createdAt, createdAt),
      env.DB.prepare('INSERT INTO telemetry (id, device_id, recorded_at, received_at, sample_id, speed, latitude, longitude, gps_valid, satellites, hdop, network_signal, overspeed_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(telemetryId, deviceId, seenAt, seenAt, `demo-${number}`, speed, latitude, longitude, 1, 15, 0.9, 20, 0),
      env.DB.prepare('INSERT INTO parent_contacts (id, student_id, name, relationship, phone, sms_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`${schoolId}-demo-contact-${number}`, studentId, `Phụ huynh ${number}`, 'Người giám hộ', `0900000${String(index + 1).padStart(3, '0')}`, 1, createdAt, createdAt),
    );
    if (index < 3) {
      const eventId = `${schoolId}-demo-event-${number}`;
      statements.push(
        env.DB.prepare('INSERT INTO overspeed_events (id, student_id, device_id, started_at, ended_at, speed_limit, max_speed, latitude, longitude, gps_valid, sms_sent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(eventId, studentId, deviceId, seenAt, seenAt, 40, 45 + index, latitude, longitude, 1, 1, createdAt, createdAt),
        env.DB.prepare('INSERT INTO alerts (id, school_id, device_id, student_id, event_id, type, severity, title, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`${schoolId}-demo-alert-${number}`, schoolId, deviceId, studentId, eventId, 'overspeed', 'warning', 'Cảnh báo vượt tốc (demo)', `Dữ liệu mô phỏng: ${NAMES[index]} đã vượt giới hạn 40 km/h.`, 'resolved', createdAt),
        env.DB.prepare('INSERT INTO sms_logs (id, event_id, phone, message, status, provider, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`${schoolId}-demo-sms-${number}`, eventId, `0900000${String(index + 1).padStart(3, '0')}`, 'SMS demo — không gửi ra mạng.', 'mocked', 'mock', createdAt, createdAt),
      );
    }
  }
  await env.DB.batch(statements);
}
