import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONSOLE_IMAGE_MAX_BYTES,
  CONSOLE_IMAGE_GIF_MAX_BYTES,
  normalizeConsoleImageAttachment,
  projectConsoleImageMetadata,
} from '../src/console-image-attachment.js';

const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000a00000014', 'hex');
const jpeg = Buffer.from('ffd8ffc00007080014000a', 'hex');
const webp = Buffer.from('524946461600000057454250565038580a00000000000000090000130000', 'hex');
const gif = Buffer.from('4749463839610a001400', 'hex');

function input(bytes, mimeType, filename = 'image') {
  return { mimeType, filename, base64: bytes.toString('base64'), width: 10, height: 20 };
}

test('normalizes allowlisted image bytes with a safe filename and digest', () => {
  const result = normalizeConsoleImageAttachment(input(png, 'image/png', '../Café <proof>.PNG'));
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.filename, 'Cafe-proof.png');
  assert.deepEqual(Buffer.from(result.content), png);
  assert.equal(result.byteLength, png.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.width, 10);
  assert.equal(result.height, 20);
});

test('rejects noncanonical base64, MIME and magic-byte mismatches, SVG, and excess dimensions', () => {
  assert.throws(() => normalizeConsoleImageAttachment({ ...input(png, 'image/png'), base64: '%%%=' }), /base64/i);
  assert.throws(() => normalizeConsoleImageAttachment({ ...input(png, 'image/png'), base64: `${png.toString('base64')}\n` }), /base64/i);
  assert.throws(() => normalizeConsoleImageAttachment(input(jpeg, 'image/png')), /magic|signature/i);
  assert.throws(() => normalizeConsoleImageAttachment(input(Buffer.from('<svg/>'), 'image/svg+xml')), /type/i);
  assert.throws(() => normalizeConsoleImageAttachment({ ...input(png, 'image/png'), width: 2049 }), /dimensions/i);
  const oversizedPng = Buffer.from(png);
  oversizedPng.writeUInt32BE(5000, 16);
  oversizedPng.writeUInt32BE(5000, 20);
  assert.throws(() => normalizeConsoleImageAttachment(input(oversizedPng, 'image/png')), /dimensions/i);
  assert.throws(() => normalizeConsoleImageAttachment({ ...input(png, 'image/png'), width: 1, height: 1 }), /match/i);
});

test('recognizes JPEG, WebP, and both GIF signatures with conservative caps', () => {
  assert.equal(normalizeConsoleImageAttachment(input(jpeg, 'image/jpeg')).mimeType, 'image/jpeg');
  assert.equal(normalizeConsoleImageAttachment(input(webp, 'image/webp')).mimeType, 'image/webp');
  assert.equal(normalizeConsoleImageAttachment(input(gif, 'image/gif')).mimeType, 'image/gif');
  assert.throws(
    () => normalizeConsoleImageAttachment(input(Buffer.concat([gif, Buffer.alloc(CONSOLE_IMAGE_GIF_MAX_BYTES)]), 'image/gif')),
    /too large/i,
  );
  assert.throws(
    () => normalizeConsoleImageAttachment(input(Buffer.concat([png, Buffer.alloc(CONSOLE_IMAGE_MAX_BYTES)]), 'image/png')),
    /too large/i,
  );
});

test('metadata projection cannot persist content or base64 payload bytes', () => {
  const normalized = normalizeConsoleImageAttachment(input(png, 'image/png'));
  const metadata = projectConsoleImageMetadata(normalized);
  assert.deepEqual(metadata, {
    kind: 'image', mimeType: 'image/png', filename: 'image.png', byteLength: png.length,
    width: 10, height: 20, sha256: normalized.sha256,
  });
  assert.equal(JSON.stringify(metadata).includes(png.toString('base64')), false);
  assert.equal('content' in metadata, false);
  assert.equal('base64' in metadata, false);
});
