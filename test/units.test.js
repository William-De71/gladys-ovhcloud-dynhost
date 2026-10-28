// The pure parts: configuration, answers of OVHcloud, echo services, the
// devices and the widget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWidgetContent,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
} from '@gladysassistant/integration-sdk';

import { normalizeConfig, readHostname, readLanguage, DEFAULT_INTERVAL } from '../src/config.js';
import { parseAnswer, createDynHostClient, FATAL_KINDS } from '../src/dynhost-api.js';
import { readAddress, isPrivateIPv4, createAddressReader } from '../src/public-ip.js';
import {
  buildHostDevice,
  buildHostStates,
  parseHostId,
  hostStatus,
  recordStatus,
  STATUSES,
} from '../src/device.js';
import { buildStatusWidget, recordLabel, WIDGET_ACTIONS } from '../src/widgets.js';
import { ERRORS } from '../src/events.js';
import { LANGUAGES, t } from '../src/i18n.js';
import {
  fakeGladys,
  fakeNet,
  HOSTNAME,
  LOGIN,
  PASSWORD,
  IPV4,
  IPV6,
  NOW,
  TZ,
  OVH,
} from './helpers/fixtures.js';

test('config: names cleaned, identifiers borrowed from slot 1, defaults', () => {
  assert.equal(readHostname(' https://Home.Example.com./path '), 'home.example.com');
  assert.equal(readHostname('example.com'), 'example.com');
  for (const bad of ['localhost', 'home', 'a..b.com', '-x.example.com', '*.example.com', 42]) {
    assert.equal(readHostname(bad), '', String(bad));
  }
  const config = normalizeConfig({
    hostname_1: HOSTNAME,
    login_1: ` ${LOGIN} `,
    password_1: PASSWORD,
    records_1: 'both',
    hostname_2: 'nas.example.com',
    hostname_3: 'cam.example.org',
    login_3: 'example.org-cam',
    password_3: 'other',
    records_3: 'nonsense',
    interval: '60',
    language: 'de',
  });
  assert.deepEqual(config, {
    hosts: [
      { slot: 1, hostname: HOSTNAME, login: LOGIN, password: PASSWORD, families: ['ipv4', 'ipv6'] },
      {
        slot: 2,
        hostname: 'nas.example.com',
        login: LOGIN,
        password: PASSWORD,
        families: ['ipv4'],
      },
      {
        slot: 3,
        hostname: 'cam.example.org',
        login: 'example.org-cam',
        password: 'other',
        families: ['ipv4'],
      },
    ],
    interval: 60,
    language: 'de',
  });
  assert.deepEqual(normalizeConfig(), { hosts: [], interval: DEFAULT_INTERVAL, language: 'auto' });
  assert.deepEqual(
    normalizeConfig({ hostname_1: HOSTNAME, login_1: LOGIN }).hosts,
    [],
    'no password',
  );
  assert.equal(normalizeConfig({ interval: '7' }).interval, DEFAULT_INTERVAL);
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'xyz' }, 'en'), 'en');
});

test('OVHcloud answers: good and nochg succeed, codes and statuses become kinds', () => {
  assert.deepEqual(parseAnswer(200, `good ${IPV4}\n`), { result: 'good', ip: IPV4 });
  assert.deepEqual(parseAnswer(200, `nochg ${IPV6}`), { result: 'nochg', ip: IPV6 });
  const kind = (status, body) => {
    try {
      parseAnswer(status, body);
    } catch (err) {
      return err.kind;
    }
    return 'success';
  };
  assert.equal(kind(401, '{"class":"Client::Unauthorized","message":"Unauthorized"}'), 'auth');
  assert.equal(kind(200, 'badauth'), 'auth');
  assert.equal(kind(200, 'nohost'), 'nohost');
  assert.equal(kind(200, 'notfqdn'), 'notfqdn');
  assert.equal(kind(200, 'abuse'), 'abuse');
  assert.equal(kind(200, 'badagent'), 'badagent');
  assert.equal(kind(200, '911'), 'server');
  assert.equal(kind(404, '{"class":"Client::NotFound","message":"Not found"}'), 'nohost');
  assert.equal(kind(429, 'Too many requests'), 'abuse');
  assert.equal(kind(502, '<html>Bad gateway</html>'), 'server');
  assert.equal(kind(500, `good ${IPV4}`), 'server', 'a success needs a 2xx');
  assert.deepEqual(FATAL_KINDS, ['auth', 'nohost', 'notfqdn', 'abuse', 'badagent']);
});

test('OVHcloud client: Basic authorization, the address always sent', async () => {
  const net = fakeNet();
  const client = createDynHostClient({ fetch: net });
  assert.deepEqual(
    await client.update({ hostname: HOSTNAME, login: LOGIN, password: PASSWORD }, IPV6),
    {
      result: 'good',
      ip: IPV6,
    },
  );
  assert.equal(net.calls[0].myip, IPV6);
  assert.equal(client.requests, 1);
  const urls = [];
  await createDynHostClient({
    fetch: async (url) => {
      urls.push(url);
      return new Response('nochg 1.2.3.4');
    },
  }).update({ hostname: HOSTNAME, login: LOGIN, password: PASSWORD }, '1.2.3.4');
  assert.equal(urls[0], `${OVH}?system=dyndns&hostname=home.example.com&myip=1.2.3.4`);
  await assert.rejects(
    createDynHostClient({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    }).update({ hostname: HOSTNAME, login: LOGIN, password: PASSWORD }, '1.2.3.4'),
    (err) => err.kind === 'network' && !err.message.includes(PASSWORD),
  );
});

test('echo services: only a public address of the asked family is kept', async () => {
  assert.equal(readAddress('ipv4', ` ${IPV4}\n`), IPV4);
  assert.equal(readAddress('ipv4', IPV6), '');
  assert.equal(readAddress('ipv6', IPV4), '');
  assert.equal(readAddress('ipv6', '2001:DB8::1'), '2001:db8::1');
  assert.equal(readAddress('ipv4', '<html>blocked</html>'), '');
  for (const ip of ['10.0.0.1', '192.168.1.10', '172.20.0.2', '100.64.1.1', '127.0.0.1']) {
    assert.ok(isPrivateIPv4(ip), ip);
    assert.equal(readAddress('ipv4', ip), '', ip);
  }
  assert.equal(isPrivateIPv4('172.32.0.1'), false);
  for (const ip of ['::1', 'fe80::1', 'fd00::1', '::ffff:1.2.3.4']) {
    assert.equal(readAddress('ipv6', ip), '', ip);
  }
  const reader = createAddressReader({
    fetch: async () => new Response('nope', { status: 500 }),
    services: { ipv4: ['https://a.example', 'https://b.example'], ipv6: [] },
    resolver: { resolve4: async () => [IPV4], resolve6: async () => [] },
  });
  await assert.rejects(
    reader.publicAddress('ipv4'),
    (err) => err.kind === 'no_ip' && /a\.example: 500, b\.example: 500/.test(err.message),
  );
  await assert.rejects(reader.publicAddress('ipv6'), (err) => err.kind === 'no_ip');
  assert.equal(await reader.resolve(HOSTNAME, 'ipv4'), IPV4);
  assert.equal(await reader.resolve(HOSTNAME, 'ipv6'), '');
});

test('devices: valid features, the right category / type pairs, in every language', () => {
  for (const language of LANGUAGES) {
    for (const families of [['ipv4'], ['ipv6'], ['ipv4', 'ipv6']]) {
      const device = buildHostDevice(fakeGladys, { hostname: HOSTNAME, families }, language);
      assert.equal(device.should_poll, false);
      assert.equal(device.poll_frequency, undefined);
      assert.equal(device.features.length, families.length + 2);
      for (const feature of device.features) {
        for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
        }
        assert.ok(feature.name.length > 0 && feature.name.length <= 50);
        assert.equal(feature.read_only, true);
      }
      const pairs = device.features.map((feature) => [feature.category, feature.type]);
      assert.deepEqual(pairs.at(-1), [
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      ]);
      for (const pair of pairs.slice(0, -1)) {
        assert.deepEqual(pair, [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT]);
      }
    }
  }
  assert.equal(parseHostId(`ext:x:host:${HOSTNAME}`), HOSTNAME);
  assert.equal(parseHostId(`ext:x:host:${HOSTNAME}:status`), HOSTNAME);
  assert.equal(parseHostId('ext:x:other:1'), '');
});

test('device states: confirmed addresses only, the worst status, the sum of changes', () => {
  const records = {
    [`${HOSTNAME}|ipv4`]: { ip: IPV4, changes: 2, error: '' },
    [`${HOSTNAME}|ipv6`]: { ip: '', changes: 0, error: 'nohost' },
  };
  const states = buildHostStates(
    fakeGladys,
    { hostname: HOSTNAME, families: ['ipv4', 'ipv6'] },
    (hostname, family) => records[`${hostname}|${family}`],
    'en',
  );
  assert.deepEqual(
    states.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.text ?? state.state,
    ]),
    [
      ['ipv4', IPV4],
      ['status', 'No DynHost record for this name'],
      ['changes', 2],
    ],
  );
  assert.equal(hostStatus([{ ip: IPV4 }, { ip: '' }]), 'pending');
  assert.equal(hostStatus([{ ip: IPV4 }]), 'ok');
  assert.equal(recordStatus({ ip: IPV4, error: 'weird' }), 'ok');
  assert.deepEqual(ERRORS, STATUSES.slice(2));
});

test('statuses fit a widget value (40 characters) in every language', () => {
  for (const language of LANGUAGES) {
    for (const status of STATUSES) {
      const text = t(`status_${status}`, language);
      assert.ok(text.length <= 40, `status_${status}.${language}: ${text.length}`);
    }
    for (const status of STATUSES) {
      const text = t(`short_${status}`, language);
      assert.ok(text.length <= 16, `short_${status}.${language}: ${text.length}`);
    }
    for (const key of ['buttonUpdate', 'rowPublicIpv4', 'rowPublicIpv6']) {
      assert.ok(t(key, language).length <= 24, `${key}.${language}`);
    }
    assert.ok(t('widgetHeading', language).length <= 40);
    assert.ok(t('checkedAt', language, { time: '23:59' }).length <= 80);
  }
});

test('widget: valid in every language, long names cut before the record type', () => {
  const hosts = [
    { hostname: HOSTNAME, families: ['ipv4', 'ipv6'] },
    { hostname: 'a-very-long-sub-domain-name.of-a-domain.example.com', families: ['ipv4'] },
    { hostname: 'nas.example.com', families: ['ipv4'] },
  ];
  const records = {
    [`${HOSTNAME}|ipv4`]: { ip: IPV4 },
    [`${HOSTNAME}|ipv6`]: { ip: '', error: 'auth' },
    'nas.example.com|ipv4': { ip: '' },
  };
  for (const language of LANGUAGES) {
    const content = buildStatusWidget({
      hosts,
      publicIps: { ipv4: { ip: IPV4 }, ipv6: { error: 'no_ip' } },
      recordOf: (hostname, family) => records[`${hostname}|${family}`] ?? { ip: IPV4 },
      checkedAt: NOW,
      language,
      timeZone: TZ,
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
    const status = content.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 6);
    assert.deepEqual(
      status.items.map((item) => item.color),
      ['primary', 'danger', 'success', 'danger', 'success', 'warning'],
    );
    assert.equal(content.components.at(-1).text, t('checkedAt', language, { time: '11:00' }));
    assert.equal(content.components[2].action.key, WIDGET_ACTIONS.UPDATE);
  }
  const label = recordLabel('a-very-long-sub-domain-name.of-a-domain.example.com', 'ipv6');
  assert.equal(label.length, 40);
  assert.match(label, /… \(AAAA\)$/);
  const empty = buildStatusWidget({
    hosts: [],
    publicIps: {},
    recordOf: () => ({}),
    checkedAt: 0,
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(empty), []);
  const unchecked = buildStatusWidget({
    hosts: [hosts[2]],
    publicIps: {},
    recordOf: () => ({ ip: '' }),
    checkedAt: 0,
    language: 'fr',
  });
  assert.equal(unchecked.components.at(-1).text, 'Pas encore vérifié · OVHcloud DynHost');
});
