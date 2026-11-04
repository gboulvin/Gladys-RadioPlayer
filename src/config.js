// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never has to deal
// with `undefined` or with numbers arriving as strings.
// -----------------------------------------------------------------------------

import { COUNTRY_CODES, DEFAULT_COUNTRY } from './countries.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // ISO 3166-1 alpha-2 code of the catalog country.
  country: DEFAULT_COUNTRY,
  // Volume applied when a station starts, in percent. 0 keeps the player's.
  start_volume: 0,
  // Many network speakers cannot play HLS (.m3u8) streams: hide those
  // stations from the catalog by default.
  exclude_hls: true,
  // Play the MP3 version of a station when one exists: MP3 is the one format
  // every speaker decodes (Android TV refuses raw AAC, old DLNA renderers
  // refuse AAC or Ogg). The original stream stays the fallback.
  prefer_mp3: true,
  // Discovery of the players on the local network.
  enable_upnp: true,
  enable_cast: true,
  // Players discovery cannot find (another subnet, mDNS/SSDP filtered):
  // comma-separated IP addresses of Google Cast devices, or http URLs of
  // UPnP/DLNA device descriptions.
  manual_players: '',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const country = String(raw.country ?? DEFAULT_CONFIG.country).toUpperCase();
  const startVolume = Number(raw.start_volume ?? DEFAULT_CONFIG.start_volume);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    country: COUNTRY_CODES.includes(country) ? country : DEFAULT_COUNTRY,
    start_volume: Number.isFinite(startVolume) ? clamp(Math.round(startVolume), 0, 100) : 0,
    exclude_hls: toBoolean(raw.exclude_hls, DEFAULT_CONFIG.exclude_hls),
    prefer_mp3: toBoolean(raw.prefer_mp3, DEFAULT_CONFIG.prefer_mp3),
    enable_upnp: toBoolean(raw.enable_upnp, DEFAULT_CONFIG.enable_upnp),
    enable_cast: toBoolean(raw.enable_cast, DEFAULT_CONFIG.enable_cast),
    manual_players: String(raw.manual_players ?? ''),
  };
}

/**
 * Parse the `manual_players` field: "192.168.1.20, http://192.168.1.30:1400/xml/device_description.xml"
 * -> [{ kind: 'cast', host }, { kind: 'upnp', location }]. Anything else is ignored.
 * @param {string} value
 */
export function parseManualPlayers(value) {
  const entries = String(value ?? '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const players = [];
  for (const entry of entries) {
    if (/^https?:\/\//i.test(entry)) {
      try {
        players.push({ kind: 'upnp', location: new URL(entry).toString() });
      } catch {
        // Not a URL: ignored.
      }
    } else if (/^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/.test(entry)) {
      const [host, port] = entry.split(':');
      players.push({ kind: 'cast', host, port: port ? Number(port) : 8009 });
    }
  }
  return players;
}
