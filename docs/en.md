# RadioPlayer

Play the web radios of your country on the speakers of your house — Google
Cast, Sonos and UPnP/DLNA — from Gladys: the dashboard, the music panel, the
widgets and the scenes.

The stations come from [Radio Browser](https://www.radio-browser.info), a free
and open community directory of more than 50,000 web radios. The catalog is
the one of the **country you pick**: its most listened stations, its genres
and its search.

## Requirements

- Gladys Assistant **5.3.0** or later.
- An **Internet access** for Gladys (the catalog) and for the speakers (they
  download the stream themselves).
- Speakers on the **same local network** as Gladys.

No account, no API key. **No audio goes through Gladys**: the integration
tells the speaker which stream to play, the speaker plays it.

## Where it works

The catalog of 20 countries, grouped in 6 zones. The integration can be
installed anywhere, but the Gladys catalog lists it in these countries.

| Zone            | Countries (stations in the catalog, November 2026)                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Western Europe  | France (3,500+), Belgium (590+), Luxembourg (35), Netherlands (1,450+), United Kingdom (2,300+), Ireland (230+) |
| Central Europe  | Germany (6,300+), Switzerland (650+), Austria (360+)                                                            |
| Southern Europe | Spain (1,450+), Portugal (380+), Italy (1,800+)                                                                 |
| North America   | Canada (1,550+), United States (7,800+)                                                                         |
| Latin America   | Mexico (2,800+), Argentina (1,150+), Chile (590+), Colombia (740+), Peru (310+)                                 |
| Oceania         | Australia (1,800+)                                                                                              |

The Configuration screen, the documentation and the messages are available
in **English, French, German and Spanish**.

## Supported speakers

| Family      | Examples                                                                                                                     | Found by |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| Google Cast | Chromecast, Chromecast Audio, Google Home / Nest, Android TV, speakers with Chromecast built-in (JBL, Sony, Bose, Marshall…) | mDNS     |
| Sonos       | All Sonos speakers (S1 and S2)                                                                                               | SSDP     |
| UPnP / DLNA | Network receivers (Denon, Marantz, Yamaha, Onkyo, Pioneer), smart TVs, Freebox Player, Kodi, BubbleUPnP…                     | SSDP     |

A speaker the scan cannot see (another subnet, a router filtering multicast)
can be added by hand, see below.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Pick the **catalog country**.
3. Optionally:
   - **Start volume** — the volume set when a station starts (0 keeps the
     volume of the speaker);
   - **Hide HLS streams** — many DLNA speakers cannot play HLS (`.m3u8`)
     streams: leave it on, unless all your speakers are Google Cast;
   - **Google Cast speakers** / **Sonos and UPnP/DLNA speakers** — turn off a
     family you do not use;
   - **Speakers added by hand** — the IP address of a Google Cast device
     (e.g. `192.168.1.20`), or the URL of a UPnP description (e.g.
     `http://192.168.1.30:1400/xml/device_description.xml` for a Sonos),
     separated by commas.
4. Save, open the **Discovery** tab and add your speakers.

## Listening

Every speaker is a Gladys **music player**:

- the **music panel** of the dashboard browses the catalog: _Favorites_,
  _Top stations_ of your country, _Genres_ (news, talk, pop, rock, oldies,
  jazz, classical, electronic, hip-hop, sport, kids) and _Recently played_,
  and searches a station by name;
- the device card shows play / pause / stop, the volume, mute, and **next /
  previous station**: they zap between your favorites (from two favorites
  on), or the top stations of your country otherwise;
- the **Radio station** select of the device lists your favorites (or the top
  stations) to pick one in a tap.

## Favorites

Up to 30 favorites, shared by all the speakers:

- the ☆ **Favorite** button of the _Now playing_ widget adds the current
  station;
- the **Add a favorite**, **Remove a favorite** and **List the favorites**
  buttons of the Configuration screen take a station name.

## Dashboard widgets

- **Radio – now playing** — the station of a speaker, its logo, its genres and
  stream quality, and the _Previous_, _Stop_ / _Play_, _Next_ and _Favorite_
  buttons.
- **Radio presets** — up to three stations you type in the widget settings,
  played in one tap on a speaker, and a _Stop_ button.
- **Top radio stations** — the most listened stations of the country (or of
  one genre), as a poster grid with a link to their website.

## Scenes

**Triggers** (_Integrations_ category of the scene editor). Optionally pick
the speaker; left empty, any speaker matches.

| Trigger             | When                                                         | Variables                           |
| ------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Radio started       | a speaker starts playing (from Gladys, its app, its buttons) | `player`, `station`, `station_uuid` |
| Radio stopped       | a speaker stops, or the stream ended                         | `player`, `station`, `station_uuid` |
| Speaker unreachable | a speaker no longer answers on the network                   | `player`                            |

Read them in the following actions with `{{triggerEvent.data.station}}`.
A start or stop caused by a scene action of RadioPlayer fires no trigger, so
a scene can never loop on itself.

**Actions**

| Action               | Parameters                            | Outputs                                   |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| Play a radio station | speaker, station name, volume         | `started`, `station_name`, `station_uuid` |
| Play a favorite      | speaker, position (1 = first), volume | `started`, `station_name`, `station_uuid` |
| Next station         | speaker                               | `started`, `station_name`, `station_uuid` |
| Stop the radio       | speaker                               | `stopped`                                 |

A station not found is not an error: `started` is `false`, use it in a
condition. The station field accepts scene variables.

Example — a radio alarm clock: _Every weekday at 7:00_ → _Play a radio
station_ "France Inter" on the bedroom speaker at 20 % → _Wait 1 hour_ →
_Stop the radio_.

## Limits

- **Sonos**: play on the coordinator of a group (the speaker that leads it).
- **Old DLNA renderers** may refuse `https` streams or AAC: pick another
  station, or another stream of the same radio.
- **HLS** streams (`.m3u8`) only play on Google Cast; they are hidden while
  _Hide HLS streams_ is on.
- The title of the song playing is not shown: the station name, genres and
  stream quality are.

## Troubleshooting

- **No speaker in Discovery**: check that the speaker is on and on the same
  network as Gladys, then scan again. Otherwise add it by hand.
- **"The radio catalog is unreachable"**: Gladys has no Internet access, or
  Radio Browser is down (the integration tries every Radio Browser server).
- **A station does not start**: use **Test a speaker**, then try another
  station; the stream may be offline.
- The integration logs everything it does: open its logs in Gladys
  (`LOG_LEVEL=debug` for the full detail).

## Privacy

The integration sends Radio Browser the searches and the stations played
(anonymous, no account). Favorites and the last stations played stay in the
integration's data volume, on your Gladys. Nothing else leaves your network.

RadioPlayer is an independent project, not affiliated with Radio Browser,
Google, Sonos or Radioplayer Worldwide.
