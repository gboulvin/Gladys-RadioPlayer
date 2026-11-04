import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevice } from '../src/devices.js';
import { PlayerRegistry } from '../src/players/index.js';
import { SCENE_TRIGGERS } from '../src/radio.js';
import { createSceneActions } from '../src/scenes.js';
import { fakeUpnpRenderer } from './helpers.js';
import { MDNS_ANSWER, SSDP_ANSWER, setup } from './setup.js';

test('discovery finds the Sonos (SSDP) and the Cast speaker (mDNS), Gladys accepts them', async () => {
  const ctx = await setup();
  try {
    assert.equal(ctx.gladys.fake.discoveredDevices.length, 2);
    assert.equal(ctx.sonos.name, 'Salon & Cuisine');
    assert.equal(ctx.sonos.external_id, 'ext:test-integration:upnp:rincon_000e58a1b2c301400');
    assert.equal(ctx.nest.name, 'Cuisine');
    assert.equal(ctx.nest.external_id, 'ext:test-integration:cast:0123456789abcdef');
    assert.deepEqual(ctx.gladys.fake.scans.map((scan) => scan.type).sort(), ['mdns', 'ssdp']);
  } finally {
    ctx.close();
  }
});

test('an SSDP answer pointing to another host is not followed', async () => {
  const gladys = createFakeGladys({
    scanResults: {
      ssdp: [
        {
          source_ip: '192.168.1.99',
          source_port: 1900,
          headers:
            'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.30:1400/xml/device_description.xml\r\n\r\n',
        },
      ],
    },
  });
  const renderer = fakeUpnpRenderer();
  const registry = new PlayerRegistry({ fetch: renderer.fetch });
  const { players } = await registry.discover(gladys, {
    enable_upnp: true,
    enable_cast: false,
    manual_players: '',
  });
  assert.equal(players.length, 0);
});

test('disabled channels are not scanned; manual players are added', async () => {
  const ctx = await setup({
    configOverrides: {
      enable_upnp: false,
      enable_cast: false,
      manual_players: '192.168.1.77, http://192.168.1.30:1400/xml/device_description.xml',
    },
  });
  try {
    assert.equal(ctx.gladys.fake.scans.length, 0);
    assert.deepEqual(ctx.devices.map((d) => d.name).sort(), [
      'Google Cast 192.168.1.77',
      'Salon & Cuisine',
    ]);
  } finally {
    ctx.close();
  }
});

test('playing a station publishes the now-playing states and counts a click', async () => {
  const ctx = await setup();
  try {
    await ctx.radio.playQuery(ctx.sonos.external_id, 'radio test');
    assert.equal(ctx.renderer.state.transport, 'PLAYING');
    const id = ctx.sonos.external_id;
    assert.equal(ctx.gladys.fake.lastState(`${id}:title`), 'Radio Test');
    assert.equal(ctx.gladys.fake.lastState(`${id}:artist`), 'news, talk');
    assert.equal(ctx.gladys.fake.lastState(`${id}:album`), 'MP3 · 128 kbps');
    assert.equal(ctx.gladys.fake.lastState(`${id}:playback_state`), MUSIC_PLAYBACK_STATE.BUFFERING);
    assert.equal(
      ctx.gladys.fake.lastState(`${id}:station`),
      '11111111-1111-1111-1111-111111111111',
    );
    assert.ok(ctx.catalogFetch.calls.some((url) => url.pathname.startsWith('/json/url/')));
    assert.equal(ctx.store.recent[0].name, 'Radio Test');

    // The settle re-read sees the speaker playing.
    await ctx.timers.shift()();
    assert.equal(ctx.gladys.fake.lastState(`${id}:playback_state`), MUSIC_PLAYBACK_STATE.PLAYING);
    assert.equal(ctx.gladys.fake.lastState(`${id}:volume`), 25);
  } finally {
    ctx.close();
  }
});

test('observed transitions fire the scene triggers', async () => {
  const ctx = await setup();
  try {
    const id = ctx.sonos.external_id;
    await ctx.radio.refresh(id); // first read: no transition
    assert.equal(ctx.gladys.fake.sceneEvents.length, 0);

    await ctx.radio.playQuery(id, 'Jazz Club');
    const started = ctx.gladys.fake.sceneEvents.at(-1);
    assert.equal(started.key, SCENE_TRIGGERS.PLAYBACK_STARTED);
    assert.equal(started.data.station, 'Jazz Club');
    assert.equal(started.data.player, 'Salon & Cuisine');
    assert.equal(started.data.device, id);

    // The speaker stops by itself (stream ended, its app...).
    ctx.renderer.state.transport = 'STOPPED';
    await ctx.radio.refresh(id);
    const stopped = ctx.gladys.fake.sceneEvents.at(-1);
    assert.equal(stopped.key, SCENE_TRIGGERS.PLAYBACK_STOPPED);
    assert.equal(stopped.data.station, 'Jazz Club');
    assert.equal(ctx.gladys.fake.lastState(`${id}:title`), '');
  } finally {
    ctx.close();
  }
});

test('a transition caused by a scene action fires no trigger (no scene loop)', async () => {
  const ctx = await setup();
  try {
    const scenes = createSceneActions({ radio: ctx.radio, store: ctx.store });
    const outputs = await scenes.play_station({
      fields: { device: ctx.sonos.external_id, station: 'Jazz Club', volume: 30 },
    });
    assert.deepEqual(outputs, {
      started: true,
      station_name: 'Jazz Club',
      station_uuid: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(ctx.renderer.state.volume, 30);
    assert.deepEqual(await scenes.stop_radio({ fields: { device: ctx.sonos.external_id } }), {
      stopped: true,
    });
    assert.equal(ctx.gladys.fake.sceneEvents.length, 0);
  } finally {
    ctx.close();
  }
});

test('scene actions report a missing station or favorite as an output', async () => {
  const ctx = await setup();
  try {
    const scenes = createSceneActions({ radio: ctx.radio, store: ctx.store });
    const empty = { started: false, station_name: '', station_uuid: '' };
    assert.deepEqual(
      await scenes.play_station({
        fields: { device: ctx.sonos.external_id, station: 'Unknown FM' },
      }),
      empty,
    );
    assert.deepEqual(
      await scenes.play_favorite({ fields: { device: ctx.sonos.external_id, position: 3 } }),
      empty,
    );
    await ctx.store.addFavorite({
      uuid: '22222222-2222-2222-2222-222222222222',
      name: 'Jazz Club',
    });
    assert.equal(
      (await scenes.play_favorite({ fields: { device: ctx.nest.external_id, position: 1 } }))
        .station_name,
      'Jazz Club',
    );
    assert.equal(ctx.cast.state.media.media.metadata.title, 'Jazz Club');
  } finally {
    ctx.close();
  }
});

test('next / previous zap through the top stations, then the favorites', async () => {
  const ctx = await setup();
  try {
    const id = ctx.nest.external_id;
    assert.equal((await ctx.radio.zap(id, 1)).name, 'Radio Test');
    assert.equal((await ctx.radio.zap(id, 1)).name, 'Jazz Club');
    assert.equal((await ctx.radio.zap(id, 1)).name, 'Radio Test');
    assert.equal((await ctx.radio.zap(id, -1)).name, 'Jazz Club');

    await ctx.store.addFavorite({
      uuid: '22222222-2222-2222-2222-222222222222',
      name: 'Jazz Club',
    });
    await ctx.store.addFavorite({
      uuid: '11111111-1111-1111-1111-111111111111',
      name: 'Radio Test',
    });
    // Favorites order: Jazz Club, Radio Test. Current: Jazz Club.
    assert.equal((await ctx.radio.zap(id, 1)).name, 'Radio Test');
  } finally {
    ctx.close();
  }
});

test('the playback_state feature plays the last station, pauses and stops', async () => {
  const ctx = await setup();
  try {
    const id = ctx.nest.external_id;
    await ctx.radio.playQuery(id, 'Jazz Club');
    await ctx.radio.setPlaybackState(id, MUSIC_PLAYBACK_STATE.PAUSED);
    assert.equal(ctx.cast.state.media.playerState, 'PAUSED');
    await ctx.radio.setPlaybackState(id, MUSIC_PLAYBACK_STATE.PLAYING);
    assert.equal(ctx.cast.state.media.playerState, 'PLAYING');
    await ctx.radio.setPlaybackState(id, MUSIC_PLAYBACK_STATE.IDLE);
    assert.equal(ctx.cast.state.app, null);
    // Nothing loaded: "play" restarts the last station of this speaker.
    await ctx.radio.setPlaybackState(id, MUSIC_PLAYBACK_STATE.PLAYING);
    assert.equal(ctx.cast.state.media.media.metadata.title, 'Jazz Club');
    await ctx.radio.setVolume(id, 120);
    assert.equal(ctx.cast.state.volume.level, 1);
  } finally {
    ctx.close();
  }
});

test('a speaker that stops answering is reported once, after two failures', async () => {
  const ctx = await setup();
  try {
    const id = ctx.sonos.external_id;
    await ctx.radio.refresh(id);
    ctx.renderer.state.down = true;
    await ctx.radio.refresh(id);
    assert.equal(ctx.gladys.fake.sceneEvents.length, 0);
    await ctx.radio.refresh(id);
    await ctx.radio.refresh(id);
    const events = ctx.gladys.fake.sceneEvents.filter(
      (e) => e.key === SCENE_TRIGGERS.PLAYER_UNREACHABLE,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].data.player, 'Salon & Cuisine');
    assert.equal(ctx.radio.status(id).unreachable, true);
    ctx.renderer.state.down = false;
    await ctx.radio.refresh(id);
    assert.equal(ctx.radio.status(id).unreachable, false);
  } finally {
    ctx.close();
  }
});

test('after a restart, a created device is rebuilt from its params', async () => {
  const ctx = await setup();
  try {
    const renderer = fakeUpnpRenderer();
    const registry = new PlayerRegistry({ fetch: renderer.fetch, castConnect: ctx.cast.connect });
    const gladys = createFakeGladys({ devices: [ctx.sonos, ctx.nest] });
    gladys.devices = [ctx.sonos, ctx.nest];
    const sonos = await registry.resolve(gladys, ctx.sonos.external_id);
    assert.equal(sonos.name, 'Salon & Cuisine');
    const nest = await registry.resolve(gladys, ctx.nest.external_id);
    assert.equal(nest.description.host, '192.168.1.50');
    assert.equal(registry.deviceExternalId(gladys, nest), ctx.nest.external_id);
    await assert.rejects(
      registry.resolve(gladys, 'ext:test-integration:upnp:unknown'),
      /Discovery tab/,
    );
    registry.closeAll();
  } finally {
    ctx.close();
  }
});

test('the station select lists the given stations', () => {
  const gladys = createFakeGladys();
  const renderer = fakeUpnpRenderer();
  const player = { kind: 'upnp', id: 'X', name: 'X', description: { location: renderer.location } };
  const device = buildDevice(gladys, player, {
    stations: [
      { uuid: 'a', name: 'A' },
      { uuid: 'b', name: 'B' },
    ],
  });
  const select = device.features.find((f) => f.external_id.endsWith(':station'));
  assert.deepEqual(select.supported_options, [
    { value: 'a', label: 'A', sort_order: 0 },
    { value: 'b', label: 'B', sort_order: 1 },
  ]);
});

test('scans run one at a time, and a busy scan is retried', async (t) => {
  // The Gladys core runs ONE mediated scan per integration: a second one
  // while the first runs is a 409 EXTERNAL_INTEGRATION_SCAN_ALREADY_RUNNING.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = fakeUpnpRenderer();
  let running = 0;
  let busyOnce = true;
  const calls = [];
  const gladys = createFakeGladys();
  gladys.scanNetwork = async (type) => {
    calls.push(type);
    if (running > 0) {
      throw Object.assign(new Error('EXTERNAL_INTEGRATION_SCAN_ALREADY_RUNNING'), { status: 409 });
    }
    if (type === 'mdns' && busyOnce) {
      busyOnce = false;
      throw Object.assign(new Error('EXTERNAL_INTEGRATION_SCAN_ALREADY_RUNNING'), { status: 409 });
    }
    running += 1;
    await Promise.resolve();
    running -= 1;
    return type === 'ssdp' ? [SSDP_ANSWER] : [MDNS_ANSWER];
  };
  const registry = new PlayerRegistry({ fetch: renderer.fetch, castConnect: async () => null });
  const config = { enable_upnp: true, enable_cast: true, manual_players: '' };
  const first = registry.discover(gladys, config);
  const second = registry.discover(gladys, config);
  // Let the first run reach the retry delay of its busy mDNS scan.
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.mock.timers.tick(10_000);
  const { players, report } = await first;
  await second;
  assert.equal(players.length, 2);
  assert.deepEqual(calls, ['ssdp', 'mdns', 'mdns', 'ssdp', 'mdns']);
  assert.equal(report.ssdp.answers, 1);
  assert.equal(report.mdns.players, 1);
  assert.equal(report.mdns.error, null);
  registry.closeAll();
});

test('a failing channel is reported, the other one still works', async () => {
  const renderer = fakeUpnpRenderer();
  const gladys = createFakeGladys();
  gladys.scanNetwork = async (type) => {
    if (type === 'mdns') {
      throw Object.assign(new Error('network_discovery: capture type mdns is not declared'), {
        status: 403,
      });
    }
    return [SSDP_ANSWER];
  };
  const registry = new PlayerRegistry({ fetch: renderer.fetch });
  const { players, report } = await registry.discover(gladys, {
    enable_upnp: true,
    enable_cast: true,
    manual_players: '',
  });
  assert.equal(players.length, 1);
  assert.match(report.mdns.error, /not declared/);
  assert.deepEqual(report.players, [{ name: 'Salon & Cuisine', kind: 'upnp' }]);
});

test('a TV answering as Google Cast and as DLNA is kept once, as Google Cast', async () => {
  const renderer = fakeUpnpRenderer({ host: '192.168.1.50' });
  const gladys = createFakeGladys({
    scanResults: {
      ssdp: [
        {
          source_ip: '192.168.1.50',
          source_port: 1900,
          headers:
            'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.50:1400/xml/device_description.xml\r\n\r\n',
        },
      ],
      mdns: [MDNS_ANSWER],
    },
  });
  const registry = new PlayerRegistry({ fetch: renderer.fetch, castConnect: async () => null });
  const { players, report } = await registry.discover(gladys, {
    enable_upnp: true,
    enable_cast: true,
    manual_players: '',
  });
  assert.deepEqual(
    players.map((p) => p.kind),
    ['cast'],
  );
  assert.equal(report.ssdp.duplicates, 1);
  registry.closeAll();
});
