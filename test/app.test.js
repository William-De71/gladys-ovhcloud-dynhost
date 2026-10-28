// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, a fake
// network (echo services and the DynHost endpoint) and a fake resolver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  MIN_GAP_MS,
  DRIFT_MS,
  FATAL_RETRY_MS,
} from '../src/app.js';
import { TRIGGERS, OUTPUTS } from '../src/events.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import {
  fakeNet,
  fakeResolver,
  storePath,
  silent,
  NOW,
  TZ,
  HOSTNAME,
  LOGIN,
  PASSWORD,
  IPV4,
  IPV4_NEW,
  IPV6,
  SERVICES,
} from './helpers/fixtures.js';

const CONFIG = { hostname_1: HOSTNAME, login_1: LOGIN, password_1: PASSWORD, language: 'fr' };
const PREFIX = 'ext:test-integration';
const HOST = `${PREFIX}:host:${HOSTNAME}`;
const NAS = `${PREFIX}:host:nas.example.com`;

/**
 * @description The integration, connected to a fake Gladys and a fake network.
 * @param {object} [options] - `{ config, path, net, records }`, `records` what
 * OVHcloud holds before the start.
 * @returns {Promise<object>} `{ gladys, app, net, resolver, clock, path }`.
 */
async function startApp({ config = CONFIG, path = storePath(), net = fakeNet(), records } = {}) {
  if (records) {
    net.records = records;
  }
  const clock = { now: NOW };
  const resolver = fakeResolver(net);
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: net,
    services: SERVICES,
    resolver,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, net, resolver, clock, path };
}

const createAll = async (gladys) => {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
};

/**
 * @description Run a scene action and return its outputs, throw on failure.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The scene action.
 * @param {object} [fields] - Its fields.
 * @returns {Promise<object>} The outputs.
 */
async function runScene(gladys, key, fields = {}) {
  const ack = await gladys.fake.sceneAction(key, fields);
  if (!ack.success) {
    throw new Error(ack.error);
  }
  return ack.data.outputs;
}

const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('a record OVHcloud does not hold yet is sent once, with the integration as user agent', async () => {
  const { gladys, net } = await startApp();
  assert.equal(net.calls.length, 1);
  assert.deepEqual(
    { ...net.calls[0], agent: undefined },
    { hostname: HOSTNAME, myip: IPV4, login: LOGIN, password: PASSWORD, agent: undefined },
  );
  assert.match(net.calls[0].agent, /^gladys-ovhcloud-dynhost\/\d+\.\d+\.\d+ \(\+https:/);
  assert.deepEqual(net.echoes, ['https://api.ipify.org'], 'IPv6 is not read: no name follows it');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /1 nom\(s\) DynHost à jour, adresse publique 203\.0\.113\.7/,
  );
  const [updated] = events(gladys, TRIGGERS.RECORD_UPDATED);
  assert.deepEqual(updated.data, {
    host: HOST,
    hostname: HOSTNAME,
    family: 'ipv4',
    ip: IPV4,
    previous_ip: '',
  });
  assert.equal(
    events(gladys, TRIGGERS.PUBLIC_IP_CHANGED).length,
    0,
    'the first reading is a baseline',
  );
});

test('a name already right is never sent: no call to OVHcloud', async () => {
  const { gladys, net, app } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  assert.equal(net.calls.length, 0);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const summary = await app.check();
  assert.deepEqual([summary.updated, summary.unchanged, summary.failed], [0, 1, 0]);
  assert.equal(net.calls.length, 0);
});

test('a new public address updates the record and fires both events', async () => {
  const { gladys, net, app, clock } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  await createAll(gladys);
  net.public.ipv4 = IPV4_NEW;
  clock.now += 5 * 60 * 1000;
  const summary = await app.check();
  assert.equal(summary.updated, 1);
  assert.deepEqual(
    net.calls.map((call) => call.myip),
    [IPV4_NEW],
  );
  assert.deepEqual(events(gladys, TRIGGERS.PUBLIC_IP_CHANGED)[0].data, {
    family: 'ipv4',
    previous_ip: IPV4,
    ip: IPV4_NEW,
  });
  assert.deepEqual(events(gladys, TRIGGERS.RECORD_UPDATED)[0].data, {
    host: HOST,
    hostname: HOSTNAME,
    family: 'ipv4',
    ip: IPV4_NEW,
    previous_ip: IPV4,
  });
  assert.equal(gladys.fake.lastState(`${HOST}:ipv4`), IPV4_NEW);
  assert.equal(gladys.fake.lastState(`${HOST}:changes`), 1);
  assert.equal(gladys.fake.lastState(`${HOST}:status`), 'À jour');
  // Nothing more at the next check.
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(net.calls.length, 1);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a restart neither sends again nor fires the change again', async () => {
  const path = storePath();
  const net = fakeNet();
  await startApp({ path, net });
  assert.equal(net.calls.length, 1);
  const second = await startApp({ path, net });
  assert.equal(net.calls.length, 1);
  assert.equal(second.gladys.fake.sceneEvents.length, 0);
  assert.equal(second.app.store.record(HOSTNAME, 'ipv4').ip, IPV4);
});

test('a refused identifier fails once, is not asked again, and heals with the right password', async () => {
  const { gladys, net, app, clock } = await startApp({
    config: { ...CONFIG, password_1: 'wrong' },
  });
  assert.equal(net.calls.length, 1);
  const [failed] = events(gladys, TRIGGERS.UPDATE_FAILED);
  assert.equal(failed.data.error, 'auth');
  assert.equal(failed.data.host, HOST);
  assert.equal(failed.data.ip, IPV4);
  assert.doesNotMatch(failed.data.message, /wrong/, 'never the password');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    `${HOSTNAME} : Identifiant ou mot de passe refusé.`,
  );
  // Same settings, same address: OVHcloud is left alone (it blocks clients
  // that insist), and no second event.
  clock.now += 30 * 60 * 1000;
  await app.check();
  assert.equal(net.calls.length, 1);
  assert.equal(events(gladys, TRIGGERS.UPDATE_FAILED).length, 1);
  // Asked again after six hours.
  clock.now += FATAL_RETRY_MS;
  await app.check();
  assert.equal(net.calls.length, 2);
  // The right password: sent at once.
  clock.now += MIN_GAP_MS;
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(net.calls.length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(events(gladys, TRIGGERS.RECORD_UPDATED).length, 1);
});

test('after a restart, a refused identifier is asked once more, then left alone', async () => {
  const path = storePath();
  const net = fakeNet();
  const config = { ...CONFIG, password_1: 'wrong' };
  await startApp({ config, path, net });
  assert.equal(net.calls.length, 1);
  // The fingerprint of the refused settings is never written to /data.
  assert.doesNotMatch(readFileSync(path, 'utf8'), /wrong|errorKey/);
  const second = await startApp({ config, path, net });
  assert.equal(net.calls.length, 1, 'never twice within a minute');
  second.clock.now += MIN_GAP_MS;
  await second.app.check();
  assert.equal(net.calls.length, 2);
  assert.equal(events(second.gladys, TRIGGERS.UPDATE_FAILED).length, 0, 'same error, no event');
  second.clock.now += 30 * 60 * 1000;
  await second.app.check();
  assert.equal(net.calls.length, 2);
});

test('the dyndns2 codes of OVHcloud become statuses', async () => {
  const { gladys, net, app, clock } = await startApp({
    config: { ...CONFIG, hostname_1: 'other.example.com' },
  });
  assert.equal(events(gladys, TRIGGERS.UPDATE_FAILED)[0].data.error, 'nohost');
  await createAll(gladys);
  assert.equal(
    gladys.fake.lastState(`${PREFIX}:host:other.example.com:status`),
    'Aucun DynHost pour ce nom',
  );
  for (const [ovh, kind] of [
    ['abuse', 'abuse'],
    ['911', 'server'],
    ['error', 'server'],
    ['down', 'network'],
  ]) {
    net.ovh = ovh;
    clock.now += MIN_GAP_MS;
    const summary = await app.check({ force: true });
    assert.equal(summary.results[0].error, kind, ovh);
  }
});

test('an OVHcloud failure is retried at the next check, and clears on success', async () => {
  const { gladys, net, app, clock } = await startApp();
  net.public.ipv4 = IPV4_NEW;
  net.ovh = 'error';
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(events(gladys, TRIGGERS.UPDATE_FAILED)[0].data.error, 'server');
  net.ovh = null;
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.deepEqual(
    net.calls.map((call) => call.myip),
    [IPV4, IPV4_NEW, IPV4_NEW],
  );
  assert.equal(app.store.record(HOSTNAME, 'ipv4').error, '');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('echo services: the next one when one fails, none means no update', async () => {
  const net = fakeNet();
  net.down = ['https://api.ipify.org'];
  const { gladys, app, clock } = await startApp({ net });
  assert.deepEqual(net.echoes, ['https://api.ipify.org', 'https://ipv4.icanhazip.com']);
  assert.equal(app.getPublicIps().ipv4.source, 'ipv4.icanhazip.com');
  assert.equal(net.calls.length, 1);
  net.public.ipv4 = '';
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(net.calls.length, 1, 'nothing sent without a public address');
  assert.equal(events(gladys, TRIGGERS.UPDATE_FAILED)[0].data.error, 'no_ip');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  // Back: the record is still right, no call, the error clears.
  net.public.ipv4 = IPV4;
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(net.calls.length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('IPv6: the AAAA record follows the public IPv6, alone or with the A record', async () => {
  const { gladys, net } = await startApp({ config: { ...CONFIG, records_1: 'both' } });
  assert.deepEqual(
    net.calls.map((call) => call.myip),
    [IPV4, IPV6],
  );
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${HOST}:ipv6`), IPV6);
  assert.equal(gladys.fake.lastState(`${HOST}:changes`), 2);
  const [device] = gladys.fake.discoveredDevices;
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['ipv4', 'ipv6', 'status', 'changes'],
  );
  const only = await startApp({ config: { ...CONFIG, records_1: 'ipv6' } });
  assert.deepEqual(only.net.echoes, ['https://api6.ipify.org']);
  assert.deepEqual(
    only.net.calls.map((call) => call.myip),
    [IPV6],
  );
});

test('a name changed by hand in the zone is put back a quarter of an hour later', async () => {
  const { net, app, clock, resolver } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  resolver.zone = { [`${HOSTNAME}|ipv4`]: '192.0.2.1' };
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(net.calls.length, 0, 'the first sighting may be propagation');
  clock.now += DRIFT_MS;
  await app.check();
  assert.deepEqual(
    net.calls.map((call) => call.myip),
    [IPV4],
  );
});

test('slots 2 and 3 borrow the identifier of slot 1; a duplicate name is ignored', async () => {
  const { gladys, net } = await startApp({
    config: {
      ...CONFIG,
      hostname_2: 'nas.example.com',
      hostname_3: 'HOME.example.com.',
    },
  });
  assert.deepEqual(
    net.calls.map((call) => [call.hostname, call.login]),
    [
      [HOSTNAME, LOGIN],
      ['nas.example.com', LOGIN],
    ],
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [HOST, NAS],
  );
});

test('scene action "update now": forced, one name, outputs, and never an event', async () => {
  const { gladys, net, clock } = await startApp({
    config: { ...CONFIG, hostname_2: 'nas.example.com' },
  });
  const before = gladys.fake.sceneEvents.length;
  clock.now += MIN_GAP_MS;
  const outputs = await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { host: NAS, force: true });
  assert.deepEqual(Object.keys(outputs), OUTPUTS.update_now);
  assert.deepEqual([outputs.updated, outputs.unchanged, outputs.failed], [0, 1, 0]);
  assert.match(outputs.summary, /nas\.example\.com \(A\) : déjà 203\.0\.113\.7/);
  assert.equal(net.calls.at(-1).hostname, 'nas.example.com');
  assert.equal(gladys.fake.sceneEvents.length, before);
  // Twice within a minute: OVHcloud is not asked again.
  const again = await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW, { host: NAS, force: true });
  assert.equal(again.unchanged, 1);
  assert.equal(net.calls.filter((call) => call.hostname === 'nas.example.com').length, 2);
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.UPDATE_NOW, {
    host: `${PREFIX}:host:unknown.example.com`,
  });
  assert.equal(ack.success, false);
});

test('a public change seen by a scene action still fires at the next check', async () => {
  const { gladys, net, app, clock } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  net.public.ipv4 = IPV4_NEW;
  clock.now += MIN_GAP_MS;
  const outputs = await runScene(gladys, SCENE_ACTIONS.UPDATE_NOW);
  assert.equal(outputs.updated, 1);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  clock.now += 5 * 60 * 1000;
  await app.check();
  assert.equal(events(gladys, TRIGGERS.PUBLIC_IP_CHANGED).length, 1);
});

test('scene action "read the public address"', async () => {
  const { gladys, net } = await startApp();
  const outputs = await runScene(gladys, SCENE_ACTIONS.GET_PUBLIC_IP);
  assert.deepEqual(outputs, {
    ipv4: IPV4,
    ipv6: IPV6,
    summary: `Adresse publique : IPv4 ${IPV4}, IPv6 ${IPV6}.`,
  });
  net.public.ipv6 = '';
  const without = await runScene(gladys, SCENE_ACTIONS.GET_PUBLIC_IP);
  assert.equal(without.ipv6, '');
  assert.match(without.summary, /IPv6 inconnue/);
});

test('widget: public address, records, button; the button forces an update', async () => {
  const { gladys, net, clock } = await startApp({ config: { ...CONFIG, records_1: 'both' } });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language });
    assert.deepEqual(validateWidgetContent(data.content), [], language);
  }
  const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language: 'en' });
  const status = data.content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.color]),
    [
      ['Public IPv4', IPV4, 'primary'],
      ['Public IPv6', IPV6, 'primary'],
      [`${HOSTNAME} (A)`, 'Up to date', 'success'],
      [`${HOSTNAME} (AAAA)`, 'Up to date', 'success'],
    ],
  );
  clock.now += MIN_GAP_MS;
  const ack = await gladys.fake.widgetAction(WIDGETS.STATUS, WIDGET_ACTIONS.UPDATE);
  assert.equal(ack.success, true);
  assert.equal(ack.data.message.en, 'DynHost: 0 updated, 2 already right, 0 failed.');
  assert.equal(net.calls.length, 4);
});

test('widget and test without a name: a message to fill the configuration', async () => {
  const { gladys, net } = await startApp({ config: {} });
  const { data } = await gladys.fake.widgetGet(WIDGETS.STATUS, { language: 'fr' });
  assert.match(data.content.components[0].text, /Aucun nom DynHost/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /Enter a DynHost name/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(net.echoes.length, 0);
});

test('test the connection: every record sent, one line each', async () => {
  const { gladys, net, clock } = await startApp({ records: { [`${HOSTNAME}|ipv4`]: IPV4 } });
  clock.now += MIN_GAP_MS;
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(net.calls.length, 1, 'sent even though already right');
  assert.equal(
    ack.data.message.fr,
    `OVHcloud a accepté chaque enregistrement :\n${HOSTNAME} (A) : déjà ${IPV4}`,
  );
  await gladys.fake.configUpdated({ ...CONFIG, password_1: 'wrong' });
  clock.now += MIN_GAP_MS;
  const failed = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(
    failed.data.message.en,
    /Some records failed:\nhome\.example\.com \(A\): Identifier or password refused/,
  );
});

test('diagnostic: in the logs, passwords hidden', async () => {
  const lines = [];
  const gladys = createFakeGladys({ config: CONFIG });
  const net = fakeNet();
  createApp(gladys, {
    fetch: net,
    services: SERVICES,
    resolver: fakeResolver(net),
    storePath: storePath(),
    now: () => NOW,
    timers: false,
    logger: { ...silent, info: (line) => lines.push(line) },
  });
  await gladys.connect();
  const ack = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.equal(ack.success, true);
  const diagnostic = lines.filter((line) => line.startsWith('DynHost diagnostic')).join('');
  assert.match(diagnostic, /"password":"11 characters"/);
  assert.doesNotMatch(diagnostic, new RegExp(PASSWORD));
});

test('devices: one per name, states republished when created', async () => {
  const { gladys } = await startApp();
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, `${HOSTNAME} (DynHost)`);
  assert.equal(device.should_poll, false);
  assert.equal(gladys.fake.states.length, 0, 'nothing before the device exists');
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${HOST}:ipv4`), IPV4);
  assert.equal(gladys.fake.lastState(`${HOST}:status`), 'À jour');
  assert.equal(gladys.fake.lastState(`${HOST}:changes`), 1);
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGETS.STATUS));
});

test('the store survives a broken file', async () => {
  const path = storePath();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, '{broken');
  const { net, path: kept } = await startApp({ path });
  assert.equal(net.calls.length, 1);
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).records[`${HOSTNAME}|ipv4`].ip, IPV4);
});
