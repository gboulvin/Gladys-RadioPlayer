// -----------------------------------------------------------------------------
// Google Cast devices: Chromecast (Audio), Google / Nest speakers and
// displays, Android TV, and the speakers "with Chromecast built-in" (JBL,
// Sony, Bose, Marshall, LG, Philips...).
//
// Discovery: an mDNS browse of `_googlecast._tcp`, done by the Gladys core on
// our behalf (see `network_discovery` in the manifest).
//
// Control: the CASTV2 protocol in unicast, TLS on port 8009. The integration
// launches the Default Media Receiver and LOADs the stream URL: the device
// downloads the radio stream itself, no audio goes through Gladys. Cast
// devices present a self-signed certificate (there is no public CA on a LAN),
// so the TLS channel is encrypted but not authenticated — the same trade-off
// as every Cast sender.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { createLogger } from '@gladysassistant/integration-sdk';
import { streamContentType } from '../catalog/radioBrowser.js';
import {
  DEFAULT_MEDIA_RECEIVER,
  NAMESPACES,
  createMessageReader,
  encodeMessage,
} from './castProtocol.js';

const logger = createLogger({ name: 'cast' });

export const MDNS_SERVICE = '_googlecast._tcp';
const SENDER_ID = 'sender-gladys';
const RECEIVER_ID = 'receiver-0';
const REQUEST_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 6000;
const HEARTBEAT_INTERVAL_MS = 5000;
// No message at all (not even a PONG) for this long: the device is gone.
const SILENCE_TIMEOUT_MS = 20000;

const MEDIA_STATES = {
  PLAYING: 'PLAYING',
  BUFFERING: 'BUFFERING',
  LOADING: 'BUFFERING',
  PAUSED: 'PAUSED',
  IDLE: 'IDLE',
};

/** Default transport: a TLS socket to the device. */
function tlsConnect({ host, port }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Cast device ${host}:${port} did not answer`));
    }, CONNECT_TIMEOUT_MS);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Read an mDNS answer of `_googlecast._tcp`.
 * @param {{ name: string, addresses: string[], port: number|null, txt: Record<string, string|boolean> }} service
 */
export function parseCastService({ addresses, port, record, name }) {
  const address = (addresses ?? []).find((a) => /^(\d{1,3}\.){3}\d{1,3}$/.test(a));
  if (!address) {
    return null;
  }
  // `id` is the stable device id; `fn` the name the user gave it in Google
  // Home; `md` the model. Cast groups (`md=Google Cast Group`) play too.
  return {
    id: String(record.id || name || address).toLowerCase(),
    name: String(record.fn || name || 'Google Cast'),
    model: String(record.md || ''),
    host: address,
    port: port || 8009,
  };
}

export class CastPlayer extends EventEmitter {
  /**
   * @param {{ id: string, name: string, model?: string, host: string, port?: number }} info
   * @param {{ connect?: (target: { host: string, port: number }) => Promise<import('node:stream').Duplex> }} [options]
   */
  constructor(info, { connect = tlsConnect } = {}) {
    super();
    this.kind = 'cast';
    this.description = { ...info, port: info.port || 8009 };
    this.connectImpl = connect;
    this.socket = null;
    this.connecting = null;
    this.requestId = 0;
    this.pending = new Map();
    this.connectedTransports = new Set();
    this.heartbeat = null;
    this.lastMessageAt = 0;
  }

  get id() {
    return this.description.id;
  }

  get name() {
    return this.description.name;
  }

  ensureConnected() {
    if (this.socket) {
      return Promise.resolve();
    }
    if (!this.connecting) {
      this.connecting = this.openConnection().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async openConnection() {
    const { host, port } = this.description;
    const socket = await this.connectImpl({ host, port });
    const read = createMessageReader((message) => this.onMessage(message));
    socket.on('data', (chunk) => {
      try {
        read(chunk);
      } catch (err) {
        logger.warn(`${this.name}: ${err.message}`);
        socket.destroy();
      }
    });
    socket.on('error', (err) => logger.debug(`${this.name}: socket error ${err.message}`));
    socket.on('close', () => this.onClose(socket));
    this.socket = socket;
    this.lastMessageAt = Date.now();
    this.connectedTransports = new Set();
    this.send(NAMESPACES.CONNECTION, RECEIVER_ID, { type: 'CONNECT' });
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
        logger.info(`${this.name}: no heartbeat, closing the connection`);
        socket.destroy();
        return;
      }
      this.send(NAMESPACES.HEARTBEAT, RECEIVER_ID, { type: 'PING' });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref?.();
    logger.debug(`${this.name}: connected to ${host}:${port}`);
  }

  onClose(socket) {
    if (this.socket !== socket) {
      return;
    }
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket = null;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error(`${this.name}: connection closed`));
    }
    this.pending.clear();
    this.emit('disconnected');
  }

  send(namespace, destinationId, data) {
    if (!this.socket) {
      throw new Error(`${this.name}: not connected`);
    }
    this.socket.write(encodeMessage({ sourceId: SENDER_ID, destinationId, namespace, data }));
  }

  request(namespace, destinationId, data) {
    this.requestId = (this.requestId % 1_000_000) + 1;
    const requestId = this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${this.name}: ${data.type} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send(namespace, destinationId, { ...data, requestId });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  onMessage({ namespace, sourceId, data }) {
    this.lastMessageAt = Date.now();
    if (!data) {
      return;
    }
    if (namespace === NAMESPACES.HEARTBEAT) {
      if (data.type === 'PING') {
        this.send(NAMESPACES.HEARTBEAT, sourceId, { type: 'PONG' });
      }
      return;
    }
    if (namespace === NAMESPACES.CONNECTION && data.type === 'CLOSE') {
      this.connectedTransports.delete(sourceId);
      return;
    }
    const pending = data.requestId ? this.pending.get(data.requestId) : undefined;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      if (
        /^(LOAD_FAILED|LOAD_CANCELLED|INVALID_REQUEST|LAUNCH_ERROR|INVALID_PLAYER_STATE)$/.test(
          data.type,
        )
      ) {
        pending.reject(
          new Error(`${this.name}: ${data.type}${data.reason ? ` (${data.reason})` : ''}`),
        );
      } else {
        pending.resolve(data);
      }
      return;
    }
    // Unsolicited status: something changed on the device (another sender,
    // the end of a stream, a volume button...).
    if (data.type === 'MEDIA_STATUS' || data.type === 'RECEIVER_STATUS') {
      this.emit('status-changed');
    }
  }

  connectTransport(transportId) {
    if (!this.connectedTransports.has(transportId)) {
      this.send(NAMESPACES.CONNECTION, transportId, { type: 'CONNECT' });
      this.connectedTransports.add(transportId);
    }
  }

  async receiverStatus() {
    await this.ensureConnected();
    const answer = await this.request(NAMESPACES.RECEIVER, RECEIVER_ID, { type: 'GET_STATUS' });
    return answer.status ?? {};
  }

  /** The running application able to play media, if any. */
  static mediaApp(status) {
    return (status.applications ?? []).find((app) =>
      (app.namespaces ?? []).some((ns) => ns.name === NAMESPACES.MEDIA),
    );
  }

  async mediaStatus(app) {
    this.connectTransport(app.transportId);
    const answer = await this.request(NAMESPACES.MEDIA, app.transportId, { type: 'GET_STATUS' });
    return (answer.status ?? [])[0] ?? null;
  }

  async launchMediaReceiver() {
    const status = await this.receiverStatus();
    let app = (status.applications ?? []).find((a) => a.appId === DEFAULT_MEDIA_RECEIVER);
    if (!app) {
      const answer = await this.request(NAMESPACES.RECEIVER, RECEIVER_ID, {
        type: 'LAUNCH',
        appId: DEFAULT_MEDIA_RECEIVER,
      });
      app = (answer.status?.applications ?? []).find((a) => a.appId === DEFAULT_MEDIA_RECEIVER);
      if (!app) {
        throw new Error(`${this.name}: the media receiver did not start`);
      }
    }
    this.connectTransport(app.transportId);
    return app;
  }

  async play(station, { volume } = {}) {
    logger.info(`${this.name}: playing ${station.name} (${station.url})`);
    const app = await this.launchMediaReceiver();
    await this.request(NAMESPACES.MEDIA, app.transportId, {
      type: 'LOAD',
      autoplay: true,
      currentTime: 0,
      media: {
        contentId: station.url,
        contentType: station.hls ? 'application/x-mpegURL' : streamContentType(station),
        streamType: 'LIVE',
        metadata: {
          metadataType: 0,
          title: station.name,
          subtitle: station.tags.slice(0, 3).join(', '),
          images: station.favicon ? [{ url: station.favicon }] : [],
        },
      },
    });
    if (volume > 0) {
      await this.setVolume(volume).catch((err) => logger.warn(err.message));
    }
  }

  async mediaCommand(type) {
    const status = await this.receiverStatus();
    const app = CastPlayer.mediaApp(status);
    if (!app) {
      return false;
    }
    const media = await this.mediaStatus(app);
    if (!media) {
      return false;
    }
    await this.request(NAMESPACES.MEDIA, app.transportId, {
      type,
      mediaSessionId: media.mediaSessionId,
    });
    return true;
  }

  async stop() {
    const status = await this.receiverStatus();
    const app = (status.applications ?? []).find((a) => a.appId === DEFAULT_MEDIA_RECEIVER);
    if (app) {
      // Quit the receiver: the speaker goes back to its idle screen/sound.
      await this.request(NAMESPACES.RECEIVER, RECEIVER_ID, {
        type: 'STOP',
        sessionId: app.sessionId,
      });
    } else {
      await this.mediaCommand('STOP');
    }
  }

  async pause() {
    await this.mediaCommand('PAUSE');
  }

  async resume() {
    await this.mediaCommand('PLAY');
  }

  async setVolume(volume) {
    await this.ensureConnected();
    await this.request(NAMESPACES.RECEIVER, RECEIVER_ID, {
      type: 'SET_VOLUME',
      volume: { level: Math.max(0, Math.min(100, volume)) / 100 },
    });
  }

  async setMute(mute) {
    await this.ensureConnected();
    await this.request(NAMESPACES.RECEIVER, RECEIVER_ID, {
      type: 'SET_VOLUME',
      volume: { muted: Boolean(mute) },
    });
  }

  /** @returns {Promise<{ state: string, volume: number|null, mute: boolean|null }>} */
  async getStatus() {
    const status = await this.receiverStatus();
    const result = {
      state: 'IDLE',
      volume:
        typeof status.volume?.level === 'number' ? Math.round(status.volume.level * 100) : null,
      mute: typeof status.volume?.muted === 'boolean' ? status.volume.muted : null,
    };
    const app = CastPlayer.mediaApp(status);
    if (app) {
      const media = await this.mediaStatus(app).catch(() => null);
      result.state = MEDIA_STATES[media?.playerState] ?? 'IDLE';
    }
    return result;
  }

  close() {
    this.socket?.destroy();
  }
}
