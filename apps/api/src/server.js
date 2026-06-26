import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { activateHelixaRecord } from './activation-records.js';
import { loadFixtureStore } from './fixtures.js';
import { createMultipassApi } from './index.js';
import { createSqliteSavedRecords } from './saved-records.js';

const DEFAULT_FIXTURE = 'generic';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;

export function parseServerOptions(argv = [], env = process.env) {
  const options = {
    fixture: env.MULTIPASS_FIXTURE || DEFAULT_FIXTURE,
    host: env.HOST || DEFAULT_HOST,
    port: parsePort(env.PORT, DEFAULT_PORT, 'PORT'),
    databasePath: env.MULTIPASS_DB_PATH || null,
    allowedOrigins: parseOriginList(env.MULTIPASS_ALLOWED_ORIGINS),
    adminSecret: env.MULTIPASS_ADMIN_SECRET || null,
    cookieSecure: parseOptionalBoolean(env.MULTIPASS_COOKIE_SECURE, 'MULTIPASS_COOKIE_SECURE'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') {
      options.fixture = argv[++index];
    } else if (arg === '--host') {
      options.host = argv[++index];
    } else if (arg === '--port') {
      options.port = parsePort(argv[++index], DEFAULT_PORT, '--port');
    } else if (arg === '--database') {
      options.databasePath = argv[++index];
    }
  }

  return options;
}

export async function startServer(options = {}) {
  const parsed = {
    fixture: options.fixture || DEFAULT_FIXTURE,
    host: options.host || DEFAULT_HOST,
    port: options.port ?? DEFAULT_PORT,
    databasePath: options.databasePath ?? null,
    allowedOrigins: options.allowedOrigins ?? [],
    adminSecret: options.adminSecret ?? null,
    cookieSecure: options.cookieSecure ?? null,
  };
  const { store, fixtureName } = await loadFixtureStore({ fixture: parsed.fixture });
  const ownsSavedRecords = Boolean(parsed.databasePath && !options.savedRecords);
  const savedRecords = options.savedRecords ?? (parsed.databasePath ? createSqliteSavedRecords({ databasePath: parsed.databasePath }) : null);
  const activationService = options.activationService ?? activateHelixaRecord;
  let api;
  let baseUrl;

  const nodeServer = http.createServer(async (req, res) => {
    try {
      const requestInit = {
        method: req.method || 'GET',
        headers: normalizeHeaders(req.headers),
      };
      if (!['GET', 'HEAD'].includes(requestInit.method.toUpperCase())) {
        requestInit.body = req;
        requestInit.duplex = 'half';
      }
      const request = new Request(new URL(req.url || '/', baseUrl), requestInit);
      const response = await api.handleRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(await response.text());
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        schema_version: '0.1.0',
        error: {
          code: 'server_error',
          message: error.message,
        },
      }));
    }
  });

  await new Promise((resolve, reject) => {
    nodeServer.once('error', reject);
    nodeServer.listen(parsed.port, parsed.host, resolve);
  });

  const address = nodeServer.address();
  const port = typeof address === 'object' && address ? address.port : parsed.port;
  baseUrl = `http://${parsed.host}:${port}`;
  api = createMultipassApi({
    store,
    baseUrl,
    savedRecords,
    activationService,
    allowedOrigins: parsed.allowedOrigins,
    adminSecret: parsed.adminSecret,
    cookieSecure: parsed.cookieSecure,
  });

  return {
    fixtureName,
    host: parsed.host,
    port,
    url: baseUrl,
    databasePath: parsed.databasePath,
    server: nodeServer,
    close: () => new Promise((resolve, reject) => {
      nodeServer.close((error) => {
        if (ownsSavedRecords) savedRecords.close();
        error ? reject(error) : resolve();
      });
    }),
  };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]),
  );
}

function parsePort(value, fallback, source) {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port for ${source}: ${value}`);
  }
  return port;
}

function parseOriginList(value) {
  return String(value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseOptionalBoolean(value, source) {
  if (value === undefined || value === null || value === '') return null;
  if (['1', 'true', 'yes'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(String(value).toLowerCase())) return false;
  throw new Error(`Invalid boolean for ${source}: ${value}`);
}

async function main() {
  const server = await startServer(parseServerOptions(process.argv.slice(2), process.env));
  console.log(`Multipass API server listening at ${server.url}`);
  console.log(`Fixture: ${server.fixtureName}`);
  if (server.databasePath) console.log(`Database: ${server.databasePath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
