// -----------------------------------------------------------------------------
// Radio catalog: the community Radio Browser directory (https://www.radio-browser.info).
//
// Free, open data, no account and no API key: tens of thousands of web radios
// with their country, genres, codec and stream URL. The integration only
// reads it, filtered by the country chosen in the configuration.
//
// API etiquette (https://api.radio-browser.info): pick a server from the
// live server list, send a descriptive User-Agent, and call /json/url/<uuid>
// when a station is played (it counts the click, which ranks the stations).
// Answers are cached in memory a few minutes to keep the load low.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'catalog' });

const SERVER_LIST_URL = 'https://all.api.radio-browser.info/json/servers';
// Used when the server list itself cannot be fetched.
const FALLBACK_SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info'];
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
// A stream probe only reads the response headers.
const PROBE_TIMEOUT_MS = 3000;

// Genre folders of the music browser. The value is the Radio Browser tag.
export const GENRES = [
  { tag: 'news', label: { en: 'News', fr: 'Info', de: 'Nachrichten', es: 'Noticias' } },
  { tag: 'talk', label: { en: 'Talk', fr: 'Talk & débats', de: 'Talk', es: 'Tertulias' } },
  { tag: 'pop', label: { en: 'Pop', fr: 'Pop', de: 'Pop', es: 'Pop' } },
  { tag: 'rock', label: { en: 'Rock', fr: 'Rock', de: 'Rock', es: 'Rock' } },
  { tag: 'oldies', label: { en: 'Oldies', fr: 'Années 60-80', de: 'Oldies', es: 'Clásicos' } },
  { tag: 'jazz', label: { en: 'Jazz', fr: 'Jazz', de: 'Jazz', es: 'Jazz' } },
  {
    tag: 'classical',
    label: { en: 'Classical', fr: 'Classique', de: 'Klassik', es: 'Clásica' },
  },
  {
    tag: 'electronic',
    label: { en: 'Electronic', fr: 'Électro', de: 'Elektronisch', es: 'Electrónica' },
  },
  { tag: 'hip hop', label: { en: 'Hip-hop', fr: 'Hip-hop', de: 'Hip-Hop', es: 'Hip-hop' } },
  { tag: 'sport', label: { en: 'Sport', fr: 'Sport', de: 'Sport', es: 'Deportes' } },
  { tag: 'kids', label: { en: 'Kids', fr: 'Enfants', de: 'Kinder', es: 'Infantil' } },
];

/**
 * The subset of a Radio Browser station the integration uses.
 * @typedef {object} Station
 * @property {string} uuid
 * @property {string} name
 * @property {string} url        stream URL (resolved from playlists by Radio Browser)
 * @property {string} homepage
 * @property {string} favicon
 * @property {string[]} tags
 * @property {string} country    ISO code
 * @property {string} codec      MP3, AAC, AAC+, OGG...
 * @property {number} bitrate    kbps, 0 when unknown
 * @property {boolean} hls
 */

/** @returns {Station} */
export function toStation(raw) {
  return {
    uuid: String(raw.stationuuid),
    name: String(raw.name ?? '').trim() || 'Radio',
    url: String(raw.url_resolved || raw.url || ''),
    homepage: String(raw.homepage ?? ''),
    favicon: String(raw.favicon ?? ''),
    tags: String(raw.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    country: String(raw.countrycode ?? '').toUpperCase(),
    codec: String(raw.codec ?? '').toUpperCase(),
    bitrate: Number(raw.bitrate) || 0,
    hls: Number(raw.hls) === 1 || /\.m3u8(\?|$)/i.test(String(raw.url_resolved ?? '')),
  };
}

/** Whether a stream is plain MP3: the one format every network speaker plays. */
export function isMp3(station) {
  return !station.hls && (station.codec === 'MP3' || /\.mp3(\?|$)/i.test(station.url));
}

/**
 * Guess the MP3 twin of an AAC / Ogg stream URL: broadcasters often publish
 * the same programme under parallel mounts (`/aac-128/` and `/mp3-128/`,
 * `live.aac` and `live.mp3`...). Only the codec token of the path changes, so
 * the guess stays on the host of the original stream.
 * @returns {string[]} candidate URLs, never the original one
 */
export function mp3UrlGuesses(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const path = parsed.pathname;
  const guesses = new Set();
  // A codec token delimited by / - _ . or the end: aac, aacp, aac+, ogg, opus.
  const token = /(^|[/._-])(aacp|aac\+|aac|ogg|opus)(?=$|[/._-]|\d)/gi;
  if (token.test(path)) {
    guesses.add(path.replace(token, '$1mp3'));
  }
  for (const guess of [...guesses]) {
    // Bitrates below 64 kbps rarely exist in MP3: `aac-48` -> `mp3-128` too.
    guesses.add(
      guess.replace(/mp3([-_])(\d{2})(?=\D|$)/i, (m, sep, rate) =>
        Number(rate) < 96 ? `mp3${sep}128` : m,
      ),
    );
  }
  guesses.delete(path);
  return [...guesses].map((guessPath) => {
    const candidate = new URL(parsed);
    candidate.pathname = guessPath;
    return candidate.toString();
  });
}

/** MIME type of a stream, from its codec (what DLNA renderers and Cast expect). */
export function streamContentType(station) {
  if (station.hls) {
    return 'application/vnd.apple.mpegurl';
  }
  switch (station.codec) {
    case 'AAC':
    case 'AAC+':
      return 'audio/aac';
    case 'OGG':
      return 'audio/ogg';
    case 'FLAC':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

export class RadioBrowserClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] injectable for the tests
   * @param {string} [options.userAgent]
   * @param {() => number} [options.now]
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, userAgent = 'Gladys-RadioPlayer', now } = {}) {
    this.fetch = fetchImpl;
    this.userAgent = userAgent;
    this.now = now ?? Date.now;
    this.servers = null;
    this.serverIndex = 0;
    this.cache = new Map();
  }

  async getServers() {
    if (this.servers) {
      return this.servers;
    }
    try {
      const list = await this.fetchJson(SERVER_LIST_URL);
      const names = [...new Set(list.map((entry) => entry.name).filter(Boolean))];
      // Spread the load: every installation starts on a random server.
      names.sort(() => Math.random() - 0.5);
      this.servers = names.length > 0 ? names : FALLBACK_SERVERS;
    } catch (err) {
      logger.warn(`Radio Browser server list unavailable (${err.message}), using the fallback`);
      this.servers = FALLBACK_SERVERS;
    }
    return this.servers;
  }

  async fetchJson(url) {
    const response = await this.fetch(url, {
      headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  /** GET an API path, trying every server once before giving up. */
  async request(path, { cache = true } = {}) {
    const cached = cache ? this.cache.get(path) : undefined;
    if (cached && cached.expires > this.now()) {
      return cached.value;
    }
    const servers = await this.getServers();
    let lastError;
    for (let attempt = 0; attempt < servers.length; attempt += 1) {
      const server = servers[(this.serverIndex + attempt) % servers.length];
      try {
        const value = await this.fetchJson(`https://${server}${path}`);
        this.serverIndex = (this.serverIndex + attempt) % servers.length;
        if (cache) {
          if (this.cache.size >= CACHE_MAX_ENTRIES) {
            this.cache.delete(this.cache.keys().next().value);
          }
          this.cache.set(path, { value, expires: this.now() + CACHE_TTL_MS });
        }
        return value;
      } catch (err) {
        lastError = err;
        logger.debug(`Radio Browser ${server} failed: ${err.message}`);
      }
    }
    throw new Error(`Radio catalog unreachable: ${lastError?.message ?? 'no server'}`);
  }

  /**
   * Search stations. Ordered by popularity (clicks), broken streams hidden.
   * @param {object} criteria
   * @param {string} criteria.country ISO code
   * @param {string} [criteria.name]
   * @param {string} [criteria.tag]
   * @param {number} [criteria.limit]
   * @param {number} [criteria.offset]
   * @param {boolean} [criteria.excludeHls]
   * @returns {Promise<Station[]>}
   */
  async search({ country, name, tag, limit = 50, offset = 0, excludeHls = true }) {
    const params = new URLSearchParams({
      countrycode: country,
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
      // Ask for more when HLS streams are filtered out afterwards.
      limit: String(excludeHls ? Math.min(limit * 2, 200) : limit),
      offset: String(offset),
    });
    if (name) {
      params.set('name', name);
    }
    if (tag) {
      params.set('tag', tag);
    }
    const raw = await this.request(`/json/stations/search?${params}`);
    let stations = raw.map(toStation).filter((station) => station.url);
    if (excludeHls) {
      stations = stations.filter((station) => !station.hls);
    }
    return stations.slice(0, limit);
  }

  /** The most listened stations of a country. */
  topStations(country, { limit = 50, offset = 0, excludeHls = true } = {}) {
    return this.search({ country, limit, offset, excludeHls });
  }

  /** Stations of a country for one genre tag. */
  byGenre(country, tag, { limit = 50, offset = 0, excludeHls = true } = {}) {
    return this.search({ country, tag, limit, offset, excludeHls });
  }

  /**
   * One station by uuid, or null.
   * @returns {Promise<Station|null>}
   */
  async getStation(uuid) {
    if (!/^[0-9a-f-]{36}$/i.test(String(uuid))) {
      return null;
    }
    const raw = await this.request(`/json/stations/byuuid/${uuid}`);
    return raw.length > 0 ? toStation(raw[0]) : null;
  }

  /**
   * Resolve what a user typed — a station uuid or a (part of a) name — to the
   * best matching station of the country, or null.
   */
  async findStation(query, { country, excludeHls = true } = {}) {
    const value = String(query ?? '').trim();
    if (!value) {
      return null;
    }
    const byUuid = await this.getStation(value);
    if (byUuid) {
      return byUuid;
    }
    const stations = await this.search({ country, name: value, limit: 10, excludeHls });
    const lower = value.toLowerCase();
    // An exact name wins over the most popular partial match.
    return stations.find((station) => station.name.toLowerCase() === lower) ?? stations[0] ?? null;
  }

  /**
   * Read the content type of a stream without downloading it: the body is
   * cancelled as soon as the headers arrive (a radio stream never ends).
   * @returns {Promise<string|null>} the content type, null when unreachable
   */
  async probeContentType(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await this.fetch(url, {
        headers: { 'User-Agent': this.userAgent, 'Icy-MetaData': '0' },
        signal: controller.signal,
      });
      const type = response.ok ? (response.headers.get('content-type') ?? '') : null;
      response.body?.cancel().catch(() => {});
      return type;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  /**
   * MP3 versions of a station that is not MP3, best first: other entries of
   * the same radio in the directory, then guessed parallel mounts confirmed by
   * their content type. Cached: a station is probed once per hour at most.
   * @param {Station} station
   * @returns {Promise<Station[]>} copies of the station with an MP3 stream URL
   */
  async mp3Variants(station) {
    if (isMp3(station)) {
      return [];
    }
    const key = `mp3:${station.uuid}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      return cached.value;
    }
    const urls = [];
    try {
      const twins = await this.search({
        country: station.country,
        name: station.name,
        limit: 10,
        excludeHls: true,
      });
      const name = station.name.toLowerCase();
      for (const twin of twins) {
        if (twin.name.toLowerCase() === name && isMp3(twin) && !urls.includes(twin.url)) {
          urls.push(twin.url);
        }
      }
    } catch (err) {
      logger.debug(`No twin search for ${station.name}: ${err.message}`);
    }
    const guesses = mp3UrlGuesses(station.url).filter((url) => !urls.includes(url));
    const probed = await Promise.all(guesses.map((url) => this.probeContentType(url)));
    guesses.forEach((url, i) => {
      if (/audio\/(mpeg|mp3)/i.test(probed[i] ?? '') && !urls.includes(url)) {
        urls.push(url);
      }
    });
    const variants = urls.map((url) => ({ ...station, url, codec: 'MP3', hls: false }));
    this.cache.set(key, { value: variants, expires: this.now() + CACHE_TTL_MS * 6 });
    if (variants.length > 0) {
      logger.info(`${station.name}: MP3 stream found (${variants[0].url})`);
    }
    return variants;
  }

  /** Count a play (Radio Browser ranks the stations with it). Never throws. */
  async countClick(uuid) {
    try {
      await this.request(`/json/url/${uuid}`, { cache: false });
    } catch (err) {
      logger.debug(`Click not counted for ${uuid}: ${err.message}`);
    }
  }

  /** Number of stations of a country (the "test the catalog" action). */
  async countryStationCount(country) {
    const raw = await this.request(`/json/countries`);
    const entry = raw.find((c) => String(c.iso_3166_1).toUpperCase() === country);
    return entry ? Number(entry.stationcount) : 0;
  }
}
