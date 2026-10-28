// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Two moments of the DynHost widget, through the real widget builder
// (src/widgets.js): every record up to date after the provider changed the
// public address, and a morning where the identifier of one name was refused
// and the IPv6 of the line was not reachable. Documentation addresses only
// (203.0.113.0/24, 2001:db8::/32), never a real one.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildStatusWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Wednesday 28 October 2026, 11:00 in Paris.
const NOW = Date.parse('2026-10-28T10:00:00Z');
const TZ = 'Europe/Paris';
const IPV4 = '203.0.113.7';
const IPV6 = '2001:db8:85a3::8a2e:370:7334';

const hosts = [
  { hostname: 'home.example.com', families: ['ipv4', 'ipv6'] },
  { hostname: 'nas.example.com', families: ['ipv4'] },
  { hostname: 'cam.example.org', families: ['ipv4'] },
];
const healthy = {
  'home.example.com|ipv4': { ip: IPV4 },
  'home.example.com|ipv6': { ip: IPV6 },
  'nas.example.com|ipv4': { ip: IPV4 },
  'cam.example.org|ipv4': { ip: IPV4 },
};
const troubled = {
  ...healthy,
  'home.example.com|ipv6': { ip: IPV6, error: 'no_ip' },
  'cam.example.org|ipv4': { ip: '', error: 'auth' },
};

const contents = {};
for (const language of LANGUAGES) {
  const build = (records, publicIps) =>
    buildStatusWidget({
      hosts,
      publicIps,
      recordOf: (hostname, family) => records[`${hostname}|${family}`],
      checkedAt: NOW,
      language,
      timeZone: TZ,
    });
  contents[language] = {
    status: build(healthy, { ipv4: { ip: IPV4 }, ipv6: { ip: IPV6 } }),
    trouble: build(troubled, { ipv4: { ip: IPV4 }, ipv6: { error: 'no_ip' } }),
  };
}

const [widget] = manifest.widgets;
const meta = { icon: widget.icon, label: widget.label };
writeFileSync(
  out,
  JSON.stringify({ now: NOW, widgets: { status: meta, trouble: meta }, contents, images: {} }),
);
