export const pwa = $state({ updateReady: false });

let waiting: ServiceWorker | null = null;

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const hadController = !!navigator.serviceWorker.controller;
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => {
          if (sw.state === 'installed' && hadController) {
            waiting = sw;
            pwa.updateReady = true;
          }
        };
        check();
        sw.addEventListener('statechange', check);
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloading) {
          reloading = true;
          location.reload();
        }
      });
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  });
}

export function applyUpdate() {
  waiting?.postMessage('skipWaiting');
}
