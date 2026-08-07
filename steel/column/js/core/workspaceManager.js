/**
 * ============================================================
 * SteelIQ Workspace Manager
 * ------------------------------------------------------------
 * Central refresh controller for all workspace modules.
 *
 * Every workspace registers here.
 *
 * Future:
 *  • Cross Section
 *  • Elevation
 *  • BBS
 *  • Analysis
 *  • Calculations
 *  • 3D
 *  • Beam
 *  • Footing
 *  • Slab
 *  • Stair
 *  • Shear Wall
 * ============================================================
 */

(function (global) {

    'use strict';

    function safeCall(module, fn) {

        if (!module) return;

        if (typeof module[fn] !== 'function') return;

        try {

            module[fn]();

        }

        catch (err) {

            console.error(
                `[WorkspaceManager] ${fn} failed`,
                err
            );

        }

    }
    const WORKSPACES = {

        selection: [

            'Canvas',
            'SideElevation',
            'AnalysisViz',
            'Calculations',
            'BBSWorkspace',
            'ThreeRenderer'

        ],

        geometry: [

            'Canvas',
            'SideElevation',
            'AnalysisViz',
            'Calculations',
            'BBSWorkspace',
            'ThreeRenderer'

        ],

        reinforcement: [

            'Canvas',
            'SideElevation',
            'BBSWorkspace',
            'Calculations',
            'ThreeRenderer'

        ],

        loads: [

            'AnalysisViz',
            'Calculations',
            'ThreeRenderer'

        ]

    };
    function refreshGroup(groupName) {

        const group = WORKSPACES[groupName];

        if (!group) return;

        group.forEach(name => {

            safeCall(global.App[name], 'render');

        });

    }
    function refreshSelection() {

        console.log(
            '%c[WorkspaceManager]',
            'color:#3b82f6;font-weight:bold;',
            'Selection Refresh'
        );

        refreshGroup('selection');

    }

    function refreshGeometry() {

        console.log(
            '%c[WorkspaceManager]',
            'color:#22c55e;font-weight:bold;',
            'Geometry Refresh'
        );

        refreshGroup('geometry');

    }

    function refreshReinforcement() {

        console.log(
            '%c[WorkspaceManager]',
            'color:#f97316;font-weight:bold;',
            'Reinforcement Refresh'
        );

        refreshGroup('reinforcement');

    }

    function refreshLoads() {

        console.log(
            '%c[WorkspaceManager]',
            'color:#8b5cf6;font-weight:bold;',
            'Load Refresh'
        );

        refreshGroup('loads');

    }

    function refreshAll() {

        refreshGroup('selection');

    }



    function refreshLoads() {

        console.log(
            '%c[WorkspaceManager]',
            'color:#8b5cf6;font-weight:bold;',
            'Load Refresh'
        );

        safeCall(global.App.AnalysisViz, 'render');
        safeCall(global.App.Calculations, 'render');
        safeCall(global.App.ThreeRenderer, 'render');

    }

    function refreshAll() {

        refreshGeometry();

    }

    global.App = global.App || {};

    global.App.WorkspaceManager = {

        refreshAll,
        refreshGeometry,
        refreshSelection,
        refreshReinforcement,
        refreshLoads

    };

    console.log(
        '%c[SteelIQ]',
        'color:#14b8a6;font-weight:bold;',
        'Workspace Manager loaded.'
    );

})(window);
