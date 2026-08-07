/**
 * Toast
 * -----------------------------------------------------------------------
 * Small transient notifications (e.g. "Column deleted", "Import failed").
 */
(function (global) {
  'use strict';

  function show(message, opts = {}) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (opts.danger ? ' danger' : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }, opts.duration || 2600);
  }

  global.App = global.App || {};
  global.App.Toast = { show };
})(window);
