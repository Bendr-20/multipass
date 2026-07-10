#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { createSqliteSavedRecords } from '../src/saved-records.js';
import {
  buildPublicWebEnrichment,
  discoverPublicWebDocuments,
} from '../src/public-web-enrichment.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const databasePath = requiredArg(args.database ?? process.env.MULTIPASS_DB_PATH, '--database or MULTIPASS_DB_PATH');
  const identifier = requiredArg(args.identifier, '--identifier');
  const seedUrl = requiredArg(args.seedUrl, '--seed-url');
  const now = args.now ?? new Date().toISOString();
  const apply = Boolean(args.apply);
  const documents = args.docsJson
    ? JSON.parse(await readFile(args.docsJson, 'utf8'))
    : await discoverPublicWebDocuments({ seedUrl });

  const store = createSqliteSavedRecords({ databasePath });
  try {
    const profile = store.resolveProfile(identifier);
    if (!profile) throw new Error(`Multipass not found: ${identifier}`);
    const enrichment = buildPublicWebEnrichment({
      multipassId: profile.multipass_id,
      displayName: profile.display_name,
      seedUrl,
      documents,
      now,
    });

    let output;
    if (apply) {
      const applied = store.applyPublicWebEnrichment(identifier, enrichment, { now });
      output = {
        applied: true,
        multipass_id: applied.profile.multipass_id,
        slug: applied.profile.slug,
        source_host: enrichment.sourceHost,
        source_urls: enrichment.sourceUrls,
        tools: {
          total: applied.tools.summary.total,
          ids: applied.tools.tools.map((tool) => tool.tool_id),
        },
        endpoints: {
          total: enrichment.endpoints.length,
          ids: enrichment.endpoints.map((endpoint) => endpoint.endpointId),
        },
        owner_verification: applied.profile.owner_summary.verification_status,
      };
    } else {
      output = {
        applied: false,
        multipass_id: profile.multipass_id,
        slug: profile.slug,
        source_host: enrichment.sourceHost,
        source_urls: enrichment.sourceUrls,
        summary: enrichment.summary,
        tools: {
          total: enrichment.tools.length,
          ids: enrichment.tools.map((tool) => tool.toolId),
        },
        endpoints: {
          total: enrichment.endpoints.length,
          ids: enrichment.endpoints.map((endpoint) => endpoint.endpointId),
        },
        note: 'Dry run only. Re-run with --apply to write pending public-web observed metadata.',
      };
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    store.close();
  }
}

function parseArgs(argv) {
  const parsed = { apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      parsed.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--database') {
      parsed.database = nextArg(argv, ++index, arg);
    } else if (arg === '--identifier') {
      parsed.identifier = nextArg(argv, ++index, arg);
    } else if (arg === '--seed-url') {
      parsed.seedUrl = nextArg(argv, ++index, arg);
    } else if (arg === '--docs-json') {
      parsed.docsJson = nextArg(argv, ++index, arg);
    } else if (arg === '--now') {
      parsed.now = nextArg(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function nextArg(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function requiredArg(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function printHelp() {
  console.log(`Usage: node apps/api/scripts/enrich-public-web-docs.js --database <path> --identifier <id-or-slug> --seed-url <https-url> [--docs-json <path>] [--apply]

Scrapes public agent-readable docs from a seed site and imports pending public-web observed Multipass metadata.
Without --apply, prints a dry-run JSON summary and writes nothing.`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
