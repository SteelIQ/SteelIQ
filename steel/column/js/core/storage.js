/**
 * Storage
 * -----------------------------------------------------------------------
 * Thin wrapper over localStorage. Everything the app persists (project
 * data, theme choice, panel widths) goes through here so storage keys
 * and failure handling live in exactly one place. Runs fully offline —
 * no network, no backend, works from a local file.
 */
(function (global) {
  'use strict';

  const NS = 'sbbs.'; // Structural BBS namespace prefix

  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        console.warn(`[Storage] failed to read "${key}"`, err);
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(NS + key, JSON.stringify(value));
        return true; 
      } catch (err) {
        console.warn(`[Storage] failed to write "${key}"`, err);
        return false;
      }
    },

    remove(key) {
      localStorage.removeItem(NS + key);
    },
  };

  global.App = global.App || {};
  global.App.Storage = Storage;
})(window);
