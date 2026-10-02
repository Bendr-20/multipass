import { createConsoleAgentRuntime } from './agent-runtime/index.js';
import { createBankrLlmClient } from './bankr-llm/index.js';
import { createConsoleReadSkillExecutor } from './console-read-skills.js';
import {
  authorizeLooperControl,
  createLoopersOwnedAgentLoader,
  createLoopersPublicClients,
} from './loopers-owned-agents.js';
import { createLooperRuntimeRegistry } from './looper-runtime-registry.js';
import { createLooperPersonaLoader } from './looper-persona.js';
import { createRestapNetworkActivationLeaseService } from './restap-network/activation-leases.js';
import { createSibylMemoryStore } from './sibyl-memory/index.js';
import {
  createDeferredXmtpAgentClient,
  createNodeXmtpAgentClient,
  createXmtpNodeClient,
} from './xmtp-agent/index.js';
import { startConsoleXmtpWorker } from './xmtp-worker/index.js';

const DEFAULT_FACTORIES = {
  authorizeLooperControl,
  createBankrLlmClient,
  createConsoleAgentRuntime,
  createConsoleReadSkillExecutor,
  createDeferredXmtpAgentClient,
  createLooperRuntimeRegistry,
  createLooperPersonaLoader,
  createRestapNetworkActivationLeaseService,
  createLoopersOwnedAgentLoader,
  createLoopersPublicClients,
  createNodeXmtpAgentClient,
  createSibylMemoryStore,
  createXmtpNodeClient,
  startConsoleXmtpWorker,
};

export async function createConsoleProductionBootstrap(options = {}, injectedFactories = {}) {
  const factories = { ...DEFAULT_FACTORIES, ...injectedFactories };
  const xmtpEnabled = options.consoleXmtpEnabled === true;
  const xmtpConfiguration = xmtpEnabled ? assertConsoleXmtpConfiguration(options) : null;

  const publicClients = factories.createLoopersPublicClients({
    rpcUrl: options.loopersOwnedRpcUrl,
    publicClients: options.loopersPublicClients,
  });
  const ownedAgentLoader = factories.createLoopersOwnedAgentLoader({
    fetchImpl: options.fetchImpl ?? fetch,
    publicClients,
    ...(options.loopersOwnedMetadataBaseUrl
      ? { metadataBaseUrl: options.loopersOwnedMetadataBaseUrl }
      : {}),
  });
  const personaLoader = factories.createLooperPersonaLoader({
    fetchImpl: options.fetchImpl ?? fetch,
    ...(options.loopersOwnedMetadataBaseUrl
      ? { metadataBaseUrl: options.loopersOwnedMetadataBaseUrl }
      : {}),
  });
  const authorizeLooper = async (input) => {
    const identity = await factories.authorizeLooperControl({
      ...input,
      publicClients,
    });
    const persona = await personaLoader({ tokenId: identity.tokenId });
    return persona ? { ...identity, persona } : identity;
  };
  const activationLeases = options.restapNetworkActivationLeases ?? (options.restapNetworkStore
    ? factories.createRestapNetworkActivationLeaseService({
      store: options.restapNetworkStore,
      getPolicyGeneration: options.restapNetworkPolicyGenerationLoader ?? (() => 0),
    })
    : null);
  const activationLeaseCandidates = activationLeases?.loadCandidates() ?? [];
  const runtimeRegistry = factories.createLooperRuntimeRegistry({
    onNetworkActivate: activationLeases && options.restapNetworkCustodyReconciler
      ? async ({ identity, wallet }) => {
        const result = await options.restapNetworkCustodyReconciler.reconcileToken({ tokenId: identity.tokenId });
        if (!result?.eligible) return Object.freeze({ status: 'unavailable' });
        const custody = options.restapNetworkCustodyReconciler.getEpochSnapshot({ tokenId: identity.tokenId });
        if (!custody || custody.status !== 'ready' || custody.tokenId !== String(identity.tokenId) || custody.owner.toLowerCase() !== wallet) {
          return Object.freeze({ status: 'unavailable' });
        }
        const expectedPolicyGeneration = Number(options.restapNetworkPolicyGeneration ?? 0);
        const lease = activationLeases.renew({ custody, expectedPolicyGeneration })
          ?? activationLeases.issue({ custody, expectedPolicyGeneration });
        return Object.freeze({
          status: 'active',
          custodyGeneration: lease.custodyGeneration,
          expiresAt: new Date(lease.expiresAt).toISOString(),
        });
      }
      : null,
    onDeactivate: activationLeases && options.restapNetworkCustodyReconciler
      ? async ({ identity }) => {
        const result = await options.restapNetworkCustodyReconciler.reconcileToken({ tokenId: identity.tokenId });
        if (!result?.eligible) throw new Error('RESTAP network custody is unavailable.');
        const custody = options.restapNetworkCustodyReconciler.getEpochSnapshot({ tokenId: identity.tokenId });
        activationLeases.deactivate({ custody, expectedPolicyGeneration: Number(options.restapNetworkPolicyGeneration ?? 0) });
      }
      : null,
  });
  const memoryClient = factories.createSibylMemoryStore();
  const llmClient = options.consoleAgentBankrLlmEnabled === true
    ? factories.createBankrLlmClient({
      apiKey: options.bankrLlmKey,
      model: options.bankrLlmModel,
      visionModel: options.bankrLlmVisionModel,
      fetchImpl: options.fetchImpl ?? fetch,
      skillProposalsEnabled: options.consoleSkillProposalsEnabled === true,
    }) ?? undefined
    : undefined;
  const bankrReadonlyApiKey = String(options.bankrReadonlyApiKey ?? '').trim() || null;
  const readSkillExecutor = options.consoleSkillProposalsEnabled === true
    || options.consoleMarketReadEnabled === true
    || options.consoleAccountReadEnabled === true
    ? factories.createConsoleReadSkillExecutor({
      bankrApiKey: bankrReadonlyApiKey,
      fetchImpl: options.fetchImpl ?? fetch,
    })
    : undefined;

  let nodeClient = null;
  let publishingClient = null;
  let runtime = null;
  let worker = null;

  try {
    if (xmtpEnabled) {
      nodeClient = await factories.createXmtpNodeClient({
        env: options.consoleXmtpEnv ?? 'production',
        walletKey: xmtpConfiguration.walletKey,
        dbPath: xmtpConfiguration.dbPath,
        dbEncryptionKey: xmtpConfiguration.dbEncryptionKey,
        historySyncUrl: options.consoleXmtpHistorySyncUrl ?? null,
        apiUrl: options.consoleXmtpApiUrl ?? null,
        gatewayHost: options.consoleXmtpGatewayHost ?? null,
        appVersion: options.consoleXmtpAppVersion ?? 'multipass-console',
      });
      publishingClient = await factories.createNodeXmtpAgentClient({
        client: nodeClient,
      });
    } else {
      publishingClient = factories.createDeferredXmtpAgentClient({ enabled: false });
    }

    runtime = factories.createConsoleAgentRuntime({
      memoryClient,
      ...(llmClient ? { llmClient } : {}),
      ...(readSkillExecutor ? { readSkillExecutor } : {}),
      xmtpClient: publishingClient,
      skillProposalsEnabled: options.consoleSkillProposalsEnabled === true,
      marketReadEnabled: options.consoleMarketReadEnabled === true,
      accountReadEnabled: options.consoleAccountReadEnabled === true,
      bankrReadEnabled: Boolean(bankrReadonlyApiKey),
      skillProviderTimeoutMs: options.consoleSkillProviderTimeoutMs,
    });

    if (xmtpEnabled) {
      worker = await factories.startConsoleXmtpWorker({
        client: nodeClient,
        xmtpClient: publishingClient,
        runtime,
        runtimeRegistry,
        authorizeLooper,
        logger: options.logger ?? console,
        retryAttempts: options.consoleXmtpRetryAttempts,
        retryDelay: options.consoleXmtpRetryDelay,
        consoleSkillProposalsEnabled: options.consoleSkillProposalsEnabled === true,
        consoleMarketReadEnabled: options.consoleMarketReadEnabled === true,
        consoleAccountReadEnabled: options.consoleAccountReadEnabled === true,
      });
    }
  } catch (error) {
    await closeSupportedXmtpClient(nodeClient).catch(() => {});
    throw error;
  }

  let stopWorkerPromise = null;
  let closeClientPromise = null;

  return {
    xmtpEnabled,
    publicClients,
    ownedAgentLoader,
    authorizeLooper,
    runtimeRegistry,
    activationLeases,
    activationLeaseCandidates,
    restapNetworkCustodyReconciler: options.restapNetworkCustodyReconciler ?? null,
    memoryClient,
    nodeClient,
    publishingClient,
    runtime,
    worker,
    stopWorker() {
      if (!stopWorkerPromise) {
        stopWorkerPromise = Promise.resolve().then(() => worker?.stop?.());
      }
      return stopWorkerPromise;
    },
    closeClient() {
      if (!closeClientPromise) {
        closeClientPromise = closeSupportedXmtpClient(nodeClient);
      }
      return closeClientPromise;
    },
  };
}

export function assertConsoleXmtpConfiguration(options = {}) {
  const walletKey = normalize32ByteHex(
    options.consoleXmtpWalletKey,
    'MULTIPASS_XMTP_WALLET_KEY',
    '32-byte hex private key',
    { prefix: true },
  );
  const dbPath = String(options.consoleXmtpDbPath ?? '').trim();
  if (!dbPath) {
    throw new Error('MULTIPASS_XMTP_ENABLED=1 requires MULTIPASS_XMTP_DB_PATH.');
  }
  const dbEncryptionKey = normalize32ByteEncryptionKey(options.consoleXmtpDbEncryptionKey);
  return { walletKey, dbPath, dbEncryptionKey };
}

async function closeSupportedXmtpClient(client) {
  if (!client) return;
  if (typeof client.close === 'function') {
    await client.close();
    return;
  }
  if (typeof client.disconnect === 'function') {
    await client.disconnect();
  }
}

function normalize32ByteEncryptionKey(value) {
  if (value instanceof Uint8Array) {
    if (value.byteLength !== 32) {
      throw new Error('MULTIPASS_XMTP_DB_ENCRYPTION_KEY must be a 32-byte encryption key.');
    }
    return value;
  }
  return normalize32ByteHex(
    value,
    'MULTIPASS_XMTP_DB_ENCRYPTION_KEY',
    '32-byte encryption key',
  );
}

function normalize32ByteHex(value, source, description, { prefix = false } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`MULTIPASS_XMTP_ENABLED=1 requires ${source}.`);
  }
  if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`${source} must be a ${description}.`);
  }
  return prefix && !normalized.startsWith('0x') ? `0x${normalized}` : normalized;
}
