(function (global) {
    'use strict';

    function createDefaultReinforcement() {
        console.log('[SteelIQ]', 'Creating default reinforcement model...');
        return {

            // Longitudinal reinforcement
            longitudinal: {
                grade: 'Fe500',

                bars: [
                    {
                        id: global.App.ColumnModel
                            ? global.App.ColumnModel.nextId()
                            : ('bar_' + Date.now()),
                        diameter: 16,
                        count: 4,
                        placement: 'corner',
                        enabled: true
                    }
                ]
            },

            // Stirrups / ties
            transverse: {

                stirrups: [
                    {
                        diameter: 8,
                        spacingMiddle: 150,
                        spacingEnd: 100,
                        endZoneLength: 750,
                        shape: 'rectangular',
                        hook: 135
                    }
                ],

                crossTies: []

            },

            // Development lengths
            development: {
                top: 0,
                bottom: 0
            },

            // Lap splices
            laps: [],

            // Hook settings
            hooks: {
                mainBar: {
                    angle: 90
                },
                stirrup: {
                    angle: 135
                }
            },

            // Future seismic detailing
            seismic: {},

            // Fabrication info
            fabrication: {
                revision: 1,
                remarks: ''
            }

        };
    }

    global.App = global.App || {};
    global.App.createDefaultReinforcement = createDefaultReinforcement;

})(window);

console.log('%c[SteelIQ]', 'color:#00d084;font-weight:bold;', 'reinforcement.js loaded');