# RadioPlayer

Écoutez les radios web de votre pays sur les enceintes de la maison —
Google Cast, Sonos et UPnP/DLNA — depuis Gladys : le tableau de bord, le
panneau musique, les widgets et les scènes.

Les stations viennent de [Radio Browser](https://www.radio-browser.info), un
annuaire communautaire libre et gratuit de plus de 50 000 radios web. Le
catalogue est celui du **pays que vous choisissez** : ses radios les plus
écoutées, ses genres et sa recherche.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un **accès Internet** pour Gladys (le catalogue) et pour les enceintes
  (elles téléchargent le flux elles-mêmes).
- Des enceintes sur le **même réseau local** que Gladys.

Pas de compte, pas de clé d'API. **Aucun son ne passe par Gladys** :
l'intégration indique à l'enceinte quel flux jouer, l'enceinte le joue.

## Où l'utiliser

Le catalogue de 20 pays, regroupés en 6 zones. L'intégration s'installe
partout, mais le catalogue de Gladys la propose dans ces pays.

| Zone              | Pays (stations au catalogue, novembre 2026)                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Europe de l'Ouest | France (3 500+), Belgique (590+), Luxembourg (35), Pays-Bas (1 450+), Royaume-Uni (2 300+), Irlande (230+) |
| Europe centrale   | Allemagne (6 300+), Suisse (650+), Autriche (360+)                                                         |
| Europe du Sud     | Espagne (1 450+), Portugal (380+), Italie (1 800+)                                                         |
| Amérique du Nord  | Canada (1 550+), États-Unis (7 800+)                                                                       |
| Amérique latine   | Mexique (2 800+), Argentine (1 150+), Chili (590+), Colombie (740+), Pérou (310+)                          |
| Océanie           | Australie (1 800+)                                                                                         |

L'écran de configuration, la documentation et les messages existent en
**français, anglais, allemand et espagnol**.

## Enceintes compatibles

| Famille     | Exemples                                                                                                                     | Trouvées par |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Google Cast | Chromecast, Chromecast Audio, Google Home / Nest, Android TV, enceintes avec Chromecast intégré (JBL, Sony, Bose, Marshall…) | mDNS         |
| Sonos       | Toutes les enceintes Sonos (S1 et S2)                                                                                        | SSDP         |
| UPnP / DLNA | Amplis réseau (Denon, Marantz, Yamaha, Onkyo, Pioneer), téléviseurs, Freebox Player, Kodi, BubbleUPnP…                       | SSDP         |

Une enceinte que la recherche ne voit pas (autre sous-réseau, box qui filtre
le multicast) peut être ajoutée à la main, voir plus bas.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Choisissez le **pays du catalogue**.
3. Si besoin :
   - **Volume au démarrage** — le volume réglé au lancement d'une station
     (0 garde le volume de l'enceinte) ;
   - **Masquer les flux HLS** — beaucoup d'enceintes DLNA ne lisent pas les
     flux HLS (`.m3u8`) : laissez activé, sauf si toutes vos enceintes sont
     Google Cast ;
   - **Enceintes Google Cast** / **Enceintes Sonos et UPnP/DLNA** —
     désactivez une famille que vous n'utilisez pas ;
   - **Enceintes ajoutées à la main** — l'adresse IP d'un appareil Google
     Cast (ex. `192.168.1.20`) ou l'URL d'une description UPnP (ex.
     `http://192.168.1.30:1400/xml/device_description.xml` pour une Sonos),
     séparées par des virgules.
4. Enregistrez, ouvrez l'onglet **Découverte** et ajoutez vos enceintes.

## Écouter

Chaque enceinte est un **lecteur de musique** Gladys :

- le **panneau musique** du tableau de bord parcourt le catalogue :
  _Favoris_, _Top des radios_ de votre pays, _Genres_ (info, talk, pop,
  rock, années 60-80, jazz, classique, électro, hip-hop, sport, enfants) et
  _Écoutées récemment_, et cherche une station par son nom ;
- la carte de l'appareil propose lecture / pause / arrêt, le volume, la
  sourdine et **station suivante / précédente** : elles passent d'un favori
  à l'autre (dès deux favoris), sinon d'une radio du top à l'autre ;
- la liste **Station de radio** de l'appareil propose vos favoris (ou le
  top) pour en lancer un en un geste.

## Favoris

Jusqu'à 30 favoris, communs à toutes les enceintes :

- le bouton ☆ **Favori** du widget _Radio en cours_ ajoute la station
  écoutée ;
- les boutons **Ajouter un favori**, **Retirer un favori** et **Lister les
  favoris** de l'écran de configuration prennent un nom de station.

## Widgets du tableau de bord

- **Radio en cours** — la station d'une enceinte, son logo, ses genres et la
  qualité du flux, et les boutons _Précédente_, _Arrêter_ / _Lancer_,
  _Suivante_ et _Favori_.
- **Radios préférées** — jusqu'à trois stations saisies dans les réglages du
  widget, lancées d'un geste sur une enceinte, et un bouton _Arrêter_.
- **Top des radios** — les stations les plus écoutées du pays (ou d'un
  genre), en grille d'affiches avec un lien vers leur site.

## Scènes

**Déclencheurs** (catégorie _Intégrations_ de l'éditeur de scènes).
Choisissez éventuellement l'enceinte ; laissé vide, toute enceinte convient.

| Déclencheur          | Quand                                                               | Variables                           |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Radio lancée         | une enceinte se met à jouer (depuis Gladys, son appli, ses boutons) | `player`, `station`, `station_uuid` |
| Radio arrêtée        | une enceinte s'arrête, ou le flux s'est interrompu                  | `player`, `station`, `station_uuid` |
| Enceinte injoignable | une enceinte ne répond plus sur le réseau                           | `player`                            |

Utilisez-les dans les actions suivantes avec `{{triggerEvent.data.station}}`.
Un lancement ou un arrêt provoqué par une action de scène RadioPlayer ne
déclenche rien : une scène ne peut jamais boucler sur elle-même.

**Actions**

| Action           | Paramètres                                  | Sorties                                   |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Lancer une radio | enceinte, nom de la station, volume         | `started`, `station_name`, `station_uuid` |
| Lancer un favori | enceinte, position (1 = le premier), volume | `started`, `station_name`, `station_uuid` |
| Station suivante | enceinte                                    | `started`, `station_name`, `station_uuid` |
| Arrêter la radio | enceinte                                    | `stopped`                                 |

Une station introuvable n'est pas une erreur : `started` vaut `false`,
utilisez-le dans une condition. Le champ station accepte les variables de
scène.

Exemple — un radio-réveil : _Chaque jour de semaine à 7 h_ → _Lancer une
radio_ « France Inter » sur l'enceinte de la chambre à 20 % → _Attendre
1 heure_ → _Arrêter la radio_.

## Limites

- **Sonos** : lancez la radio sur le coordinateur d'un groupe (l'enceinte
  qui le pilote).
- Les **vieux lecteurs DLNA** peuvent refuser les flux `https` ou l'AAC :
  choisissez une autre station, ou un autre flux de la même radio.
- Les flux **HLS** (`.m3u8`) ne sont lus que par Google Cast ; ils sont
  masqués tant que _Masquer les flux HLS_ est activé.
- Le titre du morceau diffusé n'est pas affiché : le nom de la station, ses
  genres et la qualité du flux le sont.

## Dépannage

- **Aucune enceinte dans Découverte** : vérifiez que l'enceinte est allumée
  et sur le même réseau que Gladys, puis relancez la recherche. Sinon,
  ajoutez-la à la main.
- **« Le catalogue des radios est injoignable »** : Gladys n'a pas accès à
  Internet, ou Radio Browser est en panne (l'intégration essaie tous les
  serveurs Radio Browser).
- **Une station ne démarre pas** : utilisez **Tester une enceinte**, puis
  essayez une autre station ; le flux est peut-être hors ligne.
- L'intégration journalise tout ce qu'elle fait : ouvrez ses logs dans
  Gladys (`LOG_LEVEL=debug` pour le détail complet).

## Vie privée

L'intégration envoie à Radio Browser les recherches et les stations
écoutées (anonymement, sans compte). Les favoris et les dernières stations
écoutées restent dans le volume de données de l'intégration, sur votre
Gladys. Rien d'autre ne quitte votre réseau.

RadioPlayer est un projet indépendant, sans lien avec Radio Browser, Google,
Sonos ou Radioplayer Worldwide.
