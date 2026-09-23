const MAX_INPUT_BYTES = 16 * 1024;
const MAX_DEPTH = 12;
const MAX_OBJECT_MEMBERS = 64;
const MAX_ARRAY_ITEMS = 8;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseStrictJsonObject(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Strict JSON input must be a string.');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_INPUT_BYTES) {
    throw new TypeError('Strict JSON input must be at most 16 KiB (16384 bytes).');
  }

  const lexer = new JsonLexer(value);
  lexer.skipWhitespace();
  if (lexer.peek() !== '{') throw new SyntaxError('Input must be an exact JSON object.');
  lexer.parseObject(1);
  lexer.skipWhitespace();
  if (!lexer.atEnd()) throw new SyntaxError('Input must be an exact JSON object.');

  let decoded;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new SyntaxError('Input is not valid JSON.');
  }
  return deepFreezeJson(decoded);
}

class JsonLexer {
  constructor(source) {
    this.source = source;
    this.position = 0;
  }

  atEnd() {
    return this.position === this.source.length;
  }

  peek() {
    return this.source[this.position];
  }

  skipWhitespace() {
    while (
      this.peek() === ' '
      || this.peek() === '\t'
      || this.peek() === '\n'
      || this.peek() === '\r'
    ) {
      this.position += 1;
    }
  }

  parseValue(depth) {
    const character = this.peek();
    if (character === '{') return this.parseObject(depth);
    if (character === '[') return this.parseArray(depth);
    if (character === '"') return this.parseString();
    if (character === 't') return this.parseLiteral('true');
    if (character === 'f') return this.parseLiteral('false');
    if (character === 'n') return this.parseLiteral('null');
    if (character === '-' || isDigit(character)) return this.parseNumber();
    throw new SyntaxError('Input contains invalid JSON syntax.');
  }

  parseObject(depth) {
    this.assertDepth(depth);
    this.expect('{');
    this.skipWhitespace();
    if (this.peek() === '}') {
      this.position += 1;
      return;
    }

    const keys = new Set();
    let members = 0;
    while (true) {
      if (this.peek() !== '"') throw new SyntaxError('JSON object keys must be strings.');
      const key = this.parseString();
      if (FORBIDDEN_KEYS.has(key)) throw new SyntaxError(`JSON object key "${key}" is forbidden.`);
      if (keys.has(key)) throw new SyntaxError(`JSON object contains duplicate key "${key}".`);
      keys.add(key);
      members += 1;
      if (members > MAX_OBJECT_MEMBERS) {
        throw new SyntaxError(`JSON objects may contain at most ${MAX_OBJECT_MEMBERS} members.`);
      }

      this.skipWhitespace();
      this.expect(':');
      this.skipWhitespace();
      this.parseValue(depth + 1);
      this.skipWhitespace();

      if (this.peek() === '}') {
        this.position += 1;
        return;
      }
      this.expect(',');
      this.skipWhitespace();
      if (this.peek() === '}') throw new SyntaxError('Input contains invalid JSON syntax.');
    }
  }

  parseArray(depth) {
    this.assertDepth(depth);
    this.expect('[');
    this.skipWhitespace();
    if (this.peek() === ']') {
      this.position += 1;
      return;
    }

    let items = 0;
    while (true) {
      if (this.peek() === ',' || this.peek() === ']') {
        throw new SyntaxError('JSON arrays must not contain holes.');
      }
      items += 1;
      if (items > MAX_ARRAY_ITEMS) {
        throw new SyntaxError(`JSON arrays may contain at most ${MAX_ARRAY_ITEMS} items.`);
      }
      this.parseValue(depth + 1);
      this.skipWhitespace();

      if (this.peek() === ']') {
        this.position += 1;
        return;
      }
      this.expect(',');
      this.skipWhitespace();
      if (this.peek() === ']') throw new SyntaxError('Input contains invalid JSON syntax.');
    }
  }

  parseString() {
    this.expect('"');
    let decoded = '';
    while (!this.atEnd()) {
      const character = this.peek();
      this.position += 1;
      if (character === '"') return decoded;
      if (character === '\\') {
        decoded += this.parseEscape();
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) {
        throw new SyntaxError('JSON strings must escape control characters.');
      }
      decoded += character;
    }
    throw new SyntaxError('JSON string is unterminated.');
  }

  parseEscape() {
    if (this.atEnd()) throw new SyntaxError('JSON escape is unterminated.');
    const escape = this.peek();
    this.position += 1;
    const simpleEscapes = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    if (Object.hasOwn(simpleEscapes, escape)) return simpleEscapes[escape];
    if (escape !== 'u') throw new SyntaxError('JSON string contains an invalid escape.');

    const hex = this.source.slice(this.position, this.position + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError('JSON string contains an invalid Unicode escape.');
    this.position += 4;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }

  parseLiteral(literal) {
    if (this.source.slice(this.position, this.position + literal.length) !== literal) {
      throw new SyntaxError('Input contains invalid JSON syntax.');
    }
    this.position += literal.length;
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.position));
    if (!match) throw new SyntaxError('Input contains an invalid JSON number.');
    this.position += match[0].length;
  }

  expect(character) {
    if (this.peek() !== character) throw new SyntaxError('Input contains invalid JSON syntax.');
    this.position += 1;
  }

  assertDepth(depth) {
    if (depth > MAX_DEPTH) throw new SyntaxError(`JSON container depth must not exceed ${MAX_DEPTH}.`);
  }
}

function isDigit(value) {
  return typeof value === 'string' && value >= '0' && value <= '9';
}

function deepFreezeJson(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Decoded JSON numbers must be finite.');
  }
  if (value === null || typeof value !== 'object') return value;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Decoded JSON objects must use the plain object prototype.');
  }
  for (const child of Object.values(value)) deepFreezeJson(child);
  return Object.freeze(value);
}
