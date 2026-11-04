// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   - now_playing    what a player plays, its logo, zapping buttons and a
//                    "favorite" star;
//   - radio_presets  up to three one-tap stations for a player, plus Stop;
//   - top_stations   the most listened stations of the catalog country (or of
//                    one genre), as a poster grid.
//
// Contents are declarative (the core renders them, no HTML). Button `params`
// are declared here and come back as is: the handler never receives user
// input. Logos are served through onWidgetGetImage (src/images.js).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { GENRES } from './catalog/radioBrowser.js';
import { countryName } from './countries.js';
import { mapText, text } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  NOW_PLAYING: 'now_playing',
  RADIO_PRESETS: 'radio_presets',
  TOP_STATIONS: 'top_stations',
};

const ACTIONS = {
  PLAY: 'play',
  STOP: 'stop',
  NEXT: 'next',
  PREVIOUS: 'previous',
  FAVORITE: 'favorite',
  PLAY_STATION: 'play_station',
  CHOOSE: 'choose',
};

// How many top stations the "Choose a station" list offers after the favorites.
const CHOICE_TOP_SIZE = 40;

const STATE_ROWS = {
  PLAYING: {
    value: text('Playing', 'En lecture', 'Wiedergabe', 'Reproduciendo'),
    color: WIDGET_COLORS.SUCCESS,
  },
  BUFFERING: {
    value: text('Loading', 'Chargement', 'Lädt', 'Cargando'),
    color: WIDGET_COLORS.INFO,
  },
  PAUSED: {
    value: text('Paused', 'En pause', 'Pausiert', 'En pausa'),
    color: WIDGET_COLORS.WARNING,
  },
  IDLE: { value: text('Stopped', 'Arrêté', 'Gestoppt', 'Detenido'), color: WIDGET_COLORS.NEUTRAL },
  UNREACHABLE: {
    value: text('Unreachable', 'Injoignable', 'Nicht erreichbar', 'Inaccesible'),
    color: WIDGET_COLORS.DANGER,
  },
};

const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const streamLabel = (station) =>
  [station.codec, station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' · ');

const noPlayer = () => ({
  ttl_seconds: 300,
  components: [
    {
      type: 'text',
      variant: 'body',
      text: text(
        'Pick a player in the widget settings.',
        'Choisissez un lecteur dans les réglages du widget.',
        'Wählen Sie einen Player in den Widget-Einstellungen.',
        'Elija un reproductor en los ajustes del widget.',
      ),
    },
  ],
});

export function createWidgets({ radio, catalog, store, logos, getConfig, onFavoritesChanged }) {
  function stateRow(device) {
    const status = radio.status(device);
    const key = status?.unreachable ? 'UNREACHABLE' : (status?.state ?? 'IDLE');
    return {
      label: text('Player', 'Lecteur', 'Player', 'Reproductor'),
      icon: 'speaker',
      ...(STATE_ROWS[key] ?? STATE_ROWS.IDLE),
    };
  }

  async function addFavorite(station) {
    const result = await store.addFavorite(station);
    if (result === 'full') {
      return text(
        'Favorites are full (30)',
        'Favoris pleins (30)',
        'Favoriten voll (30)',
        'Favoritos llenos (30)',
      );
    }
    if (result === 'added') {
      await onFavoritesChanged?.();
    }
    return mapText(
      text(
        '%s added to favorites',
        '%s ajoutée aux favoris',
        '%s zu Favoriten hinzugefügt',
        '%s añadida a favoritos',
      ),
      (t) => truncate(t.replace('%s', station.name), 200),
    );
  }

  /**
   * The options of the "Choose a station" list: the favorites first (★),
   * then the most listened stations of the country.
   */
  async function stationChoices() {
    const config = getConfig();
    const top = await catalog
      .topStations(config.country, { limit: CHOICE_TOP_SIZE, excludeHls: config.exclude_hls })
      .catch((err) => {
        logger.warn(`Top stations unavailable: ${err.message}`);
        return [];
      });
    const favorites = store.favorites.map((fav) => ({
      value: fav.uuid,
      label: { en: truncate(`★ ${fav.name}`, 60) },
    }));
    const seen = new Set(favorites.map((option) => option.value));
    const others = top
      .filter((station) => !seen.has(station.uuid))
      .map((station) => ({ value: station.uuid, label: { en: truncate(station.name, 60) } }));
    return [...favorites, ...others];
  }

  async function playerAction(actionKey, params, settings, values) {
    const device = settings?.device;
    if (!device) {
      throw new Error('No player selected in the widget settings');
    }
    switch (actionKey) {
      case ACTIONS.PLAY: {
        await radio.setPlaybackState(device, 1);
        return text('Radio on', 'Radio lancée', 'Radio läuft', 'Radio encendida');
      }
      case ACTIONS.STOP:
        await radio.stop(device);
        return text('Radio stopped', 'Radio arrêtée', 'Radio gestoppt', 'Radio detenida');
      case ACTIONS.NEXT:
      case ACTIONS.PREVIOUS: {
        const station = await radio.zap(device, actionKey === ACTIONS.NEXT ? 1 : -1);
        return truncate(station.name, 200);
      }
      case ACTIONS.PLAY_STATION: {
        const station = await radio.playUuid(device, params.uuid);
        return truncate(station.name, 200);
      }
      case ACTIONS.FAVORITE: {
        const station = radio.current(device);
        if (!station) {
          return text(
            'Nothing is playing',
            "Rien n'est en lecture",
            'Es läuft nichts',
            'No suena nada',
          );
        }
        return addFavorite(station);
      }
      case ACTIONS.CHOOSE: {
        // `values` is the form typed by the user, validated by the core
        // against the select options this content declared.
        const uuid = values?.station;
        if (!uuid) {
          throw new Error('No station chosen');
        }
        const current = radio.current(device);
        const station = current?.uuid === uuid ? current : await radio.playUuid(device, uuid);
        if (values.favorite === true && !store.isFavorite(uuid)) {
          return addFavorite(station);
        }
        return truncate(station.name, 200);
      }
      default:
        throw new Error(`Unknown widget action: ${actionKey}`);
    }
  }

  return {
    [WIDGET_KEYS.NOW_PLAYING]: {
      async get({ settings }) {
        const device = settings?.device;
        if (!device) {
          return noPlayer();
        }
        const station = radio.current(device);
        const components = [
          {
            type: 'text',
            variant: 'heading',
            text: station
              ? truncate(station.name, 40)
              : text('Nothing playing', 'Aucune radio', 'Keine Wiedergabe', 'Nada sonando'),
          },
          { type: 'text', variant: 'caption', text: truncate(radio.playerName(device), 80) },
        ];
        const logo = station ? logos.keyFor(station.favicon) : null;
        if (logo) {
          components.push({
            type: 'image',
            key: logo,
            alt: truncate(station.name, 100),
            fit: 'contain',
          });
        }
        const rows = [stateRow(device)];
        if (station) {
          if ((station.tags ?? []).length > 0) {
            rows.push({
              label: text('Genres', 'Genres', 'Genres', 'Géneros'),
              icon: 'music',
              value: truncate(station.tags.slice(0, 2).join(', '), 40),
              color: WIDGET_COLORS.NEUTRAL,
            });
          }
          if (streamLabel(station)) {
            // The codec of the stream really sent to the speaker. A fallback
            // means the preferred one (MP3) was dropped by this speaker.
            rows.push({
              label: text('Stream', 'Flux', 'Stream', 'Flujo'),
              icon: 'radio',
              value: station.fallback
                ? mapText(
                    text('%s (fallback)', '%s (secours)', '%s (Ersatz)', '%s (reserva)'),
                    (t) => t.replace('%s', streamLabel(station)),
                  )
                : streamLabel(station),
              color: station.fallback ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
            });
          }
        }
        components.push({ type: 'status', items: rows });
        components.push(
          {
            type: 'button',
            label: text('Previous', 'Précédente', 'Zurück', 'Anterior'),
            icon: 'skip-back',
            style: 'secondary',
            action: { key: ACTIONS.PREVIOUS },
          },
          station
            ? {
                type: 'button',
                label: text('Stop', 'Arrêter', 'Stopp', 'Detener'),
                icon: 'square',
                style: 'danger',
                action: { key: ACTIONS.STOP },
              }
            : {
                type: 'button',
                label: text('Play', 'Lancer', 'Abspielen', 'Reproducir'),
                icon: 'play',
                style: 'primary',
                action: { key: ACTIONS.PLAY },
              },
          {
            type: 'button',
            label: text('Next', 'Suivante', 'Weiter', 'Siguiente'),
            icon: 'skip-forward',
            style: 'secondary',
            action: { key: ACTIONS.NEXT },
          },
        );
        const choices = await stationChoices();
        if (choices.length > 0) {
          const preselected = choices.some((c) => c.value === station?.uuid)
            ? station.uuid
            : choices[0].value;
          components.push({
            type: 'button',
            label: text('Choose', 'Choisir', 'Auswählen', 'Elegir'),
            icon: 'list',
            style: 'primary',
            action: {
              key: ACTIONS.CHOOSE,
              fields: [
                {
                  key: 'station',
                  type: 'select',
                  label: text('Station', 'Station', 'Sender', 'Emisora'),
                  required: true,
                  default: preselected,
                  options: choices,
                },
                {
                  key: 'favorite',
                  type: 'boolean',
                  label: text(
                    'Add to favorites',
                    'Ajouter aux favoris',
                    'Zu Favoriten hinzufügen',
                    'Añadir a favoritos',
                  ),
                  default: false,
                },
              ],
            },
          });
        }
        // Refreshed on every change radio.js observes: the TTL is a safety net.
        return { ttl_seconds: 60, components };
      },
      action: (gladys, { actionKey, params, settings, values }) =>
        playerAction(actionKey, params, settings, values),
    },

    [WIDGET_KEYS.RADIO_PRESETS]: {
      async get({ settings }) {
        const device = settings?.device;
        if (!device) {
          return noPlayer();
        }
        const config = getConfig();
        const names = [settings.preset_1, settings.preset_2, settings.preset_3]
          .map((name) => String(name ?? '').trim())
          .filter(Boolean);
        // No preset typed: the first three favorites are the presets.
        const fromFavorites = names.length === 0;
        const presets = fromFavorites
          ? store.favorites.slice(0, 3)
          : await Promise.all(
              names.map((name) =>
                catalog
                  .findStation(name, { country: config.country, excludeHls: config.exclude_hls })
                  .catch((err) => {
                    logger.warn(`Preset "${name}" not resolved: ${err.message}`);
                    return null;
                  }),
              ),
            );
        const current = radio.current(device);
        const rows = [stateRow(device)];
        if (current) {
          rows.push({
            label: text('Station', 'Station', 'Sender', 'Emisora'),
            icon: 'radio',
            value: truncate(current.name, 40),
            color: WIDGET_COLORS.PRIMARY,
          });
        }
        names.forEach((name, index) => {
          if (!presets[index]) {
            rows.push({
              label: mapText(
                text('Preset %s', 'Préréglage %s', 'Preset %s', 'Preselección %s'),
                (t) => t.replace('%s', String(index + 1)),
              ),
              icon: 'alert-triangle',
              value: text('Not found', 'Introuvable', 'Nicht gefunden', 'No encontrada'),
              color: WIDGET_COLORS.WARNING,
            });
          }
        });
        const components = [
          { type: 'text', variant: 'caption', text: truncate(radio.playerName(device), 80) },
          { type: 'status', items: rows.slice(0, 10) },
        ];
        if (fromFavorites && presets.length === 0) {
          components.push({
            type: 'text',
            variant: 'body',
            text: text(
              'Your first three favorites show up here. Add some with the "Choose" button of the "Radio – now playing" widget, or type stations in the widget settings.',
              'Vos trois premiers favoris s’affichent ici. Ajoutez-en avec le bouton « Choisir » du widget « Radio en cours », ou saisissez des stations dans les réglages du widget.',
              'Ihre ersten drei Favoriten erscheinen hier. Fügen Sie welche über „Auswählen“ im Widget „Radio – läuft gerade“ hinzu oder tragen Sie Sender in den Widget-Einstellungen ein.',
              'Aquí aparecen sus tres primeros favoritos. Añádalos con el botón «Elegir» del widget «Radio – sonando» o escriba emisoras en los ajustes del widget.',
            ),
          });
        }
        for (const station of presets.filter(Boolean)) {
          components.push({
            type: 'button',
            label: truncate(station.name, 24),
            icon: 'radio',
            style: current?.uuid === station.uuid ? 'primary' : 'secondary',
            action: { key: ACTIONS.PLAY_STATION, params: { uuid: station.uuid } },
          });
        }
        components.push({
          type: 'button',
          label: text('Stop', 'Arrêter', 'Stopp', 'Detener'),
          icon: 'square',
          style: 'danger',
          action: { key: ACTIONS.STOP },
        });
        return { ttl_seconds: 120, components };
      },
      action: (gladys, { actionKey, params, settings, values }) =>
        playerAction(actionKey, params, settings, values),
    },

    [WIDGET_KEYS.TOP_STATIONS]: {
      async get({ settings, language }) {
        const config = getConfig();
        const genre = GENRES.find((g) => g.tag === settings?.genre);
        const stations = genre
          ? await catalog.byGenre(config.country, genre.tag, {
              limit: 8,
              excludeHls: config.exclude_hls,
            })
          : await catalog.topStations(config.country, { limit: 8, excludeHls: config.exclude_hls });
        const items = stations.map((station) => {
          const item = { title: truncate(station.name, 60) };
          if (station.tags.length > 0) {
            item.subtitle = truncate(station.tags.slice(0, 3).join(', '), 80);
          }
          const logo = logos.keyFor(station.favicon);
          if (logo) {
            item.image = logo;
          }
          if (station.codec) {
            item.badge = { text: truncate(streamLabel(station), 16), color: WIDGET_COLORS.NEUTRAL };
          }
          if (/^https:\/\//i.test(station.homepage)) {
            item.links = [
              {
                url: station.homepage,
                label: text('Website', 'Site web', 'Website', 'Sitio web'),
              },
            ];
          }
          return item;
        });
        const title = genre
          ? `${genre.label[language?.slice(0, 2)] ?? genre.label.en} — ${countryName(config.country, language?.slice(0, 2) || 'en')}`
          : countryName(config.country, language?.slice(0, 2) || 'en');
        const components = [{ type: 'text', variant: 'heading', text: truncate(title, 40) }];
        if (items.length > 0) {
          components.push({ type: 'card-list', display: 'grid', items });
        } else {
          components.push({
            type: 'text',
            variant: 'body',
            text: text(
              'No station found.',
              'Aucune station trouvée.',
              'Kein Sender gefunden.',
              'Ninguna emisora encontrada.',
            ),
          });
        }
        // The ranking moves slowly: one hour of cache is plenty.
        return { ttl_seconds: 3600, components };
      },
    },
  };
}

/** Nudge the widgets whose content depends on the players. */
export function refreshPlayerWidgets(gladys) {
  gladys.requestWidgetRefresh(WIDGET_KEYS.NOW_PLAYING);
  gladys.requestWidgetRefresh(WIDGET_KEYS.RADIO_PRESETS);
}

export function refreshAllWidgets(gladys) {
  for (const key of Object.values(WIDGET_KEYS)) {
    gladys.requestWidgetRefresh(key);
  }
}
