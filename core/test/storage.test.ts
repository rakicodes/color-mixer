import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createId,
  DuplicatePaintError,
  MemoryStore,
  PaletteRepo,
  parsePalette,
  parseSession,
  parseSettings,
  SessionRepo,
  SettingsRepo,
  type KeyValueStore,
  type MixStep,
} from '../src';

const step = (hex: string, ts = 1): MixStep => ({
  measuredHex: hex,
  suggestion: { status: 'adjust', currentDeltaE: 5, water: 'some', notes: [] },
  ts,
});

afterEach(() => vi.unstubAllGlobals());

describe('DAT-03: ids', () => {
  it('DAT-03 / NFR-02: createId works without crypto (plain-http LAN)', () => {
    vi.stubGlobal('crypto', undefined);
    const id = createId();
    expect(id).toMatch(/^[a-z0-9]{9,}$/);
  });

  it('DAT-03: ids are unique', () => {
    const ids = new Set(Array.from({ length: 1000 }, createId));
    expect(ids.size).toBe(1000);
  });
});

describe('PAL: PaletteRepo', () => {
  it('PAL-01: add assigns an id and keeps order', async () => {
    const repo = new PaletteRepo(new MemoryStore());
    const a = await repo.add({ name: 'A', hex: '#111111', source: 'manual' });
    const b = await repo.add({ name: 'B', hex: '#222222', source: 'photo' });
    expect(a.id).not.toBe(b.id);
    expect((await repo.list()).map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('PAL-04 / PAL-05: update replaces only the matching paint', async () => {
    const repo = new PaletteRepo(new MemoryStore());
    const a = await repo.add({ name: 'A', hex: '#111111', source: 'photo' });
    await repo.add({ name: 'B', hex: '#222222', source: 'manual' });
    await repo.update({ ...a, name: 'A2', hex: '#333333', source: 'manual' });
    expect(await repo.list()).toEqual([
      { id: a.id, name: 'A2', hex: '#333333', source: 'manual' },
      expect.objectContaining({ name: 'B' }),
    ]);
  });

  it('PAL-06: remove of an unknown id changes nothing', async () => {
    const repo = new PaletteRepo(new MemoryStore());
    await repo.add({ name: 'A', hex: '#111111', source: 'manual' });
    await repo.remove('nope');
    expect(await repo.list()).toHaveLength(1);
  });

  it.each(['Ultramarine', 'ultramarine', '  ULTRAMARINE '])('PAL-07 / ISS-04: add rejects the duplicate %j', async (name) => {
    const repo = new PaletteRepo(new MemoryStore());
    await repo.add({ name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' });
    const attempt = repo.add({ name, hex: '#000000', source: 'manual' });
    await expect(attempt).rejects.toBeInstanceOf(DuplicatePaintError);
    await expect(repo.add({ name, hex: '#000000', source: 'manual' })).rejects.toThrow(
      'You already have a paint named Ultramarine.',
    );
    expect(await repo.list()).toHaveLength(1);
  });

  it('PAL-07 / ISS-04: update rejects renaming to another paint\'s name', async () => {
    const repo = new PaletteRepo(new MemoryStore());
    await repo.add({ name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' });
    const rose = await repo.add({ name: 'Rose', hex: '#c2185b', source: 'manual' });
    await expect(repo.update({ ...rose, name: ' ULTRAMARINE ' })).rejects.toThrow(
      'You already have a paint named Ultramarine.',
    );
    expect((await repo.list())[1].name).toBe('Rose');
  });

  it('PAL-07: a paint can change its color or the case of its own name', async () => {
    const repo = new PaletteRepo(new MemoryStore());
    const ub = await repo.add({ name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' });
    await repo.update({ ...ub, hex: '#2040b0' });
    await repo.update({ ...ub, name: 'ULTRAMARINE', hex: '#2040b0' });
    expect((await repo.list())[0]).toMatchObject({ name: 'ULTRAMARINE', hex: '#2040b0' });
  });

  it('PAL-07: duplicates saved before the rule can still be edited and renamed', async () => {
    const store = new MemoryStore();
    store.set('color-mixer:palette', JSON.stringify([
      { id: 'a', name: 'Ultramarine', hex: '#1f3fa8' },
      { id: 'b', name: 'ultramarine', hex: '#2040b0' },
    ]));
    const repo = new PaletteRepo(store);
    await repo.update({ id: 'b', name: 'ultramarine', hex: '#3050c0', source: 'manual' });
    expect((await repo.list())[1].hex).toBe('#3050c0');
    await repo.update({ id: 'b', name: 'Ultramarine Deep', hex: '#3050c0', source: 'manual' });
    expect((await repo.list())[1].name).toBe('Ultramarine Deep');
  });

  it('DAT-02: unknown paint sources are read as manual', () => {
    expect(parsePalette([{ id: 'a', name: 'A', hex: '#111111', source: 'scanner' }])[0].source).toBe('manual');
    expect(parsePalette([{ id: 'a', name: 'A', hex: '#111111' }])[0].source).toBe('manual');
  });

  it('DAT-02: paints with a missing id or name are dropped', () => {
    expect(parsePalette([{ name: 'A', hex: '#111111' }, { id: 'b', hex: '#111111' }])).toEqual([]);
  });

  it('DEV-01: works with an async store (e.g. a phone app)', async () => {
    const map = new Map<string, string>();
    const asyncStore: KeyValueStore = {
      get: async (k) => map.get(k) ?? null,
      set: async (k, v) => void map.set(k, v),
      remove: async (k) => void map.delete(k),
    };
    const repo = new PaletteRepo(asyncStore);
    await repo.add({ name: 'A', hex: '#111111', source: 'manual' });
    expect(await repo.list()).toHaveLength(1);
  });
});

describe('MIX: SessionRepo', () => {
  it('TGT-03: start creates an empty session and replaces any old one', async () => {
    const repo = new SessionRepo(new MemoryStore());
    await repo.start('#111111');
    await repo.addStep(step('#aaaaaa'));
    const s = await repo.start('#222222', false);
    expect(s).toEqual({ targetHex: '#222222', targetCalibrated: false, steps: [] });
    expect(await repo.load()).toEqual(s);
  });

  it('TGT-02: an uncalibrated target stays uncalibrated after reload', async () => {
    const store = new MemoryStore();
    await new SessionRepo(store).start('#222222', false);
    expect((await new SessionRepo(store).load())?.targetCalibrated).toBe(false);
  });

  it('MOD-02: replaceLastStep swaps the newest step only', async () => {
    const repo = new SessionRepo(new MemoryStore());
    await repo.start('#111111');
    await repo.addStep(step('#aaaaaa', 1));
    await repo.addStep(step('#bbbbbb', 2));
    const s = await repo.replaceLastStep(step('#cccccc', 3));
    expect(s.steps.map((x) => x.measuredHex)).toEqual(['#aaaaaa', '#cccccc']);
    expect((await repo.load())?.steps).toHaveLength(2);
  });

  it('MOD-02: replaceLastStep refuses when there are no steps', async () => {
    const repo = new SessionRepo(new MemoryStore());
    await expect(repo.replaceLastStep(step('#cccccc'))).rejects.toThrow('There is no step to update.');
    await repo.start('#111111');
    await expect(repo.replaceLastStep(step('#cccccc'))).rejects.toThrow('There is no step to update.');
  });

  it('MIX-03: addStep without a session explains what to do', async () => {
    await expect(new SessionRepo(new MemoryStore()).addStep(step('#aaaaaa'))).rejects.toThrow(
      'No mix in progress. Choose a target first.',
    );
  });

  it('MIX-14: clear removes the session', async () => {
    const repo = new SessionRepo(new MemoryStore());
    await repo.start('#111111');
    await repo.clear();
    expect(await repo.load()).toBeNull();
  });

  it('DAT-02: a session with no steps array loads with no steps', () => {
    expect(parseSession({ targetHex: '#111111' })).toEqual({ targetHex: '#111111', targetCalibrated: true, steps: [] });
  });

  it('DAT-02: steps with a bad measured color are dropped; the calibrated flag is kept', () => {
    const s = parseSession({
      targetHex: '#111111',
      targetCalibrated: false,
      steps: [
        { ...step('#aaaaaa'), calibrated: false },
        { ...step('nope') },
      ],
    });
    expect(s?.targetCalibrated).toBe(false);
    expect(s?.steps).toHaveLength(1);
    expect(s?.steps[0].calibrated).toBe(false);
  });
});

describe('MOD-01 / THM-01: settings', () => {
  it('MOD-01: update merges partial changes', async () => {
    const repo = new SettingsRepo(new MemoryStore());
    expect(await repo.update({ theme: 'light' })).toEqual({ mixModel: 'oklab', theme: 'light' });
    expect(await repo.update({ mixModel: 'km-spectral' })).toEqual({ mixModel: 'km-spectral', theme: 'light' });
  });

  it('DAT-02: non-object settings fall back to defaults', () => {
    expect(parseSettings('junk')).toEqual({ mixModel: 'oklab', theme: 'system' });
    expect(parseSettings(null)).toEqual({ mixModel: 'oklab', theme: 'system' });
  });

  it('DAT-01: data is stored under color-mixer:* keys', async () => {
    const store = new MemoryStore();
    await new PaletteRepo(store).add({ name: 'A', hex: '#111111', source: 'manual' });
    await new SessionRepo(store).start('#111111');
    await new SettingsRepo(store).update({ theme: 'dark' });
    expect(store.get('color-mixer:palette')).toContain('"A"');
    expect(store.get('color-mixer:session')).toContain('#111111');
    expect(store.get('color-mixer:settings')).toContain('dark');
  });
});
