// -----------------------------------------------------------------------------
// UPnP / DLNA media renderers: Sonos, network receivers (Denon/Marantz HEOS,
// Yamaha MusicCast, Onkyo, Pioneer...), smart TVs, Freebox Player, Kodi,
// BubbleUPnP / Hi-Fi apps...
//
// Discovery: an SSDP M-SEARCH, emitted by the Gladys core on our behalf (the
// container cannot broadcast, see `network_discovery` in the manifest). The
// answers carry the LOCATION of the device description, fetched in unicast.
//
// Control: SOAP over HTTP on the AVTransport (SetAVTransportURI, Play, Stop,
// GetTransportInfo) and RenderingControl (volume, mute) services. The renderer
// downloads the radio stream itself: no audio goes through Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { streamContentType } from '../catalog/radioBrowser.js';
import { escapeXml, tagBlocks, tagText } from './xml.js';

const logger = createLogger({ name: 'upnp' });

export const SSDP_SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:MediaRenderer:1',
  'urn:schemas-upnp-org:device:ZonePlayer:1',
];

const AV_TRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';
const RENDERING_CONTROL = 'urn:schemas-upnp-org:service:RenderingControl:1';
const REQUEST_TIMEOUT_MS = 6000;

/** Parse a raw SSDP answer into its (lowercased) headers. */
export function parseSsdpHeaders(raw) {
  const headers = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return headers;
}

/**
 * Read a device description: identity and the control URLs of the services
 * a radio player needs. Returns null when the device cannot play a URL.
 * @param {string} xml
 * @param {string} location URL the description was fetched from
 */
export function parseDeviceDescription(xml, location) {
  const base = tagText(xml, 'URLBase') || location;
  const services = {};
  for (const block of tagBlocks(xml, 'service')) {
    const serviceType = tagText(block, 'serviceType');
    const controlURL = tagText(block, 'controlURL');
    if (!controlURL) {
      continue;
    }
    // The first one wins: Sonos also exposes a second AVTransport on its
    // MediaServer embedded device, the renderer one comes first.
    for (const [key, type] of [
      ['avTransport', AV_TRANSPORT],
      ['renderingControl', RENDERING_CONTROL],
    ]) {
      if (!services[key] && serviceType.startsWith(type.slice(0, -1))) {
        services[key] = { serviceType, controlURL: new URL(controlURL, base).toString() };
      }
    }
  }
  if (!services.avTransport) {
    return null;
  }
  const udn = tagText(xml, 'UDN').replace(/^uuid:/i, '');
  const manufacturer = tagText(xml, 'manufacturer');
  // Sonos names the room in <roomName>; the friendlyName is "IP - Model".
  const name = tagText(xml, 'roomName') || tagText(xml, 'friendlyName') || 'UPnP renderer';
  return {
    id: udn || new URL(location).host,
    name,
    manufacturer,
    model: tagText(xml, 'modelName'),
    location,
    sonos: /sonos/i.test(manufacturer),
    ...services,
  };
}

/** DIDL-Lite metadata of a radio stream (title + artwork on the renderer screen). */
export function didlMetadata(station, uri) {
  const protocolInfo = `http-get:*:${streamContentType(station)}:*`;
  return (
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
    '<item id="radioplayer" parentID="0" restricted="1">' +
    `<dc:title>${escapeXml(station.name)}</dc:title>` +
    '<upnp:class>object.item.audioItem.audioBroadcast</upnp:class>' +
    (station.favicon ? `<upnp:albumArtURI>${escapeXml(station.favicon)}</upnp:albumArtURI>` : '') +
    `<res protocolInfo="${escapeXml(protocolInfo)}">${escapeXml(uri)}</res>` +
    '</item></DIDL-Lite>'
  );
}

/** The URI given to the renderer: Sonos wants its own scheme for http radio streams. */
export function rendererUri(station, { sonos }) {
  if (sonos && /^http:\/\//i.test(station.url)) {
    return `x-rincon-mp3radio://${station.url.slice('http://'.length)}`;
  }
  return station.url;
}

/** Map a UPnP TransportState to a MUSIC_PLAYBACK_STATE name. */
export function transportStateName(state) {
  switch (state) {
    case 'PLAYING':
      return 'PLAYING';
    case 'PAUSED_PLAYBACK':
    case 'PAUSED_RECORDING':
      return 'PAUSED';
    case 'TRANSITIONING':
      return 'BUFFERING';
    default:
      return 'IDLE';
  }
}

export class UpnpPlayer {
  /**
   * @param {ReturnType<typeof parseDeviceDescription>} description
   * @param {{ fetch?: typeof fetch }} [options]
   */
  constructor(description, { fetch: fetchImpl = globalThis.fetch } = {}) {
    this.kind = 'upnp';
    this.description = description;
    this.fetch = fetchImpl;
  }

  get id() {
    return this.description.id;
  }

  get name() {
    return this.description.name;
  }

  async soap(service, action, args = {}) {
    if (!service) {
      throw new Error(`${this.name} does not support ${action}`);
    }
    const body =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
      `<u:${action} xmlns:u="${service.serviceType}">` +
      Object.entries(args)
        .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
        .join('') +
      `</u:${action}></s:Body></s:Envelope>`;
    const response = await this.fetch(service.controlURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPACTION: `"${service.serviceType}#${action}"`,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      const code = tagText(text, 'errorCode');
      throw new Error(
        `${this.name}: ${action} refused (HTTP ${response.status}${code ? `, UPnP error ${code}` : ''})`,
      );
    }
    return text;
  }

  av(action, args = {}) {
    return this.soap(this.description.avTransport, action, { InstanceID: 0, ...args });
  }

  rc(action, args = {}) {
    return this.soap(this.description.renderingControl, action, {
      InstanceID: 0,
      Channel: 'Master',
      ...args,
    });
  }

  async play(station, { volume } = {}) {
    const uri = rendererUri(station, this.description);
    logger.info(`${this.name}: playing ${station.name} (${uri})`);
    // Some renderers refuse a new URI while playing: stop first, ignore errors.
    await this.av('Stop').catch(() => {});
    await this.av('SetAVTransportURI', {
      CurrentURI: uri,
      CurrentURIMetaData: didlMetadata(station, uri),
    });
    await this.av('Play', { Speed: 1 });
    if (volume > 0) {
      await this.setVolume(volume).catch((err) => logger.warn(err.message));
    }
  }

  async stop() {
    await this.av('Stop');
  }

  async pause() {
    // A live radio cannot really pause: renderers that refuse Pause stop.
    await this.av('Pause').catch(() => this.av('Stop'));
  }

  async resume() {
    await this.av('Play', { Speed: 1 });
  }

  async setVolume(volume) {
    await this.rc('SetVolume', { DesiredVolume: Math.round(volume) });
  }

  async setMute(mute) {
    await this.rc('SetMute', { DesiredMute: mute ? 1 : 0 });
  }

  /** @returns {Promise<{ state: string, volume: number|null, mute: boolean|null }>} */
  async getStatus() {
    const info = await this.av('GetTransportInfo');
    const status = { state: transportStateName(tagText(info, 'CurrentTransportState')) };
    if (this.description.renderingControl) {
      const [volume, mute] = await Promise.all([
        this.rc('GetVolume').then((xml) => Number(tagText(xml, 'CurrentVolume'))),
        this.rc('GetMute').then((xml) => tagText(xml, 'CurrentMute') === '1'),
      ]).catch(() => [null, null]);
      status.volume = Number.isFinite(volume) ? volume : null;
      status.mute = mute;
    }
    return status;
  }

  close() {}
}

/**
 * Fetch and parse a device description.
 * @returns {Promise<UpnpPlayer|null>}
 */
export async function loadUpnpPlayer(location, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(location, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const description = parseDeviceDescription(await response.text(), location);
  return description ? new UpnpPlayer(description, { fetch: fetchImpl }) : null;
}
