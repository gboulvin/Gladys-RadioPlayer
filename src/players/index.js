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

const SCAN_TIMEOUT_SECONDS = 5;

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

  /** Scan the network and the manual entries. Never throws: a failing channel is logged. */
  async discover(gladys, config) {
    const found = [];
    const tasks = [];
    if (config.enable_upnp) {
      tasks.push(this.discoverUpnp(gladys).then((players) => found.push(...players)));
    }
    if (config.enable_cast) {
      tasks.push(this.discoverCast(gladys).then((players) => found.push(...players)));
    }
    tasks.push(this.loadManual(config).then((players) => found.push(...players)));
    await Promise.all(tasks);
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
    logger.info(`Discovery: ${unique.length} player(s) found`);
    return unique;
  }

  async discoverUpnp(gladys) {
    let answers;
    try {
      answers = await gladys.scanNetwork('ssdp', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
    } catch (err) {
      logger.warn(`SSDP scan failed: ${err.message}`);
      return [];
    }
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
          logger.debug(`UPnP description ${location} unreadable: ${err.message}`);
          return null;
        }),
      ),
    );
    return players.filter(Boolean);
  }

  async discoverCast(gladys) {
    try {
      const services = await gladys.scanNetwork('mdns', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
      return services
        .map((service) => parseCastService({ ...service, record: parseMdnsTxt(service.txt ?? []) }))
        .filter(Boolean)
        .map((info) => this.createCast(info));
    } catch (err) {
      logger.warn(`mDNS scan failed: ${err.message}`);
      return [];
    }
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
        // A Cast device typed by IP: its id is its address, there is no mDNS
        // record to read the real one from.
        players.push(
          this.createCast({
            id: `ip-${entry.host.replace(/\./g, '-')}`,
            name: `Google Cast ${entry.host}`,
            host: entry.host,
            port: entry.port,
          }),
        );
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
