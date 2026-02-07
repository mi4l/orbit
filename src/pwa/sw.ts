/// <reference lib="webworker" />

const PRECACHE = 'orbit-precache-v1';
const RUNTIME = 'orbit-runtime-v1';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const toAbsoluteUrl = (url: string): string => new URL(url, self.registration.scope).toString();

const precacheUrls = (self.__WB_MANIFEST ?? []).map((entry) => toAbsoluteUrl(entry.url));
const navigationFallbacks = [toAbsoluteUrl('index.html'), self.registration.scope, '/index.html', '/'];

const staleWhileRevalidate = async (request: Request, cacheName: string): Promise<Response> => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  return new Response('Offline', { status: 503, statusText: 'Offline' });
};

const networkFirstNavigation = async (request: Request): Promise<Response> => {
  const cache = await caches.open(PRECACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      return response;
    }
  } catch {
    // fallback below
  }

  for (const fallback of navigationFallbacks) {
    const cached = await cache.match(fallback);
    if (cached) return cached;
  }

  return new Response('Offline', { status: 503, statusText: 'Offline' });
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(precacheUrls);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== PRECACHE && key !== RUNTIME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (precacheUrls.includes(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request);
      })
    );
    return;
  }

  const isStaticRuntime = request.destination === 'image' || request.destination === 'font';
  const isJson = url.pathname.endsWith('.json');

  if (isStaticRuntime || isJson) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME));
  }
});

export {};
