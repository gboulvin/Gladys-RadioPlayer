// -----------------------------------------------------------------------------
// Persistent state: favorites, recently played stations, last station of each
// player.
//
// The container rootfs is read-only: the only writable place is the /data
// volume, which survives restarts and updates. The file holds no secret.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const MAX_FAVORITES = 30;
export const MAX_RECENT = 10;

const EMPTY = () => ({ favorites: [], recent: [], lastStation: {} });

/** The few station fields worth remembering (no stream URL: it can change). */
export function stationRef(station) {
  return {
    uuid: station.uuid,
    name: station.name,
    favicon: station.favicon ?? '',
    country: station.country ?? '',
  };
}

export class Store {
  /** @param {string} [dir] defaults to $RADIOPLAYER_DATA_DIR or /data */
  constructor(dir = process.env.RADIOPLAYER_DATA_DIR || '/data') {
    this.file = path.join(dir, 'radioplayer.json');
    this.state = EMPTY();
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites.slice(0, MAX_FAVORITES) : [],
        recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
        lastStation:
          parsed.lastStation && typeof parsed.lastStation === 'object' ? parsed.lastStation : {},
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`State file unreadable, starting empty: ${err.message}`);
      }
      this.state = EMPTY();
    }
    return this;
  }

  // Writes are serialized and atomic (temp file + rename): a crash never
  // leaves a half-written file behind.
  save() {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writing = this.writing
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        await writeFile(tmp, snapshot, 'utf8');
        await rename(tmp, this.file);
      })
      .catch((err) => logger.error(`Cannot save the state: ${err.message}`));
    return this.writing;
  }

  get favorites() {
    return this.state.favorites;
  }

  get recent() {
    return this.state.recent;
  }

  isFavorite(uuid) {
    return this.state.favorites.some((fav) => fav.uuid === uuid);
  }

  /** @returns {Promise<'added'|'exists'|'full'>} */
  async addFavorite(station) {
    if (this.isFavorite(station.uuid)) {
      return 'exists';
    }
    if (this.state.favorites.length >= MAX_FAVORITES) {
      return 'full';
    }
    this.state.favorites.push(stationRef(station));
    await this.save();
    return 'added';
  }

  /** @returns {Promise<boolean>} whether a favorite was removed */
  async removeFavorite(uuid) {
    const before = this.state.favorites.length;
    this.state.favorites = this.state.favorites.filter((fav) => fav.uuid !== uuid);
    if (this.state.favorites.length === before) {
      return false;
    }
    await this.save();
    return true;
  }

  async clearFavorites() {
    const count = this.state.favorites.length;
    this.state.favorites = [];
    await this.save();
    return count;
  }

  async recordPlay(deviceExternalId, station) {
    const ref = stationRef(station);
    this.state.recent = [ref, ...this.state.recent.filter((r) => r.uuid !== ref.uuid)].slice(
      0,
      MAX_RECENT,
    );
    this.state.lastStation[deviceExternalId] = ref;
    await this.save();
  }

  lastStation(deviceExternalId) {
    return this.state.lastStation[deviceExternalId] ?? null;
  }
}
