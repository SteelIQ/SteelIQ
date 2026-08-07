(function (global) {
  'use strict';

  function createDefaultBBS() {
    return {

      // Individual BBS rows
      rows: [],

      // Totals
      totals: {
        totalLength: 0,
        totalWeight: 0
      },

      // Metadata
      metadata: {
        generated: false,
        revision: 1,
        lastUpdated: null
      }

    };
  }

  global.App = global.App || {};
  global.App.createDefaultBBS = createDefaultBBS;

  console.log('[SteelIQ]', 'BBS model loaded.');

})(window);

console.log('%c[SteelIQ]', 'color:#00d084;font-weight:bold;', 'bbs.js loaded');