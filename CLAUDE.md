# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

**RadioPlayer**, a Gladys Assistant **external integration**: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It plays the web radios of a country (catalog:
the Radio Browser API) on the network speakers of the house: Google Cast
(CASTV2), Sonos and UPnP/DLNA renderers (SOAP). It started from the official
JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/radio.test.js            # one file
node --test --test-name-pattern "Sonos"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                         SDK wiring only: handlers registered before connect()
src/catalog/radioBrowser.js      Radio Browser client (server fallback, cache, per-country search)
src/players/index.js             discovery (SSDP, mDNS, manual) + device external_id -> player
src/players/upnp.js, xml.js      UPnP/DLNA + Sonos driver
src/players/cast.js, castProtocol.js  Google Cast driver (hand-encoded protobuf framing)
src/devices.js                   the Gladys device of a speaker (music features + station select)
src/radio.js                     playback, zapping, status, scene triggers (SCENE_TRIGGER_KEYS)
src/music.js                     music panel handlers (browse, search, play)
src/scenes.js                    scene action handlers (manifest `scene_actions`)
src/widgets.js, src/images.js    dashboard widgets (manifest `widgets`) and station logos
src/actions.js                   Configuration screen buttons (manifest `actions`)
src/store.js                     favorites / recent / last station, in /data/radioplayer.json
src/config.js                    DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/countries.js                 the 20 countries (= manifest `countries`) and their zones
src/i18n.js                      LANGUAGES (en, fr, de, es) and text helpers
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md            user documentation, re-hosted by Gladys (en + fr mandatory)
test/                            node --test, against the SDK's fake Gladys, fake speakers and catalog
```

## Rules

- **External ids are forever.** Devices are `gladys.externalIds(kind, platformId)`
  with `kind` = `upnp` | `cast` and `platformId` the UDN / Cast id
  (`platformId()` in `src/players/index.js`). Feature keys (`FEATURES` in
  `src/devices.js`) are part of the ids: never rename them. The same goes for
  every key users store: `config_schema`, `actions`, widget, scene trigger and
  scene action keys, their field keys and output keys.
- **No audio in the container.** The speaker downloads the stream; the
  integration only sends it the URL.
- **The container rootfs is read-only.** Write only under `/data`
  (`RADIOPLAYER_DATA_DIR` overrides it in development and tests). Never log
  tokens.
- **Discovery is mediated.** Multicast never reaches the container: SSDP and
  mDNS go through `gladys.scanNetwork`, and every capture must be declared in
  the manifest `network_discovery` (test/manifest.test.js checks it). Only
  follow an SSDP `LOCATION` on the host that answered. The core runs **one
  scan at a time** per integration (409 otherwise) and only uses the
  **first** `ssdp` entry: every scan goes through `PlayerRegistry.discover`,
  which queues them.
- **Gladys' native Sonos / Google Cast / AirPlay integrations** cannot be
  driven by an external integration (no host API for that, and their
  `play_notification` only plays TTS): RadioPlayer drives the speakers itself
  and exposes them as `music` players for the core Music box.
- **Scene triggers fire on observed transitions**, never as the consequence of
  a scene action of this integration (`fromScene` in `src/radio.js`): a scene
  bound to the event would loop.
- **Countries.** `src/countries.js` is the source; the manifest `countries`
  field and the `country` select must list the same codes (20 max, a store
  rule). Adding a country also updates the four docs.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the hand-pushed tag path, which bumps all three together
  before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects in **en, fr, de and es**
  (`label`, `description`, `placeholder`, option labels): the manifest test
  fails on a missing language. The catalog `description` holds 10 to 100
  characters per language; widget labels 3 to 30. `music`, `countries` and
  `keywords` need `gladys_version` `>=5.3.0`.
- **User-facing text** speaks the four languages: action messages, widget
  contents, connection status (`text()` in `src/i18n.js`), and the four docs,
  kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: inject `fetch` / the Cast
  `connect` (see `test/helpers.js`).
