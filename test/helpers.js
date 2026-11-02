// Shared fakes of the tests: no test touches the network.

import { Duplex, PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_MEDIA_RECEIVER,
  NAMESPACES,
  createMessageReader,
  encodeMessage,
} from '../src/players/castProtocol.js';
import { Store } from '../src/store.js';

export const rawStation = (overrides = {}) => ({
  stationuuid: '11111111-1111-1111-1111-111111111111',
  name: 'Radio Test',
  url: 'http://stream.example.org/live',
  url_resolved: 'http://stream.example.org/live.mp3',
  homepage: 'https://radio.example.org',
  favicon: 'https://radio.example.org/logo.png',
  tags: 'news,talk',
  countrycode: 'FR',
  codec: 'MP3',
  bitrate: 128,
  hls: 0,
  ...overrides,
});

export const STATIONS = [
  rawStation(),
  rawStation({
    stationuuid: '22222222-2222-2222-2222-222222222222',
    name: 'Jazz Club',
    tags: 'jazz',
    url_resolved: 'https://jazz.example.org/stream.aac',
    codec: 'AAC',
  }),
  rawStation({
    stationuuid: '33333333-3333-3333-3333-333333333333',
    name: 'HLS Only',
    url_resolved: 'https://hls.example.org/live.m3u8',
    hls: 1,
  }),
];

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * A fake fetch for the Radio Browser API: records the requested URLs and
 * answers from the fixtures.
 */
export function fakeRadioBrowserFetch({ stations = STATIONS, failServers = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (failServers.includes(parsed.hostname)) {
      throw new Error('connect ECONNREFUSED');
    }
    if (parsed.hostname === 'all.api.radio-browser.info') {
      return jsonResponse([{ name: 'de1.api.radio-browser.info' }]);
    }
    if (parsed.pathname === '/json/stations/search') {
      const name = parsed.searchParams.get('name')?.toLowerCase();
      const tag = parsed.searchParams.get('tag');
      const country = parsed.searchParams.get('countrycode');
      return jsonResponse(
        stations.filter(
          (s) =>
            s.countrycode === country &&
            (!name || s.name.toLowerCase().includes(name)) &&
            (!tag || s.tags.split(',').includes(tag)),
        ),
      );
    }
    if (parsed.pathname.startsWith('/json/stations/byuuid/')) {
      const uuid = parsed.pathname.split('/').pop();
      return jsonResponse(stations.filter((s) => s.stationuuid === uuid));
    }
    if (parsed.pathname.startsWith('/json/url/')) {
      return jsonResponse({ ok: true });
    }
    if (parsed.pathname === '/json/countries') {
      return jsonResponse([{ name: 'France', iso_3166_1: 'FR', stationcount: 3562 }]);
    }
    return jsonResponse({ error: 'not found' }, 404);
  };
  return { fetch: fetchImpl, calls };
}

export const SONOS_DESCRIPTION = `<?xml version="1.0" encoding="utf-8" ?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:ZonePlayer:1</deviceType>
    <friendlyName>192.168.1.30 - Sonos One</friendlyName>
    <manufacturer>Sonos, Inc.</manufacturer>
    <modelName>Sonos One</modelName>
    <roomName>Salon &amp; Cuisine</roomName>
    <UDN>uuid:RINCON_000E58A1B2C301400</UDN>
    <deviceList>
      <device>
        <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
            <controlURL>/MediaRenderer/RenderingControl/Control</controlURL>
          </service>
          <service>
            <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
            <controlURL>/MediaRenderer/AVTransport/Control</controlURL>
          </service>
        </serviceList>
      </device>
    </deviceList>
  </device>
</root>`;

/**
 * A fake UPnP renderer, at the fetch level: serves its description and
 * answers the SOAP actions, keeping a transport state.
 */
export function fakeUpnpRenderer({ host = '192.168.1.30', description = SONOS_DESCRIPTION } = {}) {
  const state = { transport: 'STOPPED', volume: 25, mute: 0, uri: null, actions: [], down: false };
  const location = `http://${host}:1400/xml/device_description.xml`;
  const fetchImpl = async (url, options = {}) => {
    if (state.down) {
      throw new Error('connect EHOSTUNREACH');
    }
    const parsed = new URL(url);
    if (parsed.host !== `${host}:1400`) {
      throw new Error(`unexpected host ${parsed.host}`);
    }
    if (parsed.pathname === '/xml/device_description.xml') {
      return new Response(description, { status: 200 });
    }
    const action = /#(\w+)"$/.exec(options.headers?.SOAPACTION ?? '')?.[1];
    state.actions.push(action);
    const body = String(options.body ?? '');
    const reply = (inner) =>
      new Response(
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`,
        { status: 200 },
      );
    switch (action) {
      case 'SetAVTransportURI':
        state.uri = /<CurrentURI>([^<]*)<\/CurrentURI>/.exec(body)[1];
        state.metadata = /<CurrentURIMetaData>([\s\S]*)<\/CurrentURIMetaData>/.exec(body)[1];
        return reply('<u:SetAVTransportURIResponse/>');
      case 'Play':
        state.transport = 'PLAYING';
        return reply('<u:PlayResponse/>');
      case 'Stop':
        state.transport = 'STOPPED';
        return reply('<u:StopResponse/>');
      case 'Pause':
        state.transport = 'PAUSED_PLAYBACK';
        return reply('<u:PauseResponse/>');
      case 'GetTransportInfo':
        return reply(
          `<u:GetTransportInfoResponse><CurrentTransportState>${state.transport}</CurrentTransportState></u:GetTransportInfoResponse>`,
        );
      case 'SetVolume':
        state.volume = Number(/<DesiredVolume>(\d+)</.exec(body)[1]);
        return reply('<u:SetVolumeResponse/>');
      case 'GetVolume':
        return reply(
          `<u:GetVolumeResponse><CurrentVolume>${state.volume}</CurrentVolume></u:GetVolumeResponse>`,
        );
      case 'SetMute':
        state.mute = Number(/<DesiredMute>(\d)</.exec(body)[1]);
        return reply('<u:SetMuteResponse/>');
      case 'GetMute':
        return reply(
          `<u:GetMuteResponse><CurrentMute>${state.mute}</CurrentMute></u:GetMuteResponse>`,
        );
      default:
        return new Response(
          '<s:Envelope><s:Body><s:Fault><errorCode>401</errorCode></s:Fault></s:Body></s:Envelope>',
          {
            status: 500,
          },
        );
    }
  };
  return { fetch: fetchImpl, state, location, host };
}

/**
 * A fake Cast device: `connect` returns the client side of an in-memory
 * socket; the device side answers the receiver and media requests.
 */
export function fakeCastDevice() {
  const state = {
    app: null,
    media: null,
    volume: { level: 0.4, muted: false },
    received: [],
    connections: 0,
  };
  const connect = async () => {
    state.connections += 1;
    const toDevice = new PassThrough();
    const toClient = new PassThrough();
    const socket = Duplex.from({ readable: toClient, writable: toDevice });
    const reply = (request, namespace, data) =>
      toClient.write(
        encodeMessage({
          sourceId: request.destinationId,
          destinationId: request.sourceId,
          namespace,
          data: { ...data, requestId: request.data.requestId },
        }),
      );
    const receiverStatus = () => ({
      type: 'RECEIVER_STATUS',
      status: {
        volume: state.volume,
        applications: state.app ? [state.app] : [],
      },
    });
    toDevice.on(
      'data',
      createMessageReader((message) => {
        state.received.push(message);
        const { namespace, data } = message;
        if (namespace === NAMESPACES.RECEIVER) {
          if (data.type === 'LAUNCH') {
            state.app = {
              appId: DEFAULT_MEDIA_RECEIVER,
              sessionId: 'session-1',
              transportId: 'transport-1',
              namespaces: [{ name: NAMESPACES.MEDIA }],
            };
          } else if (data.type === 'STOP') {
            state.app = null;
            state.media = null;
          } else if (data.type === 'SET_VOLUME') {
            state.volume = { ...state.volume, ...data.volume };
          }
          reply(message, NAMESPACES.RECEIVER, receiverStatus());
        } else if (namespace === NAMESPACES.MEDIA) {
          if (data.type === 'LOAD') {
            state.media = { mediaSessionId: 7, playerState: 'PLAYING', media: data.media };
          } else if (data.type === 'PAUSE' && state.media) {
            state.media.playerState = 'PAUSED';
          } else if (data.type === 'PLAY' && state.media) {
            state.media.playerState = 'PLAYING';
          }
          reply(message, NAMESPACES.MEDIA, {
            type: 'MEDIA_STATUS',
            status: state.media ? [state.media] : [],
          });
        }
      }),
    );
    // Closing the client side ends the fake connection.
    socket.on('close', () => toClient.end());
    return socket;
  };
  return { connect, state };
}

export function tempStore() {
  return new Store(mkdtempSync(path.join(tmpdir(), 'radioplayer-')));
}
