import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {initializeCloudDevice} from './features/sync-cloud/services/cloud-device';
import './shared/styles/style.css';
import './features/reader/styles/stv-layout.css';
import './features/names-convert/styles/convert-panel.css';
import './features/library/styles/library.css';
import './shared/styles/ui-theme.css';
import {bootstrapUiTheme} from './shared/ui-theme';
import {registerOfflineShell} from './pwa/register-offline-shell';
// Strip connection fragments and share the pending storage transaction before
// React mounts its database queries or StrictMode replays startup effects.
void initializeCloudDevice().catch(() => {});
bootstrapUiTheme();
registerOfflineShell();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>,
);
