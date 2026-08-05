/**
 * Theme
 * -----------------------------------------------------------------------
 * Applies data-theme on <html> and persists the choice. Defaults to dark
 * (the CAD-sheet aesthetic this app is built around) unless the user has
 * chosen light before, or their OS prefers light and they've never chosen.
 */
(function (global) {
  'use strict';

  const Storage = global.App.Storage;
  const bus = global.App.bus;
  const KEY = 'theme';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    bus.emit('theme:changed', theme);
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    Storage.set(KEY, next);
    apply(next);
  }

  function init() {
    const saved = Storage.get(KEY, null);
    apply(saved || 'dark');
  }

  global.App = global.App || {};
  global.App.Theme = { init, toggle, current };
})(window);
