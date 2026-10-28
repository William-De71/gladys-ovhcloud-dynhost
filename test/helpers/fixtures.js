// A fake network for the tests, served through the `fetch` option of the
// integration: the echo services answer the public address of the home in
// plain text, and the DynHost endpoint of OVHcloud answers like the real one
// (`good <ip>`, `nochg <ip>`, a dyndns2 code, or HTTP 401 with the JSON body
// observed on 2026-10-28 for a wrong identifier). A fake resolver stands for
// the DNS. Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-28T10:00:00Z');
const TZ = 'Europe/Paris';
const HOSTNAME = 'home.example.com';
const LOGIN = 'example.com-home';
const PASSWORD = 's3cret-Pa55';
const IPV4 = '203.0.113.7';
const IPV4_NEW = '198.51.100.23';
const IPV6 = '2001:db8:85a3::8a2e:370:7334';
const OVH = 'https://dns.eu.ovhapis.com/nic/update';
const SERVICES = {
  ipv4: ['https://api.ipify.org', 'https://ipv4.icanhazip.com'],
  ipv6: ['https://api6.ipify.org', 'https://ipv6.icanhazip.com'],
};

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'dynhost-')), 'dynhost.json');

/**
 * @description A Gladys client enough for building devices.
 */
const fakeGladys = {
  externalIds(type, key) {
    const device = `ext:ovhcloud-dynhost:${type}:${key}`;
    return { device, feature: (feature) => `${device}:${feature}` };
  },
};

/**
 * @description A text answer.
 * @param {number} status - The HTTP status.
 * @param {string} body - The body.
 * @param {string} [type] - The content type.
 * @returns {Response} The answer.
 */
const answer = (status, body, type = 'text/plain') =>
  new Response(body, { status, headers: { 'content-type': type } });

/**
 * @description The fake network.
 * @returns {Function} A `fetch`, with `calls` (the OVHcloud calls:
 * `{ hostname, myip, login, password }`), `echoes` (the echo services asked),
 * `public` (the address per family the echo services answer, '' for none),
 * `records` (what OVHcloud holds, `<hostname>|<family>` → address),
 * `accounts` (identifier → `{ password, hosts }`), `down` (echo services that
 * fail) and `ovh` (null, `'down'`, `'error'`, `'abuse'`, `'911'`).
 */
function fakeNet() {
  const net = async (url, init = {}) => {
    const { origin, searchParams } = new URL(url);
    if (url.startsWith(OVH)) {
      if (net.ovh === 'down') {
        throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
      }
      const [scheme, encoded] = String(init.headers?.authorization ?? '').split(' ');
      const [login, password] =
        scheme === 'Basic' ? Buffer.from(encoded, 'base64').toString().split(':') : [];
      const hostname = searchParams.get('hostname');
      const myip = searchParams.get('myip');
      net.calls.push({ hostname, myip, login, password, agent: init.headers?.['user-agent'] });
      const account = net.accounts[login];
      if (!account || account.password !== password) {
        return answer(
          401,
          '{"class":"Client::Unauthorized","message":"Unauthorized"}',
          'application/json; charset=utf-8',
        );
      }
      if (net.ovh === 'error') {
        return answer(502, '<html>Bad gateway</html>', 'text/html');
      }
      if (net.ovh === 'abuse' || net.ovh === '911') {
        return answer(200, net.ovh);
      }
      if (!account.hosts.includes(hostname)) {
        return answer(200, 'nohost');
      }
      const family = myip.includes(':') ? 'ipv6' : 'ipv4';
      const key = `${hostname}|${family}`;
      if (net.records[key] === myip) {
        return answer(200, `nochg ${myip}`);
      }
      net.records[key] = myip;
      return answer(200, `good ${myip}`);
    }
    const family = Object.keys(SERVICES).find((name) => SERVICES[name].includes(origin));
    if (family) {
      net.echoes.push(origin);
      if (net.down.includes(origin)) {
        throw new TypeError('fetch failed', {
          cause: Object.assign(new Error('x'), { code: 'ETIMEDOUT' }),
        });
      }
      return net.public[family]
        ? answer(200, `${net.public[family]}\n`)
        : answer(503, 'Service Unavailable');
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  net.calls = [];
  net.echoes = [];
  net.public = { ipv4: IPV4, ipv6: IPV6 };
  net.records = {};
  net.accounts = { [LOGIN]: { password: PASSWORD, hosts: [HOSTNAME, 'nas.example.com'] } };
  net.down = [];
  net.ovh = null;
  return net;
}

/**
 * @description A fake DNS resolver: the records OVHcloud holds, unless the
 * test sets its own answers (`zone`, `<hostname>|<family>` → address).
 * @param {object} net - The fake network.
 * @returns {object} `{ resolve4, resolve6, zone, asked }`.
 */
function fakeResolver(net) {
  const resolver = {
    zone: null,
    asked: [],
    async lookup(hostname, family) {
      resolver.asked.push(`${hostname}|${family}`);
      const zone = resolver.zone ?? net.records;
      const ip = zone[`${hostname}|${family}`];
      if (!ip) {
        throw Object.assign(new Error(`queryA ENODATA ${hostname}`), { code: 'ENODATA' });
      }
      return [ip];
    },
    resolve4: (hostname) => resolver.lookup(hostname, 'ipv4'),
    resolve6: (hostname) => resolver.lookup(hostname, 'ipv6'),
  };
  return resolver;
}

export {
  NOW,
  TZ,
  HOSTNAME,
  LOGIN,
  PASSWORD,
  IPV4,
  IPV4_NEW,
  IPV6,
  OVH,
  SERVICES,
  silent,
  storePath,
  fakeGladys,
  fakeNet,
  fakeResolver,
};
