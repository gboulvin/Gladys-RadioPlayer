// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// `fields` arrive RESOLVED (scene variables substituted, defaults applied,
// validated by the core); a `"source": "devices"` field is the chosen player
// external_id. Each handler resolves the declared scalar `outputs`. Throwing
// fails this action only: "no such station" is an output (`started: false`),
// not a failure, so the scene author can branch on it.
//
// The scene TRIGGERS (playback started / stopped, player unreachable) are
// fired by src/radio.js on the transitions it observes.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

const played = (station) => ({
  started: Boolean(station),
  station_name: station?.name ?? '',
  station_uuid: station?.uuid ?? '',
});

const volumeOf = (fields) => {
  const volume = Number(fields.volume);
  return Number.isFinite(volume) && volume > 0 ? volume : undefined;
};

export function createSceneActions({ radio, store }) {
  return {
    async play_station({ fields }) {
      logger.info(`Scene action play_station <- ${fields.device}: "${fields.station}"`);
      const station = await radio.playQuery(fields.device, fields.station, {
        volume: volumeOf(fields),
        fromScene: true,
      });
      return played(station);
    },

    async play_favorite({ fields }) {
      const position = Math.max(1, Math.round(Number(fields.position) || 1));
      logger.info(`Scene action play_favorite <- ${fields.device}: #${position}`);
      const favorite = store.favorites[position - 1];
      if (!favorite) {
        return played(null);
      }
      const station = await radio.playUuid(fields.device, favorite.uuid, {
        volume: volumeOf(fields),
        fromScene: true,
      });
      return played(station);
    },

    async next_station({ fields }) {
      logger.info(`Scene action next_station <- ${fields.device}`);
      const station = await radio.zap(fields.device, 1, { fromScene: true });
      return played(station);
    },

    async stop_radio({ fields }) {
      logger.info(`Scene action stop_radio <- ${fields.device}`);
      await radio.stop(fields.device, { fromScene: true });
      return { stopped: true };
    },
  };
}
