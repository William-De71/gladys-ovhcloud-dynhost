// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, OUTPUTS, ERRORS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import {
  SLOTS,
  RECORDS,
  DEFAULT_RECORDS,
  INTERVALS,
  DEFAULT_INTERVAL,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
} from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'OVHcloud DynHost');
  assert.equal(manifest.version, pkg.version);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/william-de71/gladys-ovhcloud-dynhost:${pkg.version}`,
  );
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-dynhost/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-ovhcloud-dynhost');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: OVHcloud and the echo services', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/dynhost-api.js'), /https:\/\/dns\.eu\.ovhapis\.com\/nic\/update/);
});

test('requires Gladys 5.3.0 and no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['network', 'servers']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
    assert.match(app, new RegExp(`onWidgetAction\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('the configuration of the code: three slots, one secret each, interval, language', () => {
  const config = byKey(manifest.config_schema);
  for (const slot of SLOTS) {
    assert.equal(config.get(`hostname_${slot}`).type, 'string');
    assert.equal(config.get(`login_${slot}`).type, 'string');
    assert.equal(config.get(`password_${slot}`).type, 'secret');
    for (const key of ['hostname', 'login', 'password']) {
      assert.equal(config.get(`${key}_${slot}`).required, slot === 1, `${key}_${slot}`);
    }
    const records = config.get(`records_${slot}`);
    assert.deepEqual(values(records), Object.keys(RECORDS));
    assert.equal(records.default, DEFAULT_RECORDS);
  }
  assert.deepEqual(
    manifest.config_schema.filter((field) => field.type === 'secret').map((field) => field.key),
    ['password_1', 'password_2', 'password_3'],
  );
  const interval = config.get('interval');
  assert.deepEqual(values(interval), INTERVALS.map(String));
  assert.equal(interval.default, String(DEFAULT_INTERVAL));
  assert.equal(config.get(INTERNAL_KEYS.language), undefined, 'internal key, never shown');
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password', 'number'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
  }
  assert.ok(
    config.get('intro').links.some((link) => link.url.startsWith('https://docs.ovhcloud.com/')),
    'the DynHost guide',
  );
});

test('the triggers filter by name device, address type and error', () => {
  const triggers = byKey(manifest.scene_triggers);
  for (const key of [TRIGGERS.RECORD_UPDATED, TRIGGERS.UPDATE_FAILED]) {
    assert.equal(byKey(triggers.get(key).fields).get('host').source, 'devices', key);
  }
  for (const key of [TRIGGERS.PUBLIC_IP_CHANGED, TRIGGERS.RECORD_UPDATED]) {
    assert.deepEqual(values(byKey(triggers.get(key).fields).get('family')), ['ipv4', 'ipv6'], key);
  }
  assert.deepEqual(values(byKey(triggers.get(TRIGGERS.UPDATE_FAILED).fields).get('error')), ERRORS);
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields) {
      assert.notEqual(field.type, 'boolean', `${trigger.key}.${field.key}`);
      assert.equal(field.required, false, `${trigger.key}.${field.key}`);
    }
  }
  const variables = (key) => triggers.get(key).variables.map((variable) => variable.key);
  assert.deepEqual(variables(TRIGGERS.PUBLIC_IP_CHANGED), ['family', 'previous_ip', 'ip']);
  assert.deepEqual(variables(TRIGGERS.RECORD_UPDATED), ['hostname', 'family', 'ip', 'previous_ip']);
  assert.deepEqual(variables(TRIGGERS.UPDATE_FAILED), [
    'hostname',
    'family',
    'ip',
    'error',
    'message',
  ]);
});

test('the scene actions: fields and outputs of the code', () => {
  const actions = byKey(manifest.scene_actions);
  for (const [key, outputs] of Object.entries(OUTPUTS)) {
    assert.deepEqual(
      actions.get(key).outputs.map((output) => output.key),
      outputs,
      key,
    );
  }
  const update = byKey(actions.get(SCENE_ACTIONS.UPDATE_NOW).fields);
  assert.equal(update.get('host').source, 'devices');
  assert.equal(update.get('host').required, false);
  assert.equal(update.get('force').default, false);
  assert.equal(actions.get(SCENE_ACTIONS.GET_PUBLIC_IP).fields, undefined);
});

test('limits of the store: counts, timeouts, sizes', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const field of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    for (const language of LANGUAGES) {
      assert.ok((field.description?.[language] ?? '').length <= 1000, `${field.key}.${language}`);
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog keywords; worldwide, so no countries', () => {
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10, 'one to ten keywords');
  keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword));
  assert.equal(new Set(keywords).size, keywords.length, 'unique once trimmed and lowercased');
  assert.equal(manifest.countries, undefined, 'OVHcloud domains are worldwide');
});
