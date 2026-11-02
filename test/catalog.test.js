import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RadioBrowserClient, streamContentType, toStation } from '../src/catalog/radioBrowser.js';
import { STATIONS, fakeRadioBrowserFetch, rawStation } from './helpers.js';

test('toStation keeps the resolved stream URL and splits the tags', () => {
  const station = toStation(rawStation());
  assert.equal(station.url, 'http://stream.example.org/live.mp3');
  assert.deepEqual(station.tags, ['news', 'talk']);
  assert.equal(station.country, 'FR');
  assert.equal(station.hls, false);
  assert.equal(toStation(rawStation({ hls: 0, url_resolved: 'https://x/y.m3u8?t=1' })).hls, true);
});

test('streamContentType follows the codec', () => {
  assert.equal(streamContentType(toStation(rawStation())), 'audio/mpeg');
  assert.equal(streamContentType(toStation(rawStation({ codec: 'AAC+' }))), 'audio/aac');
  assert.equal(
    streamContentType(toStation(rawStation({ hls: 1 }))),
    'application/vnd.apple.mpegurl',
  );
});

test('top stations are filtered by country, by popularity, HLS hidden', async () => {
  const { fetch, calls } = fakeRadioBrowserFetch();
  const catalog = new RadioBrowserClient({ fetch });
  const stations = await catalog.topStations('FR', { limit: 10 });
  assert.deepEqual(
    stations.map((s) => s.name),
    ['Radio Test', 'Jazz Club'],
  );
  const search = calls.find((url) => url.pathname === '/json/stations/search');
  assert.equal(search.searchParams.get('countrycode'), 'FR');
  assert.equal(search.searchParams.get('order'), 'clickcount');
  assert.equal(search.searchParams.get('reverse'), 'true');
  assert.equal(search.searchParams.get('hidebroken'), 'true');
  const withHls = await catalog.topStations('FR', { limit: 10, excludeHls: false });
  assert.equal(withHls.length, 3);
});

test('answers are cached', async () => {
  const { fetch, calls } = fakeRadioBrowserFetch();
  const catalog = new RadioBrowserClient({ fetch });
  await catalog.topStations('FR');
  await catalog.topStations('FR');
  assert.equal(calls.filter((url) => url.pathname === '/json/stations/search').length, 1);
});

test('a failing server falls back to the next one', async () => {
  const { fetch } = fakeRadioBrowserFetch({
    failServers: ['all.api.radio-browser.info', 'de1.api.radio-browser.info'],
  });
  const catalog = new RadioBrowserClient({ fetch });
  const stations = await catalog.topStations('FR');
  assert.equal(stations.length, 2);
});

test('the catalog unreachable is a clear error', async () => {
  const catalog = new RadioBrowserClient({
    fetch: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(catalog.topStations('FR'), /Radio catalog unreachable/);
});

test('findStation accepts a uuid, an exact name or a partial name', async () => {
  const { fetch } = fakeRadioBrowserFetch();
  const catalog = new RadioBrowserClient({ fetch });
  assert.equal(
    (await catalog.findStation(STATIONS[1].stationuuid, { country: 'FR' })).name,
    'Jazz Club',
  );
  assert.equal((await catalog.findStation('jazz club', { country: 'FR' })).name, 'Jazz Club');
  assert.equal((await catalog.findStation('jaz', { country: 'FR' })).name, 'Jazz Club');
  assert.equal(await catalog.findStation('nothing like it', { country: 'FR' }), null);
  assert.equal(await catalog.findStation('Jazz', { country: 'DE' }), null);
  assert.equal(await catalog.findStation('  ', { country: 'FR' }), null);
});

test('countryStationCount reads the country list', async () => {
  const { fetch } = fakeRadioBrowserFetch();
  const catalog = new RadioBrowserClient({ fetch });
  assert.equal(await catalog.countryStationCount('FR'), 3562);
  assert.equal(await catalog.countryStationCount('PE'), 0);
});
