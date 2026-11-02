import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaItems } from '@gladysassistant/integration-sdk';
import { GENRES } from '../src/catalog/radioBrowser.js';
import { catalogLanguage, createMusicHandlers, stationUuid } from '../src/music.js';
import { setup } from './setup.js';

function handlers(ctx) {
  return createMusicHandlers({
    gladys: ctx.gladys,
    catalog: ctx.catalog,
    store: ctx.store,
    radio: ctx.radio,
    getConfig: () => ctx.config,
  });
}

test('the root lists the four folders, titled in the language of the country', async () => {
  const ctx = await setup();
  try {
    const { items, total } = await handlers(ctx).browse(ctx.sonos, { parentId: null });
    assert.equal(total, 4);
    assert.deepEqual(
      items.map((i) => i.id),
      ['favorites', 'top', 'genres', 'recent'],
    );
    assert.equal(items[1].title, 'Top des radios');
    assert.equal(items[1].subtitle, 'France');
    assert.deepEqual(validateMediaItems(items), []);
    assert.equal(catalogLanguage('AT'), 'de');
    assert.equal(catalogLanguage('MX'), 'es');
    assert.equal(catalogLanguage('GB'), 'en');
  } finally {
    ctx.close();
  }
});

test('top, genres and search return playable radios', async () => {
  const ctx = await setup();
  try {
    const music = handlers(ctx);
    const top = await music.browse(ctx.sonos, { parentId: 'top', offset: 0, limit: 50 });
    assert.deepEqual(
      top.items.map((i) => i.title),
      ['Radio Test', 'Jazz Club'],
    );
    assert.equal(top.items[0].type, 'radio');
    assert.match(top.items[0].artwork_key, /^art-[0-9a-f]{12}$/);
    assert.deepEqual(validateMediaItems(top.items), []);

    const genres = await music.browse(ctx.sonos, { parentId: 'genres' });
    assert.equal(genres.items.length, GENRES.length);
    const jazz = await music.browse(ctx.sonos, { parentId: 'genre:jazz' });
    assert.deepEqual(
      jazz.items.map((i) => i.title),
      ['Jazz Club'],
    );

    const found = await music.search(ctx.sonos, { query: 'jazz', type: null, limit: 20 });
    assert.deepEqual(
      found.items.map((i) => i.title),
      ['Jazz Club'],
    );
    assert.deepEqual(await music.search(ctx.sonos, { query: 'jazz', type: 'track' }), {
      items: [],
    });
  } finally {
    ctx.close();
  }
});

test('play starts the station on the speaker; favorites and recent follow', async () => {
  const ctx = await setup();
  try {
    const music = handlers(ctx);
    await music.play(ctx.nest, {
      id: 'station:22222222-2222-2222-2222-222222222222',
      type: 'radio',
    });
    assert.equal(ctx.cast.state.media.media.metadata.title, 'Jazz Club');
    const recent = await music.browse(ctx.nest, { parentId: 'recent' });
    assert.deepEqual(
      recent.items.map((i) => i.title),
      ['Jazz Club'],
    );
    await assert.rejects(music.play(ctx.nest, { id: 'genres', type: 'folder' }), /Only a radio/);
    assert.equal(stationUuid('station:abc'), 'abc');
    assert.equal(stationUuid('top'), null);
  } finally {
    ctx.close();
  }
});
