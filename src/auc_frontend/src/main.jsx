//main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import "@nfid/identitykit/react/styles.css"
 
import { IdentityKitProvider } from "@nfid/identitykit/react"
import { IdentityKitAuthType } from '@nfid/identitykit';


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <IdentityKitProvider
  authType={IdentityKitAuthType.DELEGATION}
  signerClientOptions={{
    targets: [
      "bkyz2-fmaaa-aaaaa-qaaaq-cai", // Backend
    ], // Add any other canisters you call
    maxTimeToLive: BigInt(60 * 60 * 1000 * 1000 * 1000) // 1 hour in nanoseconds
  }}>
    <App />
    </IdentityKitProvider>
  </React.StrictMode>,
);
