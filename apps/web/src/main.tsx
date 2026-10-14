import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import '@fontsource-variable/geist';
import './index.css';
import './i18n';
import { initializeAppearance } from './lib/appearance';
import { cleanupDevServiceWorkers } from './lib/dev-service-worker';
import { installStaleChunkRecovery } from './lib/chunk-reload';
import { configureApiBase } from './lib/configure-api-base';
import { installAuthFetch } from './lib/install-auth-fetch';
import { queryClient } from './lib/query-client';
import { appRouter } from './lib/tanstack-router';
import { consumeUiKitQueryParam, resolveUiKit } from './lib/ui-kit';
import { loadUiKit } from './components/ui/kit';

configureApiBase();
// Must come after configureApiBase, which also wraps fetch to prefix relative
// API paths in a split-domain deploy - the auth retry has to sit outside that.
installAuthFetch();
void cleanupDevServiceWorkers();
installStaleChunkRecovery();
initializeAppearance();

consumeUiKitQueryParam();

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={appRouter} />
        </QueryClientProvider>
      </MotionConfig>
    </StrictMode>,
  );
}

// The UI kit has to be in place before the first render: facades in
// components/ui read it synchronously. Legacy resolves immediately; HeroUI
// waits for its lazy chunk (and falls back to legacy if that fails).
void loadUiKit(resolveUiKit()).finally(render);
