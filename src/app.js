// -----------------------------------------------------------------------------
// The OVHcloud DynHost integration: every handler, registered on a Gladys
// client.
//
// Keeps up to three DynHost names of OVHcloud pointed at the public address
// of the home, through the official DynHost endpoint (dynhost-api.js):
//   - at each check (every 1 to 30 min, 5 by default) the public IPv4, and
//     IPv6 when a name follows it, is read on echo services (public-ip.js);
//   - a record is sent to OVHcloud only when it must change: the public
//     address differs from the one OVHcloud last confirmed, or the name
//     still resolves elsewhere a quarter of an hour after an update (changed
//     by hand in the zone). A refused update (identifier, unknown name,
//     abuse…) is not asked again before the settings or the address change,
//     or 6 hours: OVHcloud blocks clients that insist;
//   - devices (device.js): one per name, its addresses, status and number of
//     changes;
//   - scene triggers (events.js): public address changed, record updated,
//     update failed;
//   - scene actions: update now, read the public address;
//   - dashboard widget (widgets.js): the public address and every record.
//
// Transport: cloud only (OVHcloud and the echo services).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK, a fake fetch and a fake resolver (test/app.test.js).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, FAMILIES, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createDynHostClient, FATAL_KINDS } from './dynhost-api.js';
import { createAddressReader } from './public-ip.js';
import { createStore, recordKey, DEFAULT_PATH } from './store.js';
import { hostIds, parseHostId, buildHostDevice, buildHostStates } from './device.js';
import { TRIGGERS, OUTPUTS, pick, publicChangeData, updatedData, failedData } from './events.js';
import { WIDGETS, WIDGET_ACTIONS, messageContent, buildStatusWidget } from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = { TEST_CONNECTION: 'test_connection', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = { UPDATE_NOW: 'update_now', GET_PUBLIC_IP: 'get_public_ip' };
const MINUTE_MS = 60 * 1000;
// Never two calls for the same record within a minute, even when forced.
const MIN_GAP_MS = MINUTE_MS;
// A name still resolving elsewhere this long after an update was changed by
// hand in the zone (OVHcloud propagates within a few minutes).
const DRIFT_MS = 15 * MINUTE_MS;
// A refused update is asked again after this long at most.
const FATAL_RETRY_MS = 6 * 60 * MINUTE_MS;
// Errors cleared as soon as the record is right again without a call.
const TRANSIENT_KINDS = ['server', 'network', 'no_ip'];
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description A fingerprint of an identifier and its password: tells whether
 * the settings changed since a refusal. Kept in memory only, never in /data.
 * @param {object} host - `{ login, password }`.
 * @returns {string} 12 hexadecimal characters.
 */
const credentialsKey = ({ login, password }) =>
  createHash('sha256').update(`${login}\n${password}`).digest('hex');

/**
 * @description Create the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - `{ fetch, baseUrl, services, resolver,
 * storePath, now, timeZone, timers, logger }` (the tests set them).
 * @returns {object} Helpers for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    services,
    resolver,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  // The public address of each family at the last check: `{ ip, source }` or
  // `{ error, message }`.
  let publicIps = {};
  let checkedAt = 0;
  let checking = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let checkTimer = null;
  let stopped = false;
  // Per record, the fingerprint of the settings OVHcloud refused. After a
  // restart it is unknown, so a refused record is asked once more.
  const refusedWith = new Map();

  const api = createDynHostClient({
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const addresses = createAddressReader({
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(services ? { services } : {}),
    ...(resolver ? { resolver } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const recordOf = (hostname, family) => store.record(hostname, family);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The first record in error, if any.
   * @returns {{ hostname: string, family: string, record: object }|null} It.
   */
  function firstError() {
    for (const host of config.hosts) {
      for (const family of host.families) {
        const record = recordOf(host.hostname, family);
        if (record.error) {
          return { hostname: host.hostname, family, record };
        }
      }
    }
    return null;
  }

  /**
   * @description Work out the connection status from the last check.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (config.hosts.length === 0) {
      await reportStatus(false, all('statusNoHost'));
      return;
    }
    if (!checkedAt) {
      return;
    }
    const failure = firstError();
    if (failure) {
      await reportStatus(
        false,
        all('statusError', (lang) => ({
          hostname: failure.hostname,
          error: t(`status_${failure.record.error}`, lang),
        })),
      );
      return;
    }
    await reportStatus(
      true,
      all('statusConnected', {
        count: config.hosts.length,
        ip: publicIps.ipv4?.ip ?? publicIps.ipv6?.ip ?? '',
        minutes: Math.max(1, Math.round(config.interval / 60)),
      }),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widget to pull its content again.
   */
  function refreshWidget() {
    Promise.resolve(gladys.requestWidgetRefresh(WIDGETS.STATUS)).catch(() => {});
  }

  /**
   * @description Offer the devices on the Discovery screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = config.hosts.map((host) => buildHostDevice(gladys, host, lang));
    const signature = JSON.stringify(devices);
    if (!force && signature === lastDiscovery) {
      return devices.length;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
    return devices.length;
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = config.hosts
      .filter((host) => createdDevices.has(hostIds(gladys, host.hostname).device))
      .flatMap((host) => buildHostStates(gladys, host, recordOf, lang));
    if (states.length === 0) {
      return;
    }
    try {
      await gladys.publishChangedStates(states, { heartbeat: 30 * MINUTE_MS });
    } catch (err) {
      logger.warn(`Unable to publish the states: ${err.message}`);
    }
  }

  /**
   * @description Fire a scene event, never failing the check.
   * @param {string} key - The trigger.
   * @param {object} data - The flat data.
   * @returns {Promise<void>}
   */
  async function fire(key, data) {
    logger.info(`${key}: ${JSON.stringify(data)}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to fire ${key}: ${err.message}`);
    }
  }

  // --- The check ---------------------------------------------------------------------

  /**
   * @description Read the public address of each family a name follows.
   * @param {string[]} families - The families.
   * @param {boolean} silent - True when no event may fire (a scene action
   * asked): the stored address is then left as it was, so the next check
   * still fires the change.
   * @returns {Promise<Array<object>>} The events to fire.
   */
  async function readPublicAddresses(families, silent) {
    const events = [];
    for (const family of families) {
      try {
        const { ip, source } = await addresses.publicAddress(family);
        publicIps[family] = { ip, source };
        const before = store.data.public[family];
        if (before?.ip === ip || silent) {
          continue;
        }
        if (before?.ip) {
          logger.info(`Public ${family} address: ${before.ip} -> ${ip}`);
          events.push({
            key: TRIGGERS.PUBLIC_IP_CHANGED,
            data: publicChangeData(family, before.ip, ip),
          });
        }
        store.data.public[family] = { ip, at: now() };
      } catch (err) {
        logger.warn(err.message);
        publicIps[family] = { error: 'no_ip', message: err.message };
      }
    }
    return events;
  }

  /**
   * @description Whether a record must be sent to OVHcloud.
   * @param {object} host - The configured host.
   * @param {string} family - `ipv4` or `ipv6`.
   * @param {object} record - The stored record.
   * @param {string} ip - The public address.
   * @param {boolean} force - Asked by the user.
   * @returns {Promise<boolean>} True to send it.
   */
  async function mustSend(host, family, record, ip, force) {
    if (now() - (record.sentAt || 0) < MIN_GAP_MS) {
      return false;
    }
    if (FATAL_KINDS.includes(record.error)) {
      const changed =
        refusedWith.get(recordKey(host.hostname, family)) !== credentialsKey(host) ||
        record.errorIp !== ip;
      return force || changed || now() - (record.errorAt || 0) >= FATAL_RETRY_MS;
    }
    if (force) {
      return true;
    }
    const resolved = await addresses.resolve(host.hostname, family);
    if (record.ip !== ip) {
      // First check of a name, or after a restart: already right, no call.
      if (!record.ip && resolved === ip) {
        Object.assign(record, { ip, at: now(), error: '', message: '' });
        return false;
      }
      return true;
    }
    return Boolean(resolved) && resolved !== ip && now() - (record.at || 0) >= DRIFT_MS;
  }

  /**
   * @description Check one record, and send it when it must change.
   * @param {object} host - The configured host.
   * @param {string} family - `ipv4` or `ipv6`.
   * @param {object} options - `{ force }`.
   * @returns {Promise<{ outcome: string, events: Array<object> }>} The outcome
   * (`updated`, `unchanged`, `failed`) and the events to fire.
   */
  async function checkRecord(host, family, { force }) {
    const record = recordOf(host.hostname, family);
    const device = hostIds(gladys, host.hostname).device;
    const events = [];
    const fail = (kind, message, ip) => {
      if (record.error !== kind) {
        events.push({
          key: TRIGGERS.UPDATE_FAILED,
          data: failedData({
            host: device,
            hostname: host.hostname,
            family,
            ip,
            error: kind,
            message,
          }),
        });
      }
      Object.assign(record, {
        error: kind,
        message: String(message).slice(0, 200),
        errorAt: now(),
        errorIp: ip ?? '',
      });
      refusedWith.set(recordKey(host.hostname, family), credentialsKey(host));
      return { outcome: 'failed', events };
    };
    const ip = publicIps[family]?.ip;
    if (!ip) {
      return fail('no_ip', publicIps[family]?.message ?? 'No public address');
    }
    if (!(await mustSend(host, family, record, ip, force))) {
      if (TRANSIENT_KINDS.includes(record.error) && record.ip === ip) {
        Object.assign(record, { error: '', message: '' });
      }
      return { outcome: record.error ? 'failed' : 'unchanged', events };
    }
    record.sentAt = now();
    try {
      const { result } = await api.update(host, ip);
      const previous = record.ip;
      Object.assign(record, { ip, at: now(), error: '', message: '' });
      logger.info(`${host.hostname} (${family}): ${result} ${ip}`);
      if (result !== 'good') {
        return { outcome: 'unchanged', events };
      }
      record.changes = (Number(record.changes) || 0) + 1;
      events.push({
        key: TRIGGERS.RECORD_UPDATED,
        data: updatedData({ host: device, hostname: host.hostname, family, ip, previous }),
      });
      return { outcome: 'updated', events };
    } catch (err) {
      logger.warn(`${host.hostname} (${family}): ${err.kind ?? 'error'}: ${err.message}`);
      return fail(err.kind ?? 'server', err.message, ip);
    }
  }

  /**
   * @description Check the public address and every record, send those that
   * must change, then publish devices, states and events. Concurrent calls
   * wait for each other.
   * @param {object} [options] - `{ force, hostname, silent }`: `force` sends
   * even a record already right, `hostname` limits the check to one name,
   * `silent` fires no event (asked by a scene action).
   * @returns {Promise<object>} `{ updated, unchanged, failed, results }`,
   * `results` per record `{ hostname, family, outcome, ip, error }`.
   */
  function check({ force = false, hostname = '', silent = false } = {}) {
    const previous = checking ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        const hosts = config.hosts.filter((host) => !hostname || host.hostname === hostname);
        const summary = { updated: 0, unchanged: 0, failed: 0, results: [] };
        try {
          if (hosts.length > 0) {
            const families = FAMILIES.filter((family) =>
              hosts.some((host) => host.families.includes(family)),
            );
            const events = await readPublicAddresses(families, silent);
            for (const host of hosts) {
              for (const family of host.families) {
                const result = await checkRecord(host, family, { force });
                summary[result.outcome] += 1;
                const record = recordOf(host.hostname, family);
                summary.results.push({
                  hostname: host.hostname,
                  family,
                  outcome: result.outcome,
                  ip: record.ip,
                  error: record.error,
                });
                events.push(...result.events);
              }
            }
            checkedAt = now();
            await store.save();
            if (!silent) {
              for (const { key, data } of events) {
                await fire(key, data);
              }
            }
          }
          await publishDiscoveredDevices();
          await publishStates();
          refreshWidget();
        } catch (err) {
          logger.error('Check failed', err);
        } finally {
          await refreshStatus();
        }
        return summary;
      });
    checking = current.finally(() => {
      if (checking === current) {
        checking = null;
      }
    });
    return current;
  }

  /**
   * @description Apply the configuration: check now, set the timer.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    clearInterval(checkTimer);
    lastDiscovery = null;
    await check();
    if (timers && !stopped) {
      checkTimer = setInterval(() => {
        check().catch(() => {});
      }, config.interval * 1000);
      checkTimer.unref?.();
    }
  }

  /**
   * @description One line per record: "home.example.com (A): 203.0.113.7".
   * @param {Array<object>} results - The results of a check.
   * @param {string} lang - The language.
   * @returns {string} The lines.
   */
  function resultLines(results, lang) {
    return results
      .map(({ hostname, family, outcome, ip, error }) => {
        const type = family === 'ipv6' ? 'AAAA' : 'A';
        const state =
          outcome === 'failed'
            ? t(`status_${error || 'server'}`, lang)
            : t(outcome === 'updated' ? 'lineUpdated' : 'lineUnchanged', lang, { ip });
        return t('resultLine', lang, { record: `${hostname} (${type})`, state });
      })
      .join('\n');
  }

  /**
   * @description The summary of a check, in a language.
   * @param {object} summary - The result of check().
   * @param {string} lang - The language.
   * @returns {string} The summary.
   */
  function summaryText(summary, lang) {
    if (config.hosts.length === 0) {
      return t('statusNoHost', lang);
    }
    return t('summaryCheck', lang, {
      updated: summary.updated,
      unchanged: summary.unchanged,
      failed: summary.failed,
      lines: resultLines(summary.results, lang),
    });
  }

  // --- Widget ------------------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.STATUS, async ({ language: lang }) => {
    rememberLanguage(lang);
    // Never a check here: the widget answers within 15 s, a check may not.
    if (config.hosts.length === 0) {
      return messageContent(t('widgetNoHost', lang));
    }
    return buildStatusWidget({
      hosts: config.hosts,
      publicIps,
      recordOf,
      checkedAt,
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetAction(WIDGETS.STATUS, async (actionKey) => {
    if (actionKey !== WIDGET_ACTIONS.UPDATE) {
      throw new Error(`Unknown widget action ${actionKey}`);
    }
    if (config.hosts.length === 0) {
      return all('statusNoHost');
    }
    const summary = await check({ force: true });
    return all('toastChecked', {
      updated: summary.updated,
      unchanged: summary.unchanged,
      failed: summary.failed,
    });
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.UPDATE_NOW, async (fields = {}) => {
    const hostname = fields.host ? parseHostId(fields.host) : '';
    if (fields.host && !config.hosts.some((host) => host.hostname === hostname)) {
      throw new Error(
        `Not a DynHost name of the configuration: ${String(fields.host).slice(0, 80)}`,
      );
    }
    // Never an event for what a scene asked: the scene reads the outputs.
    const summary = await check({ force: fields.force === true, hostname, silent: true });
    return pick({ ...summary, summary: summaryText(summary, textLanguage()) }, OUTPUTS.update_now);
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_PUBLIC_IP, async () => {
    const found = {};
    for (const family of FAMILIES) {
      try {
        found[family] = (await addresses.publicAddress(family)).ip;
      } catch {
        found[family] = '';
      }
    }
    const lang = textLanguage();
    const unknown = t('valueUnknown', lang);
    return pick(
      {
        ipv4: found.ipv4,
        ipv6: found.ipv6,
        summary: t('summaryPublic', lang, {
          ipv4: found.ipv4 || unknown,
          ipv6: found.ipv6 || unknown,
        }),
      },
      OUTPUTS.get_public_ip,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (config.hosts.length === 0) {
      return all('statusNoHost');
    }
    const summary = await check({ force: true });
    const key = summary.failed > 0 ? 'testFailed' : 'testOk';
    return Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        t(key, lang, { lines: resultLines(summary.results, lang) }).slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      config: {
        ...config,
        hosts: config.hosts.map(({ password, ...host }) => ({
          ...host,
          password: password ? `${password.length} characters` : '',
        })),
      },
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
      publicIps,
      store: store.data,
      created: [...createdDevices],
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `DynHost diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidget();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info(`Configuration updated: ${config.hosts.length} DynHost name(s)`);
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(checkTimer);
    await store.save();
  });

  return {
    store,
    api,
    check,
    applyConfig,
    getConfig: () => config,
    getPublicIps: () => publicIps,
    whenReady: () => startup,
  };
}

export { createApp, credentialsKey, ACTIONS, SCENE_ACTIONS, MIN_GAP_MS, DRIFT_MS, FATAL_RETRY_MS };
