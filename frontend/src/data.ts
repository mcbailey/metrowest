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
