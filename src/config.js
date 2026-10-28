// -----------------------------------------------------------------------------
// Configuration of the OVHcloud DynHost integration.
//
// Fields of the config_schema, for each of the three host slots (n = 1, 2, 3):
//   - `hostname_n`   the DynHost record to keep up to date ("home.example.com",
//                    the bare domain "example.com" for the root);
//   - `login_n`      the DynHost identifier created in the OVHcloud Control
//                    Panel ("example.com-home"); empty for slots 2 and 3:
//                    the identifier of slot 1 (one identifier created with
//                    the sub-domain `*` covers every name of the domain);
//   - `password_n`   its password (secret);
//   - `records_n`    which records of the name follow the public address:
//                    `ipv4` (A), `ipv6` (AAAA) or `both`.
// And for the whole integration:
//   - `interval`     seconds between two checks of the public address;
//   - `language`     language of the device and feature names, the status
//                    texts and the scene summaries: `auto` follows the last
//                    widget request.
//
// Internal key, outside the config_schema (stored by setConfig):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const SLOTS = [1, 2, 3];
// A check reads the public address from an echo service and resolves each
// name: cheap. OVHcloud is only called when a record must change.
const INTERVALS = [60, 300, 900, 1800];
const DEFAULT_INTERVAL = 300;
const FAMILIES = ['ipv4', 'ipv6'];
const RECORDS = { ipv4: ['ipv4'], ipv6: ['ipv6'], both: ['ipv4', 'ipv6'] };
const DEFAULT_RECORDS = 'ipv4';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
// A DNS name: labels of letters, digits and hyphens, at least one dot.
const HOSTNAME =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read a value among allowed numbers.
 * @param {unknown} raw - The raw value ("300", 300).
 * @param {number[]} allowed - The allowed values.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return allowed.includes(value) ? value : fallback;
}

/**
 * @description A host name as DynHost expects it, from what a user may paste.
 * @param {unknown} raw - The typed name.
 * @returns {string} The lowercase name, '' when it cannot be one.
 * @example
 * readHostname(' https://Home.Example.com./ '); // -> 'home.example.com'
 */
function readHostname(raw) {
  const value = readString(raw)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
  return HOSTNAME.test(value) ? value : '';
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ hosts: [{ slot, hostname, login, password, families }],
 * interval, language }`, the hosts without a valid name or identifier left out.
 * @example
 * normalizeConfig({ hostname_1: 'home.example.com', login_1: 'example.com-home', password_1: 'x' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const first = { login: readString(config.login_1), password: readString(config.password_1) };
  const hosts = [];
  const seen = new Set();
  for (const slot of SLOTS) {
    const hostname = readHostname(config[`hostname_${slot}`]);
    if (!hostname || seen.has(hostname)) {
      continue;
    }
    const own = { login: readString(config[`login_${slot}`]) };
    // Slots 2 and 3 borrow the identifier of slot 1 when theirs is empty.
    const { login, password } = own.login
      ? { login: own.login, password: readString(config[`password_${slot}`]) }
      : first;
    if (!login || !password) {
      continue;
    }
    seen.add(hostname);
    const records = readString(config[`records_${slot}`]);
    hosts.push({
      slot,
      hostname,
      login,
      password,
      families: RECORDS[records] ?? RECORDS[DEFAULT_RECORDS],
    });
  }
  return {
    hosts,
    interval: readChoice(config.interval, INTERVALS, DEFAULT_INTERVAL),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  SLOTS,
  INTERVALS,
  DEFAULT_INTERVAL,
  FAMILIES,
  RECORDS,
  DEFAULT_RECORDS,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  readHostname,
  normalizeConfig,
  readLanguage,
};
