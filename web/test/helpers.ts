import { MemoryStore, PaletteRepo, SessionRepo, SettingsRepo, type MixStep, type Paint } from '@color-mixer/core';
import { vi } from 'vitest';
import type { AppContext } from '../src/app';

export function makeCtx() {
  const store = new MemoryStore();
  const ctx = {
    palette: new PaletteRepo(store),
    sessions: new SessionRepo(store),
    settings: new SettingsRepo(store),
    go: vi.fn<AppContext['go']>(),
  };
  return { ctx, store };
}

/** Attached root, so toasts and focus behave like the real page. */
export function makeRoot(): HTMLElement {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

/** Let pending promises (storage, re-renders) settle. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

export function buttonByText(root: ParentNode, text: string | RegExp): HTMLButtonElement {
  const btn = [...root.querySelectorAll('button')].find((b) =>
    typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error(`No button "${text}". Buttons: ${[...root.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return btn;
}

/** Type into an input the way a user would: set the value, then fire input + change. */
export function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export const PAINTS: Omit<Paint, 'id'>[] = [
  { name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' },
  { name: 'Quinacridone Rose', hex: '#c2185b', source: 'manual' },
];

export function step(measuredHex: string, overrides: Partial<MixStep> = {}): MixStep {
  return {
    measuredHex,
    suggestion: { status: 'adjust', currentDeltaE: 12.34, water: 'some', notes: [], modelId: 'oklab' },
    ts: 1,
    ...overrides,
  };
}

export function text(root: ParentNode): string {
  return (root as HTMLElement).textContent ?? '';
}
