// -----------------------------------------------------------------------------
// The public address of the home, read on echo services that answer the
// address a request comes from, in plain text. Each family has its own
// services, reachable over that family only (an A-only name for IPv4, an
// AAAA-only name for IPv6), tried in order until one answers a valid
// address: one failing service never stops the updates.
//
// And the address a DynHost name points to now, from the DNS resolver of the
// container: a name already right needs no call to OVHcloud.
// -----------------------------------------------------------------------------

import { isIPv4, isIPv6 } from 'node:net';
import { Resolver } from 'node:dns/promises';

const SERVICES = {
  ipv4: ['https://api.ipify.org', 'https://ipv4.icanhazip.com', 'https://v4.ident.me'],
  ipv6: ['https://api6.ipify.org', 'https://ipv6.icanhazip.com', 'https://v6.ident.me'],
};
// Without an IPv6 route, each IPv6 service only fails at its timeout: three of
// them must stay far below the 60 s of a scene action.
const TIMEOUT_MS = 5000;
const VALID = { ipv4: isIPv4, ipv6: isIPv6 };

/**
 * @description Whether an IPv4 address is private, shared or reserved: never
 * the public address of a home (an echo service answering one is wrong).
 * @param {string} ip - An IPv4 address.
 * @returns {boolean} True for 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
 * 192.168/16, 0/8 and 224/3.
 */
function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * @description Read an address answered by an echo service.
 * @param {string} family - `ipv4` or `ipv6`.
 * @param {string} body - The answer.
 * @returns {string} The address, '' when the answer is none.
 * @example
 * readAddress('ipv4', '203.0.113.7\n'); // -> '203.0.113.7'
 */
function readAddress(family, body) {
  const value = String(body ?? '')
    .trim()
    .toLowerCase();
  if (!VALID[family](value)) {
    return '';
  }
  if (family === 'ipv4' && isPrivateIPv4(value)) {
    return '';
  }
  if (family === 'ipv6' && /^(::1?$|fe[89ab]|f[cd]|::ffff:)/.test(value)) {
    return '';
  }
  return value;
}

/**
 * @description The reader of the public address.
 * @param {object} [options] - `{ fetch, services, resolver }` (the tests set them).
 * @returns {object} `{ publicAddress, resolve }`.
 */
function createAddressReader({
  fetch: fetchFn = globalThis.fetch,
  services = SERVICES,
  resolver = new Resolver({ timeout: 5000, tries: 2 }),
} = {}) {
  return {
    /**
     * @description The public address of a family.
     * @param {string} family - `ipv4` or `ipv6`.
     * @returns {Promise<{ ip: string, source: string }>} The address and the
     * service that answered it.
     * @throws {Error} When no service answered (`kind: 'no_ip'`).
     */
    async publicAddress(family) {
      const errors = [];
      for (const url of services[family]) {
        try {
          const response = await fetchFn(url, {
            headers: { accept: 'text/plain' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const ip = response.ok ? readAddress(family, await response.text()) : '';
          if (ip) {
            return { ip, source: new URL(url).hostname };
          }
          errors.push(`${new URL(url).hostname}: ${response.ok ? 'no address' : response.status}`);
        } catch (err) {
          errors.push(`${new URL(url).hostname}: ${err.cause?.code ?? err.message}`);
        }
      }
      throw Object.assign(new Error(`No public ${family} address (${errors.join(', ')})`), {
        kind: 'no_ip',
      });
    },
    /**
     * @description The address a name points to now.
     * @param {string} hostname - The name.
     * @param {string} family - `ipv4` or `ipv6`.
     * @returns {Promise<string>} The first address, '' when the name has none
     * or the resolver failed.
     */
    async resolve(hostname, family) {
      try {
        const addresses =
          family === 'ipv6' ? await resolver.resolve6(hostname) : await resolver.resolve4(hostname);
        return String(addresses[0] ?? '').toLowerCase();
      } catch {
        return '';
      }
    },
  };
}

export { SERVICES, isPrivateIPv4, readAddress, createAddressReader };
