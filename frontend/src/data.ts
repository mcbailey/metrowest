export function dataPath(path: string): string {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const cleaned = path.replace(/^\/+/, "");
  return `${normalizedBase}${cleaned}`;
}

export async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(dataPath(path));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`);
  }
  return (await response.json()) as T;
}

const jsonCache = new Map<string, Promise<unknown>>();

/** Like loadJson, but each path is fetched once per page load (index.json, divisions.json, towns.json...). */
export function loadJsonCached<T>(path: string): Promise<T> {
  let pending = jsonCache.get(path) as Promise<T> | undefined;
  if (!pending) {
    pending = loadJson<T>(path);
    pending.catch(() => jsonCache.delete(path));
    jsonCache.set(path, pending);
  }
  return pending;
}
