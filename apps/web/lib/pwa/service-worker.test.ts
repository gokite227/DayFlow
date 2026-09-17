import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Runs the real public/sw.js against a stand-in ServiceWorkerGlobalScope: it may only answer same-origin page
 * navigations (network first, offline page as fallback) and must never touch auth, API, OAuth or other requests,
 * nor cache anything but the offline page.
 */
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://day-flow-web.vercel.app";

type Listener = (event: unknown) => void;

function loadWorker(options: { network: "online" | "offline" }) {
  const listeners = new Map<string, Listener>();
  const cached = new Map<string, Map<string, string>>();
  const fetched: string[] = [];
  const cacheStorage = {
    open: async (name: string) => {
      const cache = cached.get(name) ?? new Map<string, string>();
      cached.set(name, cache);
      return { add: async (request: { url: string }) => void cache.set(new URL(request.url, ORIGIN).pathname, "offline page") };
    },
    keys: async () => [...cached.keys()],
    delete: async (name: string) => cached.delete(name),
    match: async (url: string) => {
      for (const cache of cached.values()) if (cache.has(url)) return `cached:${url}`;
      return undefined;
    },
  };
  const scope = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fakeFetch = async (request: { url: string }) => {
    fetched.push(request.url);
    if (options.network === "offline") throw new TypeError("Failed to fetch");
    return `network:${request.url}`;
  };
  class FakeRequest {
    readonly url: string;
    constructor(url: string) {
      this.url = url;
    }
  }
  new Function("self", "caches", "fetch", "Request", "Response", SOURCE)(scope, cacheStorage, fakeFetch, FakeRequest, { error: () => "error" });

  const run = async (type: string) => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  };

  /** Dispatches a fetch; returns what the worker responded with, or "untouched" when it let the browser handle it. */
  const dispatch = async (path: string, init: { method?: string; mode?: string } = {}) => {
    let responded: Promise<unknown> | null = null;
    const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
    listeners.get("fetch")!({ request: { url, method: init.method ?? "GET", mode: init.mode ?? "navigate" }, respondWith: (value: Promise<unknown>) => (responded = value) });
    return responded === null ? "untouched" : await responded;
  };

  return { run, dispatch, cached, fetched };
}

describe("service worker", () => {
  it("caches only the offline page and drops old caches", async () => {
    const worker = loadWorker({ network: "online" });
    worker.cached.set("dayflow-old", new Map([["/today", "stale"]]));
    await worker.run("install");
    await worker.run("activate");
    expect([...worker.cached.keys()]).toEqual(["dayflow-offline-v1"]);
    expect([...worker.cached.get("dayflow-offline-v1")!.keys()]).toEqual(["/offline.html"]);
  });

  it("serves app pages from the network, and the offline page only when the network fails", async () => {
    const online = loadWorker({ network: "online" });
    await online.run("install");
    expect(await online.dispatch("/today?view=week")).toBe(`network:${ORIGIN}/today?view=week`);
    expect(await online.dispatch("/review?mode=archive&q=%EC%9A%B4%EB%8F%99")).toBe(`network:${ORIGIN}/review?mode=archive&q=%EC%9A%B4%EB%8F%99`);

    const offline = loadWorker({ network: "offline" });
    await offline.run("install");
    expect(await offline.dispatch("/calendar")).toBe("cached:/offline.html");
  });

  it("never touches auth, API, OAuth, cross-origin, non-GET or non-navigation requests", async () => {
    const worker = loadWorker({ network: "online" });
    await worker.run("install");
    const untouched = [
      ["/api/v1/auth/refresh", { method: "POST", mode: "cors" }],
      ["/api/v1/auth/exchange", { method: "POST", mode: "cors" }],
      ["/api/v1/auth/logout", { method: "POST", mode: "cors" }],
      ["/api/v1/days", { mode: "navigate" }],
      ["/auth/callback?code=abc&state=xyz", { mode: "navigate" }],
      ["/login", { mode: "navigate" }],
      ["https://dayflow-api.up.railway.app/api/v1/auth/google/start?returnTo=%2Ftoday", { mode: "navigate" }],
      ["https://accounts.google.com/o/oauth2/v2/auth", { mode: "navigate" }],
      ["https://dayflow-api.up.railway.app/api/v1/days", { mode: "cors" }],
      ["/_next/static/chunks/app.js", { mode: "no-cors" }],
      ["/today", { method: "POST", mode: "navigate" }],
    ] as const;
    for (const [path, init] of untouched) expect(await worker.dispatch(path, init), path).toBe("untouched");
    expect(worker.fetched).toEqual([]);
  });
});
