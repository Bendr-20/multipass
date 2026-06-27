export function shortenAddress(address) {
  if (address == null) return null;
  const value = String(address);
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function defaultWalletSnapshot(overrides = {}) {
  return {
    ready: true,
    configured: true,
    connected: false,
    address: null,
    label: null,
    connectLabel: 'Connect wallet to claim',
    ...overrides,
  };
}

export function getWalletErrorMessage(error) {
  const messages = [
    error?.message,
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.message,
  ].filter((message) => typeof message === 'string' && message.trim());
  const message = messages.join(' ');
  const code = error?.code;
  const normalized = message.toLowerCase();

  if (
    code === 4001
    || code === '4001'
    || code === 'ACTION_REJECTED'
    || normalized.includes('user rejected')
    || normalized.includes('rejected the request')
  ) {
    return 'Wallet signature cancelled. Nothing was changed.';
  }

  return message || 'Wallet connection failed. Nothing was changed.';
}

export function createLegacyWalletClient(walletSigner) {
  return {
    getSnapshot() {
      return defaultWalletSnapshot({ connected: true, connectLabel: 'Sign owner claim' });
    },
    subscribe() {
      return () => {};
    },
    async connect() {},
    signMessage: walletSigner,
  };
}

export function createInjectedWalletClient({ getWindow = () => globalThis.window } = {}) {
  let address = null;
  const subscribers = new Set();

  function getProvider() {
    const provider = getWindow()?.ethereum;
    if (!provider?.request) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
    return provider;
  }

  function notify() {
    for (const listener of subscribers) listener();
  }

  return {
    getSnapshot() {
      return defaultWalletSnapshot({
        connected: Boolean(address),
        address,
        label: address ? shortenAddress(address) : null,
        connectLabel: address ? 'Sign owner claim' : 'Connect wallet to claim',
      });
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    async connect() {
      const provider = getProvider();
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const nextAddress = accounts?.[0] ?? null;
      if (!nextAddress) throw new Error('Wallet connection did not return an account.');
      address = nextAddress;
      notify();
    },
    async signMessage(message) {
      if (!address) await this.connect();
      if (!address) throw new Error('Connect an Ethereum wallet to sign the owner claim.');
      const provider = getProvider();
      const signature = await provider.request({ method: 'personal_sign', params: [message, address] });
      return { wallet: address, signature };
    },
  };
}
