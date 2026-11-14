'use strict';
/* Storage wrapper: chrome.storage.local inside the extension, localStorage when the page is opened directly (handy for previewing). */
const hasChromeStorage = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);

const Store = {
  async get(key, fallback) {
    try {
      if (hasChromeStorage) {
        const r = await chrome.storage.local.get(key);
        return r[key] === undefined ? fallback : r[key];
      }
      const raw = localStorage.getItem('metro:' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('Store.get failed', key, e);
      return fallback;
    }
  },
  async set(key, value) {
    if (hasChromeStorage) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem('metro:' + key, JSON.stringify(value));
  },
  onChange(cb) {
    if (hasChromeStorage) {
      chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') cb(changes); });
    }
  },
};
