import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toStation } from '../src/catalog/radioBrowser.js';
import {
  didlMetadata,
  loadUpnpPlayer,
  parseDeviceDescription,
  parseSsdpHeaders,
  rendererUri,
  transportStateName,
} from '../src/players/upnp.js';
import { unescapeXml } from '../src/players/xml.js';
import { SONOS_DESCRIPTION, fakeUpnpRenderer, rawStation } from './helpers.js';

const GENERIC_DESCRIPTION = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <URLBase>http://192.168.1.40:8080/</URLBase>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Ampli salon</friendlyName>
    <manufacturer>Denon</manufacturer>
    <modelName>AVR-X1700H</modelName>
    <UDN>uuid:5f9ec1b3-ed59-1900-4530-0005cdabcdef</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
        <controlURL>upnp/control/AVTransport</controlURL>
      </service>
    </serviceList>
  </device>
</root>`;

test('parseSsdpHeaders reads the raw answer', () => {
  const headers = parseSsdpHeaders(
    'HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://192.168.1.30:1400/xml/device_description.xml\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n',
  );
  assert.equal(headers.location, 'http://192.168.1.30:1400/xml/device_description.xml');
  assert.equal(headers.st, 'urn:schemas-upnp-org:device:ZonePlayer:1');
});

test('a Sonos description gives the room name and the embedded renderer services', () => {
  const location = 'http://192.168.1.30:1400/xml/device_description.xml';
  const description = parseDeviceDescription(SONOS_DESCRIPTION, location);
  assert.equal(description.name, 'Salon & Cuisine');
  assert.equal(description.id, 'RINCON_000E58A1B2C301400');
  assert.equal(description.sonos, true);
  assert.equal(
    description.avTransport.controlURL,
    'http://192.168.1.30:1400/MediaRenderer/AVTransport/Control',
  );
  assert.equal(
    description.renderingControl.controlURL,
    'http://192.168.1.30:1400/MediaRenderer/RenderingControl/Control',
  );
});

test('a generic renderer honours URLBase; no AVTransport means not a player', () => {
  const description = parseDeviceDescription(
    GENERIC_DESCRIPTION,
    'http://192.168.1.40:8080/desc.xml',
  );
  assert.equal(description.name, 'Ampli salon');
  assert.equal(description.sonos, false);
  assert.equal(
    description.avTransport.controlURL,
    'http://192.168.1.40:8080/upnp/control/AVTransport',
  );
  assert.equal(description.renderingControl, undefined);
  assert.equal(
    parseDeviceDescription('<root><device><UDN>uuid:x</UDN></device></root>', 'http://a/'),
    null,
  );
});

test('Sonos gets its radio scheme for http streams only', () => {
  const http = toStation(rawStation());
  const https = toStation(rawStation({ url_resolved: 'https://secure.example.org/live' }));
  assert.equal(
    rendererUri(http, { sonos: true }),
    'x-rincon-mp3radio://stream.example.org/live.mp3',
  );
  assert.equal(rendererUri(https, { sonos: true }), 'https://secure.example.org/live');
  assert.equal(rendererUri(http, { sonos: false }), 'http://stream.example.org/live.mp3');
});

test('the DIDL metadata is escaped and typed as a broadcast', () => {
  const station = toStation(rawStation({ name: 'Rock & <Roll>' }));
  const didl = didlMetadata(station, station.url);
  assert.match(didl, /<dc:title>Rock &amp; &lt;Roll&gt;<\/dc:title>/);
  assert.match(didl, /object\.item\.audioItem\.audioBroadcast/);
  assert.match(didl, /protocolInfo="http-get:\*:audio\/mpeg:\*"/);
});

test('transport states map to the playback states', () => {
  assert.equal(transportStateName('PLAYING'), 'PLAYING');
  assert.equal(transportStateName('PAUSED_PLAYBACK'), 'PAUSED');
  assert.equal(transportStateName('TRANSITIONING'), 'BUFFERING');
  assert.equal(transportStateName('STOPPED'), 'IDLE');
  assert.equal(transportStateName('NO_MEDIA_PRESENT'), 'IDLE');
});

test('play sets the URI with its metadata, starts and sets the volume', async () => {
  const renderer = fakeUpnpRenderer();
  const player = await loadUpnpPlayer(renderer.location, { fetch: renderer.fetch });
  await player.play(toStation(rawStation()), { volume: 40 });
  assert.deepEqual(renderer.state.actions, ['Stop', 'SetAVTransportURI', 'Play', 'SetVolume']);
  assert.equal(renderer.state.uri, 'x-rincon-mp3radio://stream.example.org/live.mp3');
  assert.match(unescapeXml(renderer.state.metadata), /<dc:title>Radio Test<\/dc:title>/);
  assert.equal(renderer.state.volume, 40);
  assert.deepEqual(await player.getStatus(), { state: 'PLAYING', volume: 40, mute: false });
  await player.setMute(true);
  await player.stop();
  assert.deepEqual(await player.getStatus(), { state: 'IDLE', volume: 40, mute: true });
});

test('a refused action is a readable error', async () => {
  const renderer = fakeUpnpRenderer();
  const player = await loadUpnpPlayer(renderer.location, { fetch: renderer.fetch });
  await assert.rejects(player.av('Seek'), /Seek refused \(HTTP 500, UPnP error 401\)/);
});
