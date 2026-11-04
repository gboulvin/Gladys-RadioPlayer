// A complete integration wired against the fake Gladys of the SDK: one Sonos
// found by SSDP, one Google Cast speaker found by mDNS, the fake catalog.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { RadioBrowserClient } from '../src/catalog/radioBrowser.js';
import { normalizeConfig } from '../src/config.js';
import { buildDevice } from '../src/devices.js';
import { LogoStore } from '../src/images.js';
import { PlayerRegistry } from '../src/players/index.js';
import { RadioService } from '../src/radio.js';
import { fakeCastDevice, fakeRadioBrowserFetch, fakeUpnpRenderer, tempStore } from './helpers.js';

export const SSDP_ANSWER = {
  source_ip: '192.168.1.30',
  source_port: 1900,
  headers:
    'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.30:1400/xml/device_description.xml\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n',
};
export const MDNS_ANSWER = {
  name: 'Nest-Mini._googlecast._tcp.local',
  host: 'nest.local',
  addresses: ['192.168.1.50'],
  port: 8009,
  txt: ['id=0123456789abcdef', 'fn=Cuisine', 'md=Google Nest Mini'],
};

export async function setup({
  scanResults,
  configOverrides = {},
  timers = [],
  cast: castOptions,
  streams,
} = {}) {
  const gladys = createFakeGladys({
    scanResults: scanResults ?? { ssdp: [SSDP_ANSWER], mdns: [MDNS_ANSWER] },
  });
  const renderer = fakeUpnpRenderer();
  const cast = fakeCastDevice(castOptions);
  const catalogFetch = fakeRadioBrowserFetch({ streams });
  const catalog = new RadioBrowserClient({ fetch: catalogFetch.fetch });
  const store = tempStore();
  await store.load();
  const registry = new PlayerRegistry({ fetch: renderer.fetch, castConnect: cast.connect });
  const config = normalizeConfig(configOverrides);
  const radio = new RadioService({
    gladys,
    catalog,
    store,
    registry,
    config,
    schedule: (fn) => timers.push(fn),
  });
  const logos = new LogoStore({ fetch: async () => new Response('x', { status: 404 }) });
  const { players } = await registry.discover(gladys, config);
  const devices = players.map((player) => buildDevice(gladys, player));
  await gladys.publishDiscoveredDevices(devices);
  const sonos = devices.find((d) => d.params.some((p) => p.value === 'upnp'));
  const nest = devices.find((d) => d.params.some((p) => p.value === 'cast'));
  const close = () => registry.closeAll();
  return {
    gladys,
    renderer,
    cast,
    catalog,
    catalogFetch,
    store,
    registry,
    config,
    radio,
    logos,
    devices,
    sonos,
    nest,
    close,
    timers,
  };
}
