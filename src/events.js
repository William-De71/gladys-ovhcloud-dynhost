// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs of the integration.
//
// Triggers, one event per transition, never a periodic snapshot:
//   - `public_ip_changed`   the public address of the home changed (not at
//                           the first reading, which is a baseline);
//   - `record_updated`      OVHcloud changed a record ("good"; a "nochg" is
//                           no change);
//   - `update_failed`       a record could not be updated, once per error
//                           (the same error again fires nothing until a
//                           success or another error).
// The filters are the event values of the same key: `family` (`ipv4`,
// `ipv6`), `host` (the device external id of the name), `error`.
// -----------------------------------------------------------------------------

import { STATUSES } from './device.js';

const TRIGGERS = {
  PUBLIC_IP_CHANGED: 'public_ip_changed',
  RECORD_UPDATED: 'record_updated',
  UPDATE_FAILED: 'update_failed',
};
// The errors a trigger can filter on: every status but `ok` and `pending`.
const ERRORS = STATUSES.filter((status) => status !== 'ok' && status !== 'pending');
const OUTPUTS = {
  update_now: ['updated', 'unchanged', 'failed', 'summary'],
  get_public_ip: ['ipv4', 'ipv6', 'summary'],
};

/**
 * @description Keep the declared outputs only.
 * @param {object} values - The values.
 * @param {string[]} keys - The declared outputs.
 * @returns {object} The outputs.
 */
const pick = (values, keys) =>
  Object.fromEntries(
    keys.filter((key) => values[key] !== undefined).map((key) => [key, values[key]]),
  );

/**
 * @description The data of a "public address changed" event.
 * @param {string} family - `ipv4` or `ipv6`.
 * @param {string} previous - The former address.
 * @param {string} ip - The new address.
 * @returns {object} The data.
 */
const publicChangeData = (family, previous, ip) => ({ family, previous_ip: previous, ip });

/**
 * @description The data of a "record updated" event.
 * @param {object} record - `{ host, hostname, family, ip, previous }`, `host`
 * the device external id.
 * @returns {object} The data.
 */
const updatedData = ({ host, hostname, family, ip, previous }) => ({
  host,
  hostname,
  family,
  ip,
  previous_ip: previous ?? '',
});

/**
 * @description The data of an "update failed" event.
 * @param {object} failure - `{ host, hostname, family, ip, error, message }`.
 * @returns {object} The data.
 */
const failedData = ({ host, hostname, family, ip, error, message }) => ({
  host,
  hostname,
  family,
  ip: ip ?? '',
  error,
  message: String(message ?? '').slice(0, 300),
});

export { TRIGGERS, ERRORS, OUTPUTS, pick, publicChangeData, updatedData, failedData };
