import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RadioBrowserClient,
  isMp3,
  mp3UrlGuesses,
  toStation,
} from '../src/catalog/radioBrowser.js';
import { fakeRadioBrowserFetch, rawStation } from './helpers.js';
import { setup } from './setup.js';

const JAZZ_AAC = 'https://jazz.example.org/stream.aac';
const JAZZ_MP3 = 'https://jazz.example.org/stream.mp3';
const isAac = (media) => media.contentId.endsWith('.aac');

test('mp3UrlGuesses swaps the codec token of the path only', () => {
  assert.deepEqual(mp3UrlGuesses('http://radio.rtbf.be/c21-metal/aac-128/fl'), [
    'http://radio.rtbf.be/c21-metal/mp3-128/fl',
  ]);
  assert.deepEqual(mp3UrlGuesses('http://direct.franceinter.fr/live/franceinter-hifi.aac'), [
    'http://direct.franceinter.fr/live/franceinter-hifi.mp3',
  ]);
  assert.deepEqual(mp3UrlGuesses('https://ice.example/stream.ogg?t=1'), [
    'https://ice.example/stream.mp3?t=1',
  ]);
  assert.deepEqual(mp3UrlGuesses('http://x/live/aac-48/s'), [
    'http://x/live/mp3-48/s',
    'http://x/live/mp3-128/s',
  ]);
  // No codec token, or already MP3: nothing to guess. Never another host.
  assert.deepEqual(mp3UrlGuesses('http://x/stream'), []);
  assert.deepEqual(mp3UrlGuesses('http://x/radio.mp3'), []);
  assert.deepEqual(mp3UrlGuesses('http://aac.example/live'), []);
  assert.deepEqual(mp3UrlGuesses('not a url'), []);
});

test('isMp3', () => {
  assert.equal(isMp3(toStation(rawStation())), true);
  assert.equal(isMp3(toStation(rawStation({ codec: 'AAC', url_resolved: JAZZ_AAC }))), false);
  assert.equal(isMp3(toStation(rawStation({ codec: '', url_resolved: 'http://x/a.mp3' }))), true);
});

test('mp3Variants: a twin entry of the directory, then a confirmed guess', async () => {
  const stations = [
    rawStation({
      stationuuid: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12),
      name: 'Jazz Club',
      codec: 'AAC',
      url_resolved: JAZZ_AAC,
    }),
    rawStation({
      stationuuid: 'b'.repeat(8) + '-bbbb-bbbb-bbbb-' + 'b'.repeat(12),
      name: 'Jazz Club',
      codec: 'MP3',
      url_resolved: 'http://mirror.example.org/jazz',
    }),
  ];
  const { fetch, calls } = fakeRadioBrowserFetch({
    stations,
    streams: { [JAZZ_MP3]: 'audio/mpeg' },
  });
  const catalog = new RadioBrowserClient({ fetch });
  const aac = toStation(stations[0]);
  const variants = await catalog.mp3Variants(aac);
  assert.deepEqual(
    variants.map((v) => [v.url, v.codec, v.uuid]),
    [
      ['http://mirror.example.org/jazz', 'MP3', aac.uuid],
      [JAZZ_MP3, 'MP3', aac.uuid],
    ],
  );
  // Cached: no second probe.
  const probes = calls.filter((u) => u.hostname === 'jazz.example.org').length;
  await catalog.mp3Variants(aac);
  assert.equal(calls.filter((u) => u.hostname === 'jazz.example.org').length, probes);
  assert.deepEqual(await catalog.mp3Variants(toStation(rawStation())), []);
});

test('a guess whose content type is not MP3 is not kept', async () => {
  const { fetch } = fakeRadioBrowserFetch({ stations: [], streams: { [JAZZ_MP3]: 'text/html' } });
  const catalog = new RadioBrowserClient({ fetch });
  assert.deepEqual(
    await catalog.mp3Variants(toStation(rawStation({ codec: 'AAC', url_resolved: JAZZ_AAC }))),
    [],
  );
});

test('Android TV: the MP3 version of an AAC station is played first', async () => {
  const ctx = await setup({ cast: { unsupported: isAac }, streams: { [JAZZ_MP3]: 'audio/mpeg' } });
  try {
    const station = await ctx.radio.playQuery(ctx.nest.external_id, 'Jazz Club');
    assert.equal(station.url, JAZZ_MP3);
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_MP3]);
    assert.equal(ctx.cast.state.media.media.contentType, 'audio/mpeg');
    // The station identity is kept: favorites and history use its uuid.
    assert.equal(ctx.store.recent[0].uuid, '22222222-2222-2222-2222-222222222222');
  } finally {
    ctx.close();
  }
});

test('a stream refused in the LOAD answer falls back to the next one at once', async () => {
  const ctx = await setup({
    configOverrides: { prefer_mp3: true },
    cast: { unsupported: (m) => m.contentId === JAZZ_MP3, failOn: 'load' },
    streams: { [JAZZ_MP3]: 'audio/mpeg' },
  });
  try {
    const station = await ctx.radio.playQuery(ctx.nest.external_id, 'Jazz Club');
    assert.equal(station.url, JAZZ_AAC);
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_MP3, JAZZ_AAC]);
  } finally {
    ctx.close();
  }
});

test('with "Prefer MP3 streams" off, the original stream is the only one', async () => {
  const ctx = await setup({
    configOverrides: { prefer_mp3: false },
    cast: { unsupported: isAac },
  });
  try {
    const id = ctx.nest.external_id;
    // With prefer_mp3 off, the only stream is the original: nothing to fall back on.
    await ctx.radio.playQuery(id, 'Jazz Club');
    await ctx.timers.shift()();
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_AAC]);
    assert.equal(ctx.radio.status(id).state, 'IDLE');
  } finally {
    ctx.close();
  }
});

test('the settle check replays the MP3 stream when the original one is dropped', async () => {
  const ctx = await setup({
    cast: { unsupported: (m) => m.contentId === JAZZ_MP3 },
    streams: { [JAZZ_MP3]: 'audio/mpeg' },
  });
  try {
    const id = ctx.nest.external_id;
    // MP3 first (accepted, then dropped by this device), AAC as the fallback.
    await ctx.radio.playQuery(id, 'Jazz Club');
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_MP3]);
    await ctx.timers.shift()();
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_MP3, JAZZ_AAC]);
    assert.equal(ctx.radio.current(id).url, JAZZ_AAC);
    assert.ok(!ctx.gladys.fake.sceneEvents.some((e) => e.key === 'playback_stopped'));
    await ctx.timers.shift()();
    assert.equal(ctx.radio.status(id).state, 'PLAYING');
    assert.equal(ctx.radio.status(id).attempt, null);
  } finally {
    ctx.close();
  }
});

test('a stop right after a play is not mistaken for a refused stream', async () => {
  const ctx = await setup({ streams: { [JAZZ_MP3]: 'audio/mpeg' } });
  try {
    const id = ctx.nest.external_id;
    await ctx.radio.playQuery(id, 'Jazz Club');
    await ctx.radio.stop(id);
    await ctx.timers.shift()();
    assert.deepEqual(ctx.cast.state.loads, [JAZZ_MP3]);
    assert.equal(ctx.radio.status(id).state, 'IDLE');
  } finally {
    ctx.close();
  }
});
