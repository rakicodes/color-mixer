import type { MixModelId } from './mix';
import { DEFAULT_MIX_MODEL, isMixModelId } from './models';
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
const SETTINGS_KEY = 'color-mixer:settings';

/**
 * Reads and validates stored JSON. Corrupt or outdated data falls back
 * instead of crashing the app.
 */
async function readJson<T>(store: KeyValueStore, key: string, validate: (v: unknown) => T): Promise<T> {
  const raw = await store.get(key);
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  return validate(parsed);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const STATUSES = new Set(['done', 'adjust', 'stuck']);

export function parsePalette(v: unknown): Paint[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is Paint => isObject(p) && typeof p.id === 'string' && typeof p.name === 'string' && isHex(p.hex),
  ).map((p) => ({ ...p, source: p.source === 'photo' ? 'photo' : 'manual' }));
}

function isStep(s: unknown): s is MixStep {
  if (!isObject(s) || !isHex(s.measuredHex) || !isObject(s.suggestion)) return false;
  const sug = s.suggestion;
  return (
    typeof sug.status === 'string' &&
    STATUSES.has(sug.status) &&
    typeof sug.currentDeltaE === 'number' &&
    typeof sug.water === 'string'
  );
}

export function parseSession(v: unknown): MixSession | null {
  if (!isObject(v) || !isHex(v.targetHex)) return null;
  const steps = Array.isArray(v.steps) ? v.steps.filter(isStep) : [];
  return {
    targetHex: v.targetHex,
    targetCalibrated: v.targetCalibrated !== false,
    steps: steps.map((s) => ({
      ...s,
      suggestion: { ...s.suggestion, notes: Array.isArray(s.suggestion.notes) ? s.suggestion.notes : [] },
    })),
  };
}

/** Short random id. Avoids crypto.randomUUID, which browsers block on plain-http LAN. */
export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Thrown when a paint name is already used (compared case-insensitively, trimmed). */
export class DuplicatePaintError extends Error {
  override name = 'DuplicatePaintError';
}

const nameKey = (name: string) => name.trim().toLowerCase();

function assertUniqueName(paints: Paint[], name: string, exceptId?: string): void {
  const existing = paints.find((p) => p.id !== exceptId && nameKey(p.name) === nameKey(name));
  if (existing) throw new DuplicatePaintError(`You already have a paint named ${existing.name}.`);
}

export class PaletteRepo {
  constructor(private store: KeyValueStore) {}

  list(): Promise<Paint[]> {
    return readJson(this.store, PALETTE_KEY, parsePalette);
  }

  private async save(paints: Paint[]) {
    await this.store.set(PALETTE_KEY, JSON.stringify(paints));
  }

  async add(paint: Omit<Paint, 'id'>): Promise<Paint> {
    const paints = await this.list();
    assertUniqueName(paints, paint.name);
    const created = { ...paint, id: createId() };
    await this.save([...paints, created]);
    return created;
  }

  async update(paint: Paint): Promise<void> {
    const paints = await this.list();
    // Only check when the name changes, so duplicates saved before this rule can still be edited.
    const before = paints.find((p) => p.id === paint.id);
    if (!before || nameKey(before.name) !== nameKey(paint.name)) assertUniqueName(paints, paint.name, paint.id);
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
    return readJson(this.store, SESSION_KEY, parseSession);
  }

  async save(session: MixSession): Promise<void> {
    await this.store.set(SESSION_KEY, JSON.stringify(session));
  }

  async start(targetHex: string, targetCalibrated = true): Promise<MixSession> {
    const session: MixSession = { targetHex, targetCalibrated, steps: [] };
    await this.save(session);
    return session;
  }

  async addStep(step: MixStep): Promise<MixSession> {
    const session = await this.load();
    if (!session) throw new Error('No mix in progress. Choose a target first.');
    const next = { ...session, steps: [...session.steps, step] };
    await this.save(next);
    return next;
  }

  /** Replace the most recent step, e.g. after recalculating with another model. */
  async replaceLastStep(step: MixStep): Promise<MixSession> {
    const session = await this.load();
    if (!session?.steps.length) throw new Error('There is no step to update.');
    const next = { ...session, steps: [...session.steps.slice(0, -1), step] };
    await this.save(next);
    return next;
  }

  async clear(): Promise<void> {
    await this.store.remove(SESSION_KEY);
  }
}

/** 'system' follows the device's light/dark preference. */
export type Theme = 'system' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export interface Settings {
  mixModel: MixModelId;
  theme: Theme;
}

const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

export function parseSettings(v: unknown): Settings {
  const obj = isObject(v) ? v : {};
  return {
    mixModel: isMixModelId(obj.mixModel) ? obj.mixModel : DEFAULT_MIX_MODEL,
    theme: isTheme(obj.theme) ? obj.theme : 'system',
  };
}

export class SettingsRepo {
  constructor(private store: KeyValueStore) {}

  load(): Promise<Settings> {
    return readJson(this.store, SETTINGS_KEY, parseSettings);
  }

  async update(changes: Partial<Settings>): Promise<Settings> {
    const next = parseSettings({ ...(await this.load()), ...changes });
    await this.store.set(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }
}
