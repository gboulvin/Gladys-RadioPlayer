// -----------------------------------------------------------------------------
// Station logos for the dashboard widgets.
//
// The browser never loads a third-party URL: a widget content declares image
// KEYS, and Gladys asks the integration for their bytes (onWidgetGetImage).
// The logo is downloaded, checked (PNG, JPEG or WebP by magic number, at most
// 300 KB) and sent as is; anything else is refused and the card shows no logo.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const MAX_IMAGE_BYTES = 300 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_KEYS = 500;

export function imageFormat(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export class LogoStore {
  constructor({ fetch: fetchImpl = globalThis.fetch } = {}) {
    this.fetch = fetchImpl;
    this.urls = new Map();
  }

  /** The image key of a logo URL, or null when the station has none. */
  keyFor(url) {
    if (!/^https?:\/\//i.test(url ?? '')) {
      return null;
    }
    const key = `logo-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
    if (!this.urls.has(key)) {
      if (this.urls.size >= MAX_KEYS) {
        this.urls.delete(this.urls.keys().next().value);
      }
      this.urls.set(key, url);
    }
    return key;
  }

  /** Raw base64 of the logo behind a key. Throws when it cannot be served. */
  async get(key) {
    const url = this.urls.get(key);
    if (!url) {
      throw new Error(`Unknown image ${key}`);
    }
    const response = await this.fetch(url, {
      headers: { 'User-Agent': 'Gladys-RadioPlayer' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Logo unavailable (HTTP ${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Logo too large');
    }
    if (!imageFormat(buffer)) {
      throw new Error('Logo format not supported (PNG, JPEG or WebP only)');
    }
    return buffer.toString('base64');
  }
}
