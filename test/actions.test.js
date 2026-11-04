import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions, describeReport } from '../src/actions.js';
import { setup } from './setup.js';

function actionsFor(ctx) {
  return createActions({
    gladys: ctx.gladys,
    catalog: ctx.catalog,
    store: ctx.store,
    registry: ctx.registry,
    radio: ctx.radio,
    onFavoritesChanged: async () => {},
    getConfig: () => ctx.config,
    rescan: async () => (await ctx.registry.discover(ctx.gladys, ctx.config)).report,
  });
}

test('test_catalog gives the top stations and the next step', async () => {
  const ctx = await setup();
  try {
    const message = await actionsFor(ctx).test_catalog();
    assert.match(message.fr, /3562 stations pour le pays France/);
    assert.match(message.fr, /1\. Radio Test · 2\. Jazz Club/);
    assert.match(message.fr, /onglet Découverte/);
    assert.ok(message.de && message.es);
  } finally {
    ctx.close();
  }
});

test('scan_players lists what each channel saw', async () => {
  const ctx = await setup();
  try {
    const message = await actionsFor(ctx).scan_players();
    assert.match(
      message.en,
      /^2 speaker\(s\) found: Salon & Cuisine \(UPnP\/DLNA\), Cuisine \(Google Cast\)/,
    );
    assert.match(message.en, /Google Cast \(mDNS\): 1 answer\(s\), 1 speaker\(s\)/);
    assert.match(message.en, /Sonos\/DLNA \(SSDP\): 1 answer\(s\), 1 speaker\(s\)/);
  } finally {
    ctx.close();
  }
});

test('scan_players explains an empty network', async () => {
  const ctx = await setup({ scanResults: { ssdp: [], mdns: [] } });
  try {
    const message = await actionsFor(ctx).scan_players();
    assert.match(message.fr, /^Aucune enceinte trouvée/);
    assert.match(message.fr, /Google Cast \(mDNS\): 0 réponse\(s\)/);
    assert.match(message.fr, /ajoutez-les par leur IP/);
  } finally {
    ctx.close();
  }
});

test('describeReport shows the disabled and failing channels', () => {
  const text = describeReport({
    ssdp: { enabled: false },
    mdns: { enabled: true, error: 'HTTP 403' },
    players: [],
  });
  assert.equal(text.en, 'Google Cast (mDNS): error (HTTP 403) · Sonos/DLNA (SSDP): off');
});

test('play_now plays a station on a speaker', async () => {
  const ctx = await setup();
  try {
    const actions = actionsFor(ctx);
    const message = await actions.play_now({ device: ctx.nest.external_id, station: 'jazz' });
    assert.equal(message.fr, 'Jazz Club démarre sur Cuisine.');
    assert.equal(ctx.cast.state.media.media.metadata.title, 'Jazz Club');
    const missing = await actions.play_now({ device: ctx.nest.external_id, station: 'Nope FM' });
    assert.match(missing.en, /No station matches "Nope FM"/);
  } finally {
    ctx.close();
  }
});
