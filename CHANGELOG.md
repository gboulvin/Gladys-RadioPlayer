# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.1] - 2026-11-04

### Added

- **Prefer MP3 streams** option, on by default: when a station is published
  in AAC or Ogg, RadioPlayer looks for its MP3 version (another entry of the
  same radio in the directory, or the parallel MP3 mount of the same server)
  and plays it first, the original stream staying the fallback.

### Fixed

- Android TV (Google Cast) showed "incompatible file format" on raw AAC
  streams, e.g. Classic 21 Metal: the MP3 version of the station now plays.
- A stream a speaker accepts then drops (unsupported format) is detected a
  few seconds after the start, and the next stream of the station is tried,
  without firing the "Radio stopped" trigger.

## [1.1.0] - 2026-11-04

### Added

- **Search for speakers** button in the Configuration screen: scans the
  network now and reports what Google Cast (mDNS) and Sonos/DLNA (SSDP)
  answered, so an empty Discovery tab is no longer a dead end.
- **Play a station now** button: plays a station on a speaker straight from
  the Configuration screen.
- The Configuration screen explains the three steps (country, Discovery tab,
  listen), and its status line says when no speaker was found yet.
- Documentation: getting started in 3 steps, the Configuration buttons, and
  how RadioPlayer relates to the native Sonos, Google Cast and AirPlay
  integrations of Gladys.

### Changed

- **Test the radio catalog** lists the five most listened stations and the
  next step.

### Fixed

- The Discovery tab could stay empty: the Google Cast and Sonos/DLNA scans
  ran at the same time, and Gladys only runs one network scan per
  integration at once. The scans now run one after the other, and a scan
  refused because another one is running is retried.
- The manifest declared a second SSDP search target that Gladys never uses
  (it only sends the first one): removed from the install screen.

## [1.0.0] - 2026-11-02

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

[Unreleased]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gboulvin/Gladys-RadioPlayer/releases/tag/v1.0.0
