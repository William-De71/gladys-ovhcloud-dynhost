# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-28

### Added

- Dynamic DNS for an OVHcloud domain: up to three DynHost names kept pointed at the public address of the home through the official DynHost endpoint, A (IPv4), AAAA (IPv6) or both per name; the second and third names can share the identifier of the first one.
- The public address read on echo services (ipify, icanhazip, ident.me, the next one when one fails) every 1 to 30 minutes, 5 by default; OVHcloud is only called when a record must change, a name changed by hand in the zone is put back a quarter of an hour later, and a refused update is not asked again before the settings or the address change (or 6 hours).
- One device per name: IPv4 and IPv6 addresses confirmed by OVHcloud, status in words and the number of address changes.
- Scene triggers: public address changed, record updated, update failed (once per error, filtered by name, address type and error).
- Scene actions: update now (one name or all, optionally forced), and read the public address to send it in a message.
- Dashboard widget: the public IPv4 / IPv6 and every record with its status, and a button to update now.
- Configuration actions: test the connection (every record sent to OVHcloud), and a diagnostic written to the Logs tab (passwords hidden).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-ovhcloud-dynhost/releases/tag/v0.1.0
