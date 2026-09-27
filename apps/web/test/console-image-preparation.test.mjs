import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONSOLE_IMAGE_MAX_BYTES,
  CONSOLE_IMAGE_SOURCE_MAX_BYTES,
  createImagePreview,
  prepareConsoleImage,
} from '../src/console-image-preparation.js';

const signatures = {
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]),
  gif: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1]),
};

function file(bytes, type, name = 'photo') {
  return { type, name, size: bytes.length, async arrayBuffer() { return bytes.slice().buffer; } };
}

test('rejects SVG and MIME or magic-byte mismatches with accessible messages', async () => {
  await assert.rejects(() => prepareConsoleImage(file(new TextEncoder().encode('<svg/>'), 'image/svg+xml')), /JPEG, PNG, WebP, or GIF/i);
  await assert.rejects(() => prepareConsoleImage(file(signatures.jpeg, 'image/png')), /does not match/i);
});

test('rejects oversized source images before reading or decoding them', async () => {
  let read = false;
  await assert.rejects(() => prepareConsoleImage({
    type: 'image/jpeg', name: 'huge.jpg', size: CONSOLE_IMAGE_SOURCE_MAX_BYTES + 1,
    async arrayBuffer() { read = true; return signatures.jpeg.buffer; },
  }), /12 MiB/i);
  assert.equal(read, false);
});

test('passes validated GIF bytes through without canvas and sanitizes the filename', async () => {
  const result = await prepareConsoleImage(file(signatures.gif, 'image/gif', '../Café cat.GIF'));
  assert.equal(result.mimeType, 'image/gif');
  assert.equal(result.filename, 'Cafe-cat.gif');
  assert.equal(result.base64, Buffer.from(signatures.gif).toString('base64'));
  assert.equal(result.width, null);
  assert.equal(result.height, null);
});

test('decodes and re-encodes static images to strip source metadata with bounded dimensions and bytes', async () => {
  const calls = [];
  const oversized = new Uint8Array(CONSOLE_IMAGE_MAX_BYTES + 1).fill(1);
  oversized.set(signatures.jpeg);
  const small = signatures.jpeg;
  const sourceWithExif = new Uint8Array([...signatures.jpeg, ...new TextEncoder().encode('EXIF_GPS_SECRET')]);
  const result = await prepareConsoleImage(file(sourceWithExif, 'image/jpeg', 'camera-original.jpg'), {
    decodeImage: async () => ({ width: 4000, height: 2000, source: {} }),
    encodeImage: async ({ width, height, quality, mimeType }) => {
      calls.push({ width, height, quality, mimeType });
      return calls.length === 1 ? oversized : small;
    },
  });
  assert.equal(calls[0].width, 2048);
  assert.equal(calls[0].height, 1024);
  assert.ok(calls.at(-1).quality < calls[0].quality);
  assert.ok(result.byteLength <= CONSOLE_IMAGE_MAX_BYTES);
  assert.equal(result.width, 2048);
  assert.equal(result.height, 1024);
  assert.equal(result.base64, Buffer.from(small).toString('base64'));
  assert.equal(Buffer.from(result.base64, 'base64').includes(Buffer.from('EXIF_GPS_SECRET')), false);
});

test('preview lifecycle revokes URLs on replacement and removal', () => {
  const revoked = [];
  let sequence = 0;
  const preview = createImagePreview({
    createObjectURL: () => `blob:${++sequence}`,
    revokeObjectURL: (url) => revoked.push(url),
  });
  assert.equal(preview.set(new Blob(['one'])), 'blob:1');
  assert.equal(preview.set(new Blob(['two'])), 'blob:2');
  assert.deepEqual(revoked, ['blob:1']);
  preview.clear();
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
  assert.equal(preview.url, null);
});
