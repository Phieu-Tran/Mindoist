import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/geist';
import './index.css';
import './i18n';
import App from './App';
import { initializeAppearance } from './lib/appearance';
import { cleanupDevServiceWorkers } from './lib/dev-service-worker';
import { configureApiBase } from './lib/configure-api-base';
import { installAuthFetch } from './lib/install-auth-fetch';

configureApiBase();
// Must come after configureApiBase, which also wraps fetch to prefix relative
// API paths in a split-domain deploy - the auth retry has to sit outside that.
installAuthFetch();
void cleanupDevServiceWorkers();
initializeAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
