// -----------------------------------------------------------------------------
// Entry point of the OVHcloud DynHost external integration.
//
// Keeps DynHost names of an OVHcloud domain pointed at the public address of
// the home (dynamic DNS), through the official DynHost endpoint:
//   - devices: one per name, its IPv4 / IPv6 addresses, status and number of
//     changes (src/device.js);
//   - scene triggers: public address changed, record updated, update failed;
//   - scene actions: update now, read the public address;
//   - dashboard widget: the public address and every record.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the OVHcloud DynHost integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
