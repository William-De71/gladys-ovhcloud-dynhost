# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for OVHcloud DynHost (dynamic
DNS): a Node.js service (Node 22+, ESM, no build step) that runs in its own
sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It keeps up to three DynHost names of an
OVHcloud domain pointed at the public address of the home through the official
DynHost endpoint (`GET https://dns.eu.ovhapis.com/nic/update?system=dyndns&hostname=…&myip=…`,
Basic authentication with the DynHost identifier, dyndns2 answers `good` /
`nochg` / codes, HTTP 401 for a wrong identifier; guide
https://docs.ovhcloud.com/fr/guides/web-cloud/domains/dns-dynhost). The public
address is read on echo services (ipify, icanhazip, ident.me, an A-only and an
AAAA-only name per family). Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer, the check, the scene actions
src/dynhost-api.js      the DynHost endpoint: Basic auth, User-Agent, answers -> { result } or err.kind
src/public-ip.js        public address on echo services (fallbacks, private ranges refused), DNS resolution
src/device.js           one device per name and its states; record and host statuses
src/events.js           scene trigger keys and data, scene action outputs
src/widgets.js          the status dashboard widget
src/store.js            /data/dynhost.json: `public`, `records`
src/config.js           configuration (3 slots: name, identifier, password, records; interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`host:<name>`, the DynHost name in lowercase, never
  the slot), feature `category` / `type` / `unit` / `min` / `max` / `step`,
  the keys of `config_schema` and their option values, `actions`, the widget,
  scene triggers (fields, options, variables) and scene actions (fields,
  outputs), and the internal config key `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** Addresses and status are `text` / `text`; the
  number of changes is `counter-sensor` / `integer`. An address OVHcloud has
  not confirmed is never published.
- **`should_poll` stays false**: the integration checks on its own timer
  (`interval`, 1 to 30 min, 5 by default).
- **Be kind to OVHcloud**, it blocks clients that insist (`abuse`): a record
  is sent only when the public address differs from the one OVHcloud last
  confirmed, or the name still resolves elsewhere 15 min after (`DRIFT_MS`);
  never twice within `MIN_GAP_MS` (1 min), even forced; a refused update
  (`FATAL_KINDS`) is asked again only when the settings or the address
  change, or after 6 h. A first check adopts a name already right, no call.
- **Passwords are secrets.** Never log them (the diagnostic shows their
  length), never put them in an error message, a URL, a widget or `/data`:
  the fingerprint of refused settings lives in memory only.
- **Events once.** `public` (in /data) keeps the last public address per
  family: the first reading is a baseline, a restart never fires the same
  change twice. `update_failed` fires on a transition to an error, not at
  every check. A scene action fires nothing (no loops) and leaves `public`
  untouched, so the next check still fires the change it saw.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Statuses are widget values: 40
  characters at most, the short ones 16.
- **Widget images.** After any change to the content of the widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files. They
  use documentation addresses only (203.0.113.0/24, 2001:db8::/32).
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords`). Transport: `["cloud"]`. No permission. Three secrets
  (`password_1..3`), no `countries` (OVHcloud domains are worldwide).
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`test/helpers/fixtures.js`: a
  fake network answering like OVHcloud and the echo services, a fake
  resolver).
