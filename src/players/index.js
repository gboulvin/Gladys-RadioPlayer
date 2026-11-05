// -----------------------------------------------------------------------------
// Player registry: discovery of the network speakers and the link between a
// Gladys device and the driver that controls it.
//
// Two families, two discovery channels, both mediated by the Gladys core (the
// integration container sits on a bridge network that multicast never
// reaches):
//   - UPnP / DLNA renderers and Sonos: SSDP M-SEARCH;
//   - Google Cast devices: mDNS browse of `_googlecast._tcp`.
// Players discovery cannot see are typed in the `manual_players` config field.
//
// After a restart, the players of the devices the user created are rebuilt
// from the device params (PLAYER_KIND, LOCATION or HOST/PORT): no scan needed
// to control them.
// -----------------------------------------------------------------------------

import { createLogger, parseMdnsTxt } from '@gladysassistant/integration-sdk';
import { parseManualPlayers } from '../config.js';
import { CastPlayer, parseCastService } from './cast.js';
import { loadUpnpPlayer, parseSsdpHeaders } from './upnp.js';

const logger = createLogger({ name: 'players' });

// Cast devices and DLNA renderers answer within 1-3 s; 5 s leaves margin
// while keeping the two sequential scans under 15 s.
export const SCAN_TIMEOUT_SECONDS = 5;

// Where a Sonos player serves its UPnP device description.
const SONOS_PORT = 1400;
const SONOS_DESCRIPTION_PATH = '/xml/device_description.xml';

export const PARAMS = {
  KIND: 'PLAYER_KIND',
  LOCATION: 'LOCATION',
  HOST: 'HOST',
  PORT: 'PORT',
  MODEL: 'MODEL',
  MANUFACTURER: 'MANUFACTURER',
};

/** A stable, id-safe platform id (UDNs and Cast ids carry ':' or uppercase). */
export function platformId(player) {
  return String(player.id)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The IP address a player is reached at. */
export function playerHost(player) {
  if (player.kind === 'cast') {
    return player.description.host;
  }
  try {
    return new URL(player.description.location).hostname;
  } catch {
    return null;
  }
}

const paramValue = (device, name) => device.params?.find((p) => p.name === name)?.value;

export class PlayerRegistry {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] UPnP HTTP requests (injectable for the tests)
   * @param {Function} [options.castConnect] Cast transport (injectable for the tests)
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, castConnect } = {}) {
    this.fetch = fetchImpl;
    this.castConnect = castConnect;
    /** @type {Map<string, import('./upnp.js').UpnpPlayer | CastPlayer>} by device external_id */
    this.players = new Map();
    this.listeners = [];
    this.scanQueue = Promise.resolve();
    this.lastReport = null;
  }

  /** Called with (deviceExternalId) when a player reports a change by itself. */
  onStatusChanged(listener) {
    this.listeners.push(listener);
  }

  deviceExternalId(gladys, player) {
    return gladys.externalIds(player.kind, platformId(player)).device;
  }

  add(gladys, player) {
    const externalId = this.deviceExternalId(gladys, player);
    const previous = this.players.get(externalId);
    if (previous && previous !== player) {
      // Same device, maybe a new IP: keep the fresh description.
      previous.close();
    }
    if (player.kind === 'cast') {
      player.on('status-changed', () => this.listeners.forEach((l) => l(externalId)));
      player.on('error', (err) => logger.debug(`${player.name}: ${err.message}`));
    }
    this.players.set(externalId, player);
    return externalId;
  }

  createCast(info) {
    return new CastPlayer(info, this.castConnect ? { connect: this.castConnect } : {});
  }

  /**
   * Scan the network and the manual entries. Never throws: a failing channel
   * is reported. Scans run ONE AT A TIME: the Gladys core accepts a single
   * mediated scan per integration (409 otherwise), so the startup scan, the
   * Discovery tab and a config change must never overlap.
   * @returns {Promise<{ players: object[], report: object }>}
   */
  discover(gladys, config) {
    const run = this.scanQueue.then(() => this.runDiscovery(gladys, config));
    // The queue survives a failed run.
    this.scanQueue = run.catch(() => {});
    return run;
  }

  async runDiscovery(gladys, config) {
    const report = {
      ssdp: { enabled: config.enable_upnp, answers: 0, players: 0, error: null },
      mdns: { enabled: config.enable_cast, answers: 0, players: 0, error: null },
      manual: { entries: parseManualPlayers(config.manual_players).length, players: 0 },
      players: [],
    };
    const found = [];
    // Sequential on purpose, see discover().
    let upnp = config.enable_upnp ? await this.discoverUpnp(gladys, report.ssdp) : [];
    const cast = config.enable_cast ? await this.discoverCast(gladys, report.mdns) : [];
    // An Android TV (or a speaker with Chromecast built-in) also answers as a
    // DLNA renderer, whose stream support is far poorer: one physical device,
    // two players, and only the Cast one plays reliably. Keep the Cast one.
    const castHosts = new Set(cast.map((player) => player.description.host));
    const duplicates = upnp.filter((player) => castHosts.has(playerHost(player)));
    if (duplicates.length > 0) {
      logger.info(
        `Ignoring the DLNA side of ${duplicates.map((p) => p.name).join(', ')}: also a Google Cast device`,
      );
      upnp = upnp.filter((player) => !duplicates.includes(player));
    }
    report.ssdp.duplicates = duplicates.length;
    found.push(...upnp, ...cast);
    const manual = await this.loadManual(config);
    report.manual.players = manual.length;
    found.push(...manual);

    const ids = new Set();
    const unique = [];
    for (const player of found) {
      const externalId = this.deviceExternalId(gladys, player);
      if (!ids.has(externalId)) {
        ids.add(externalId);
        unique.push(player);
        this.add(gladys, player);
      }
    }
    report.players = unique.map((player) => ({ name: player.name, kind: player.kind }));
    logger.info(
      `Discovery: ${unique.length} player(s) found ` +
        `(SSDP ${report.ssdp.answers} answer(s), mDNS ${report.mdns.answers} answer(s), ` +
        `manual ${report.manual.players})`,
    );
    this.lastReport = report;
    return { players: unique, report };
  }

  /** scanNetwork, retried once when another scan of this integration is still running. */
  async scan(gladys, type) {
    try {
      return await gladys.scanNetwork(type, { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
    } catch (err) {
      if (err.status !== 409 && !/ALREADY_RUNNING/.test(err.message)) {
        throw err;
      }
      logger.debug(`${type} scan busy, retrying`);
      await new Promise((resolve) => {
        setTimeout(resolve, (SCAN_TIMEOUT_SECONDS + 1) * 1000).unref?.();
      });
      return gladys.scanNetwork(type, { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
    }
  }

  async discoverUpnp(gladys, report = {}) {
    let answers;
    try {
      answers = await this.scan(gladys, 'ssdp');
    } catch (err) {
      logger.warn(`SSDP scan failed: ${err.message}`);
      report.error = err.message;
      return [];
    }
    report.answers = answers.length;
    const locations = new Set();
    for (const answer of answers) {
      const location = parseSsdpHeaders(answer.headers).location;
      if (!location) {
        continue;
      }
      try {
        const url = new URL(location);
        // Only follow a description served by the device that answered:
        // an SSDP answer must not make the integration fetch any other host.
        if (url.protocol === 'http:' && url.hostname === answer.source_ip) {
          locations.add(url.toString());
        }
      } catch {
        // Invalid LOCATION: ignored.
      }
    }
    const players = await Promise.all(
      [...locations].map((location) =>
        loadUpnpPlayer(location, { fetch: this.fetch }).catch((err) => {
          logger.warn(`UPnP description ${location} unreadable: ${err.message}`);
          return null;
        }),
      ),
    );
    const kept = players.filter(Boolean);
    report.players = kept.length;
    return kept;
  }

  async discoverCast(gladys, report = {}) {
    try {
      const services = await this.scan(gladys, 'mdns');
      report.answers = services.length;
      const players = services
        .map((service) => parseCastService({ ...service, record: parseMdnsTxt(service.txt ?? []) }))
        .filter(Boolean)
        .map((info) => this.createCast(info));
      if (players.length < services.length) {
        logger.warn(
          `${services.length - players.length} Google Cast answer(s) without an IPv4 address: ` +
            'add these speakers by IP in the configuration',
        );
      }
      report.players = players.length;
      return players;
    } catch (err) {
      logger.warn(`mDNS scan failed: ${err.message}`);
      report.error = err.message;
      return [];
    }
  }

  /**
   * What answers at an IP typed by hand. A Sonos serves its UPnP description
   * on port 1400: try it first, and fall back to Google Cast (port 8009),
   * which has no plain-HTTP identity to probe.
   */
  async probeIp({ host, port }) {
    if (port === null || port === SONOS_PORT) {
      const location = `http://${host}:${SONOS_PORT}${SONOS_DESCRIPTION_PATH}`;
      const player = await loadUpnpPlayer(location, { fetch: this.fetch }).catch((err) => {
        logger.debug(`${host}: no Sonos / UPnP description (${err.message})`);
        return null;
      });
      if (player) {
        logger.info(`Manual player ${host}: ${player.name} (UPnP / Sonos)`);
        return player;
      }
      if (port === SONOS_PORT) {
        logger.warn(`Manual player ${host}:${SONOS_PORT} does not answer as a Sonos`);
        return null;
      }
    }
    // A Cast device typed by IP: its id is its address, there is no mDNS
    // record to read the real one from.
    logger.info(`Manual player ${host}: Google Cast`);
    return this.createCast({
      id: `ip-${host.replace(/\./g, '-')}`,
      name: `Google Cast ${host}`,
      host,
      port: port ?? 8009,
    });
  }

  async loadManual(config) {
    const players = [];
    for (const entry of parseManualPlayers(config.manual_players)) {
      if (entry.kind === 'upnp') {
        const player = await loadUpnpPlayer(entry.location, { fetch: this.fetch }).catch((err) => {
          logger.warn(`Manual player ${entry.location} unreachable: ${err.message}`);
          return null;
        });
        if (player) {
          players.push(player);
        }
      } else {
        const player = await this.probeIp(entry);
        if (player) {
          players.push(player);
        }
      }
    }
    return players;
  }

  /**
   * The player of a Gladys device, rebuilt from its params when needed.
   * @param {object} gladys
   * @param {string} deviceExternalId
   */
  async resolve(gladys, deviceExternalId) {
    const known = this.players.get(deviceExternalId);
    if (known) {
      return known;
    }
    const device = (gladys.devices ?? []).find((d) => d.external_id === deviceExternalId);
    if (!device) {
      throw new Error(`Unknown player ${deviceExternalId}: add it from the Discovery tab first`);
    }
    const kind = paramValue(device, PARAMS.KIND);
    let player = null;
    if (kind === 'upnp') {
      player = await loadUpnpPlayer(paramValue(device, PARAMS.LOCATION), { fetch: this.fetch });
    } else if (kind === 'cast') {
      // The id comes from the external id itself: `ext:<selector>:cast:<id>`.
      player = this.createCast({
        id: deviceExternalId.split(':cast:')[1],
        name: device.name,
        host: paramValue(device, PARAMS.HOST),
        port: Number(paramValue(device, PARAMS.PORT)) || 8009,
      });
    }
    if (!player) {
      throw new Error(`Player ${device.name} cannot be rebuilt, scan again from the Discovery tab`);
    }
    // The rebuilt id must lead back to the same device.
    const externalId = this.deviceExternalId(gladys, player);
    if (externalId !== deviceExternalId) {
      throw new Error(`Player ${device.name} changed identity, scan again from the Discovery tab`);
    }
    this.add(gladys, player);
    return player;
  }

  forget(deviceExternalId) {
    this.players.get(deviceExternalId)?.close();
    this.players.delete(deviceExternalId);
  }

  closeAll() {
    for (const player of this.players.values()) {
      player.close();
    }
  }
}
