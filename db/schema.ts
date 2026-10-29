import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
};

export const schools = sqliteTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  accountToken: text('account_token'),
  accountType: text('account_type', { enum: ['school', 'personal'] }).notNull().default('school'),
  ...timestamps,
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').references(() => schools.id),
  platformUserId: text('platform_user_id').notNull(),
  username: text('username'),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  email: text('email').notNull(),
  fullName: text('full_name'),
  role: text('role', { enum: ['admin', 'staff', 'viewer'] }).notNull().default('staff'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex('uq_users_platform_user_id').on(table.platformUserId), uniqueIndex('uq_users_username').on(table.username), index('idx_users_school_id').on(table.schoolId)]);

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  studentCode: text('student_code').notNull(),
  fullName: text('full_name').notNull(),
  className: text('class_name').notNull(),
  grade: text('grade'),
  academicYear: text('academic_year'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  vehiclePlate: text('vehicle_plate'),
  notes: text('notes'),
  ...timestamps,
}, (table) => [uniqueIndex('uq_students_school_code').on(table.schoolId, table.studentCode), index('idx_students_school_name').on(table.schoolId, table.fullName)]);

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  studentId: text('student_id').references(() => students.id),
  deviceId: text('device_id').notNull(),
  deviceName: text('device_name').notNull(),
  deviceTokenHash: text('device_token_hash').notNull(),
  deviceToken: text('device_token'),
  apiUrl: text('api_url'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSeen: text('last_seen'),
  lastLatitude: real('last_latitude'),
  lastLongitude: real('last_longitude'),
  currentSpeed: real('current_speed'),
  satellites: integer('satellites'),
  hdop: real('hdop'),
  networkSignal: integer('network_signal'),
  firmwareVersion: text('firmware_version'),
  gpsValid: integer('gps_valid', { mode: 'boolean' }).notNull().default(false),
  lastTelemetryAt: text('last_telemetry_at'),
  activeOverspeedEventId: text('active_overspeed_event_id'),
  helmetWorn: integer('helmet_worn', { mode: 'boolean' }),
  helmetLastSeenAt: text('helmet_last_seen_at'),
  helmetMissingSince: text('helmet_missing_since'),
  helmetAlertSentAt: text('helmet_alert_sent_at'),
  helmetAlertActive: integer('helmet_alert_active', { mode: 'boolean' }).notNull().default(false),
  verifyCode: text('verify_code'),
  pairingPending: integer('pairing_pending', { mode: 'boolean' }).notNull().default(false),
  pairingRequestedAt: text('pairing_requested_at'),
  pairedAt: text('paired_at'),
  tokenSyncedAt: text('token_synced_at'),
  ...timestamps,
}, (table) => [uniqueIndex('uq_devices_school_device_id').on(table.schoolId, table.deviceId), index('idx_devices_school_seen').on(table.schoolId, table.lastSeen), index('idx_devices_student_id').on(table.studentId)]);

export const deviceConfigs = sqliteTable('device_configs', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id),
  speedLimit: real('speed_limit').notNull().default(40),
  speedAlertEnabled: integer('speed_alert_enabled', { mode: 'boolean' }).notNull().default(true),
  buzzerEnabled: integer('buzzer_enabled', { mode: 'boolean' }).notNull().default(true),
  remoteAlarm: integer('remote_alarm', { mode: 'boolean' }).notNull().default(false),
  remoteAlarmRequestedAt: text('remote_alarm_requested_at'),
  version: integer('version').notNull().default(1),
  ...timestamps,
}, (table) => [uniqueIndex('uq_device_configs_device_id').on(table.deviceId)]);

export const parentContacts = sqliteTable('parent_contacts', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  name: text('name').notNull(),
  relationship: text('relationship').notNull(),
  phone: text('phone').notNull(),
  smsEnabled: integer('sms_enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (table) => [index('idx_parent_contacts_student_id').on(table.studentId)]);

export const telemetry = sqliteTable('telemetry', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id),
  recordedAt: text('recorded_at').notNull(),
  receivedAt: text('received_at').notNull(),
  sampleId: text('sample_id'),
  speed: real('speed'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  gpsValid: integer('gps_valid', { mode: 'boolean' }).notNull(),
  satellites: integer('satellites'),
  hdop: real('hdop'),
  networkSignal: integer('network_signal'),
  overspeedActive: integer('overspeed_active', { mode: 'boolean' }).notNull().default(false),
  helmetWorn: integer('helmet_worn', { mode: 'boolean' }),
}, (table) => [uniqueIndex('uq_telemetry_sample_id').on(table.deviceId, table.sampleId), index('idx_telemetry_device_recorded_at').on(table.deviceId, table.recordedAt), index('idx_telemetry_received_at').on(table.receivedAt)]);

export const overspeedEvents = sqliteTable('overspeed_events', {
  id: text('id').primaryKey(),
  studentId: text('student_id').references(() => students.id),
  deviceId: text('device_id').notNull().references(() => devices.id),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  speedLimit: real('speed_limit').notNull(),
  maxSpeed: real('max_speed').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  gpsValid: integer('gps_valid', { mode: 'boolean' }).notNull().default(false),
  smsSent: integer('sms_sent', { mode: 'boolean' }).notNull().default(false),
  acknowledgedAt: text('acknowledged_at'),
  acknowledgedBy: text('acknowledged_by').references(() => users.id),
  ...timestamps,
}, (table) => [index('idx_overspeed_events_device_active').on(table.deviceId, table.endedAt), index('idx_overspeed_events_student_started').on(table.studentId, table.startedAt)]);

export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  deviceId: text('device_id').references(() => devices.id),
  studentId: text('student_id').references(() => students.id),
  eventId: text('event_id').references(() => overspeedEvents.id),
  type: text('type', { enum: ['overspeed', 'device_offline', 'gps_lost', 'network_lost', 'helmet_missing'] }).notNull(),
  severity: text('severity', { enum: ['info', 'warning', 'critical'] }).notNull().default('warning'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['open', 'acknowledged', 'resolved'] }).notNull().default('open'),
  resolvedAt: text('resolved_at'),
  resolvedBy: text('resolved_by').references(() => users.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [index('idx_alerts_school_status_created').on(table.schoolId, table.status, table.createdAt)]);

export const smsLogs = sqliteTable('sms_logs', {
  id: text('id').primaryKey(),
  eventId: text('event_id').references(() => overspeedEvents.id),
  phone: text('phone').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed', 'mocked'] }).notNull(),
  provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  errorMessage: text('error_message'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [index('idx_sms_logs_event_id').on(table.eventId), index('idx_sms_logs_created_at').on(table.createdAt)]);

export const helmetSmsJobs = sqliteTable('helmet_sms_jobs', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  alertId: text('alert_id').references(() => alerts.id, { onDelete: 'set null' }),
  phone: text('phone').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['queued', 'dispatched', 'accepted', 'failed', 'unknown', 'cancelled', 'expired'] }).notNull().default('queued'),
  detail: text('detail'),
  ...timestamps,
}, (table) => [
  index('idx_helmet_sms_device_status').on(table.deviceId, table.status),
  index('idx_helmet_sms_school_created').on(table.schoolId, table.createdAt),
]);

export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  smsEnabled: integer('sms_enabled', { mode: 'boolean' }).notNull().default(true),
  sendLocation: integer('send_location', { mode: 'boolean' }).notNull().default(true),
  smsCooldownMinutes: integer('sms_cooldown_minutes').notNull().default(15),
  smsTemplate: text('sms_template').notNull(),
  telemetryRetentionDays: integer('telemetry_retention_days').notNull().default(90),
  helmetDetectionEnabled: integer('helmet_detection_enabled', { mode: 'boolean' }).notNull().default(false),
  helmetGraceSeconds: integer('helmet_grace_seconds').notNull().default(45),
  helmetMinSpeedKmh: real('helmet_min_speed_kmh').notNull().default(5),
  ...timestamps,
}, (table) => [uniqueIndex('uq_system_settings_school_id').on(table.schoolId)]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [index('idx_audit_logs_school_created_at').on(table.schoolId, table.createdAt)]);

export const deviceRequestLimits = sqliteTable('device_request_limits', {
  deviceId: text('device_id').primaryKey().references(() => devices.id),
  windowStartedAt: text('window_started_at').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const studentAccounts = sqliteTable('student_accounts', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  studentId: text('student_id').references(() => students.id),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  fullName: text('full_name').notNull(),
  className: text('class_name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_student_accounts_school_username').on(table.schoolId, table.username),
  index('idx_student_accounts_school_id').on(table.schoolId),
]);

export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => schools.id),
  type: text('type', { enum: ['direct', 'group'] }).notNull().default('direct'),
  title: text('title'),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}, (table) => [
  index('idx_chat_conversations_school').on(table.schoolId),
]);

export const chatParticipants = sqliteTable('chat_participants', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => chatConversations.id),
  userId: text('user_id').notNull(),
  userType: text('user_type', { enum: ['teacher', 'student'] }).notNull(),
  userName: text('user_name').notNull(),
  joinedAt: text('joined_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('uq_chat_participants_conv_user').on(table.conversationId, table.userId),
  index('idx_chat_participants_user').on(table.userId),
]);

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => chatConversations.id),
  senderId: text('sender_id').notNull(),
  senderType: text('sender_type', { enum: ['teacher', 'student'] }).notNull(),
  senderName: text('sender_name').notNull(),
  message: text('message').notNull(),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  isAlert: integer('is_alert', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  index('idx_chat_messages_conv_created').on(table.conversationId, table.createdAt),
]);

