// Stands in for Stronghold's shared/i18n.js (兼容-2): the names its battle content imports. A message is the Chinese
// text with its parameters, as Stronghold builds it (`msg`), and a game-data name is marked for the name resolver
// (`dn`); both are plain data, never translated here — the content only hands them on (toasts, labels).

/** A message: its Chinese text (the message id) and its parameters. @param {unknown} msgid @param {unknown} [params] */
export const msg = (msgid, params) => ({ msgid: String(msgid), params });

/** A game-data name, for the name resolver. @param {unknown} name */
export const dn = (name) => ({ dn: name == null ? '' : String(name) });
