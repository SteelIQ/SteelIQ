/**
 * EventBus
 * -----------------------------------------------------------------------
 * Minimal publish/subscribe hub. Every UI module listens for state
 * changes here instead of polling or reaching into other modules
 * directly — this is what keeps ui/*.js, models/*.js and core/state.js
 * decoupled so future modules (beams, footings, slabs...) can plug into
 * the same event names without touching existing code.
 */
(function (global) {
  'use strict';

  function EventBus() {
    this._listeners = Object.create(null);
  }

  EventBus.prototype.on = function (event, handler) {
    (this._listeners[event] || (this._listeners[event] = [])).push(handler);
    return () => this.off(event, handler); // returns an unsubscribe fn
  };

  EventBus.prototype.off = function (event, handler) {
    const list = this._listeners[event];
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };

  EventBus.prototype.emit = function (event, payload) {
    const list = this._listeners[event];
    if (!list) return;
    // Copy before iterating: a handler may subscribe/unsubscribe mid-emit.
    list.slice().forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[EventBus] handler for "${event}" threw:`, err); }
    });
  };

  global.App = global.App || {};
  global.App.EventBus = EventBus;
  global.App.bus = new EventBus();
})(window);
