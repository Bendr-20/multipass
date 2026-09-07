import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DEFAULT_ELEVENLABS_VOICE = {
  id: 'SAxJUlDKRc79XAyeWyMu',
  name: 'Morgan - Deep Storyteller Pro',
  accent: 'american',
};

export function resolveElevenLabsVoice(env = process.env) {
  const overrideId = String(env.ELEVENLABS_VOICE_ID || '').trim();
  if (overrideId) {
    return {
      id: overrideId,
      name: String(env.ELEVENLABS_VOICE_NAME || '').trim() || 'Custom ElevenLabs voice',
      accent: String(env.ELEVENLABS_VOICE_ACCENT || '').trim() || 'custom',
    };
  }

  return DEFAULT_ELEVENLABS_VOICE;
}

export function findStaleDemoOutputDirs({ tmpRoot, currentOutputDir, entries }) {
  const current = resolve(currentOutputDir);
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => /^sibyl-console-demo-\d{8}T\d{9}Z$/u.test(entry.name))
    .map((entry) => resolve(tmpRoot, entry.name))
    .filter((path) => path !== current)
    .sort();
}

export async function cleanupStaleDemoOutputs({ tmpRoot, currentOutputDir }) {
  const entries = await readdir(tmpRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const staleDirs = findStaleDemoOutputDirs({ tmpRoot, currentOutputDir, entries });

  for (const dir of staleDirs) {
    await rm(dir, { recursive: true, force: true });
  }

  return staleDirs;
}
