import { createHash } from 'node:crypto';

export const CONSOLE_IMAGE_MAX_BYTES = 750 * 1024;
export const CONSOLE_IMAGE_GIF_MAX_BYTES = 512 * 1024;
export const CONSOLE_IMAGE_MAX_DIMENSION = 2048;
export const CONSOLE_IMAGE_REQUEST_MAX_BYTES = 1_100_000;

const EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
});

export function normalizeConsoleImageAttachment(value, { allowUnknownDimensions = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Image attachment must be an object.');
  }
  const mimeType = String(value.mimeType ?? '').trim().toLowerCase();
  if (!Object.hasOwn(EXTENSION_BY_MIME, mimeType)) {
    throw new TypeError('Image type must be JPEG, PNG, WebP, or GIF.');
  }
  const content = decodeStrictBase64(value.base64);
  const maximum = mimeType === 'image/gif' ? CONSOLE_IMAGE_GIF_MAX_BYTES : CONSOLE_IMAGE_MAX_BYTES;
  if (!content.byteLength || content.byteLength > maximum) {
    throw new TypeError(`Image is too large. Maximum decoded size is ${maximum} bytes.`);
  }
  if (!matchesImageMagic(content, mimeType)) {
    throw new TypeError('Image magic bytes do not match the declared MIME type.');
  }
  const dimensions = readImageDimensions(content, mimeType);
  if (!dimensions) throw new TypeError('Image dimensions could not be verified from the encoded bytes.');
  if (dimensions.width > CONSOLE_IMAGE_MAX_DIMENSION || dimensions.height > CONSOLE_IMAGE_MAX_DIMENSION) {
    throw new TypeError(`Image dimensions must not exceed ${CONSOLE_IMAGE_MAX_DIMENSION} pixels.`);
  }
  const claimedWidth = normalizeDimension(value.width);
  const claimedHeight = normalizeDimension(value.height);
  if (!allowUnknownDimensions && mimeType !== 'image/gif' && (!claimedWidth || !claimedHeight)) {
    throw new TypeError('Static image dimensions are required.');
  }
  if ((claimedWidth && claimedWidth !== dimensions.width) || (claimedHeight && claimedHeight !== dimensions.height)) {
    throw new TypeError('Image dimensions do not match the encoded bytes.');
  }
  const filename = sanitizeImageFilename(value.filename, mimeType);
  return {
    kind: 'image',
    mimeType,
    filename,
    content: new Uint8Array(content),
    byteLength: content.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function projectConsoleImageMetadata(value) {
  if (!value) return null;
  return {
    kind: 'image',
    mimeType: String(value.mimeType),
    filename: String(value.filename),
    byteLength: Number(value.byteLength),
    width: value.width == null ? null : Number(value.width),
    height: value.height == null ? null : Number(value.height),
    sha256: String(value.sha256),
  };
}

export function sanitizeImageFilename(value, mimeType) {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) throw new TypeError('Unsupported image type.');
  const basename = String(value ?? 'image').split(/[\\/]/u).at(-1) || 'image';
  const stem = basename.replace(/\.[^.]*$/u, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '')
    .slice(0, 90 - extension.length) || 'image';
  return `${stem}.${extension}`.slice(0, 96);
}

export function matchesImageMagic(bytes, mimeType) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/gif') {
    const header = ascii(data, 0, 6);
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mimeType === 'image/webp') return data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP';
  return false;
}

export function readImageDimensions(bytes, mimeType) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (!matchesImageMagic(data, mimeType)) return null;
  if (mimeType === 'image/png') {
    if (data.length < 24 || ascii(data, 12, 16) !== 'IHDR') return null;
    return validDimensions(readU32Be(data, 16), readU32Be(data, 20));
  }
  if (mimeType === 'image/gif') {
    if (data.length < 10) return null;
    return validDimensions(readU16Le(data, 6), readU16Le(data, 8));
  }
  if (mimeType === 'image/webp') return readWebpDimensions(data);
  if (mimeType === 'image/jpeg') return readJpegDimensions(data);
  return null;
}

function readJpegDimensions(data) {
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < data.length) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;
    const marker = data[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= data.length) return null;
    const segmentLength = readU16Be(data, offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) return null;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) return null;
      return validDimensions(readU16Be(data, offset + 5), readU16Be(data, offset + 3));
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(data) {
  if (data.length < 25) return null;
  const chunk = ascii(data, 12, 16);
  if (chunk === 'VP8X') {
    if (data.length < 30) return null;
    return validDimensions(1 + readU24Le(data, 24), 1 + readU24Le(data, 27));
  }
  if (chunk === 'VP8 ') {
    if (data.length < 30 || data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return null;
    return validDimensions(readU16Le(data, 26) & 0x3fff, readU16Le(data, 28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (data[20] !== 0x2f) return null;
    const width = 1 + data[21] + ((data[22] & 0x3f) << 8);
    const height = 1 + (data[22] >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
    return validDimensions(width, height);
  }
  return null;
}

function validDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { width, height } : null;
}

function decodeStrictBase64(value) {
  const encoded = String(value ?? '');
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    throw new TypeError('Image payload must use strict canonical base64.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new TypeError('Image payload must use strict canonical base64.');
  return bytes;
}

function normalizeDimension(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > CONSOLE_IMAGE_MAX_DIMENSION) {
    throw new TypeError(`Image dimensions must be integers between 1 and ${CONSOLE_IMAGE_MAX_DIMENSION}.`);
  }
  return number;
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(data, start, end) {
  return Buffer.from(data.subarray(start, end)).toString('ascii');
}

function readU16Be(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function readU16Le(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function readU24Le(data, offset) {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function readU32Be(data, offset) {
  return (((data[offset] << 24) >>> 0) + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3]) >>> 0;
}
