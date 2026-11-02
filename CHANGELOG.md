# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First release of RadioPlayer: the web radios of your country on your Google
  Cast, Sonos and UPnP/DLNA speakers.
- Radio catalog per country, from the free Radio Browser directory: top
  stations, 11 genres, search. 20 countries in 6 zones (Western, Central and
  Southern Europe, North and Latin America, Oceania).
- Discovery of the speakers through the Gladys core (mDNS for Google Cast,
  SSDP for Sonos and DLNA), plus speakers added by hand by IP or URL.
- Every speaker is a Gladys music player: now-playing card, music panel
  (browse and search), play / pause / stop, volume, mute, next / previous
  station and a station select.
- Up to 30 favorites, and the recently played stations.
- Dashboard widgets: _Radio – now playing_, _Radio presets_ and _Top radio
  stations_.
- Scene triggers: radio started, radio stopped, speaker unreachable.
- Scene actions: play a radio station, play a favorite, next station, stop the
  radio.
- Configuration screen buttons: test the catalog, test a speaker, add, remove
  and list the favorites.
- English, French, German and Spanish everywhere: configuration, messages,
  widgets and documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-RadioPlayer/commits/main
