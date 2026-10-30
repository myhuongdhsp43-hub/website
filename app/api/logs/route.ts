import { env } from 'cloudflare:workers';
import { apiError, json, noStore } from '@/lib/server/http';
import { requireSchoolUser } from '@/lib/server/auth';

export type UnifiedLog = {
  id: string;
  timestamp: string;
  category: 'telemetry' | 'command' | 'alert' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  deviceId: string;
  deviceName?: string | null;
  studentName?: string | null;
  title: string;
  message: string;
  details: Record<string, unknown>;
};

export async function GET(request: Request) {
  try {
    const context = await requireSchoolUser();
    const url = new URL(request.url);
    const category = (url.searchParams.get('category') || url.searchParams.get('type') || 'all').toLowerCase();
    const deviceFilter = (url.searchParams.get('device_id') || '').trim().toUpperCase();
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '80', 10)));

    const entries: UnifiedLog[] = [];

    // 1. Telemetry logs (Dữ liệu 4G từ thiết bị gửi lên)
    if (category === 'all' || category === 'telemetry') {
      let query = `
        SELECT t.id, t.recorded_at, t.received_at, t.speed, t.latitude, t.longitude, t.gps_valid,
               t.satellites, t.hdop, t.network_signal, t.overspeed_active, t.helmet_worn, t.sample_id,
               d.device_id, d.device_name, s.full_name AS student_name, s.student_code, s.class_name
        FROM telemetry t
        JOIN devices d ON d.id = t.device_id
        LEFT JOIN students s ON s.id = d.student_id AND s.school_id = d.school_id
        WHERE d.school_id = ?
      `;
      const params: unknown[] = [context.schoolId];
      if (deviceFilter) {
        query += ' AND d.device_id = ?';
        params.push(deviceFilter);
      }
      query += ' ORDER BY COALESCE(t.received_at, t.recorded_at) DESC LIMIT ?';
      params.push(limit);

      const rows = await env.DB.prepare(query).bind(...params).all<{
        id: string;
        recorded_at: string;
        received_at: string | null;
        speed: number;
        latitude: number | null;
        longitude: number | null;
        gps_valid: number;
        satellites: number | null;
        hdop: number | null;
        network_signal: number | null;
        overspeed_active: number;
        helmet_worn: number | null;
        sample_id: string;
        device_id: string;
        device_name: string;
        student_name: string | null;
        student_code: string | null;
        class_name: string | null;
      }>();

      for (const r of rows.results || []) {
        const time = r.received_at || r.recorded_at || new Date().toISOString();
        const gpsStatus = r.gps_valid ? `GPS Khóa (${r.satellites ?? 0} vệ tinh, HDOP ${r.hdop ?? 'N/A'})` : 'Chờ định vị GPS';
        const helmetStatus = r.helmet_worn === 1 ? 'Đã đội mũ' : r.helmet_worn === 0 ? 'Chưa đội mũ' : 'Không có cảm biến';
        const signalDbm = r.network_signal ? `Sóng 4G: ${r.network_signal}/31 CSQ` : 'Sóng 4G: N/A';

        entries.push({
          id: `tel_${r.id}`,
          timestamp: time,
          category: 'telemetry',
          level: r.overspeed_active ? 'warning' : 'success',
          deviceId: r.device_id,
          deviceName: r.device_name,
          studentName: r.student_name,
          title: `Gói tin viễn thông 4G (${r.speed.toFixed(1)} km/h)`,
          message: `Vận tốc: ${r.speed.toFixed(1)} km/h | ${gpsStatus} | ${signalDbm} | ${helmetStatus}`,
          details: {
            speed: r.speed,
            gps_valid: Boolean(r.gps_valid),
            latitude: r.latitude,
            longitude: r.longitude,
            satellites: r.satellites,
            hdop: r.hdop,
            network_signal: r.network_signal,
            overspeed_active: Boolean(r.overspeed_active),
            helmet_worn: r.helmet_worn,
            sample_id: r.sample_id,
            recorded_at: r.recorded_at,
            received_at: r.received_at,
          },
        });
      }
    }

    // 2. Command & Audit logs (Lệnh từ Web gửi về xe / Thao tác hệ thống)
    if (category === 'all' || category === 'command' || category === 'system') {
      let query = `
        SELECT a.id, a.user_id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
               u.full_name AS user_name, u.email AS user_email
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.school_id = ?
      `;
      const params: unknown[] = [context.schoolId];
      query += ' ORDER BY a.created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await env.DB.prepare(query).bind(...params).all<{
        id: string;
        user_id: string;
        action: string;
        entity: string;
        entity_id: string | null;
        metadata: string | null;
        created_at: string;
        user_name: string | null;
        user_email: string | null;
      }>();

      for (const r of rows.results || []) {
        let meta: Record<string, unknown> = {};
        try {
          if (r.metadata) meta = JSON.parse(r.metadata);
        } catch {}

        const targetDeviceId = String(meta.deviceId || meta.device_id || '').toUpperCase();
        if (deviceFilter && targetDeviceId && targetDeviceId !== deviceFilter) {
          continue;
        }

        const isCommand = r.action.startsWith('device.') || r.action.includes('alarm') || r.action.includes('config');
        const isAlarm = r.action === 'device.remote_alarm';

        let title = `Thao tác Web: ${r.action}`;
        let message = `Người thực hiện: ${r.user_name || r.user_email || 'Hệ thống'}`;
        let level: UnifiedLog['level'] = 'info';

        if (isAlarm) {
          title = `Lệnh điều khiển: PHÁT CÒI TỪ XA (${targetDeviceId || 'Xe'})`;
          message = `Gửi tín hiệu còi khẩn cấp qua 4G tới xe ${targetDeviceId || ''}. Thiết bị sẽ hú còi ở chu kỳ đồng bộ.`;
          level = 'warning';
        } else if (r.action === 'device.activate' || r.action === 'device.pair') {
          title = `Kích hoạt / Ghép đôi thiết bị (${targetDeviceId || 'Xe'})`;
          message = `Xác thực phần cứng thành công cho xe ${targetDeviceId || ''}.`;
          level = 'success';
        } else if (r.action === 'device.update') {
          title = `Cập nhật cấu hình xe (${targetDeviceId || 'Xe'})`;
          message = `Thay đổi giới hạn tốc độ / còi báo động được lưu vào hệ thống.`;
          level = 'info';
        }

        entries.push({
          id: `aud_${r.id}`,
          timestamp: r.created_at,
          category: isCommand ? 'command' : 'system',
          level,
          deviceId: targetDeviceId || (r.entity === 'device' ? r.entity_id || '' : ''),
          deviceName: null,
          studentName: null,
          title,
          message,
          details: {
            action: r.action,
            entity: r.entity,
            entity_id: r.entity_id,
            user: r.user_name || r.user_email,
            ...meta,
          },
        });
      }
    }

    // 3. Alerts (Cảnh báo khẩn cấp từ xe hoặc hệ thống)
    if (category === 'all' || category === 'alert') {
      let query = `
        SELECT al.id, al.type, al.severity, al.title, al.message, al.status, al.created_at,
               d.device_id, d.device_name, s.full_name AS student_name
        FROM alerts al
        LEFT JOIN devices d ON d.id = al.device_id
        LEFT JOIN students s ON s.id = al.student_id AND s.school_id = al.school_id
        WHERE al.school_id = ?
      `;
      const params: unknown[] = [context.schoolId];
      if (deviceFilter) {
        query += ' AND d.device_id = ?';
        params.push(deviceFilter);
      }
      query += ' ORDER BY al.created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await env.DB.prepare(query).bind(...params).all<{
        id: string;
        type: string;
        severity: string;
        title: string;
        message: string;
        status: string;
        created_at: string;
        device_id: string | null;
        device_name: string | null;
        student_name: string | null;
      }>();

      for (const r of rows.results || []) {
        entries.push({
          id: `alt_${r.id}`,
          timestamp: r.created_at,
          category: 'alert',
          level: r.severity === 'critical' || r.type === 'overspeed' ? 'error' : 'warning',
          deviceId: r.device_id || '',
          deviceName: r.device_name,
          studentName: r.student_name,
          title: `CẢNH BÁO: ${r.title}`,
          message: r.message,
          details: {
            type: r.type,
            severity: r.severity,
            status: r.status,
          },
        });
      }
    }

    // Sắp xếp toàn bộ nhật ký theo thời gian mới nhất lên đầu
    entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    // Cắt theo limit yêu cầu
    const finalLogs = entries.slice(0, limit);

    return noStore(json({
      success: true,
      logs: finalLogs,
      total: finalLogs.length,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (error) {
    return apiError(error);
  }
}
