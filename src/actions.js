// -----------------------------------------------------------------------------
// Manifest `actions`: the buttons of the Configuration screen. Each handler
// resolves the multi-language message shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { countryName } from './countries.js';
import { mapText, text } from './i18n.js';

const logger = createLogger({ name: 'actions' });

const withValue = (message, value) => mapText(message, (t) => t.replaceAll('%s', value));

const kindLabel = (kind) => (kind === 'cast' ? 'Google Cast' : 'UPnP/DLNA');

/** One line per discovery channel: what the scan saw, what it kept. */
export function describeReport(report) {
  const channel = (name, entry, lang) => {
    if (!entry.enabled) {
      return `${name}: ${{ en: 'off', fr: 'désactivé', de: 'aus', es: 'desactivado' }[lang]}`;
    }
    if (entry.error) {
      return `${name}: ${{ en: 'error', fr: 'erreur', de: 'Fehler', es: 'error' }[lang]} (${entry.error})`;
    }
    const answers = { en: 'answer(s)', fr: 'réponse(s)', de: 'Antwort(en)', es: 'respuesta(s)' }[
      lang
    ];
    const kept = {
      en: 'speaker(s)',
      fr: 'enceinte(s)',
      de: 'Lautsprecher',
      es: 'altavoz/altavoces',
    }[lang];
    return `${name}: ${entry.answers} ${answers}, ${entry.players} ${kept}`;
  };
  return Object.fromEntries(
    ['en', 'fr', 'de', 'es'].map((lang) => [
      lang,
      [
        channel('Google Cast (mDNS)', report.mdns, lang),
        channel('Sonos/DLNA (SSDP)', report.ssdp, lang),
      ].join(' · '),
    ]),
  );
}

export function createActions({
  gladys,
  catalog,
  store,
  registry,
  radio,
  onFavoritesChanged,
  getConfig,
  rescan,
}) {
  return {
    async test_catalog() {
      const config = getConfig();
      const [count, top] = await Promise.all([
        catalog.countryStationCount(config.country),
        catalog.topStations(config.country, { limit: 5, excludeHls: config.exclude_hls }),
      ]);
      const names = top.map((s, i) => `${i + 1}. ${s.name}`).join(' · ');
      return mapText(
        text(
          'Catalog OK: %n stations in %c. Most listened: %t. Next step: open the Discovery tab and add your speakers, then use "Play a station now".',
          'Catalogue OK : %n stations pour le pays %c. Les plus écoutées : %t. Étape suivante : ouvrez l’onglet Découverte et ajoutez vos enceintes, puis utilisez « Lancer une radio maintenant ».',
          'Katalog OK: %n Sender in %c. Meistgehört: %t. Nächster Schritt: Tab „Erkennung“ öffnen und Lautsprecher hinzufügen, dann „Jetzt einen Sender abspielen“.',
          'Catálogo OK: %n emisoras en %c. Las más escuchadas: %t. Siguiente paso: abra la pestaña Descubrimiento y añada sus altavoces, luego use «Reproducir una emisora ahora».',
        ),
        (t, lang) =>
          t
            .replace('%n', String(count))
            .replace('%c', countryName(config.country, lang))
            .replace('%t', names || '—'),
      );
    },

    async scan_players() {
      const report = await rescan();
      const details = describeReport(report);
      if (report.players.length === 0) {
        return mapText(
          text(
            'No speaker found. %d. Check that the speakers are on and on the same network as Gladys (no guest Wi-Fi, no VLAN), or add them by IP in "Speakers added by hand".',
            'Aucune enceinte trouvée. %d. Vérifiez que les enceintes sont allumées et sur le même réseau que Gladys (pas de Wi-Fi invité, pas de VLAN), ou ajoutez-les par leur IP dans « Enceintes ajoutées à la main ».',
            'Kein Lautsprecher gefunden. %d. Sind die Lautsprecher eingeschaltet und im selben Netzwerk wie Gladys (kein Gast-WLAN, kein VLAN)? Sonst per IP unter „Manuell hinzugefügte Lautsprecher“ eintragen.',
            'Ningún altavoz encontrado. %d. Compruebe que están encendidos y en la misma red que Gladys (sin wifi de invitados ni VLAN), o añádalos por IP en «Altavoces añadidos a mano».',
          ),
          (t, lang) => t.replace('%d', details[lang]),
        );
      }
      const list = report.players.map((p) => `${p.name} (${kindLabel(p.kind)})`).join(', ');
      return mapText(
        text(
          '%n speaker(s) found: %l. %d. Add them from the Discovery tab.',
          '%n enceinte(s) trouvée(s) : %l. %d. Ajoutez-les depuis l’onglet Découverte.',
          '%n Lautsprecher gefunden: %l. %d. Fügen Sie sie im Tab „Erkennung“ hinzu.',
          '%n altavoz/altavoces encontrado(s): %l. %d. Añádalos desde la pestaña Descubrimiento.',
        ),
        (t, lang) =>
          t
            .replace('%n', String(report.players.length))
            .replace('%l', list)
            .replace('%d', details[lang]),
      );
    },

    async play_now({ device, station: query }) {
      const station = await radio.playQuery(device, query);
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
      return mapText(
        text(
          '%s is starting on %p.',
          '%s démarre sur %p.',
          '%s startet auf %p.',
          '%s empieza a sonar en %p.',
        ),
        (t) => t.replace('%s', station.name).replace('%p', radio.playerName(device)),
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
