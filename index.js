// -----------------------------------------------------------------------------
// RadioPlayer — entry point of the Gladys external integration.
//
// Plays the web radios of a country's catalog on the network speakers of the
// house (Google Cast, Sonos, UPnP/DLNA renderers). This file only wires the
// SDK to the modules of src/:
//   catalog/radioBrowser.js  the radio catalog (Radio Browser, per country)
//   players/                 discovery + drivers of the speakers
//   devices.js               the Gladys device of a speaker
//   radio.js                 playback, zapping, status, scene triggers
//   music.js                 the music panel (browse / search / play)
//   scenes.js, widgets.js, actions.js
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { RadioBrowserClient } from './src/catalog/radioBrowser.js';
import { normalizeConfig } from './src/config.js';
import { buildDevice, featureKey, FEATURES } from './src/devices.js';
import { LogoStore } from './src/images.js';
import { text } from './src/i18n.js';
import { createMusicHandlers } from './src/music.js';
import { PlayerRegistry } from './src/players/index.js';
import { RadioService } from './src/radio.js';
import { createSceneActions } from './src/scenes.js';
import { Store } from './src/store.js';
import { createActions } from './src/actions.js';
import { createWidgets, refreshAllWidgets, refreshPlayerWidgets } from './src/widgets.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
let config = normalizeConfig();
const getConfig = () => config;

const catalog = new RadioBrowserClient({ userAgent: `Gladys-RadioPlayer/${version}` });
const store = new Store();
const registry = new PlayerRegistry();
const logos = new LogoStore();
const radio = new RadioService({ gladys, catalog, store, registry, config });
// Loaded once: on a reconnection, the in-memory state is the freshest.
let storeLoaded = null;

// Players found by the last scan, kept to re-publish them without scanning
// again (config or favorites change).
let discovered = [];

// The stations listed in the "Radio station" select of every player.
async function stationOptions() {
  if (store.favorites.length > 0) {
    return store.favorites;
  }
  return catalog
    .topStations(config.country, { limit: 15, excludeHls: config.exclude_hls })
    .catch((err) => {
      logger.warn(`Top stations unavailable: ${err.message}`);
      return [];
    });
}

async function publishDevices({ scan }) {
  if (scan) {
    discovered = await registry.discover(gladys, config);
  }
  const stations = await stationOptions();
  await gladys.publishDiscoveredDevices(
    discovered.map((player) => buildDevice(gladys, player, { stations })),
  );
}

async function onFavoritesChanged() {
  await publishDevices({ scan: false });
  refreshAllWidgets(gladys);
}

// --- Discovery -----------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> scanning the network for speakers');
  await publishDevices({ scan: true });
});

// --- Commands on a player feature -----------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  const key = featureKey(feature.external_id, device.external_id);
  logger.info(`onSetValue <- ${device.name} ${key} = ${value}`);
  switch (key) {
    case FEATURES.PLAYBACK_STATE:
      return radio.setPlaybackState(device.external_id, Number(value));
    case FEATURES.VOLUME:
      return radio.setVolume(device.external_id, Number(value));
    case FEATURES.MUTE:
      return radio.setMute(device.external_id, Number(value) === 1);
    case FEATURES.NEXT:
      return radio.zap(device.external_id, 1);
    case FEATURES.PREVIOUS:
      return radio.zap(device.external_id, -1);
    case FEATURES.STATION:
      return radio.playUuid(device.external_id, String(value));
    default:
      throw new Error(`Feature ${feature.external_id} cannot be controlled`);
  }
});

gladys.onPoll(async (device) => {
  await radio.refresh(device.external_id);
});

gladys.onDeviceDeleted(async (device) => {
  registry.forget(device.external_id);
});

// Cast devices push their changes over their open connection.
registry.onStatusChanged((deviceExternalId) => {
  radio.refresh(deviceExternalId);
});
radio.onChange(() => refreshPlayerWidgets(gladys));

// --- Music panel (manifest `music`: browse + search) ------------------------------
const music = createMusicHandlers({ gladys, catalog, store, radio, getConfig });
gladys.onMusicBrowse(music.browse);
gladys.onMusicSearch(music.search);
gladys.onMusicPlay(music.play);

// --- Configuration screen actions --------------------------------------------------
const actions = createActions({ gladys, catalog, store, registry, onFavoritesChanged, getConfig });
for (const [key, handler] of Object.entries(actions)) {
  gladys.onAction(key, (fields) => handler(fields ?? {}));
}

// --- Scene actions -------------------------------------------------------------
const sceneActions = createSceneActions({ radio, store });
for (const [key, handler] of Object.entries(sceneActions)) {
  gladys.onSceneAction(key, (fields) => handler({ fields }));
}

// --- Dashboard widgets ---------------------------------------------------------
const widgets = createWidgets({ radio, catalog, store, logos, getConfig });
for (const [key, widget] of Object.entries(widgets)) {
  gladys.onWidgetGet(key, (request) => widget.get(request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(gladys, { actionKey, params, settings }),
    );
  }
}
gladys.onWidgetGetImage((key) => logos.get(key));

// --- Configuration -------------------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  radio.config = config;
  // The country or the discovery channels may have changed: scan again.
  await publishDevices({ scan: true });
  refreshAllWidgets(gladys);
});

// --- Connection lifecycle --------------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    radio.config = config;
    storeLoaded = storeLoaded ?? store.load();
    await storeLoaded;
    await publishDevices({ scan: true });
    // Read the real state of the created players once, so the dashboard is
    // right before the first poll.
    await Promise.all((gladys.devices ?? []).map((device) => radio.refresh(device.external_id)));
    refreshAllWidgets(gladys);
    await catalog.topStations(config.country, { limit: 1, excludeHls: config.exclude_hls });
    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(
        false,
        text(
          'The radio catalog is unreachable: check the Internet connection of Gladys.',
          'Le catalogue des radios est injoignable : vérifiez la connexion Internet de Gladys.',
          'Der Radiokatalog ist nicht erreichbar: Prüfen Sie die Internetverbindung von Gladys.',
          'El catálogo de radios no es accesible: compruebe la conexión a Internet de Gladys.',
        ),
      )
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  registry.closeAll();
  await store.writing;
});

logger.info(`Starting RadioPlayer ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
