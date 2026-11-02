// -----------------------------------------------------------------------------
// Music panel of a player: browse and search the radio catalog of the
// configured country, then play a station (manifest `music`: browse + search).
//
// The catalog tree:
//   root
//   ├─ Favorites            (stored in /data)
//   ├─ Top stations — <country>
//   ├─ Genres
//   │   └─ News, Pop, Rock, Jazz...
//   └─ Recently played
// MediaItem ids are ours: `station:<uuid>`, `top`, `genres`, `genre:<tag>`...
// -----------------------------------------------------------------------------

import { MUSIC_MEDIA_TYPES } from '@gladysassistant/integration-sdk';
import { GENRES } from './catalog/radioBrowser.js';
import { countryName } from './countries.js';
import { pick } from './i18n.js';

const FOLDERS = {
  FAVORITES: 'favorites',
  TOP: 'top',
  GENRES: 'genres',
  RECENT: 'recent',
};
const STATION_PREFIX = 'station:';
const GENRE_PREFIX = 'genre:';
const MAX_ITEMS = 100;

// Folder titles, in the four languages of the integration.
const LABELS = {
  favorites: { en: 'Favorites', fr: 'Favoris', de: 'Favoriten', es: 'Favoritos' },
  top: { en: 'Top stations', fr: 'Top des radios', de: 'Top-Sender', es: 'Emisoras top' },
  genres: { en: 'Genres', fr: 'Genres', de: 'Genres', es: 'Géneros' },
  recent: {
    en: 'Recently played',
    fr: 'Écoutées récemment',
    de: 'Zuletzt gehört',
    es: 'Escuchadas recientemente',
  },
};

// The language of the folder titles: the main language of the catalog
// country (the music panel request does not carry the user's language).
const COUNTRY_LANGUAGE = {
  FR: 'fr',
  BE: 'fr',
  LU: 'fr',
  CH: 'fr',
  CA: 'fr',
  DE: 'de',
  AT: 'de',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CL: 'es',
  CO: 'es',
  PE: 'es',
};

export function catalogLanguage(country) {
  return COUNTRY_LANGUAGE[country] ?? 'en';
}

function folder(id, title, subtitle) {
  return { id, type: MUSIC_MEDIA_TYPES.FOLDER, title, subtitle, browsable: true, playable: false };
}

/** A station as a MediaItem. Works for full stations and stored references. */
export function stationItem(gladys, station) {
  const item = {
    id: `${STATION_PREFIX}${station.uuid}`,
    type: MUSIC_MEDIA_TYPES.RADIO,
    title: station.name.slice(0, 200),
    browsable: false,
    playable: true,
  };
  const subtitle = (station.tags ?? []).slice(0, 3).join(', ');
  if (subtitle) {
    item.subtitle = subtitle.slice(0, 200);
  }
  if (/^https?:\/\//i.test(station.favicon ?? '')) {
    item.artwork_key = gladys.artworkKey(station.favicon);
  }
  return item;
}

/** The station uuid behind a MediaItem id, or null. */
export function stationUuid(mediaId) {
  const id = String(mediaId ?? '');
  return id.startsWith(STATION_PREFIX) ? id.slice(STATION_PREFIX.length) : null;
}

export function createMusicHandlers({ gladys, catalog, store, radio, getConfig }) {
  const options = () => ({ excludeHls: getConfig().exclude_hls });

  async function browse(_device, { parentId, offset = 0, limit = 50 }) {
    const config = getConfig();
    const lang = catalogLanguage(config.country);
    const size = Math.min(limit || 50, MAX_ITEMS);

    if (parentId === null || parentId === undefined || parentId === '') {
      const items = [
        folder(FOLDERS.FAVORITES, pick(LABELS.favorites, lang), `${store.favorites.length}`),
        folder(FOLDERS.TOP, pick(LABELS.top, lang), countryName(config.country, lang)),
        folder(FOLDERS.GENRES, pick(LABELS.genres, lang)),
        folder(FOLDERS.RECENT, pick(LABELS.recent, lang)),
      ];
      return { items, total: items.length };
    }
    if (parentId === FOLDERS.FAVORITES || parentId === FOLDERS.RECENT) {
      const list = parentId === FOLDERS.FAVORITES ? store.favorites : store.recent;
      return {
        items: list.slice(offset, offset + size).map((ref) => stationItem(gladys, ref)),
        total: list.length,
      };
    }
    if (parentId === FOLDERS.GENRES) {
      const items = GENRES.map((genre) =>
        folder(`${GENRE_PREFIX}${genre.tag}`, pick(genre.label, lang)),
      );
      return { items: items.slice(offset, offset + size), total: items.length };
    }
    if (parentId === FOLDERS.TOP) {
      const stations = await catalog.topStations(config.country, {
        limit: size,
        offset,
        ...options(),
      });
      return { items: stations.map((s) => stationItem(gladys, s)) };
    }
    if (String(parentId).startsWith(GENRE_PREFIX)) {
      const tag = String(parentId).slice(GENRE_PREFIX.length);
      const stations = await catalog.byGenre(config.country, tag, {
        limit: size,
        offset,
        ...options(),
      });
      return { items: stations.map((s) => stationItem(gladys, s)) };
    }
    return { items: [], total: 0 };
  }

  async function search(_device, { query, type, limit = 20 }) {
    if (type && type !== MUSIC_MEDIA_TYPES.RADIO) {
      // Only radios here: no track, album or artist.
      return { items: [] };
    }
    const value = String(query ?? '').trim();
    if (!value) {
      return { items: [] };
    }
    const stations = await catalog.search({
      country: getConfig().country,
      name: value,
      limit: Math.min(limit || 20, MAX_ITEMS),
      ...options(),
    });
    return { items: stations.map((s) => stationItem(gladys, s)) };
  }

  async function play(device, media) {
    const uuid = stationUuid(media?.id);
    if (!uuid) {
      throw new Error('Only a radio station can be played');
    }
    await radio.playUuid(device.external_id, uuid);
  }

  return { browse, search, play };
}
