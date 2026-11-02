import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { imageFormat, LogoStore } from '../src/images.js';
import { WIDGET_KEYS, createWidgets } from '../src/widgets.js';
import { setup } from './setup.js';

async function widgetsFor(ctx) {
  return createWidgets({
    radio: ctx.radio,
    catalog: ctx.catalog,
    store: ctx.store,
    logos: ctx.logos,
    getConfig: () => ctx.config,
  });
}

const request = (settings = {}) => ({ settings, language: 'fr', units: 'metric' });

test('every widget content is rendered exactly as sent, in every state', async () => {
  const ctx = await setup();
  try {
    const widgets = await widgetsFor(ctx);
    const device = ctx.sonos.external_id;
    const contents = [];
    for (const widget of Object.values(widgets)) {
      contents.push(await widget.get(request()));
    }
    contents.push(await widgets.now_playing.get(request({ device })));
    contents.push(
      await widgets.radio_presets.get(
        request({ device, preset_1: 'Jazz Club', preset_2: 'Nope FM' }),
      ),
    );
    await ctx.radio.playQuery(device, 'Radio Test');
    contents.push(await widgets.now_playing.get(request({ device })));
    contents.push(await widgets.radio_presets.get(request({ device, preset_1: 'Radio Test' })));
    contents.push(await widgets.top_stations.get(request({ genre: 'jazz' })));
    for (const content of contents) {
      assert.deepEqual(validateWidgetContent(content), []);
    }
  } finally {
    ctx.close();
  }
});

test('now_playing shows the station, its logo and the favorite star', async () => {
  const ctx = await setup();
  try {
    const widgets = await widgetsFor(ctx);
    const device = ctx.sonos.external_id;
    await ctx.radio.playQuery(device, 'Radio Test');
    const content = await widgets.now_playing.get(request({ device }));
    assert.equal(content.components[0].text, 'Radio Test');
    assert.ok(content.components.some((c) => c.type === 'image' && c.key.startsWith('logo-')));
    const actions = content.components.filter((c) => c.type === 'button').map((c) => c.action.key);
    assert.deepEqual(actions, ['previous', 'stop', 'next', 'favorite']);

    const toast = await widgets.now_playing.action(null, {
      actionKey: 'favorite',
      params: {},
      settings: { device },
    });
    assert.equal(toast.fr, 'Radio Test ajoutée aux favoris');
    assert.equal(ctx.store.favorites.length, 1);
    const after = await widgets.now_playing.get(request({ device }));
    assert.ok(!after.components.some((c) => c.action?.key === 'favorite'));
  } finally {
    ctx.close();
  }
});

test('radio_presets plays a preset station and stops', async () => {
  const ctx = await setup();
  try {
    const widgets = await widgetsFor(ctx);
    const device = ctx.nest.external_id;
    const content = await widgets.radio_presets.get(request({ device, preset_1: 'Jazz Club' }));
    const preset = content.components.find((c) => c.type === 'button' && c.label === 'Jazz Club');
    await widgets.radio_presets.action(null, {
      actionKey: preset.action.key,
      params: preset.action.params,
      settings: { device },
    });
    assert.equal(ctx.cast.state.media.media.metadata.title, 'Jazz Club');
    await widgets.radio_presets.action(null, {
      actionKey: 'stop',
      params: {},
      settings: { device },
    });
    assert.equal(ctx.cast.state.app, null);
    await assert.rejects(
      widgets.radio_presets.action(null, { actionKey: 'stop', params: {}, settings: {} }),
      /No player selected/,
    );
  } finally {
    ctx.close();
  }
});

test('top_stations lists the country stations as a grid', async () => {
  const ctx = await setup();
  try {
    const widgets = await widgetsFor(ctx);
    const content = await widgets.top_stations.get(request());
    assert.equal(content.components[0].text, 'France');
    const grid = content.components.find((c) => c.type === 'card-list');
    assert.deepEqual(
      grid.items.map((i) => i.title),
      ['Radio Test', 'Jazz Club'],
    );
    assert.equal(grid.items[0].links[0].url, 'https://radio.example.org');
  } finally {
    ctx.close();
  }
});

test('the widget keys match the manifest keys used by index.js', () => {
  assert.deepEqual(Object.values(WIDGET_KEYS).sort(), [
    'now_playing',
    'radio_presets',
    'top_stations',
  ]);
});

test('logos: only PNG, JPEG and WebP under 300 KB are served', async () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
  assert.equal(imageFormat(png), 'png');
  assert.equal(imageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(imageFormat(Buffer.from('RIFF0000WEBPVP8 ')), 'webp');
  assert.equal(imageFormat(Buffer.from('<svg></svg>')), null);

  const bodies = {
    'https://a/logo.png': png,
    'https://a/logo.svg': Buffer.from('<svg></svg>'),
    'https://a/big.png': Buffer.concat([png, Buffer.alloc(400 * 1024)]),
  };
  const logos = new LogoStore({ fetch: async (url) => new Response(bodies[url]) });
  assert.equal(logos.keyFor('data:image/png;base64,xx'), null);
  const key = logos.keyFor('https://a/logo.png');
  assert.match(key, /^logo-[0-9a-f]{12}$/);
  assert.equal(await logos.get(key), png.toString('base64'));
  await assert.rejects(logos.get(logos.keyFor('https://a/logo.svg')), /not supported/);
  await assert.rejects(logos.get(logos.keyFor('https://a/big.png')), /too large/);
  await assert.rejects(logos.get('logo-000000000000'), /Unknown image/);
});
