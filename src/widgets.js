// -----------------------------------------------------------------------------
// Dashboard widget of the OVHcloud DynHost integration.
//
//   - `status`   the public address of the home (IPv4, and IPv6 when a name
//                follows it), then each record of each name with its status
//                in a word, a button to update now and the time of the last
//                check.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { recordStatus } from './device.js';

const WIDGETS = { STATUS: 'status' };
const WIDGET_ACTIONS = { UPDATE: 'update' };
const TTL_SECONDS = { content: 300, message: 300 };
// The name of a record type, as the DNS zone of OVHcloud shows it.
const RECORD_TYPES = { ipv4: 'A', ipv6: 'AAAA' };
const COLORS = { ok: WIDGET_COLORS.SUCCESS, pending: WIDGET_COLORS.WARNING };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A time of day: "22:51".
 * @param {number} at - Epoch milliseconds.
 * @param {string} [timeZone] - The time zone.
 * @returns {string} The time.
 */
function formatTime(at, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(at));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description "home.example.com (A)", the start of a long name cut so the
 * record type always shows.
 * @param {string} hostname - The name.
 * @param {string} family - `ipv4` or `ipv6`.
 * @returns {string} The label, 40 characters at most.
 */
function recordLabel(hostname, family) {
  const suffix = ` (${RECORD_TYPES[family]})`;
  return `${clip(hostname, 40 - suffix.length)}${suffix}`;
}

/**
 * @description The "status" widget.
 * @param {object} options - `{ hosts, publicIps, recordOf, checkedAt,
 * language, timeZone }`: `hosts` the configured names, `publicIps` per family
 * `{ ip }` or an error `{ error }`, `recordOf(hostname, family)` the stored
 * record, `checkedAt` the time of the last check (0 before the first one).
 * @returns {object} The content.
 */
function buildStatusWidget({ hosts, publicIps, recordOf, checkedAt, language, timeZone }) {
  if (hosts.length === 0) {
    return messageContent(t('widgetNoHost', language));
  }
  const families = ['ipv4', 'ipv6'].filter((family) =>
    hosts.some((host) => host.families.includes(family)),
  );
  const items = families.map((family) => {
    const ip = publicIps[family]?.ip;
    return {
      label: t(family === 'ipv4' ? 'rowPublicIpv4' : 'rowPublicIpv6', language),
      value: ip || t('valueUnknown', language),
      icon: 'globe',
      color: ip ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.DANGER,
    };
  });
  for (const host of hosts) {
    for (const family of host.families) {
      const record = recordOf(host.hostname, family);
      const status = recordStatus(record);
      items.push({
        label: recordLabel(host.hostname, family),
        // The address is in the rows above: a short status leaves room for the name.
        value: t(`short_${status}`, language),
        color: COLORS[status] ?? WIDGET_COLORS.DANGER,
      });
    }
  }
  return {
    ttl_seconds: TTL_SECONDS.content,
    components: [
      { type: 'text', variant: 'heading', text: t('widgetHeading', language) },
      { type: 'status', items: items.slice(0, 10) },
      {
        type: 'button',
        label: t('buttonUpdate', language),
        icon: 'refresh-cw',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.UPDATE },
      },
      {
        type: 'text',
        variant: 'caption',
        text: checkedAt
          ? t('checkedAt', language, { time: formatTime(checkedAt, timeZone) })
          : t('notChecked', language),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  TTL_SECONDS,
  RECORD_TYPES,
  clip,
  formatTime,
  messageContent,
  recordLabel,
  buildStatusWidget,
};
