import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { base } from 'viem/chains';

import { createApp } from './app.js';
import { createPrivyWalletClient, PrivyWalletBridge } from './privy-wallet-client.js';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const appRoot = document.querySelector('#app');
const walletRoot = document.querySelector('#wallet-root');
const walletClient = createPrivyWalletClient();

createApp({ root: appRoot, walletClient }).start();

if (walletRoot && PRIVY_APP_ID) {
  createRoot(walletRoot).render(
    React.createElement(
      PrivyProvider,
      {
        appId: PRIVY_APP_ID,
        config: {
          loginMethods: ['wallet'],
          defaultChain: base,
          supportedChains: [base],
          appearance: {
            theme: 'dark',
            accentColor: '#6eecd8',
            logo: 'https://helixa.xyz/helixa-logo.jpg',
            walletChainType: 'ethereum-only',
          },
          embeddedWallets: {
            ethereum: { createOnLogin: 'off' },
            solana: { createOnLogin: 'off' },
          },
        },
      },
      React.createElement(PrivyWalletBridge, { client: walletClient, configured: true }),
    ),
  );
} else {
  walletClient.setSnapshot({
    ready: true,
    configured: false,
    connected: false,
    address: null,
    connectLabel: 'Wallet login is not configured for this build.',
  });
}
