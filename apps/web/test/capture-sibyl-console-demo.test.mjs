import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_ELEVENLABS_VOICE,
  findStaleDemoOutputDirs,
  resolveElevenLabsVoice,
} from '../scripts/capture-sibyl-console-demo-utils.mjs';

test('capture demo defaults to an American narration voice', () => {
  const voice = resolveElevenLabsVoice({});

  assert.equal(voice.id, DEFAULT_ELEVENLABS_VOICE.id);
  assert.equal(voice.accent, 'american');
  assert.match(voice.name, /Morgan/);
});

test('capture demo still lets callers override the ElevenLabs voice id', () => {
  const voice = resolveElevenLabsVoice({ ELEVENLABS_VOICE_ID: 'custom-voice-id' });

  assert.equal(voice.id, 'custom-voice-id');
  assert.equal(voice.name, 'Custom ElevenLabs voice');
});

test('stale output cleanup only targets older Sibyl Console demo packages', () => {
  const tmpRoot = resolve('/tmp/workspace/tmp');
  const currentOutputDir = join(tmpRoot, 'sibyl-console-demo-20260907T140000000Z');
  const staleDirs = findStaleDemoOutputDirs({
    tmpRoot,
    currentOutputDir,
    entries: [
      { name: 'sibyl-console-demo-20260907T043739020Z', isDirectory: () => true },
      { name: 'sibyl-console-demo-20260907T140000000Z', isDirectory: () => true },
      { name: 'not-a-demo-output', isDirectory: () => true },
      { name: 'sibyl-console-demo-note.txt', isDirectory: () => false },
    ],
  });

  assert.deepEqual(staleDirs, [
    join(tmpRoot, 'sibyl-console-demo-20260907T043739020Z'),
  ]);
});
