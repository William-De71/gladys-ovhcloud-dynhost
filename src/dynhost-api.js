// -----------------------------------------------------------------------------
// The DynHost update endpoint of OVHcloud.
//
//   GET https://dns.eu.ovhapis.com/nic/update?system=dyndns&hostname=<name>&myip=<ip>
//   Authorization: Basic <DynHost identifier>:<password>
//
// documented at https://docs.ovhcloud.com/fr/guides/web-cloud/domains/dns-dynhost
// (www.ovh.com/nic/update, the older address, answers the same). The answer
// is the dyndns2 one: `good <ip>` (record changed), `nochg <ip>` (already
// right), or a code (`nohost`, `notfqdn`, `abuse`, `badagent`, `911`…). A
// wrong identifier or password is an HTTP 401 with a JSON body
// (`{"class":"Client::Unauthorized"}`), checked on 2026-10-28. The endpoint is
// reachable over IPv4 only: `myip` is always sent, so an AAAA record is set
// to the IPv6 address read on the IPv6 echo services.
//
// Error kinds (`err.kind`): `auth` (identifier refused), `nohost` (no such
// DynHost record for this identifier), `notfqdn` (not a full name), `abuse`
// (blocked for too many updates), `badagent`, `server` (OVHcloud failed),
// `network` (unreachable).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL = 'https://dns.eu.ovhapis.com/nic/update';
const TIMEOUT_MS = 15000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const USER_AGENT = `gladys-ovhcloud-dynhost/${VERSION} (+https://github.com/William-De71/gladys-ovhcloud-dynhost)`;
// Codes that will not heal by asking again with the same settings.
const FATAL_KINDS = ['auth', 'nohost', 'notfqdn', 'abuse', 'badagent'];
const CODES = {
  badauth: 'auth',
  nohost: 'nohost',
  notfqdn: 'notfqdn',
  abuse: 'abuse',
  badagent: 'badagent',
  911: 'server',
  dnserr: 'server',
};

/**
 * @description An error with its kind.
 * @param {string} kind - The kind.
 * @param {string} message - The message (never a password).
 * @returns {Error} The error.
 */
const failure = (kind, message) => Object.assign(new Error(message), { kind });

/**
 * @description Read the answer of the endpoint.
 * @param {number} status - The HTTP status.
 * @param {string} body - The body.
 * @returns {{ result: 'good'|'nochg', ip: string }} The success.
 * @throws {Error} With a `kind` for any other answer.
 * @example
 * parseAnswer(200, 'nochg 203.0.113.7'); // -> { result: 'nochg', ip: '203.0.113.7' }
 */
function parseAnswer(status, body) {
  const text = String(body ?? '').trim();
  if (status === 401 || status === 403) {
    throw failure('auth', `HTTP ${status}: identifier or password refused`);
  }
  const success = /^(good|nochg)\b\s*(\S*)/m.exec(text);
  if (status >= 200 && status < 300 && success) {
    return { result: success[1], ip: success[2] };
  }
  const code = /^([a-z0-9]+)\b/i.exec(text)?.[1]?.toLowerCase();
  if (code && CODES[code]) {
    throw failure(CODES[code], `OVHcloud answered "${text.slice(0, 80)}"`);
  }
  // Errors of the API gateway come as JSON: {"class":"…","message":"…"}.
  let message = text;
  try {
    const json = JSON.parse(text);
    message = [json.class, json.message].filter(Boolean).join(': ') || text;
  } catch {
    // Not JSON: the text itself.
  }
  if (status === 404 || /not ?found|nohost/i.test(message)) {
    throw failure('nohost', `HTTP ${status}: ${message.slice(0, 80)}`);
  }
  if (status === 429) {
    throw failure('abuse', `HTTP 429: ${message.slice(0, 80)}`);
  }
  throw failure('server', `HTTP ${status}: ${message.slice(0, 80) || 'unexpected answer'}`);
}

/**
 * @description The client of the endpoint.
 * @param {object} [options] - `{ fetch, baseUrl }` (the tests set them).
 * @returns {object} `{ update, requests }`.
 */
function createDynHostClient({ fetch: fetchFn = globalThis.fetch, baseUrl = BASE_URL } = {}) {
  const client = {
    // Requests sent since the start, for the diagnostic.
    requests: 0,
    /**
     * @description Point a record at an address.
     * @param {object} host - `{ hostname, login, password }`.
     * @param {string} ip - The IPv4 or IPv6 address.
     * @returns {Promise<{ result: string, ip: string }>} The success.
     * @throws {Error} With a `kind`.
     */
    async update({ hostname, login, password }, ip) {
      const url = new URL(baseUrl);
      url.search = new URLSearchParams({ system: 'dyndns', hostname, myip: ip }).toString();
      const credentials = Buffer.from(`${login}:${password}`).toString('base64');
      client.requests += 1;
      let response;
      try {
        response = await fetchFn(url.toString(), {
          headers: {
            authorization: `Basic ${credentials}`,
            'user-agent': USER_AGENT,
            accept: 'text/plain, application/json',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw failure('network', `OVHcloud unreachable: ${err.cause?.message ?? err.message}`);
      }
      return parseAnswer(response.status, await response.text().catch(() => ''));
    },
  };
  return client;
}

export { BASE_URL, USER_AGENT, FATAL_KINDS, parseAnswer, createDynHostClient };
