import { PaletteRepo, SessionRepo, SettingsRepo } from '@color-mixer/core';
import { LocalStorageStore } from './storage';

export type Tab = 'paints' | 'target' | 'mix';

export interface AppContext {
  palette: PaletteRepo;
  sessions: SessionRepo;
  settings: SettingsRepo;
  go(tab: Tab): void;
}

const store = new LocalStorageStore();
export const palette = new PaletteRepo(store);
export const sessions = new SessionRepo(store);
export const settings = new SettingsRepo(store);
