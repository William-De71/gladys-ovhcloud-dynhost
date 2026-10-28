// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/dynhost.json (the only
// writable place of the container):
//   - `public`    per family (`ipv4`, `ipv6`): the last public address read
//                 and when it changed, so a restart never fires "public
//                 address changed" again and the first reading is a baseline;
//   - `records`   per record (`<hostname>|<family>`): the address OVHcloud
//                 confirmed (`ip`, `at`), the last call (`sentAt`), the last
//                 error (`error`, `message`, `errorAt`, `errorIp`) and the
//                 number of changes applied (`changes`). A refused update is
//                 not asked again in a loop, and a record already right is
//                 never sent again after a restart.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/dynhost.json';
const EMPTY = () => ({ public: {}, records: {} });

/**
 * @description The key of a record.
 * @param {string} hostname - The name.
 * @param {string} family - `ipv4` or `ipv6`.
 * @returns {string} "home.example.com|ipv4".
 */
const recordKey = (hostname, family) => `${hostname}|${family}`;

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save, record }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) =>
          value[name] && typeof value[name] === 'object' && !Array.isArray(value[name])
            ? value[name]
            : {};
        store.data = { public: part('public'), records: part('records') };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
    /**
     * @description The state of a record, created empty when unknown.
     * @param {string} hostname - The name.
     * @param {string} family - `ipv4` or `ipv6`.
     * @returns {object} `{ ip, at, sentAt, error, message, errorAt, errorIp, changes }`.
     */
    record(hostname, family) {
      const key = recordKey(hostname, family);
      const current = store.data.records[key];
      if (!current || typeof current !== 'object') {
        store.data.records[key] = { ip: '', at: 0, sentAt: 0, error: '', changes: 0 };
      }
      return store.data.records[key];
    },
  };
  return store;
}

export { DEFAULT_PATH, recordKey, createStore };
