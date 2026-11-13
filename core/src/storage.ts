import type { MixSession, MixStep, Paint } from './types';

/**
 * Minimal key-value storage. The web app wraps localStorage; a phone app can
 * wrap AsyncStorage or similar (methods may return promises).
 */
export interface KeyValueStore {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

/** In-memory store, useful for tests. */
export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
}

const PALETTE_KEY = 'color-mixer:palette';
const SESSION_KEY = 'color-mixer:session';

async function readJson<T>(store: KeyValueStore, key: string, fallback: T): Promise<T> {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Short random id. Avoids crypto.randomUUID, which browsers block on plain-http LAN. */
export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class PaletteRepo {
  constructor(private store: KeyValueStore) {}

  list(): Promise<Paint[]> {
    return readJson<Paint[]>(this.store, PALETTE_KEY, []);
  }

  private async save(paints: Paint[]) {
    await this.store.set(PALETTE_KEY, JSON.stringify(paints));
  }

  async add(paint: Omit<Paint, 'id'>): Promise<Paint> {
    const paints = await this.list();
    const created = { ...paint, id: createId() };
    await this.save([...paints, created]);
    return created;
  }

  async update(paint: Paint): Promise<void> {
    const paints = await this.list();
    await this.save(paints.map((p) => (p.id === paint.id ? paint : p)));
  }

  async remove(id: string): Promise<void> {
    const paints = await this.list();
    await this.save(paints.filter((p) => p.id !== id));
  }
}

export class SessionRepo {
  constructor(private store: KeyValueStore) {}

  load(): Promise<MixSession | null> {
    return readJson<MixSession | null>(this.store, SESSION_KEY, null);
  }

  async save(session: MixSession): Promise<void> {
    await this.store.set(SESSION_KEY, JSON.stringify(session));
  }

  async start(targetHex: string): Promise<MixSession> {
    const session: MixSession = { targetHex, steps: [] };
    await this.save(session);
    return session;
  }

  async addStep(step: MixStep): Promise<MixSession> {
    const session = (await this.load()) ?? { targetHex: '#000000', steps: [] };
    const next = { ...session, steps: [...session.steps, step] };
    await this.save(next);
    return next;
  }

  async clear(): Promise<void> {
    await this.store.remove(SESSION_KEY);
  }
}
