export const CONSOLE_IMAGE_SOURCE_MAX_BYTES = 12 * 1024 * 1024;
export const CONSOLE_IMAGE_MAX_BYTES = 750 * 1024;
export const CONSOLE_IMAGE_GIF_MAX_BYTES = 512 * 1024;
export const CONSOLE_IMAGE_MAX_DIMENSION = 2048;

const EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
});
const STATIC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function prepareConsoleImage(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose one image to attach.');
  const mimeType = String(file.type ?? '').trim().toLowerCase();
  if (!Object.hasOwn(EXTENSION_BY_MIME, mimeType)) {
    throw new Error('Choose a JPEG, PNG, WebP, or GIF image. SVG and other formats are not accepted.');
  }
  const sourceLimit = mimeType === 'image/gif' ? CONSOLE_IMAGE_GIF_MAX_BYTES : CONSOLE_IMAGE_SOURCE_MAX_BYTES;
  if (Number.isFinite(Number(file.size)) && Number(file.size) > sourceLimit) {
    throw new Error(mimeType === 'image/gif' ? 'GIF images must be 512 KiB or smaller.' : 'Source image must be 12 MiB or smaller.');
  }
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  if (!sourceBytes.byteLength || sourceBytes.byteLength > sourceLimit) {
    throw new Error(mimeType === 'image/gif' ? 'GIF images must be 512 KiB or smaller.' : 'Source image must be 12 MiB or smaller.');
  }
  if (!matchesImageMagic(sourceBytes, mimeType)) throw new Error('The file content does not match the declared image type.');
  const filename = sanitizeFilename(file.name, mimeType);
  if (mimeType === 'image/gif') {
    if (!sourceBytes.byteLength || sourceBytes.byteLength > CONSOLE_IMAGE_GIF_MAX_BYTES) {
      throw new Error('GIF images must be 512 KiB or smaller.');
    }
    return imageResult({ bytes: sourceBytes, mimeType, filename, width: null, height: null });
  }
  if (!STATIC_TYPES.has(mimeType)) throw new Error('Unsupported image type.');

  const decodeImage = options.decodeImage ?? decodeBrowserImage;
  const encodeImage = options.encodeImage ?? encodeBrowserImage;
  const decoded = await decodeImage(new Blob([sourceBytes], { type: mimeType }));
  if (!decoded || !Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width < 1 || decoded.height < 1) {
    decoded?.close?.();
    throw new Error('The image could not be decoded safely.');
  }

  let { width, height } = fitDimensions(decoded.width, decoded.height);
  let quality = mimeType === 'image/png' ? 1 : 0.9;
  let bytes = null;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      bytes = toUint8Array(await encodeImage({ source: decoded.source ?? decoded, width, height, mimeType, quality }));
      if (bytes.byteLength <= CONSOLE_IMAGE_MAX_BYTES) break;
      if (mimeType !== 'image/png' && quality > 0.55) quality = Math.max(0.55, Number((quality - 0.08).toFixed(2)));
      else {
        width = Math.max(1, Math.floor(width * 0.84));
        height = Math.max(1, Math.floor(height * 0.84));
      }
    }
  } finally {
    decoded.close?.();
  }
  if (!bytes?.byteLength || bytes.byteLength > CONSOLE_IMAGE_MAX_BYTES) {
    throw new Error('The image could not be reduced below 750 KiB. Choose a smaller image.');
  }
  if (!matchesImageMagic(bytes, mimeType)) throw new Error('The prepared image has an invalid encoding.');
  return imageResult({ bytes, mimeType, filename, width, height });
}

export function createImagePreview({ createObjectURL = URL.createObjectURL.bind(URL), revokeObjectURL = URL.revokeObjectURL.bind(URL) } = {}) {
  let current = null;
  return {
    get url() { return current; },
    set(blob) {
      if (current) revokeObjectURL(current);
      current = createObjectURL(blob);
      return current;
    },
    clear() {
      if (current) revokeObjectURL(current);
      current = null;
    },
  };
}

export function preparedImageBlob(prepared) {
  return new Blob([base64ToBytes(prepared.base64)], { type: prepared.mimeType });
}

function imageResult({ bytes, mimeType, filename, width, height }) {
  return {
    kind: 'image', mimeType, filename, base64: bytesToBase64(bytes), byteLength: bytes.byteLength, width, height,
  };
}

function sanitizeFilename(value, mimeType) {
  const extension = EXTENSION_BY_MIME[mimeType];
  const basename = String(value ?? 'image').split(/[\\/]/u).at(-1) || 'image';
  const stem = basename.replace(/\.[^.]*$/u, '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^[._-]+|[._-]+$/gu, '').slice(0, 90 - extension.length) || 'image';
  return `${stem}.${extension}`.slice(0, 96);
}

function fitDimensions(width, height) {
  const scale = Math.min(1, CONSOLE_IMAGE_MAX_DIMENSION / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decodeBrowserImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be decoded safely.'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodeBrowserImage({ source, width, height, mimeType, quality }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });
  if (!context) throw new Error('Image preparation is unavailable in this browser.');
  context.drawImage(source, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob || blob.type !== mimeType) throw new Error('The browser could not encode this image type.');
  return new Uint8Array(await blob.arrayBuffer());
}

function matchesImageMagic(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (mimeType === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('Image encoder returned invalid bytes.');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
