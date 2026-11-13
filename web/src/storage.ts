import type { KeyValueStore } from '@color-mixer/core';

export class LocalStorageStore implements KeyValueStore {
  get(key: string) {
    return localStorage.getItem(key);
  }
  set(key: string, value: string) {
    localStorage.setItem(key, value);
  }
  remove(key: string) {
    localStorage.removeItem(key);
  }
}
