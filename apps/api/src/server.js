import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { activateHelixaRecord } from './activation-records.js';
import { readAllowlistFile } from './allowlist-snapshot.js';
import { createJsonAllowlistStore, createMemoryAllowlistStore } from './allowlist-store.js';
import { createConsoleProductionBootstrap } from './console-production-bootstrap.js';
import { loadFixtureStore } from './fixtures.js';
import { createMultipassApi } from './index.js';
import {
  DEFAULT_LOOPER_CRED_API_BASE_URL,
  DEFAULT_LOOPER_CRED_CONCURRENCY,
  DEFAULT_LOOPER_CRED_TIMEOUT_MS,
} from './looper-cred-client.js';
import { createLooperCodexRuntime } from './looper-codex-runtime.js';
import { createSqliteLooperNameStore } from './looper-name-store.js';
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
    publicBaseUrl: normalizeOptionalBaseUrl(env.MULTIPASS_PUBLIC_BASE_URL, 'MULTIPASS_PUBLIC_BASE_URL'),
    loopersAllowlistPath: env.MULTIPASS_LOOPERS_ALLOWLIST_PATH || null,
    loopersAllowlistSnapshotPath: env.MULTIPASS_LOOPERS_ALLOWLIST_SNAPSHOT_PATH || null,
    looperCodexArtifactPath: env.MULTIPASS_LOOPER_CODEX_ARTIFACT_PATH || null,
    loopersAllowlistRegistrationPaused: parseOptionalBoolean(env.MULTIPASS_LOOPERS_ALLOWLIST_PAUSED, 'MULTIPASS_LOOPERS_ALLOWLIST_PAUSED') ?? false,
    loopersAllowlistRequireBrowserOrigin: parseOptionalBoolean(env.MULTIPASS_LOOPERS_ALLOWLIST_REQUIRE_BROWSER_ORIGIN, 'MULTIPASS_LOOPERS_ALLOWLIST_REQUIRE_BROWSER_ORIGIN') ?? false,
    loopersAllowlistBlockedSources: parseStringList(env.MULTIPASS_LOOPERS_ALLOWLIST_BLOCKED_SOURCES),
    loopersAllowlistRateLimit: parseRateLimitConfig({
      limit: env.MULTIPASS_LOOPERS_ALLOWLIST_RATE_LIMIT,
      windowSeconds: env.MULTIPASS_LOOPERS_ALLOWLIST_RATE_WINDOW_SECONDS,
    }, 'MULTIPASS_LOOPERS_ALLOWLIST_RATE'),
    loopersAllowlistSubnetRateLimit: parseRateLimitConfig({
      limit: env.MULTIPASS_LOOPERS_ALLOWLIST_SUBNET_RATE_LIMIT,
      windowSeconds: env.MULTIPASS_LOOPERS_ALLOWLIST_SUBNET_RATE_WINDOW_SECONDS,
    }, 'MULTIPASS_LOOPERS_ALLOWLIST_SUBNET_RATE'),
    loopersAllowlistGlobalRateLimit: parseRateLimitConfig({
      limit: env.MULTIPASS_LOOPERS_ALLOWLIST_GLOBAL_RATE_LIMIT,
      windowSeconds: env.MULTIPASS_LOOPERS_ALLOWLIST_GLOBAL_RATE_WINDOW_SECONDS,
    }, 'MULTIPASS_LOOPERS_ALLOWLIST_GLOBAL_RATE'),
    loopersTurnstileSecretKey: env.MULTIPASS_LOOPERS_TURNSTILE_SECRET_KEY || null,
    loopersCredApiBaseUrl: normalizeOptionalBaseUrl(env.MULTIPASS_LOOPER_CRED_API_BASE_URL, 'MULTIPASS_LOOPER_CRED_API_BASE_URL') ?? DEFAULT_LOOPER_CRED_API_BASE_URL,
    loopersCredTimeoutMs: parseBoundedPositiveInteger(env.MULTIPASS_LOOPER_CRED_TIMEOUT_MS, DEFAULT_LOOPER_CRED_TIMEOUT_MS, 'MULTIPASS_LOOPER_CRED_TIMEOUT_MS', 30_000),
    loopersCredConcurrency: parseBoundedPositiveInteger(env.MULTIPASS_LOOPER_CRED_CONCURRENCY, DEFAULT_LOOPER_CRED_CONCURRENCY, 'MULTIPASS_LOOPER_CRED_CONCURRENCY', 16),
    bankrLlmKey: env.BANKR_LLM_KEY || env.BANKR_API_KEY || null,
    bankrReadonlyApiKey: env.BANKR_READONLY_API_KEY || null,
    bankrLlmModel: env.MULTIPASS_AGENT_LLM_MODEL || null,
    bankrLlmVisionModel: env.MULTIPASS_AGENT_LLM_VISION_MODEL || null,
    consoleAgentBankrLlmEnabled: parseOptionalBoolean(env.MULTIPASS_AGENT_BANKR_LLM_ENABLED, 'MULTIPASS_AGENT_BANKR_LLM_ENABLED') ?? false,
    consoleSkillProposalsEnabled: parseOptionalBoolean(env.MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED, 'MULTIPASS_CONSOLE_SKILL_PROPOSALS_ENABLED') ?? false,
    consoleMarketReadEnabled: parseOptionalBoolean(env.MULTIPASS_CONSOLE_MARKET_READ_ENABLED, 'MULTIPASS_CONSOLE_MARKET_READ_ENABLED') ?? false,
    consoleAccountReadEnabled: parseOptionalBoolean(env.MULTIPASS_CONSOLE_ACCOUNT_READ_ENABLED, 'MULTIPASS_CONSOLE_ACCOUNT_READ_ENABLED') ?? false,
    consoleXmtpEnabled: parseOptionalBoolean(env.MULTIPASS_XMTP_ENABLED, 'MULTIPASS_XMTP_ENABLED') ?? false,
    consoleXmtpEnv: env.MULTIPASS_XMTP_ENV || 'production',
    consoleXmtpWalletKey: env.MULTIPASS_XMTP_WALLET_KEY || null,
    consoleXmtpDbPath: env.MULTIPASS_XMTP_DB_PATH || null,
    consoleXmtpDbEncryptionKey: env.MULTIPASS_XMTP_DB_ENCRYPTION_KEY || null,
    consoleXmtpHistorySyncUrl: env.MULTIPASS_XMTP_HISTORY_SYNC_URL || null,
    consoleXmtpApiUrl: env.MULTIPASS_XMTP_API_URL || null,
    consoleXmtpGatewayHost: env.MULTIPASS_XMTP_GATEWAY_HOST || null,
    consoleXmtpAppVersion: env.MULTIPASS_XMTP_APP_VERSION || 'multipass-console',
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
    } else if (arg === '--public-base-url') {
      options.publicBaseUrl = normalizeOptionalBaseUrl(argv[++index], '--public-base-url');
    } else if (arg === '--loopers-allowlist') {
      options.loopersAllowlistPath = argv[++index];
    } else if (arg === '--loopers-allowlist-snapshot') {
      options.loopersAllowlistSnapshotPath = argv[++index];
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
    publicBaseUrl: normalizeOptionalBaseUrl(options.publicBaseUrl, 'publicBaseUrl'),
    loopersAllowlistPath: options.loopersAllowlistPath ?? null,
    loopersAllowlistSnapshotPath: options.loopersAllowlistSnapshotPath ?? null,
    looperCodexArtifactPath: options.looperCodexArtifactPath ?? null,
    loopersAllowlistRegistrationPaused: Boolean(options.loopersAllowlistRegistrationPaused),
    loopersAllowlistRequireBrowserOrigin: Boolean(options.loopersAllowlistRequireBrowserOrigin),
    loopersAllowlistBlockedSources: options.loopersAllowlistBlockedSources ?? [],
    loopersAllowlistRateLimit: options.loopersAllowlistRateLimit,
    loopersAllowlistSubnetRateLimit: options.loopersAllowlistSubnetRateLimit,
    loopersAllowlistGlobalRateLimit: options.loopersAllowlistGlobalRateLimit,
    loopersTurnstileSecretKey: options.loopersTurnstileSecretKey ?? null,
    loopersCredApiBaseUrl: normalizeOptionalBaseUrl(options.loopersCredApiBaseUrl ?? DEFAULT_LOOPER_CRED_API_BASE_URL, 'loopersCredApiBaseUrl'),
    loopersCredTimeoutMs: parseBoundedPositiveInteger(options.loopersCredTimeoutMs, DEFAULT_LOOPER_CRED_TIMEOUT_MS, 'loopersCredTimeoutMs', 30_000),
    loopersCredConcurrency: parseBoundedPositiveInteger(options.loopersCredConcurrency, DEFAULT_LOOPER_CRED_CONCURRENCY, 'loopersCredConcurrency', 16),
    bankrLlmKey: options.bankrLlmKey ?? null,
    bankrReadonlyApiKey: options.bankrReadonlyApiKey ?? null,
    bankrLlmModel: options.bankrLlmModel ?? null,
    bankrLlmVisionModel: options.bankrLlmVisionModel ?? null,
    consoleAgentBankrLlmEnabled: Boolean(options.consoleAgentBankrLlmEnabled),
    consoleSkillProposalsEnabled: Boolean(options.consoleSkillProposalsEnabled),
    consoleMarketReadEnabled: Boolean(options.consoleMarketReadEnabled),
    consoleAccountReadEnabled: Boolean(options.consoleAccountReadEnabled),
    consoleXmtpEnabled: Boolean(options.consoleXmtpEnabled),
    consoleXmtpEnv: options.consoleXmtpEnv ?? 'production',
    consoleXmtpWalletKey: options.consoleXmtpWalletKey ?? null,
    consoleXmtpDbPath: options.consoleXmtpDbPath ?? null,
    consoleXmtpDbEncryptionKey: options.consoleXmtpDbEncryptionKey ?? null,
    consoleXmtpHistorySyncUrl: options.consoleXmtpHistorySyncUrl ?? null,
    consoleXmtpApiUrl: options.consoleXmtpApiUrl ?? null,
    consoleXmtpGatewayHost: options.consoleXmtpGatewayHost ?? null,
    consoleXmtpAppVersion: options.consoleXmtpAppVersion ?? 'multipass-console',
    loopersOwnedRpcUrl: options.loopersOwnedRpcUrl,
    loopersOwnedMetadataBaseUrl: options.loopersOwnedMetadataBaseUrl,
    loopersPublicClients: options.loopersPublicClients,
    fetchImpl: options.fetchImpl,
  };
  const { store, fixtureName } = await loadFixtureStore({ fixture: parsed.fixture });
  const ownsSavedRecords = Boolean(parsed.databasePath && !options.savedRecords);
  const savedRecords = options.savedRecords ?? (parsed.databasePath ? createSqliteSavedRecords({ databasePath: parsed.databasePath }) : null);
  const ownsLooperNameStore = !options.looperNameStore;
  const looperNameStore = options.looperNameStore ?? createSqliteLooperNameStore({ databasePath: parsed.databasePath ?? ':memory:' });
  const activationService = options.activationService ?? activateHelixaRecord;
  const loopersAllowlist = options.loopersAllowlist
    ?? (parsed.loopersAllowlistPath
      ? await createJsonAllowlistStore({ filePath: parsed.loopersAllowlistPath })
      : createMemoryAllowlistStore());
  const loopersAllowlistSnapshot = options.loopersAllowlistSnapshot
    ?? (parsed.loopersAllowlistSnapshotPath
      ? await readAllowlistFile(parsed.loopersAllowlistSnapshotPath)
      : null);
  const consoleBootstrapFactory = options.consoleBootstrapFactory ?? createConsoleProductionBootstrap;
  const looperCodexRuntimeFactory = options.looperCodexRuntimeFactory ?? createLooperCodexRuntime;
  const apiFactory = options.apiFactory ?? createMultipassApi;
  let api;
  let listeningUrl;
  let apiBaseUrl;
  let consoleBootstrap;
  let looperCodexRuntime;
  let closePromise = null;

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
      const request = new Request(new URL(req.url || '/', apiBaseUrl), requestInit);
      const response = await api.handleRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (requestInit.method.toUpperCase() === 'HEAD') {
        res.end();
      } else {
        res.end(Buffer.from(await response.arrayBuffer()));
      }
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

  try {
    const codexStartedAt = Date.now();
    const codexStartingRss = process.memoryUsage().rss;
    looperCodexRuntime = options.looperCodexRuntime ?? await looperCodexRuntimeFactory({
      artifactPath: parsed.looperCodexArtifactPath,
      logger: {},
    });
    const codexStatus = looperCodexRuntime?.status ?? { available: false };
    logServerEvent(options.logger ?? console, codexStatus.available ? 'info' : 'warn', {
      event: 'looper_codex_startup',
      available: codexStatus.available === true,
      schemaVersion: safeStartupString(codexStatus.schemaVersion),
      artifactHashPrefix: safeHashPrefix(codexStatus.artifactHash),
      count: Number.isSafeInteger(codexStatus.count) ? codexStatus.count : null,
      loadMs: Date.now() - codexStartedAt,
      rssDeltaBytes: process.memoryUsage().rss - codexStartingRss,
    });

    consoleBootstrap = await consoleBootstrapFactory({
      ...parsed,
      logger: options.logger ?? console,
    });

    await new Promise((resolve, reject) => {
      nodeServer.once('error', reject);
      nodeServer.listen(parsed.port, parsed.host, resolve);
    });

    const address = nodeServer.address();
    const port = typeof address === 'object' && address ? address.port : parsed.port;
    listeningUrl = `http://${parsed.host}:${port}`;
    apiBaseUrl = parsed.publicBaseUrl ?? listeningUrl;
    api = apiFactory({
      store,
      baseUrl: apiBaseUrl,
      savedRecords,
      looperNameStore,
      activationService,
      allowedOrigins: parsed.allowedOrigins,
      adminSecret: parsed.adminSecret,
      cookieSecure: parsed.cookieSecure,
      loopersAllowlist,
      loopersAllowlistSnapshot,
      loopersAllowlistRegistrationPaused: parsed.loopersAllowlistRegistrationPaused,
      loopersAllowlistRequireBrowserOrigin: parsed.loopersAllowlistRequireBrowserOrigin,
      loopersAllowlistBlockedSources: parsed.loopersAllowlistBlockedSources,
      loopersAllowlistRateLimit: parsed.loopersAllowlistRateLimit,
      loopersAllowlistSubnetRateLimit: parsed.loopersAllowlistSubnetRateLimit,
      loopersAllowlistGlobalRateLimit: parsed.loopersAllowlistGlobalRateLimit,
      loopersTurnstileSecretKey: parsed.loopersTurnstileSecretKey,
      loopersCredApiBaseUrl: parsed.loopersCredApiBaseUrl,
      loopersCredTimeoutMs: parsed.loopersCredTimeoutMs,
      loopersCredConcurrency: parsed.loopersCredConcurrency,
      loopersOwnedAgentLoader: consoleBootstrap.ownedAgentLoader,
      loopersPublicClients: consoleBootstrap.publicClients,
      loopersAuthorizer: consoleBootstrap.authorizeLooper,
      consoleRuntimeRegistry: consoleBootstrap.runtimeRegistry,
      consoleXmtpClient: consoleBootstrap.publishingClient,
      consoleAgentRuntime: consoleBootstrap.runtime,
      looperCodexRuntime,
      logger: options.logger ?? console,
      fetchImpl: parsed.fetchImpl,
    });
  } catch (error) {
    await closeServerResources({
      consoleBootstrap,
      nodeServer,
      savedRecords,
      ownsSavedRecords,
      looperNameStore,
      ownsLooperNameStore,
    }).catch(() => {});
    throw error;
  }

  const address = nodeServer.address();
  const port = typeof address === 'object' && address ? address.port : parsed.port;

  return {
    fixtureName,
    host: parsed.host,
    port,
    url: listeningUrl,
    publicBaseUrl: apiBaseUrl,
    databasePath: parsed.databasePath,
    loopersAllowlistPath: parsed.loopersAllowlistPath,
    loopersAllowlistSnapshotPath: parsed.loopersAllowlistSnapshotPath,
    console: consoleBootstrap,
    server: nodeServer,
    close() {
      if (!closePromise) {
        closePromise = closeServerResources({
          consoleBootstrap,
          nodeServer,
          savedRecords,
          ownsSavedRecords,
          looperNameStore,
          ownsLooperNameStore,
        });
      }
      return closePromise;
    },
  };
}

async function closeServerResources({ consoleBootstrap, nodeServer, savedRecords, ownsSavedRecords, looperNameStore, ownsLooperNameStore }) {
  const errors = [];
  for (const close of [
    () => consoleBootstrap?.stopWorker?.(),
    () => closeHttpServer(nodeServer),
    () => consoleBootstrap?.closeClient?.(),
    () => ownsSavedRecords ? savedRecords?.close?.() : undefined,
    () => ownsLooperNameStore ? looperNameStore?.close?.() : undefined,
  ]) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Multipass server shutdown failed.');
}

function closeHttpServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
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
  return parseStringList(value);
}

function parseStringList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOptionalBaseUrl(value, source) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('unsupported protocol');
    }
    return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
  } catch {
    throw new Error(`Invalid URL for ${source}: ${value}`);
  }
}

function parseOptionalBoolean(value, source) {
  if (value === undefined || value === null || value === '') return null;
  if (['1', 'true', 'yes'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(String(value).toLowerCase())) return false;
  throw new Error(`Invalid boolean for ${source}: ${value}`);
}

function parseOptionalPositiveInteger(value, source) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer for ${source}: ${value}`);
  }
  return parsed;
}

function parseBoundedPositiveInteger(value, fallback, source, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parseOptionalPositiveInteger(value, source);
  if (parsed > max) throw new Error(`Invalid positive integer for ${source}: ${value}`);
  return parsed;
}

function parseRateLimitConfig({ limit, windowSeconds } = {}, sourcePrefix) {
  const parsedLimit = parseOptionalPositiveInteger(limit, `${sourcePrefix}_LIMIT`);
  const parsedWindowSeconds = parseOptionalPositiveInteger(windowSeconds, `${sourcePrefix}_WINDOW_SECONDS`);
  if (parsedLimit === null && parsedWindowSeconds === null) return undefined;
  return {
    ...(parsedLimit !== null ? { limit: parsedLimit } : {}),
    ...(parsedWindowSeconds !== null ? { windowMs: parsedWindowSeconds * 1000 } : {}),
  };
}

function safeStartupString(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && normalized.length <= 64 ? normalized : null;
}

function safeHashPrefix(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
    ? value.slice(0, 12)
    : null;
}

function logServerEvent(logger, level, event) {
  try {
    logger?.[level]?.(event);
  } catch {
    // Logging must never affect service availability.
  }
}

async function main() {
  const server = await startServer(parseServerOptions(process.argv.slice(2), process.env));
  console.log(`Multipass API server listening at ${server.url}`);
  if (server.publicBaseUrl !== server.url) console.log(`Public base URL: ${server.publicBaseUrl}`);
  console.log(`Fixture: ${server.fixtureName}`);
  if (server.databasePath) console.log(`Database: ${server.databasePath}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Multipass API server received ${signal}; stopping.`);
    try {
      await server.close();
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
