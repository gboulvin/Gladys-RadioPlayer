// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createActions } from '../src/actions.js';
import { GENRES } from '../src/catalog/radioBrowser.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { COUNTRY_CODES } from '../src/countries.js';
import { LANGUAGES } from '../src/i18n.js';
import { SSDP_SEARCH_TARGETS } from '../src/players/upnp.js';
import { MDNS_SERVICE } from '../src/players/cast.js';
import { SCENE_TRIGGER_KEYS } from '../src/radio.js';
import { createSceneActions } from '../src/scenes.js';
import { createWidgets } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();
const handlerKeys = (object) => Object.keys(object).sort();

// The factories only need their dependencies at call time.
const actions = createActions({});
const sceneActions = createSceneActions({});
const widgets = createWidgets({});

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), handlerKeys(actions));
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions), handlerKeys(sceneActions));
});

test('every widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), handlerKeys(widgets));
  for (const widget of manifest.widgets) {
    for (const [lang, label] of Object.entries(widget.label)) {
      assert.ok(
        label.length >= 3 && label.length <= 30,
        `widget ${widget.key} label.${lang}: 3-30 characters`,
      );
    }
    for (const [lang, description] of Object.entries(widget.description ?? {})) {
      assert.ok(
        description.length <= 100,
        `widget ${widget.key} description.${lang}: 100 characters max`,
      );
    }
  }
});

test('the scene triggers the code fires are the declared ones', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [...SCENE_TRIGGER_KEYS].sort());
  for (const trigger of manifest.scene_triggers) {
    // radio.js fires { device, player, station, station_uuid }.
    for (const key of [...(trigger.fields ?? []), ...(trigger.variables ?? [])].map((f) => f.key)) {
      assert.ok(
        ['device', 'player', 'station', 'station_uuid'].includes(key),
        `${trigger.key}: unknown key ${key}`,
      );
    }
  }
});

test('the music, keywords and countries fields require Gladys >= 5.3.0', () => {
  assert.ok(manifest.music, 'the integration declares the music capability');
  assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]), `got "${manifest.gladys_version}"`);
});

test('the manifest countries are the countries of the code and of the config select', () => {
  assert.deepEqual(manifest.countries, COUNTRY_CODES);
  const select = manifest.config_schema.find((f) => f.key === 'country');
  assert.deepEqual(
    select.options.map((o) => o.value),
    COUNTRY_CODES,
  );
  assert.ok(manifest.countries.length <= 20, 'the store accepts 20 countries at most');
});

test('the declared network captures are the ones the code scans', () => {
  const ssdp = manifest.network_discovery.filter((d) => d.type === 'ssdp').map((d) => d.st);
  assert.deepEqual(ssdp.sort(), [...SSDP_SEARCH_TARGETS].sort());
  assert.deepEqual(
    manifest.network_discovery.filter((d) => d.type === 'mdns').map((d) => d.service),
    [MDNS_SERVICE],
  );
});

test('the top_stations genre options are the catalog genres', () => {
  const genre = manifest.widgets
    .find((w) => w.key === 'top_stations')
    .settings.find((s) => s.key === 'genre');
  assert.deepEqual(
    genre.options.map((o) => o.value),
    GENRES.map((g) => g.tag),
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.equal(field.default, undefined, `section "${field.key}" stores no value`);
      assert.equal(
        DEFAULT_CONFIG[field.key],
        undefined,
        `section "${field.key}" is not a config key`,
      );
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG misses "${field.key}"`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('every text of the manifest speaks English, French, German and Spanish', () => {
  const missing = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.includes('en') && keys.every((k) => /^[a-z]{2}$/.test(k))) {
        for (const lang of LANGUAGES) {
          if (!value[lang]) missing.push(`${path}.${lang}`);
        }
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`);
      }
    }
  };
  visit(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('version, docker_image and package.json agree', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});

test('the transports tag says the speakers are driven on the local network', () => {
  assert.deepEqual(manifest.transports, ['local']);
});
