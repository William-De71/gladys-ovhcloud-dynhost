// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen: one per
// DynHost name of the configuration, "<name> (DynHost)", read-only features:
//   `ipv4`      the address the A record points to, as OVHcloud confirmed it
//               (text; only when the slot follows IPv4);
//   `ipv6`      the same for the AAAA record (only when the slot follows IPv6);
//   `status`    "Up to date", "Waiting", or the last error in words (text);
//   `changes`   the number of updates OVHcloud applied (counter-sensor: its
//               history shows when the public address changed).
//
// External ids: the DynHost name, lowercase (`ext:ovhcloud-dynhost:host:
// home.example.com`): the record OVHcloud knows, whatever the slot it is
// typed in. `should_poll` stays false: the integration checks the public
// address on its own timer.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPES = { HOST: 'host' };
const FEATURE_KEYS = { IPV4: 'ipv4', IPV6: 'ipv6', STATUS: 'status', CHANGES: 'changes' };
const MAX_COUNT = 10000000;
// Status codes of a record: `ok`, `pending` (never confirmed yet), or the kind
// of its last error (dynhost-api.js, `no_ip` from public-ip.js).
const STATUSES = [
  'ok',
  'pending',
  'auth',
  'nohost',
  'notfqdn',
  'abuse',
  'badagent',
  'server',
  'network',
  'no_ip',
];

/**
 * @description The external ids of a host device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} hostname - The DynHost name.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const hostIds = (gladys, hostname) => gladys.externalIds(DEVICE_TYPES.HOST, hostname);

/**
 * @description The DynHost name a device (or feature) external id stands for.
 * @param {unknown} externalId - An external id.
 * @returns {string} The name, '' for none.
 * @example
 * parseHostId('ext:ovhcloud-dynhost:host:home.example.com'); // -> 'home.example.com'
 */
function parseHostId(externalId) {
  const match = /:host:([a-z0-9.-]+?)(?::(?:ipv4|ipv6|status|changes))?$/.exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : '';
}

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const text = (name, externalId) =>
  sensor({
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: false,
    min: 0,
    max: 0,
  });

/**
 * @description The status of a record.
 * @param {object} record - The stored record (store.js).
 * @returns {string} One of STATUSES.
 */
function recordStatus(record) {
  if (record?.error && STATUSES.includes(record.error)) {
    return record.error;
  }
  return record?.ip ? 'ok' : 'pending';
}

/**
 * @description The status of a host: its first record in error, else pending,
 * else ok.
 * @param {object[]} records - Its stored records.
 * @returns {string} One of STATUSES.
 */
function hostStatus(records) {
  const statuses = records.map(recordStatus);
  return (
    statuses.find((status) => status !== 'ok' && status !== 'pending') ??
    (statuses.includes('pending') ? 'pending' : 'ok')
  );
}

/**
 * @description Build the device of a host.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} host - `{ hostname, families }`.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildHostDevice(gladys, host, language = 'en') {
  const ids = hostIds(gladys, host.hostname);
  const features = [];
  if (host.families.includes('ipv4')) {
    features.push(text(t('featureIpv4', language), ids.feature(FEATURE_KEYS.IPV4)));
  }
  if (host.families.includes('ipv6')) {
    features.push(text(t('featureIpv6', language), ids.feature(FEATURE_KEYS.IPV6)));
  }
  features.push(
    text(t('featureStatus', language), ids.feature(FEATURE_KEYS.STATUS)),
    sensor({
      name: t('featureChanges', language),
      external_id: ids.feature(FEATURE_KEYS.CHANGES),
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      min: 0,
      max: MAX_COUNT,
    }),
  );
  return {
    name: t('hostDeviceName', language, { hostname: host.hostname }),
    external_id: ids.device,
    model: 'OVHcloud DynHost',
    should_poll: false,
    params: [{ name: 'DYNHOST_HOSTNAME', value: host.hostname }],
    features,
  };
}

/**
 * @description The states of a host.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} host - `{ hostname, families }`.
 * @param {Function} recordOf - `(hostname, family) => record` (store.js).
 * @param {string} [language] - Language of the status text.
 * @returns {Array<object>} The states, an unconfirmed address left out.
 */
function buildHostStates(gladys, host, recordOf, language = 'en') {
  const ids = hostIds(gladys, host.hostname);
  const records = host.families.map((family) => recordOf(host.hostname, family));
  const states = [];
  host.families.forEach((family, index) => {
    if (records[index].ip) {
      states.push({
        device_feature_external_id: ids.feature(FEATURE_KEYS[family.toUpperCase()]),
        text: records[index].ip,
      });
    }
  });
  const changes = records.reduce((sum, record) => sum + (Number(record.changes) || 0), 0);
  states.push(
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.STATUS),
      text: t(`status_${hostStatus(records)}`, language),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.CHANGES),
      state: Math.min(MAX_COUNT, changes),
    },
  );
  return states;
}

export {
  DEVICE_TYPES,
  FEATURE_KEYS,
  MAX_COUNT,
  STATUSES,
  hostIds,
  parseHostId,
  recordStatus,
  hostStatus,
  buildHostDevice,
  buildHostStates,
};
