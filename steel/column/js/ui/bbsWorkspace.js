(function (global) {
    'use strict';

    /*==========================================================
      Utilities
    ==========================================================*/

    function unitWeight(dia) {

        return (dia * dia) / 162;

    }

    function getShapeCode(bar) {

        if (bar.placement === 'corner') return 'SC-01';
        if (bar.placement === 'middle') return 'SC-02';

        return 'SC-00';

    }

    function getShapeSvg(shapeCode) {

        switch (shapeCode) {

            case 'SC-01':
                return `...`;

            case 'SC-02':
                return `...`;

            default:
                return '';

        }

    }

    /*==========================================================
      Data Generation
    ==========================================================*/

    function generateRows(column) {

        const rows = [];

        if (!column) return rows;

        const clearHeight = Number(column.geometry.height);

        const devTop = Number(column.reinforcement.development.top);

        const devBottom = Number(column.reinforcement.development.bottom);

        column.reinforcement.longitudinal.bars.forEach((bar, index) => {

            const cutLength = clearHeight + devTop + devBottom;

            const totalLength = cutLength * bar.count;

            const unitWt = unitWeight(bar.diameter);

            const weight = (totalLength / 1000) * unitWt;

            const shapeCode = getShapeCode(bar);

            rows.push({

                id: bar.id,

                mark: `M${index + 1}`,

                member: column.name,

                type: 'Main Bar',

                placement: bar.placement,

                dia: bar.diameter,

                qty: bar.count,

                shape: {

                    code: shapeCode,

                    svg: getShapeSvg(shapeCode)

                },

                unitWeight: Number(unitWt.toFixed(3)),

                cutLength,

                totalLength,

                weight: Number(weight.toFixed(2)),

                remarks: ''

            });

            console.log(
                '%c[BBS]',
                'color:#22c55e;font-weight:bold;',
                `Row ${index + 1} Generated`,
                rows[rows.length - 1]
            );

        });

        console.log(
            '%c[SteelIQ]',
            'color:#06b6d4;font-weight:bold;',
            `${rows.length} BBS row(s) generated.`
        );

        return rows;

    }

    /*==========================================================
      UI Rendering
    ==========================================================*/

    function render() {

        const root = document.getElementById('bbs-workspace');

        if (!root) return;

        const column = global.App.state.getSelected();

        if (!column) {

            root.innerHTML = `
        <div style="
            height:100%;
            display:flex;
            align-items:center;
            justify-content:center;
            color:var(--text-secondary);
            font-size:15px;
        ">
            ${renderToolbar(column, totals)}
        </div>
        `;

            return;

        }

        const rows = generateRows(column);

        const totals = calculateTotals(rows);

        root.innerHTML = `

<div style="
height:100%;
display:flex;
flex-direction:column;
background:var(--bg-main);
">

${renderToolbar(column, totals)}

<div style="
flex:1;
display:flex;
overflow:hidden;
">

${renderTable(rows)}

${renderSummary(column, totals)}

</div>

${renderStatusBar(rows)}

</div>

`;

        console.log(
            '%c[SteelIQ]',
            'color:#14b8a6;font-weight:bold;',
            'BBS Workspace rendered.',
            {
                column: column.name,
                rows: rows.length,
                totals
            }
        );

    }

    function renderToolbar(column, totals) {

        return `

<div class="bbs-toolbar">

    <div class="bbs-title">

        <div class="bbs-title-main">

            Bar Bending Schedule

        </div>

        <div class="bbs-title-sub">

            ${column.name} • ${column.type.toUpperCase()} COLUMN

        </div>

    </div>

    <div class="bbs-toolbar-right">

        <div class="bbs-chip">

            Marks
            <span>${totals.marks}</span>

        </div>

        <div class="bbs-chip">

            Bars
            <span>${totals.quantity}</span>

        </div>

        <div class="bbs-chip">

            Length
            <span>${totals.totalLength.toFixed(2)} m</span>

        </div>

        <div class="bbs-chip">

            Steel
            <span>${totals.totalWeight.toFixed(2)} kg</span>

        </div>

        <button class="bbs-btn">

            PDF

        </button>

        <button class="bbs-btn">

            Excel

        </button>

        <button class="bbs-btn">

            Print

        </button>

    </div>

</div>

`;

    }



    function init() {

        console.log(
            '%c[SteelIQ]',
            'color:#14b8a6;font-weight:bold;',
            'BBS Workspace initialized.'
        );

    }



    /*==========================================================
      Helpers (Next)
    ==========================================================*/

    function renderToolbar(column, totals) {

        return `

<div style="
height:58px;
display:flex;
align-items:center;
justify-content:space-between;
padding:0 18px;
border-bottom:1px solid var(--border-strong);
background:var(--bg-panel);
">

    <div
    style="
    display:flex;
    align-items:center;
    gap:14px;
    ">

        <div
        style="
        font-size:18px;
        font-weight:600;
        ">
            Bar Bending Schedule
        </div>

        <div
        style="
        padding:4px 10px;
        border-radius:999px;
        background:rgba(59,130,246,.12);
        color:#60a5fa;
        font-size:12px;
        ">
            ${column.designCode}
        </div>

    </div>

    <div
    style="
    display:flex;
    align-items:center;
    gap:22px;
    font-family:var(--font-mono);
    font-size:13px;
    ">

        <div>

            Column

            <strong>${column.name}</strong>

        </div>

        <div>

            Marks

            <strong>${totals.marks}</strong>

        </div>

        <div>

            Weight

            <strong>${totals.totalWeight} kg</strong>

        </div>

        <button class="btn btn-primary">

            Generate

        </button>

    </div>

</div>

`;

    }

    function renderTable(rows) {

        return `

<div class="bbs-table-container">

<table class="bbs-table">

<thead>

<tr>

<th style="width:70px;">MARK</th>

<th style="width:90px;">SHAPE</th>

<th style="width:95px;">TYPE</th>

<th style="width:70px;">Ø</th>

<th style="width:70px;">NOS</th>

<th style="width:130px;">CUT LENGTH</th>

<th style="width:130px;">TOTAL</th>

<th style="width:110px;">WEIGHT</th>

<th>REMARKS</th>

</tr>

</thead>

<tbody>

${rows.map((row, index) => `

<tr class="${index % 2 ? 'odd' : 'even'}">

<td class="mono">

${row.mark}

</td>

<td>

<div class="shape-cell">

${row.shape.svg}

<div class="shape-code">

${row.shape.code}

</div>

</div>

</td>

<td>

${row.type}

</td>

<td class="mono">

${row.dia}

</td>

<td class="mono">

${row.qty}

</td>

<td class="mono">

${row.cutLength.toLocaleString()} mm

</td>

<td class="mono">

${(row.totalLength / 1000).toFixed(2)} m

</td>

<td class="mono steel">

${row.weight.toFixed(2)} kg

</td>

<td>

${row.remarks || '-'}

</td>

</tr>

`).join('')}

</tbody>

</table>

</div>

`;

    }
    function card(title, value) {

        return `

<div style="
padding:14px;
border:1px solid var(--border-subtle);
border-radius:10px;
background:var(--bg-elevated);
">

<div style="
font-size:11px;
letter-spacing:.08em;
color:var(--text-secondary);
margin-bottom:8px;
">

${title}

</div>

<div style="
font-size:20px;
font-family:var(--font-mono);
font-weight:700;
">

${value}

</div>

</div>

`;

    }
    function renderSummary(column, totals) {

        return `

<div class="bbs-summary">

<div class="summary-title">

PROJECT SUMMARY

</div>

${summaryCard("COLUMN", column.name)}

${summaryCard("MARKS", totals.marks)}

${summaryCard("TOTAL BARS", totals.quantity)}

${summaryCard("TOTAL LENGTH", totals.totalLength.toFixed(2) + " m")}

${summaryCard("STEEL WEIGHT", totals.totalWeight.toFixed(2) + " kg")}

${summaryCard("GRADE", column.steelGrade)}

</div>

`;

    }

    function renderStatusBar(rows) {

        return `

<div style="
height:34px;
border-top:1px solid var(--border-strong);
display:flex;
align-items:center;
justify-content:space-between;
padding:0 14px;
background:var(--bg-panel);
font-size:12px;
color:var(--text-secondary);
font-family:var(--font-mono);
">

<div>

Rows : ${rows.length}

</div>

<div>

SteelIQ BBS Engine v1.0

</div>

</div>

`;

    }
    function summaryCard(label, value) {

        return `

<div class="summary-card">

<div class="summary-label">

${label}

</div>

<div class="summary-value">

${value}

</div>

</div>

`;

    }

    function calculateTotals(rows) {

        const totals = {

            marks: rows.length,

            quantity: 0,

            totalLength: 0,

            totalWeight: 0,

            diameters: new Set(),

            types: new Set()

        };

        rows.forEach(row => {

            totals.quantity += row.qty;

            totals.totalLength += row.totalLength;

            totals.totalWeight += row.weight;

            totals.diameters.add(row.dia);

            totals.types.add(row.type);

        });

        totals.totalWeight =
            Number(totals.totalWeight.toFixed(2));

        totals.totalLength =
            Number((totals.totalLength / 1000).toFixed(2));

        totals.diameterCount =
            totals.diameters.size;

        totals.typeCount =
            totals.types.size;

        console.log(
            '%c[BBS]',
            'color:#3b82f6;font-weight:bold;',
            totals
        );

        return totals;

    }

    /*==========================================================
      Public API
    ==========================================================*/

    global.App = global.App || {};

    global.App.BBSWorkspace = {

        render,
        init

    };

    console.log(
        '%c[SteelIQ]',
        'color:#14b8a6;font-weight:bold;',
        'bbsWorkspace.js loaded.'
    );

})(window);