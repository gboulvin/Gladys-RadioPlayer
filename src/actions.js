// -----------------------------------------------------------------------------
// Manifest `actions`: the buttons of the Configuration screen. Each handler
// resolves the multi-language message shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { countryName } from './countries.js';
import { mapText, text } from './i18n.js';

const logger = createLogger({ name: 'actions' });

const withValue = (message, value) => mapText(message, (t) => t.replaceAll('%s', value));

export function createActions({ gladys, catalog, store, registry, onFavoritesChanged, getConfig }) {
  return {
    async test_catalog() {
      const config = getConfig();
      const [count, top] = await Promise.all([
        catalog.countryStationCount(config.country),
        catalog.topStations(config.country, { limit: 3, excludeHls: config.exclude_hls }),
      ]);
      const names = top.map((s) => s.name).join(', ');
      return mapText(
        text(
          'Catalog reachable: %n stations in %c. Most listened: %t.',
          'Catalogue joignable : %n stations en/au %c. Les plus écoutées : %t.',
          'Katalog erreichbar: %n Sender in %c. Meistgehört: %t.',
          'Catálogo accesible: %n emisoras en %c. Las más escuchadas: %t.',
        ),
        (t, lang) =>
          t
            .replace('%n', String(count))
            .replace('%c', countryName(config.country, lang))
            .replace('%t', names || '—'),
      );
    },

    async add_favorite({ station: query }) {
      const config = getConfig();
      const station = await catalog.findStation(query, {
        country: config.country,
        excludeHls: config.exclude_hls,
      });
      if (!station) {
        return withValue(
          text(
            'No station matches "%s" in the catalog of this country.',
            'Aucune station ne correspond à « %s » dans le catalogue de ce pays.',
            'Kein Sender passt zu „%s“ im Katalog dieses Landes.',
            'Ninguna emisora coincide con «%s» en el catálogo de este país.',
          ),
          String(query),
        );
      }
      const result = await store.addFavorite(station);
      if (result === 'added') {
        await onFavoritesChanged();
      }
      const messages = {
        added: text(
          '%s added to favorites.',
          '%s ajoutée aux favoris.',
          '%s zu den Favoriten hinzugefügt.',
          '%s añadida a favoritos.',
        ),
        exists: text(
          '%s is already a favorite.',
          '%s est déjà en favori.',
          '%s ist bereits ein Favorit.',
          '%s ya es favorita.',
        ),
        full: text(
          'Favorites are full (30): remove one first.',
          'Les favoris sont pleins (30) : retirez-en un.',
          'Favoriten sind voll (30): entfernen Sie zuerst einen.',
          'Favoritos llenos (30): quite uno primero.',
        ),
      };
      return withValue(messages[result], station.name);
    },

    async remove_favorite({ station: query }) {
      const value = String(query ?? '')
        .trim()
        .toLowerCase();
      const favorite =
        store.favorites.find((fav) => fav.uuid === value || fav.name.toLowerCase() === value) ??
        store.favorites.find((fav) => fav.name.toLowerCase().includes(value));
      if (!value || !favorite) {
        return withValue(
          text(
            'No favorite matches "%s".',
            'Aucun favori ne correspond à « %s ».',
            'Kein Favorit passt zu „%s“.',
            'Ningún favorito coincide con «%s».',
          ),
          String(query ?? ''),
        );
      }
      await store.removeFavorite(favorite.uuid);
      await onFavoritesChanged();
      return withValue(
        text(
          '%s removed from favorites.',
          '%s retirée des favoris.',
          '%s aus den Favoriten entfernt.',
          '%s quitada de favoritos.',
        ),
        favorite.name,
      );
    },

    async list_favorites() {
      if (store.favorites.length === 0) {
        return text(
          'No favorite yet: add one with "Add a favorite", or from the "Now playing" widget.',
          'Aucun favori : ajoutez-en avec « Ajouter un favori » ou depuis le widget « En cours de lecture ».',
          'Noch keine Favoriten: fügen Sie welche mit „Favorit hinzufügen“ oder über das Widget „Läuft gerade“ hinzu.',
          'Aún no hay favoritos: añádalos con «Añadir un favorito» o desde el widget «Sonando ahora».',
        );
      }
      const list = store.favorites.map((fav, i) => `${i + 1}. ${fav.name}`).join(' · ');
      return withValue(
        text('Favorites: %s', 'Favoris : %s', 'Favoriten: %s', 'Favoritos: %s'),
        list,
      );
    },

    async test_player({ device }) {
      const player = await registry.resolve(gladys, device);
      try {
        const status = await player.getStatus();
        const volume =
          status.volume === null || status.volume === undefined ? '?' : `${status.volume} %`;
        return mapText(
          text(
            '%p answers (%k). Volume: %v.',
            '%p répond (%k). Volume : %v.',
            '%p antwortet (%k). Lautstärke: %v.',
            '%p responde (%k). Volumen: %v.',
          ),
          (t) =>
            t
              .replace('%p', player.name)
              .replace('%k', player.kind === 'cast' ? 'Google Cast' : 'UPnP / DLNA')
              .replace('%v', volume),
        );
      } catch (err) {
        logger.warn(`test_player ${device}: ${err.message}`);
        return withValue(
          text(
            '%s does not answer: check that it is on and on the same network.',
            '%s ne répond pas : vérifiez qu’il est allumé et sur le même réseau.',
            '%s antwortet nicht: Ist er eingeschaltet und im selben Netzwerk?',
            '%s no responde: compruebe que está encendido y en la misma red.',
          ),
          player.name,
        );
      }
    },
  };
}
