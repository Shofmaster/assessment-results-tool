/**
 * Registers public/sw.js so phones can install AeroGap to the home screen.
 *
 * Hosted production only. A self-hosted or desktop install serves the app from
 * its own server (often an Electron window on 127.0.0.1), where a service
 * worker adds nothing and an outlived cache would outlast an upgrade. Dev
 * builds skip it so Vite's hot reload is never shadowed by a cached shell.
 */
import { isSelfHosted } from '../auth';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || isSelfHosted) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* Not fatal: the site works the same without it, it just can't be installed. */
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
