import test from 'node:test';
import assert from 'node:assert/strict';
import { determineOverspeedTransition } from '../lib/domain/overspeed.mjs';

test('starts one event only after firmware has qualified an enabled alert', () => {
  assert.equal(determineOverspeedTransition({ overspeedActive: true, speedAlertEnabled: true, hasOpenEvent: false }), 'start');
});

test('updates instead of starting duplicate SMS events while speed remains high', () => {
  assert.equal(determineOverspeedTransition({ overspeedActive: true, speedAlertEnabled: true, hasOpenEvent: true }), 'update');
});

test('ends an existing event when firmware returns to its hysteresis-safe state', () => {
  assert.equal(determineOverspeedTransition({ overspeedActive: false, speedAlertEnabled: true, hasOpenEvent: true }), 'end');
});

test('does not create events while speed alerts are disabled', () => {
  assert.equal(determineOverspeedTransition({ overspeedActive: true, speedAlertEnabled: false, hasOpenEvent: false }), 'none');
});
