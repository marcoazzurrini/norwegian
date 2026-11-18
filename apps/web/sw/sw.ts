// Offline support. The app is a single page with hashed assets, so the strategy is simple:
// pages are fetched from the network first and fall back to the cached shell;
// everything else is served from the cache and refreshed in the background.
//
// The build writes this file to /sw.js, the address installed apps already know.

// Inside a service worker the global scope is this one. TypeScript only knows it as some worker's.
declare const self: ServiceWorkerGlobalScope;

// Installed apps hold caches under these two names. A new name would throw their contents away.
const CACHE = "norsk-v1";

// Recorded audio never changes, so it is kept apart and survives app updates.
const AUDIO = "norsk-audio-v1";
const SHELL = "/";

const install = async (): Promise<void> => {
  const cache = await caches.open(CACHE);

  await cache.add(SHELL);
  await self.skipWaiting();
};

const activate = async (): Promise<void> => {
  const names = await caches.keys();

  await Promise.all(
    names
      .filter((name) => name !== CACHE && name !== AUDIO)
      .map(async (name) => await caches.delete(name))
  );
  await self.clients.claim();
};

/** Keeps a copy for later. The page does not wait for it. */
const keep = (key: Request | string, copy: Response): void => {
  const save = async (): Promise<void> => {
    const cache = await caches.open(CACHE);

    await cache.put(key, copy);
  };

  save().catch(reportError);
};

/** A recording: from its cache, or from the network the first time. */
const recording = async (request: Request): Promise<Response> => {
  const cache = await caches.open(AUDIO);
  const cached = await cache.match(request);

  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    cache.put(request, response.clone()).catch(reportError);
  }

  return response;
};

/** A page: from the network, and without a connection the shell that was kept. */
const page = async (request: Request): Promise<Response> => {
  try {
    const response = await fetch(request);

    keep(SHELL, response.clone());

    return response;
  } catch {
    return (await caches.match(SHELL)) ?? Response.error();
  }
};

/** The answer of the network, kept for next time; or the cached copy if the network fails. */
const refresh = async (
  request: Request,
  cached: Response | undefined
): Promise<Response | undefined> => {
  try {
    const response = await fetch(request);

    if (response.ok) {
      keep(request, response.clone());
    }

    return response;
  } catch {
    return cached;
  }
};

/** Anything else: the cached copy at once if there is one, while a fresh one is fetched for next time. */
const asset = async (request: Request): Promise<Response> => {
  const cached = await caches.match(request);
  // Started here, so the cache is refreshed also when the cached copy is the answer.
  const fresh = refresh(request, cached);

  return cached ?? (await fresh) ?? Response.error();
};

self.addEventListener("install", (event) => {
  event.waitUntil(install());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const { origin, pathname } = new URL(request.url);

  if (request.method !== "GET" || origin !== self.location.origin) {
    return;
  }

  // Sign-in and sync answers must always come from the server.
  if (pathname.startsWith("/api/")) {
    return;
  }

  if (pathname.startsWith("/audio/")) {
    event.respondWith(recording(request));

    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(page(request));

    return;
  }

  event.respondWith(asset(request));
});
