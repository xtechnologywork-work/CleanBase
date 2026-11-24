import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initDB } from './services/mockDb';
import { isCloud } from './services/backend';

// A live site built without its database keys would silently fall back to the local demo (sample accounts, data that never reaches the server).
// Stop it with a clear message instead. Set VITE_ALLOW_DEMO=true to publish a demo on purpose.
const missingKeys = import.meta.env.PROD && !isCloud && import.meta.env.VITE_ALLOW_DEMO !== 'true';

if (missingKeys) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <div role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#1d1d1f' }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>This site is not connected to its database yet</h1>
      <p style={{ color: '#5f5f68', lineHeight: 1.5 }}>
        The site was built without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Add both in the hosting settings, then build and deploy again.
      </p>
    </div>,
  );
} else {
  initDB();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
