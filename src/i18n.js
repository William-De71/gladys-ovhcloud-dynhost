// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, statuses, the widget, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo, scène / Szene / escena) and of the OVHcloud
// Control Panel (DynHost, identifiant / Kennung / identificador, zone DNS).
// Statuses are widget values too: 40 characters at most.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  hostDeviceName: {
    en: '{hostname} (DynHost)',
    fr: '{hostname} (DynHost)',
    de: '{hostname} (DynHost)',
    es: '{hostname} (DynHost)',
  },
  featureIpv4: {
    en: 'IPv4 address (A record)',
    fr: 'Adresse IPv4 (enregistrement A)',
    de: 'IPv4-Adresse (A-Eintrag)',
    es: 'Dirección IPv4 (registro A)',
  },
  featureIpv6: {
    en: 'IPv6 address (AAAA record)',
    fr: 'Adresse IPv6 (enregistrement AAAA)',
    de: 'IPv6-Adresse (AAAA-Eintrag)',
    es: 'Dirección IPv6 (registro AAAA)',
  },
  featureStatus: {
    en: 'DynHost status',
    fr: 'État du DynHost',
    de: 'DynHost-Status',
    es: 'Estado del DynHost',
  },
  featureChanges: {
    en: 'Address changes',
    fr: 'Changements d’adresse',
    de: 'Adressänderungen',
    es: 'Cambios de dirección',
  },

  // statuses of a record (widget values: 40 characters at most)
  status_ok: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Actualizado' },
  status_pending: {
    en: 'Waiting for the first check',
    fr: 'En attente de la première vérification',
    de: 'Wartet auf die erste Prüfung',
    es: 'Esperando la primera comprobación',
  },
  status_auth: {
    en: 'Identifier or password refused',
    fr: 'Identifiant ou mot de passe refusé',
    de: 'Kennung oder Passwort abgelehnt',
    es: 'Identificador o contraseña rechazados',
  },
  status_nohost: {
    en: 'No DynHost record for this name',
    fr: 'Aucun DynHost pour ce nom',
    de: 'Kein DynHost-Eintrag für diesen Namen',
    es: 'Ningún registro DynHost para este nombre',
  },
  status_notfqdn: {
    en: 'Not a full domain name',
    fr: 'Nom de domaine incomplet',
    de: 'Kein vollständiger Domainname',
    es: 'Nombre de dominio incompleto',
  },
  status_abuse: {
    en: 'Blocked: too many updates',
    fr: 'Bloqué : trop de mises à jour',
    de: 'Gesperrt: zu viele Updates',
    es: 'Bloqueado: demasiadas actualizaciones',
  },
  status_badagent: {
    en: 'Client refused by OVHcloud',
    fr: 'Client refusé par OVHcloud',
    de: 'Client von OVHcloud abgelehnt',
    es: 'Cliente rechazado por OVHcloud',
  },
  status_server: {
    en: 'OVHcloud error, retrying',
    fr: 'Erreur OVHcloud, nouvel essai',
    de: 'OVHcloud-Fehler, neuer Versuch',
    es: 'Error de OVHcloud, reintentando',
  },
  status_network: {
    en: 'OVHcloud unreachable, retrying',
    fr: 'OVHcloud injoignable, nouvel essai',
    de: 'OVHcloud nicht erreichbar, neuer Versuch',
    es: 'OVHcloud inaccesible, reintentando',
  },
  status_no_ip: {
    en: 'Public address unknown',
    fr: 'Adresse publique inconnue',
    de: 'Öffentliche Adresse unbekannt',
    es: 'Dirección pública desconocida',
  },

  // short statuses of the widget rows (beside a long name: 16 characters at most)
  short_ok: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  short_pending: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  short_auth: {
    en: 'Login refused',
    fr: 'Accès refusé',
    de: 'Zugang abgelehnt',
    es: 'Acceso denegado',
  },
  short_nohost: { en: 'Unknown name', fr: 'Nom inconnu', de: 'Name unbekannt', es: 'Nombre ajeno' },
  short_notfqdn: {
    en: 'Incomplete name',
    fr: 'Nom incomplet',
    de: 'Name unvollst.',
    es: 'Nombre parcial',
  },
  short_abuse: { en: 'Blocked', fr: 'Bloqué', de: 'Gesperrt', es: 'Bloqueado' },
  short_badagent: {
    en: 'Client refused',
    fr: 'Client refusé',
    de: 'Client abgelehnt',
    es: 'Cliente denegado',
  },
  short_server: {
    en: 'OVHcloud error',
    fr: 'Erreur OVHcloud',
    de: 'OVHcloud-Fehler',
    es: 'Error OVHcloud',
  },
  short_network: { en: 'Unreachable', fr: 'Injoignable', de: 'Unerreichbar', es: 'Inaccesible' },
  short_no_ip: { en: 'No address', fr: 'Sans adresse', de: 'Keine Adresse', es: 'Sin dirección' },

  // connection status
  statusNoHost: {
    en: 'Enter a DynHost name, its identifier and its password in the configuration.',
    fr: 'Saisissez un nom DynHost, son identifiant et son mot de passe dans la configuration.',
    de: 'Gib in der Konfiguration einen DynHost-Namen, seine Kennung und sein Passwort ein.',
    es: 'Introduce un nombre DynHost, su identificador y su contraseña en la configuración.',
  },
  statusError: {
    en: '{hostname}: {error}.',
    fr: '{hostname} : {error}.',
    de: '{hostname}: {error}.',
    es: '{hostname}: {error}.',
  },
  statusConnected: {
    en: '{count} DynHost name(s) up to date, public address {ip}, checked every {minutes} min.',
    fr: '{count} nom(s) DynHost à jour, adresse publique {ip}, vérifiée toutes les {minutes} min.',
    de: '{count} DynHost-Name(n) aktuell, öffentliche Adresse {ip}, Prüfung alle {minutes} Min.',
    es: '{count} nombre(s) DynHost al día, dirección pública {ip}, comprobada cada {minutes} min.',
  },

  // widget
  widgetHeading: {
    en: 'Public address',
    fr: 'Adresse publique',
    de: 'Öffentliche Adresse',
    es: 'Dirección pública',
  },
  widgetNoHost: {
    en: 'No DynHost name yet: add one in the configuration of the integration.',
    fr: 'Aucun nom DynHost pour l’instant : ajoutez-en un dans la configuration de l’intégration.',
    de: 'Noch kein DynHost-Name: Füge einen in der Konfiguration der Integration hinzu.',
    es: 'Aún no hay ningún nombre DynHost: añade uno en la configuración de la integración.',
  },
  rowPublicIpv4: {
    en: 'Public IPv4',
    fr: 'IPv4 publique',
    de: 'Öffentliche IPv4',
    es: 'IPv4 pública',
  },
  rowPublicIpv6: {
    en: 'Public IPv6',
    fr: 'IPv6 publique',
    de: 'Öffentliche IPv6',
    es: 'IPv6 pública',
  },
  valueUnknown: { en: 'unknown', fr: 'inconnue', de: 'unbekannt', es: 'desconocida' },
  buttonUpdate: {
    en: 'Update now',
    fr: 'Mettre à jour',
    de: 'Jetzt aktualisieren',
    es: 'Actualizar ahora',
  },
  checkedAt: {
    en: 'Checked at {time} · OVHcloud DynHost',
    fr: 'Vérifié à {time} · OVHcloud DynHost',
    de: 'Geprüft um {time} · OVHcloud DynHost',
    es: 'Comprobado a las {time} · OVHcloud DynHost',
  },
  notChecked: {
    en: 'Not checked yet · OVHcloud DynHost',
    fr: 'Pas encore vérifié · OVHcloud DynHost',
    de: 'Noch nicht geprüft · OVHcloud DynHost',
    es: 'Aún sin comprobar · OVHcloud DynHost',
  },
  toastChecked: {
    en: 'DynHost: {updated} updated, {unchanged} already right, {failed} failed.',
    fr: 'DynHost : {updated} mis à jour, {unchanged} déjà à jour, {failed} en échec.',
    de: 'DynHost: {updated} aktualisiert, {unchanged} schon aktuell, {failed} fehlgeschlagen.',
    es: 'DynHost: {updated} actualizados, {unchanged} ya al día, {failed} con error.',
  },

  // scene summaries and configuration actions
  resultLine: {
    en: '{record}: {state}',
    fr: '{record} : {state}',
    de: '{record}: {state}',
    es: '{record}: {state}',
  },
  lineUpdated: {
    en: 'updated to {ip}',
    fr: 'mis à jour vers {ip}',
    de: 'aktualisiert auf {ip}',
    es: 'actualizado a {ip}',
  },
  lineUnchanged: {
    en: 'already {ip}',
    fr: 'déjà {ip}',
    de: 'bereits {ip}',
    es: 'ya {ip}',
  },
  summaryCheck: {
    en: 'DynHost: {updated} updated, {unchanged} already right, {failed} failed.\n{lines}',
    fr: 'DynHost : {updated} mis à jour, {unchanged} déjà à jour, {failed} en échec.\n{lines}',
    de: 'DynHost: {updated} aktualisiert, {unchanged} schon aktuell, {failed} fehlgeschlagen.\n{lines}',
    es: 'DynHost: {updated} actualizados, {unchanged} ya al día, {failed} con error.\n{lines}',
  },
  summaryPublic: {
    en: 'Public address: IPv4 {ipv4}, IPv6 {ipv6}.',
    fr: 'Adresse publique : IPv4 {ipv4}, IPv6 {ipv6}.',
    de: 'Öffentliche Adresse: IPv4 {ipv4}, IPv6 {ipv6}.',
    es: 'Dirección pública: IPv4 {ipv4}, IPv6 {ipv6}.',
  },
  testOk: {
    en: 'OVHcloud accepted every record:\n{lines}',
    fr: 'OVHcloud a accepté chaque enregistrement :\n{lines}',
    de: 'OVHcloud hat jeden Eintrag angenommen:\n{lines}',
    es: 'OVHcloud aceptó cada registro:\n{lines}',
  },
  testFailed: {
    en: 'Some records failed:\n{lines}',
    fr: 'Certains enregistrements ont échoué :\n{lines}',
    de: 'Einige Einträge sind fehlgeschlagen:\n{lines}',
    es: 'Algunos registros han fallado:\n{lines}',
  },
  diagnosticDone: {
    en: 'Diagnostic written in the logs of the integration ({count} line(s) "DynHost diagnostic"), passwords hidden.',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s) « DynHost diagnostic »), mots de passe masqués.',
    de: 'Diagnose in die Protokolle der Integration geschrieben ({count} Zeile(n) „DynHost diagnostic“), Passwörter verborgen.',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s) «DynHost diagnostic»), contraseñas ocultas.',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('status_ok', 'fr'); // -> 'À jour'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

export { LANGUAGES, TEXTS, isLanguage, t, all };
