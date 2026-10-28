// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to.
//
// test/fixtures/discovery.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would have to delete
// and recreate a device, or would lose a scene or a widget setting: never
// update the baseline without a documented migration. To write it again on
// purpose: BASELINE=write node --test test/structure.test.js
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { buildHostDevice } from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, HOSTNAME } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const BASELINE = new URL('./fixtures/discovery.baseline.json', import.meta.url);
const manifest = read('../gladys-assistant-integration.json');

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));
const shape = (device) => ({
  external_id: device.external_id,
  should_poll: device.should_poll,
  params: device.params.map((param) => param.name),
  features: device.features.map(pick),
});
const options = (field) => (field.options ?? []).map((option) => option.value);

/**
 * @description Every kind of device, in a language.
 * @param {string} language - The language.
 * @returns {object} The devices, by kind.
 */
const devices = (language) => ({
  ipv4: shape(buildHostDevice(fakeGladys, { hostname: HOSTNAME, families: ['ipv4'] }, language)),
  ipv6: shape(buildHostDevice(fakeGladys, { hostname: HOSTNAME, families: ['ipv6'] }, language)),
  both: shape(
    buildHostDevice(fakeGladys, { hostname: HOSTNAME, families: ['ipv4', 'ipv6'] }, language),
  ),
});

/**
 * @description The keys of the manifest users store.
 * @returns {object} The keys.
 */
const manifestKeys = () => ({
  actions: keys(manifest.actions),
  config_schema: manifest.config_schema.map((field) => ({
    key: field.key,
    type: field.type,
    options: options(field),
  })),
  scene_triggers: manifest.scene_triggers.map((trigger) => ({
    key: trigger.key,
    fields: trigger.fields.map((field) => ({ key: field.key, options: options(field) })),
    variables: trigger.variables.map(({ key, type }) => ({ key, type })),
  })),
  scene_actions: manifest.scene_actions.map((action) => ({
    key: action.key,
    fields: (action.fields ?? []).map((field) => ({ key: field.key, options: options(field) })),
    outputs: action.outputs.map(({ key, type }) => ({ key, type })),
  })),
  widgets: manifest.widgets.map((widget) => ({
    key: widget.key,
    settings: keys(widget.settings),
  })),
});

if (process.env.BASELINE === 'write') {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ devices: devices('en'), manifest: manifestKeys() }, null, 2)}\n`,
  );
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

test('the devices keep their external ids and the fields Discovery compares, in every language', () => {
  for (const language of LANGUAGES) {
    assert.deepEqual(devices(language), baseline.devices, language);
  }
});

test('no configuration action disappears', () => {
  assert.deepEqual(
    keys(manifest.actions).filter((key) => baseline.manifest.actions.includes(key)),
    baseline.manifest.actions,
  );
});

test('no configuration key disappears, changes type or loses an option', () => {
  const current = byKey(manifest.config_schema);
  for (const { key, type, options: before } of baseline.manifest.config_schema) {
    assert.equal(current.get(key)?.type, type, `config_schema.${key}`);
    const now = options(current.get(key));
    before.forEach((value) => assert.ok(now.includes(value), `${key}: ${value}`));
  }
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, options: before } of trigger.fields) {
      assert.ok(fields.has(key), `${trigger.key}.fields.${key}`);
      const values = options(fields.get(key));
      before.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields, options and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    const fields = byKey(now.fields);
    for (const { key, options: before } of action.fields) {
      assert.ok(fields.has(key), `${action.key}.${key}`);
      const values = options(fields.get(key));
      before.forEach((value) =>
        assert.ok(values.includes(value), `${action.key}.${key}: ${value}`),
      );
    }
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
  }
});

test('widgets keep their keys and settings', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = current.get(widget.key);
    assert.ok(now, `widgets.${widget.key}`);
    for (const key of widget.settings) {
      assert.ok(byKey(now.settings).has(key), `${widget.key}.settings.${key}`);
    }
  }
});
