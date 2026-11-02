import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseManualPlayers } from '../src/config.js';
import { COUNTRY_CODES, countryName } from '../src/countries.js';
import path from 'node:path';
import { MAX_FAVORITES, Store } from '../src/store.js';
import { tempStore } from './helpers.js';

test('normalizeConfig applies the defaults and fixes the types', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    country: 'de',
    start_volume: '150',
    exclude_hls: 'false',
    enable_cast: false,
  });
  assert.equal(config.country, 'DE');
  assert.equal(config.start_volume, 100);
  assert.equal(config.exclude_hls, false);
  assert.equal(config.enable_cast, false);
  assert.equal(config.enable_upnp, true);
  assert.equal(normalizeConfig({ country: 'ZZ' }).country, 'FR');
});

test('parseManualPlayers reads Cast IPs and UPnP URLs, ignores the rest', () => {
  assert.deepEqual(
    parseManualPlayers(
      '192.168.1.20, http://192.168.1.30:1400/xml/device_description.xml; 10.0.0.5:8010 hello',
    ),
    [
      { kind: 'cast', host: '192.168.1.20', port: 8009 },
      { kind: 'upnp', location: 'http://192.168.1.30:1400/xml/device_description.xml' },
      { kind: 'cast', host: '10.0.0.5', port: 8010 },
    ],
  );
  assert.deepEqual(parseManualPlayers(''), []);
});

test('20 countries, named in the four languages', () => {
  assert.equal(COUNTRY_CODES.length, 20);
  assert.equal(countryName('DE', 'fr'), 'Allemagne');
  assert.equal(countryName('ES', 'es'), 'España');
  assert.deepEqual(Object.keys(countryName('AT')), ['en', 'fr', 'de', 'es']);
});

test('the store keeps favorites and recent plays across restarts', async () => {
  const store = tempStore();
  await store.load();
  const station = { uuid: 'u1', name: 'One', favicon: '', country: 'FR', url: 'http://x' };
  assert.equal(await store.addFavorite(station), 'added');
  assert.equal(await store.addFavorite(station), 'exists');
  await store.recordPlay('ext:x:cast:a', station);
  const reloaded = await new Store(path.dirname(store.file)).load();
  assert.deepEqual(reloaded.favorites, [{ uuid: 'u1', name: 'One', favicon: '', country: 'FR' }]);
  assert.equal(reloaded.lastStation('ext:x:cast:a').name, 'One');
  assert.equal(await reloaded.removeFavorite('u1'), true);
  assert.equal(await reloaded.removeFavorite('u1'), false);
  for (let i = 0; i < MAX_FAVORITES; i += 1) {
    await reloaded.addFavorite({ uuid: `f${i}`, name: `F${i}` });
  }
  assert.equal(await reloaded.addFavorite({ uuid: 'one-more', name: 'More' }), 'full');
});
