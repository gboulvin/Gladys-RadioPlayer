# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.2.1] - 2026-11-05

### Fixed

- A Sonos added by its IP address in **Speakers added by hand** was taken
  for a Google Cast device and could not play. A bare IP is now probed: a
  Sonos is recognised by its UPnP description (port 1400), any other IP stays
  Google Cast. The wrong "Google Cast <IP>" devices created before can be
  deleted, then the Sonos added again from the Discovery tab.

## [1.2.0] - 2026-11-04

### Added

- _Radio – now playing_ widget: a **Choose** button opens the station list
  (favorites first, then the top stations of the country) with an **Add to
  favorites** box, to pick and star a station in one go.
- _Radio presets_ widget: with no station typed in its settings, it shows the
  first three favorites as one-tap buttons.
- The stream row of the _Radio – now playing_ widget flags a fallback stream
  (`(fallback)`, in orange).

### Changed

- The **Radio station** select of a speaker lists the favorites (★) first,
  then the top stations of the country (it only showed one or the other).
- The _Favorite_ button of the _Radio – now playing_ widget is replaced by the
  **Add to favorites** box of the **Choose** list.
- DLNA renderers receive the DLNA profile of the stream (MP3, AAC), which
  many TVs and receivers require.

### Fixed

- An Android TV (or a speaker with Chromecast built-in) showed up twice, as
  Google Cast and as a DLNA renderer that could not play the stations: a
  device answering both ways is now kept once, as Google Cast.

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

[Unreleased]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/gboulvin/Gladys-RadioPlayer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gboulvin/Gladys-RadioPlayer/releases/tag/v1.0.0
