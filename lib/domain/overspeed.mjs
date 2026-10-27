/**
 * Pure, tested transition rule for the server-side event lifecycle.
 * Firmware owns qualification (3 seconds + hysteresis); server owns durable
 * event and SMS deduplication after receiving that qualified state.
 */
export function determineOverspeedTransition({ overspeedActive, speedAlertEnabled, hasOpenEvent }) {
  if (overspeedActive && speedAlertEnabled) return hasOpenEvent ? 'update' : 'start';
  return hasOpenEvent ? 'end' : 'none';
}
