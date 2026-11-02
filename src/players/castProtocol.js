// -----------------------------------------------------------------------------
// Google Cast wire format (CASTV2).
//
// Every message is a protobuf `CastMessage` prefixed by its length (4 bytes,
// big endian), over TLS on port 8009. The message has six fields, all a
// sender needs: hand-encoding them avoids a protobuf dependency.
//
//   1 protocol_version  varint  (0 = CASTV2_1_0)
//   2 source_id         string
//   3 destination_id    string
//   4 namespace         string
//   5 payload_type      varint  (0 = STRING, 1 = BINARY)
//   6 payload_utf8      string  (a JSON document)
// -----------------------------------------------------------------------------

export const NAMESPACES = {
  CONNECTION: 'urn:x-cast:com.google.cast.tp.connection',
  HEARTBEAT: 'urn:x-cast:com.google.cast.tp.heartbeat',
  RECEIVER: 'urn:x-cast:com.google.cast.receiver',
  MEDIA: 'urn:x-cast:com.google.cast.media',
};

// The Default Media Receiver: plays a URL, available on every Cast device.
export const DEFAULT_MEDIA_RECEIVER = 'CC1AD845';

function encodeVarint(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function encodeString(fieldNumber, value) {
  const data = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarint((fieldNumber << 3) | 2), encodeVarint(data.length), data]);
}

function encodeVarintField(fieldNumber, value) {
  return Buffer.concat([encodeVarint(fieldNumber << 3), encodeVarint(value)]);
}

/**
 * Encode one message, length prefix included.
 * @param {{ sourceId: string, destinationId: string, namespace: string, data: object }} message
 */
export function encodeMessage({ sourceId, destinationId, namespace, data }) {
  const body = Buffer.concat([
    encodeVarintField(1, 0),
    encodeString(2, sourceId),
    encodeString(3, destinationId),
    encodeString(4, namespace),
    encodeVarintField(5, 0),
    encodeString(6, JSON.stringify(data)),
  ]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  let position = offset;
  for (;;) {
    if (position >= buffer.length) {
      throw new Error('Truncated varint');
    }
    const byte = buffer[position];
    position += 1;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value: result, offset: position };
    }
    shift += 7;
    if (shift > 35) {
      throw new Error('Varint too long');
    }
  }
}

/**
 * Decode one message body (without the length prefix).
 * @returns {{ sourceId: string, destinationId: string, namespace: string, data: object|null }}
 */
export function decodeMessage(body) {
  const message = { sourceId: '', destinationId: '', namespace: '', data: null };
  let offset = 0;
  let payload = '';
  while (offset < body.length) {
    const key = readVarint(body, offset);
    offset = key.offset;
    const fieldNumber = Math.floor(key.value / 8);
    const wireType = key.value % 8;
    if (wireType === 0) {
      offset = readVarint(body, offset).offset;
    } else if (wireType === 2) {
      const length = readVarint(body, offset);
      const end = length.offset + length.value;
      if (end > body.length) {
        throw new Error('Truncated field');
      }
      const value = body.subarray(length.offset, end);
      offset = end;
      if (fieldNumber === 2) message.sourceId = value.toString('utf8');
      else if (fieldNumber === 3) message.destinationId = value.toString('utf8');
      else if (fieldNumber === 4) message.namespace = value.toString('utf8');
      else if (fieldNumber === 6) payload = value.toString('utf8');
    } else {
      throw new Error(`Unsupported wire type ${wireType}`);
    }
  }
  try {
    message.data = payload ? JSON.parse(payload) : null;
  } catch {
    message.data = null;
  }
  return message;
}

// A Cast message is a few KB: anything above is a corrupted stream.
const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Split a byte stream into messages. Feed it the socket chunks, it calls
 * `onMessage` for every complete message.
 */
export function createMessageReader(onMessage) {
  let pending = Buffer.alloc(0);
  return (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const length = pending.readUInt32BE(0);
      if (length > MAX_MESSAGE_BYTES) {
        throw new Error(`Cast message too large (${length} bytes)`);
      }
      if (pending.length < 4 + length) {
        return;
      }
      const body = pending.subarray(4, 4 + length);
      pending = pending.subarray(4 + length);
      onMessage(decodeMessage(body));
    }
  };
}
