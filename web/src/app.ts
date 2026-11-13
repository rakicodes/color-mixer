import { PaletteRepo, SessionRepo } from '@color-mixer/core';
import { LocalStorageStore } from './storage';

export type Tab = 'paints' | 'target' | 'mix';

export interface AppContext {
  palette: PaletteRepo;
  sessions: SessionRepo;
  go(tab: Tab): void;
}

const store = new LocalStorageStore();
export const palette = new PaletteRepo(store);
export const sessions = new SessionRepo(store);
