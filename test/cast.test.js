import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toStation } from '../src/catalog/radioBrowser.js';
import { CastPlayer, parseCastService } from '../src/players/cast.js';
import {
  NAMESPACES,
  createMessageReader,
  decodeMessage,
  encodeMessage,
} from '../src/players/castProtocol.js';
import { fakeCastDevice, rawStation } from './helpers.js';

test('a Cast message survives an encode / decode round trip', () => {
  const message = {
    sourceId: 'sender-0',
    destinationId: 'receiver-0',
    namespace: NAMESPACES.RECEIVER,
    data: { type: 'GET_STATUS', requestId: 300, text: 'é'.repeat(200) },
  };
  const encoded = encodeMessage(message);
  assert.equal(encoded.readUInt32BE(0), encoded.length - 4);
  assert.deepEqual(decodeMessage(encoded.subarray(4)), message);
});

test('the reader reassembles messages split across chunks', () => {
  const received = [];
  const read = createMessageReader((m) => received.push(m.data.n));
  const stream = Buffer.concat(
    [1, 2, 3].map((n) =>
      encodeMessage({
        sourceId: 'a',
        destinationId: 'b',
        namespace: NAMESPACES.MEDIA,
        data: { n },
      }),
    ),
  );
  for (let i = 0; i < stream.length; i += 7) {
    read(stream.subarray(i, i + 7));
  }
  assert.deepEqual(received, [1, 2, 3]);
});

test('the reader refuses an oversized message', () => {
  const read = createMessageReader(() => {});
  const header = Buffer.alloc(4);
  header.writeUInt32BE(10 * 1024 * 1024, 0);
  assert.throws(() => read(header), /too large/);
});

test('parseCastService reads the mDNS record', () => {
  const info = parseCastService({
    name: 'Google-Nest-Mini-abc._googlecast._tcp.local',
    addresses: ['fe80::1', '192.168.1.50'],
    port: 8009,
    record: { id: 'ABCDEF0123456789', fn: 'Cuisine', md: 'Google Nest Mini' },
  });
  assert.deepEqual(info, {
    id: 'abcdef0123456789',
    name: 'Cuisine',
    model: 'Google Nest Mini',
    host: '192.168.1.50',
    port: 8009,
  });
  assert.equal(parseCastService({ addresses: ['fe80::1'], record: {} }), null);
});

test('play launches the media receiver and loads the stream', async () => {
  const device = fakeCastDevice();
  const player = new CastPlayer(
    { id: 'abc', name: 'Cuisine', host: '192.168.1.50' },
    { connect: device.connect },
  );
  try {
    await player.play(toStation(rawStation()), { volume: 55 });
    assert.equal(device.state.app.appId, 'CC1AD845');
    assert.equal(device.state.media.media.contentId, 'http://stream.example.org/live.mp3');
    assert.equal(device.state.media.media.streamType, 'LIVE');
    assert.equal(device.state.media.media.metadata.title, 'Radio Test');
    assert.equal(device.state.volume.level, 0.55);
    assert.deepEqual(await player.getStatus(), { state: 'PLAYING', volume: 55, mute: false });

    await player.pause();
    assert.equal((await player.getStatus()).state, 'PAUSED');
    await player.resume();
    await player.setMute(true);
    assert.deepEqual(await player.getStatus(), { state: 'PLAYING', volume: 55, mute: true });

    await player.stop();
    assert.equal(device.state.app, null);
    assert.equal((await player.getStatus()).state, 'IDLE');
    // One connection for the whole session.
    assert.equal(device.state.connections, 1);
    // The first message of a connection is the virtual CONNECT.
    assert.equal(device.state.received[0].namespace, NAMESPACES.CONNECTION);
  } finally {
    player.close();
  }
});

test('a closed connection is reopened by the next command', async () => {
  const device = fakeCastDevice();
  const player = new CastPlayer(
    { id: 'abc', name: 'Cuisine', host: '192.168.1.50' },
    { connect: device.connect },
  );
  try {
    await player.getStatus();
    player.socket.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(player.socket, null);
    await player.getStatus();
    assert.equal(device.state.connections, 2);
  } finally {
    player.close();
  }
});

test('an unreachable device is an error', async () => {
  const player = new CastPlayer(
    { id: 'abc', name: 'Cuisine', host: '192.168.1.50' },
    {
      connect: async () => {
        throw new Error('connect EHOSTUNREACH');
      },
    },
  );
  await assert.rejects(player.getStatus(), /EHOSTUNREACH/);
});
