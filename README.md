# RadioPlayer — Gladys Assistant integration

Play the web radios of your country on the speakers of your house — **Google
Cast, Sonos and UPnP/DLNA** — from [Gladys Assistant](https://gladysassistant.com).

- **A catalog per country**: the most listened stations, genres and search of
  the country you pick, from the free [Radio Browser](https://www.radio-browser.info)
  directory (no account, no API key).
- **Every speaker becomes a Gladys music player**: now-playing card, music
  panel (browse + search), volume, mute, next / previous station, a station
  select.
- **3 dashboard widgets**, **3 scene triggers**, **4 scene actions**, favorites.
- **No audio goes through Gladys**: the speaker downloads the stream itself.
- English, French, German and Spanish.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Where it works

20 countries in 6 zones, declared in the manifest `countries` field:

| Zone            | Countries                                     |
| --------------- | --------------------------------------------- |
| Western Europe  | 🇫🇷 FR · 🇧🇪 BE · 🇱🇺 LU · 🇳🇱 NL · 🇬🇧 GB · 🇮🇪 IE |
| Central Europe  | 🇩🇪 DE · 🇨🇭 CH · 🇦🇹 AT                         |
| Southern Europe | 🇪🇸 ES · 🇵🇹 PT · 🇮🇹 IT                         |
| North America   | 🇨🇦 CA · 🇺🇸 US                                 |
| Latin America   | 🇲🇽 MX · 🇦🇷 AR · 🇨🇱 CL · 🇨🇴 CO · 🇵🇪 PE         |
| Oceania         | 🇦🇺 AU                                         |

## Requirements

- Gladys Assistant **5.3.0** or later (music players, `countries`, `keywords`).
- Internet access for the catalog and the streams; speakers on the local
  network of Gladys.

## Tags

- **Transport: `local`** — the speakers are discovered (SSDP / mDNS, mediated
  by the Gladys core) and driven on the local network, in unicast.
- **Internet required** for the radio catalog (Radio Browser API) and for the
  streams the speakers download. There is no cloud account and no vendor
  cloud in the control path.

## How it works

```
Gladys ──WebSocket──► RadioPlayer container ──HTTPS──► Radio Browser API (catalog)
                           │
                           ├── UPnP SOAP (HTTP)  ──► Sonos / DLNA renderer ──► radio stream
                           └── CASTV2 (TLS 8009) ──► Google Cast device    ──► radio stream
```

| Path                                     | Role                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `index.js`                               | SDK wiring only                                                  |
| `src/catalog/radioBrowser.js`            | Radio Browser client: server fallback, cache, per-country search |
| `src/players/index.js`                   | discovery (SSDP + mDNS + manual) and device ↔ player registry    |
| `src/players/upnp.js`, `xml.js`          | UPnP/DLNA + Sonos driver (AVTransport, RenderingControl)         |
| `src/players/cast.js`, `castProtocol.js` | Google Cast driver (CASTV2, hand-encoded protobuf)               |
| `src/devices.js`                         | the Gladys `music` device of a speaker                           |
| `src/radio.js`                           | playback, zapping, status follow-up, scene triggers              |
| `src/music.js`                           | music panel: browse / search / play                              |
| `src/scenes.js`                          | scene actions                                                    |
| `src/widgets.js`, `src/images.js`        | dashboard widgets and station logos                              |
| `src/actions.js`                         | Configuration screen buttons                                     |
| `src/store.js`                           | favorites and recent stations, in `/data`                        |
| `src/countries.js`, `src/i18n.js`        | the 20 countries, the four languages                             |

The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## Development

```bash
npm install
npm test               # node --test, against the fake Gladys of the SDK
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run it against a Gladys in developer mode:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="radioplayer" \
RADIOPLAYER_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (`patch`, `minor` or `major`). The
workflow bumps `package.json` and the manifest, rolls the changelog, tags,
builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/gboulvin/gladys-radioplayer` and publishes the GitHub Release.

Started from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js).

## License

Apache-2.0. RadioPlayer is an independent project, not affiliated with Radio
Browser, Google, Sonos or Radioplayer Worldwide. Station data © Radio Browser
contributors, under its open data terms.
