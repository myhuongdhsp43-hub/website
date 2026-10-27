// Fresh consecutive movement samples qualify a helmet incident. A telemetry gap
// restarts qualification instead of treating offline time as observed movement.
export function helmetDecision({ enabled, worn, gpsValid, speed, minSpeed, graceSeconds, missingSince, lastSeenAt, nowMs, active }) {
  if (!enabled || worn === true || (gpsValid && speed < minSpeed)) return 'clear';
  if (!gpsValid) return 'unknown';
  if (active) return 'active';
  if (!missingSince || !lastSeenAt || nowMs - Date.parse(lastSeenAt) > 45_000) return 'begin';
  return nowMs - Date.parse(missingSince) >= graceSeconds * 1000 ? 'alert' : 'wait';
}

export function normalizeSmsPhone(value) {
  const phone = String(value ?? '').replace(/[\s()-]/g, '');
  const normalized = /^0\d{9}$/.test(phone) ? '+84' + phone.slice(1) : phone;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function helmetSmsMessage(deviceId, speed, latitude, longitude, sendLocation) {
  const text = `CANH BAO MU: Xe ${deviceId.slice(0, 24)} (${speed.toFixed(1)} km/h) chua nhan tin hieu doi mu. Kiem tra ngay.`;
  const map = sendLocation && latitude !== null && longitude !== null
    ? ` https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}` : '';
  return text.length + map.length <= 160 ? text + map : text.slice(0, 160);
}
