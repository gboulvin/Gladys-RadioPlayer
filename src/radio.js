// -----------------------------------------------------------------------------
// The radio service: plays a station on a player, zaps, follows what every
// player does and tells Gladys.
//
// - Commands (dashboard, music panel, scenes, widgets) go through playStation
//   / stop / next / setVolume...;
// - refresh() reads a player's real status (poll, or a Cast status push) and
//   publishes it with publishNowPlaying, which only sends what changed;
// - the scene triggers fire on the OBSERVED transitions of a player. A
//   transition caused by a scene action of this integration fires nothing:
//   a scene bound to the event would otherwise loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger, MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { isMp3 } from './catalog/radioBrowser.js';
import { FEATURES } from './devices.js';

const logger = createLogger({ name: 'radio' });

export const SCENE_TRIGGERS = {
  PLAYBACK_STARTED: 'playback_started',
  PLAYBACK_STOPPED: 'playback_stopped',
  PLAYER_UNREACHABLE: 'player_unreachable',
};
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

// Two failed status reads in a row: the player is unreachable.
const UNREACHABLE_AFTER_FAILURES = 2;
// How long a transition caused by a scene action stays silent.
const SCENE_ORIGIN_SILENCE_MS = 30 * 1000;
// Re-read a player this long after a command: the speaker needs a moment to
// buffer the stream, and the poll would only see it up to 15 s later.
const SETTLE_DELAY_MS = 4000;
const ZAPPING_LIST_SIZE = 20;
// How long after a play an idle / error status means "this stream failed".
const ATTEMPT_WINDOW_MS = 30 * 1000;

const playing = (state) => state === 'PLAYING' || state === 'BUFFERING';

export class RadioService {
  /**
   * @param {object} deps
   * @param {object} deps.gladys
   * @param {import('./catalog/radioBrowser.js').RadioBrowserClient} deps.catalog
   * @param {import('./store.js').Store} deps.store
   * @param {import('./players/index.js').PlayerRegistry} deps.registry
   * @param {object} [deps.config]
   * @param {(fn: () => void, ms: number) => unknown} [deps.schedule] injectable timer
   */
  constructor({ gladys, catalog, store, registry, config, schedule }) {
    this.gladys = gladys;
    this.catalog = catalog;
    this.store = store;
    this.registry = registry;
    this.config = config;
    this.schedule =
      schedule ??
      ((fn, ms) => {
        const timer = setTimeout(fn, ms);
        timer.unref?.();
        return timer;
      });
    /** Per device: { station, state, failures, sceneOriginUntil, unreachable } */
    this.players = new Map();
    this.listeners = [];
  }

  /** Called with (deviceExternalId) after a published change (widgets refresh on it). */
  onChange(listener) {
    this.listeners.push(listener);
  }

  notify(deviceExternalId) {
    for (const listener of this.listeners) {
      try {
        listener(deviceExternalId);
      } catch (err) {
        logger.debug(`Change listener failed: ${err.message}`);
      }
    }
  }

  entry(deviceExternalId) {
    if (!this.players.has(deviceExternalId)) {
      this.players.set(deviceExternalId, {
        station: null,
        attempt: null,
        state: null,
        failures: 0,
        sceneOriginUntil: 0,
        unreachable: false,
      });
    }
    return this.players.get(deviceExternalId);
  }

  /** What a device plays (the station this integration started), or null. */
  current(deviceExternalId) {
    const entry = this.players.get(deviceExternalId);
    return entry && playing(entry.state) ? entry.station : null;
  }

  status(deviceExternalId) {
    return this.players.get(deviceExternalId) ?? null;
  }

  playerName(deviceExternalId) {
    return (
      this.registry.players.get(deviceExternalId)?.name ??
      (this.gladys.devices ?? []).find((d) => d.external_id === deviceExternalId)?.name ??
      deviceExternalId
    );
  }

  // --- Commands ---------------------------------------------------------------

  /**
   * @param {string} deviceExternalId
   * @param {import('./catalog/radioBrowser.js').Station} station
   * @param {{ volume?: number, fromScene?: boolean }} [options]
   */
  async playStation(deviceExternalId, station, { volume, fromScene = false } = {}) {
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    const entry = this.entry(deviceExternalId);
    if (fromScene) {
      entry.sceneOriginUntil = Date.now() + SCENE_ORIGIN_SILENCE_MS;
    }
    const streams = await this.streamsFor(station);
    const options = { volume: volume ?? this.config.start_volume };
    let lastError;
    for (let i = 0; i < streams.length; i += 1) {
      try {
        await player.play(streams[i], options);
        return await this.started(deviceExternalId, streams[i], streams.slice(i + 1), options);
      } catch (err) {
        lastError = err;
        logger.warn(`${player.name} refused ${streams[i].url}: ${err.message}`);
      }
    }
    throw lastError;
  }

  /**
   * The streams to try for a station, in order. Many speakers only decode
   * MP3 reliably (an Android TV refuses raw AAC, old DLNA renderers refuse
   * AAC or Ogg): unless the user opted out, an MP3 version of the same radio
   * goes first, the original stream stays as the fallback.
   */
  async streamsFor(station) {
    if (!this.config.prefer_mp3 || isMp3(station)) {
      return [station];
    }
    const variants = await this.catalog.mp3Variants(station).catch(() => []);
    return [...variants, station];
  }

  async started(deviceExternalId, stream, fallbacks, options) {
    const entry = this.entry(deviceExternalId);
    entry.station = stream;
    // Watched until the speaker is seen playing: a stream it accepted but
    // cannot decode shows up as an error / idle state a few seconds later.
    entry.attempt = { fallbacks, options, until: Date.now() + ATTEMPT_WINDOW_MS };
    // A command is a known starting point: nothing played before it.
    entry.state = entry.state ?? 'IDLE';
    await this.store.recordPlay(deviceExternalId, stream);
    this.catalog.countClick(stream.uuid);
    await this.publish(deviceExternalId, 'BUFFERING', { stationChanged: true });
    this.schedule(() => this.refresh(deviceExternalId), SETTLE_DELAY_MS);
    return stream;
  }

  /**
   * The speaker gave up on a stream it had accepted: play the next stream of
   * the same station. Returns true when a fallback started.
   */
  async fallback(deviceExternalId, status) {
    const entry = this.entry(deviceExternalId);
    const { attempt } = entry;
    entry.attempt = null;
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    const failed = entry.station?.url;
    for (let i = 0; i < attempt.fallbacks.length; i += 1) {
      const stream = attempt.fallbacks[i];
      logger.warn(
        `${player.name} could not play ${failed}${status.error ? ` (${status.error})` : ''}, trying ${stream.url}`,
      );
      try {
        await player.play(stream, attempt.options);
        await this.started(
          deviceExternalId,
          stream,
          attempt.fallbacks.slice(i + 1),
          attempt.options,
        );
        return true;
      } catch (err) {
        logger.warn(`${player.name} refused ${stream.url}: ${err.message}`);
      }
    }
    return false;
  }

  /** Play what a user typed: a station uuid or name, searched in the country catalog. */
  async playQuery(deviceExternalId, query, options) {
    const station = await this.catalog.findStation(query, {
      country: this.config.country,
      excludeHls: this.config.exclude_hls,
    });
    if (!station) {
      return null;
    }
    return this.playStation(deviceExternalId, station, options);
  }

  async playUuid(deviceExternalId, uuid, options) {
    const station = await this.catalog.getStation(uuid);
    if (!station) {
      throw new Error(`Station ${uuid} not found in the catalog`);
    }
    return this.playStation(deviceExternalId, station, options);
  }

  async stop(deviceExternalId, { fromScene = false } = {}) {
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    const entry = this.entry(deviceExternalId);
    entry.attempt = null;
    if (fromScene) {
      entry.sceneOriginUntil = Date.now() + SCENE_ORIGIN_SILENCE_MS;
    }
    await player.stop();
    await this.refresh(deviceExternalId);
  }

  /** Play / pause / stop from the playback_state feature (0 pause, 1 play, 2 stop). */
  async setPlaybackState(deviceExternalId, value) {
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    if (value === MUSIC_PLAYBACK_STATE.PLAYING) {
      const entry = this.entry(deviceExternalId);
      if (entry.state === 'PAUSED') {
        await player.resume();
      } else {
        // Nothing loaded: start the last station of this player, or the first
        // one of the zapping list.
        const last = this.store.lastStation(deviceExternalId);
        const station = last
          ? await this.catalog.getStation(last.uuid)
          : (await this.zappingList())[0];
        if (!station) {
          throw new Error('No station to play: pick one in the music panel first');
        }
        await this.playStation(deviceExternalId, station);
        return;
      }
    } else if (value === MUSIC_PLAYBACK_STATE.PAUSED) {
      this.entry(deviceExternalId).attempt = null;
      await player.pause();
    } else {
      this.entry(deviceExternalId).attempt = null;
      await player.stop();
    }
    await this.refresh(deviceExternalId);
  }

  /**
   * The stations next / previous zap between: the favorites when there are at
   * least two, the most listened stations of the country otherwise.
   */
  async zappingList() {
    if (this.store.favorites.length >= 2) {
      return this.store.favorites.map((fav) => ({ ...fav, ref: true }));
    }
    return this.catalog.topStations(this.config.country, {
      limit: ZAPPING_LIST_SIZE,
      excludeHls: this.config.exclude_hls,
    });
  }

  /** @param {1|-1} step */
  async zap(deviceExternalId, step, options) {
    const list = await this.zappingList();
    if (list.length === 0) {
      throw new Error('The station list is empty');
    }
    const currentUuid =
      this.current(deviceExternalId)?.uuid ?? this.store.lastStation(deviceExternalId)?.uuid;
    const index = list.findIndex((station) => station.uuid === currentUuid);
    const next = list[(index + step + list.length) % list.length];
    // Favorites only keep a reference: read the current stream URL.
    const station = next.ref ? await this.catalog.getStation(next.uuid) : next;
    if (!station) {
      throw new Error(`Station ${next.name} is no longer in the catalog`);
    }
    return this.playStation(deviceExternalId, station, options);
  }

  async setVolume(deviceExternalId, volume) {
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    await player.setVolume(Math.max(0, Math.min(100, Math.round(volume))));
    await this.refresh(deviceExternalId);
  }

  async setMute(deviceExternalId, mute) {
    const player = await this.registry.resolve(this.gladys, deviceExternalId);
    await player.setMute(mute);
    await this.refresh(deviceExternalId);
  }

  // --- Status -------------------------------------------------------------------

  /**
   * Read the real status of a player and publish it. Never throws: a player
   * that does not answer is reported unreachable after two failures.
   */
  async refresh(deviceExternalId) {
    const entry = this.entry(deviceExternalId);
    let status;
    try {
      const player = await this.registry.resolve(this.gladys, deviceExternalId);
      status = await player.getStatus();
    } catch (err) {
      entry.failures += 1;
      logger.debug(`${deviceExternalId}: status unavailable (${err.message})`);
      if (entry.failures >= UNREACHABLE_AFTER_FAILURES && !entry.unreachable) {
        entry.unreachable = true;
        logger.warn(`${this.playerName(deviceExternalId)} is unreachable`);
        await this.fireEvent(SCENE_TRIGGERS.PLAYER_UNREACHABLE, deviceExternalId, entry);
        this.notify(deviceExternalId);
      }
      return null;
    }
    entry.failures = 0;
    entry.unreachable = false;
    const { attempt } = entry;
    if (attempt) {
      // An idle speaker only means "refused" on the first read after the
      // play: later, it may just be someone stopping it from its own app.
      const failed = Boolean(status.error) || (status.state === 'IDLE' && !attempt.checked);
      attempt.checked = true;
      if (failed && Date.now() < attempt.until && attempt.fallbacks.length > 0) {
        if (await this.fallback(deviceExternalId, status)) {
          return status;
        }
      } else if (status.state === 'PLAYING' || Date.now() >= attempt.until) {
        // Seen playing (or long enough): the stream is fine.
        entry.attempt = null;
      }
    }
    await this.publish(deviceExternalId, status.state, status);
    return status;
  }

  async publish(deviceExternalId, state, { volume, mute, stationChanged = false } = {}) {
    const entry = this.entry(deviceExternalId);
    const previous = entry.state;
    entry.state = state;

    const nowPlaying = { playback_state: MUSIC_PLAYBACK_STATE[state] };
    if (typeof volume === 'number') {
      nowPlaying.volume = volume;
    }
    if (typeof mute === 'boolean') {
      nowPlaying.mute = mute;
    }
    if (playing(state) && entry.station) {
      const { station } = entry;
      Object.assign(nowPlaying, {
        title: station.name,
        artist: station.tags.slice(0, 3).join(', '),
        album: [station.codec, station.bitrate ? `${station.bitrate} kbps` : '']
          .filter(Boolean)
          .join(' · '),
        artwork_url: /^https?:\/\//i.test(station.favicon) ? station.favicon : null,
        duration: 0,
      });
    } else if (!playing(state)) {
      // Stopped, or another app took over the speaker: clear the texts
      // explicitly (an absent key means "unchanged").
      Object.assign(nowPlaying, { title: '', artist: '', album: '', artwork_url: null });
      if (state === 'IDLE') {
        entry.station = null;
      }
    }

    try {
      await this.gladys.publishNowPlaying(deviceExternalId, nowPlaying);
      const select = `${deviceExternalId}:${FEATURES.STATION}`;
      if (stationChanged && entry.station) {
        await this.gladys.publishChangedStates([
          { device_feature_external_id: select, text: entry.station.uuid },
        ]);
      }
    } catch (err) {
      // The device is discovered but not created yet: nothing to update.
      logger.debug(`${deviceExternalId}: states not published (${err.message})`);
    }

    // previous === null: the first status read since the start, not a transition.
    if (previous !== null && playing(previous) !== playing(state)) {
      await this.fireEvent(
        playing(state) ? SCENE_TRIGGERS.PLAYBACK_STARTED : SCENE_TRIGGERS.PLAYBACK_STOPPED,
        deviceExternalId,
        entry,
      );
    }
    if (previous !== state || stationChanged) {
      this.notify(deviceExternalId);
    }
  }

  async fireEvent(key, deviceExternalId, entry) {
    if (Date.now() < entry.sceneOriginUntil) {
      logger.debug(`${key} not fired for ${deviceExternalId}: caused by a scene action`);
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceExternalId,
        player: this.playerName(deviceExternalId),
        station: entry.station?.name ?? this.store.lastStation(deviceExternalId)?.name ?? '',
        station_uuid: entry.station?.uuid ?? '',
      });
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }
}
