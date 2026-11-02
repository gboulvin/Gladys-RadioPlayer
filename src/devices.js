// -----------------------------------------------------------------------------
// The Gladys device of a network player.
//
// A player is a `music` device: the now-playing card of the dashboard, the
// music panel (browse + search of the radio catalog) and the standard music
// scene actions all come with it. On top, a `text`/`select` feature lists the
// stations to zap between (favorites, or the top stations of the country).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  MUSIC_PLAYBACK_STATE,
} from '@gladysassistant/integration-sdk';
import { PARAMS, platformId } from './players/index.js';

const MUSIC = DEVICE_FEATURE_TYPES.MUSIC;

// Feature keys are part of the external ids: never rename them. The music
// ones match the feature type, which is what publishNowPlaying expects.
export const FEATURES = {
  PLAYBACK_STATE: MUSIC.PLAYBACK_STATE,
  VOLUME: MUSIC.VOLUME,
  MUTE: MUSIC.MUTE,
  NEXT: MUSIC.NEXT,
  PREVIOUS: MUSIC.PREVIOUS,
  TITLE: MUSIC.TITLE,
  ARTIST: MUSIC.ARTIST,
  ALBUM: MUSIC.ALBUM,
  ARTWORK: MUSIC.ARTWORK,
  STATION: 'station',
};

// Max stations listed in the station select of a device.
export const MAX_STATION_OPTIONS = 30;

const music = (name, externalId, type, extra = {}) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.MUSIC,
  type,
  read_only: true,
  has_feedback: true,
  keep_history: false,
  min: 0,
  max: 0,
  ...extra,
});

/**
 * @param {object} gladys
 * @param {import('./players/upnp.js').UpnpPlayer | import('./players/cast.js').CastPlayer} player
 * @param {{ stations?: { uuid: string, name: string }[] }} [options]
 */
export function buildDevice(gladys, player, { stations = [] } = {}) {
  const ids = gladys.externalIds(player.kind, platformId(player));
  const { description } = player;
  const params = [{ name: PARAMS.KIND, value: player.kind }];
  if (player.kind === 'upnp') {
    params.push({ name: PARAMS.LOCATION, value: description.location });
  } else {
    params.push({ name: PARAMS.HOST, value: description.host });
    params.push({ name: PARAMS.PORT, value: String(description.port) });
  }
  if (description.manufacturer) {
    params.push({ name: PARAMS.MANUFACTURER, value: description.manufacturer });
  }
  if (description.model) {
    params.push({ name: PARAMS.MODEL, value: description.model });
  }

  return {
    name: player.name,
    external_id: ids.device,
    model: description.model || (player.kind === 'cast' ? 'Google Cast' : 'UPnP / DLNA'),
    // Polled to follow what the speaker does by itself (a stream that ends, a
    // volume knob, another app taking over). Cast devices also push their
    // changes through their open connection.
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_15_SECONDS,
    should_poll: true,
    params,
    features: [
      music('Playback', ids.feature(FEATURES.PLAYBACK_STATE), MUSIC.PLAYBACK_STATE, {
        read_only: false,
        min: MUSIC_PLAYBACK_STATE.PAUSED,
        max: MUSIC_PLAYBACK_STATE.BUFFERING,
      }),
      music('Volume', ids.feature(FEATURES.VOLUME), MUSIC.VOLUME, {
        read_only: false,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
      }),
      music('Mute', ids.feature(FEATURES.MUTE), MUSIC.MUTE, { read_only: false, max: 1 }),
      music('Next station', ids.feature(FEATURES.NEXT), MUSIC.NEXT, { read_only: false, max: 1 }),
      music('Previous station', ids.feature(FEATURES.PREVIOUS), MUSIC.PREVIOUS, {
        read_only: false,
        max: 1,
      }),
      music('Station', ids.feature(FEATURES.TITLE), MUSIC.TITLE),
      music('Genres', ids.feature(FEATURES.ARTIST), MUSIC.ARTIST),
      music('Stream', ids.feature(FEATURES.ALBUM), MUSIC.ALBUM),
      music('Logo', ids.feature(FEATURES.ARTWORK), MUSIC.ARTWORK),
      {
        name: 'Radio station',
        external_id: ids.feature(FEATURES.STATION),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
        read_only: false,
        has_feedback: true,
        keep_history: false,
        min: 0,
        max: 0,
        supported_options: stations.slice(0, MAX_STATION_OPTIONS).map((station, index) => ({
          value: station.uuid,
          label: station.name.slice(0, 100),
          sort_order: index,
        })),
      },
    ],
  };
}

/** Which feature of a device an external id designates (FEATURES value), or null. */
export function featureKey(featureExternalId, deviceExternalId) {
  const prefix = `${deviceExternalId}:`;
  return featureExternalId.startsWith(prefix) ? featureExternalId.slice(prefix.length) : null;
}
