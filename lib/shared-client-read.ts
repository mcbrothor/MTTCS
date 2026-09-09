/** Browser reads only. Successful macro responses share a short cache; other reads only share in flight. */
export const MACRO_READ_TTL_MS = 30_000;

export function createSharedClientRead(fetcher: typeof fetch = fetch, now = Date.now) {
  type Entry = { controller: AbortController; users: number; pending: boolean; expires: number; response?: Response; promise: Promise<Response> };
  const entries = new Map<string, Entry>();
  return function read(url: string, options: { signal?: AbortSignal; ttlMs?: number } = {}): Promise<Response> {
    if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const ttl = options.ttlMs ?? 0;
    let entry = entries.get(url);
    if (entry && !entry.pending && entry.expires <= now()) { entries.delete(url); entry = undefined; }
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, users: 0, pending: true, expires: 0, promise: Promise.resolve(new Response()) };
      const current = entry;
      current.promise = fetcher(url, { signal: controller.signal, cache: 'no-store' }).then(response => {
        current.pending = false;
        if (response.ok && ttl > 0 && !controller.signal.aborted) {
          current.expires = now() + ttl;
          current.response = response;
        } else if (entries.get(url) === current) entries.delete(url);
        return response;
      }, error => {
        current.pending = false;
        if (entries.get(url) === current) entries.delete(url);
        throw error;
      });
      entries.set(url, current);
      // Evict completed reads first; never cancel an active subscriber to make space.
      for (const [key, value] of entries) {
        if (!value.pending && (value.expires <= now() || entries.size > 16)) entries.delete(key);
      }
    }
    const current = entry;
    current.users++;
    return new Promise<Response>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        options.signal?.removeEventListener('abort', abort);
        current.users--;
        if (current.pending && current.users === 0) {
          current.controller.abort();
          if (entries.get(url) === current) entries.delete(url);
        }
        return true;
      };
      const abort = () => { if (finish()) reject(new DOMException('Aborted', 'AbortError')); };
      options.signal?.addEventListener('abort', abort, { once: true });
      (current.response ? Promise.resolve(current.response) : current.promise).then(
        response => { if (finish()) resolve(response.clone()); },
        error => { if (finish()) reject(error); },
      );
    });
  };
}

export const sharedClientRead = createSharedClientRead();
export const readMacro = (options: { signal?: AbortSignal; market?: 'US' | 'KR' } = {}) => sharedClientRead(options.market === 'KR' ? '/api/macro?market=KR' : '/api/macro', { signal: options.signal, ttlMs: MACRO_READ_TTL_MS });
