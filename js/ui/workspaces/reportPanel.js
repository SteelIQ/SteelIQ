/**
 * ReportPanel — Phase 8: PDF Report & Excel Export
 * -----------------------------------------------------------------------
 * Renders the "PDF Report" workspace tab and does the actual export
 * work. All the numbers come from models/reportData.js (already unit-
 * tested); this file is purely "lay that data out as a PDF page / Excel
 * sheet." Column drawings come from Canvas.getColumnPngDataUrl(), which
 * rasterizes each column's cross-section without disturbing the user's
 * current selection or view on the live canvas.
 *
 * jsPDF / jspdf-autotable / SheetJS load from CDN (index.html) — the one
 * feature in this app that needs a network connection once, to fetch
 * them. Every export action checks they loaded and shows a clear error
 * instead of a silent failure if they didn't.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Calc = global.App.Calc;
  const ReportData = global.App.ReportData;
  const Toast = global.App.Toast;

  const root = () => document.getElementById('report-body');

  function librariesReady() {
    return !!(global.jspdf && global.jspdf.jsPDF) && !!global.XLSX;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------------ tab UI

  function render() {
    const columns = state.columns;
    const el = root();

    el.innerHTML = `
      <div class="calc-header">
        <h3>Report Export <span class="text-muted" style="font-weight:400;">— ${columns.length} column type(s)</span></h3>
      </div>

      ${!librariesReady() ? `<div class="notice" style="border-color:var(--danger-dim); margin-bottom:14px;">${warnIcon()}<span>Export libraries (jsPDF / SheetJS) haven't loaded — check your internet connection, then reload the page. Everything else in this app works fully offline; this is the one feature that needs a network connection, to fetch these libraries from CDN.</span></div>` : ''}

      <div class="calc-section">
        <h4>Column Sections &amp; Theme Colors</h4>
        <div class="theme-legend">
          ${columns.map((col, i) => {
            const theme = ReportData.themeForIndex(i);
            return `<div class="theme-chip" style="border-color:${theme.hex};">
              <span class="theme-dot" style="background:${theme.hex};"></span>
              ${escapeHtml(col.name)} <span class="text-muted">(${theme.name})</span>
            </div>`;
          }).join('') || '<div class="field-hint">No columns yet.</div>'}
        </div>
      </div>

      <div class="calc-section">
        <h4>Generate</h4>
        <div class="pt-row" style="margin-bottom:8px;">
          <button class="btn btn-primary" id="btn-generate-pdf" ${columns.length ? '' : 'disabled'}>Generate PDF Report</button>
          <button class="btn" id="btn-export-xlsx" ${columns.length ? '' : 'disabled'}>Export Excel Workbook</button>
        </div>
        <div class="field-hint" id="report-status"></div>
      </div>

      <div class="calc-section" id="report-preview-wrap" style="display:none;">
        <h4>Preview</h4>
        <iframe id="report-preview" title="PDF report preview"></iframe>
      </div>
    `;

    document.getElementById('btn-generate-pdf').addEventListener('click', generatePdfReport);
    document.getElementById('btn-export-xlsx').addEventListener('click', exportExcelWorkbook);
  }

  function warnIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>';
  }

  function setStatus(text) {
    const el = document.getElementById('report-status');
    if (el) el.textContent = text;
  }

  // ------------------------------------------------------------------- PDF

  async function generatePdfReport() {
    if (!librariesReady()) { Toast.show('Export libraries did not load — check your internet connection.', { danger: true }); return; }
    const columns = state.columns;
    if (!columns.length) { Toast.show('Add at least one column first.', { danger: true }); return; }

    const btn = document.getElementById('btn-generate-pdf');
    btn.disabled = true;
    setStatus('Rendering column drawings…');

    try {
      const { jsPDF } = global.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 12;

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        setStatus(`Rendering ${col.name} (${i + 1} of ${columns.length})…`);
        if (i > 0) doc.addPage();
        const reportData = ReportData.buildColumnReportData(col, i);
        // eslint-disable-next-line no-await-in-loop
        const image = await global.App.Canvas.getColumnPngDataUrl(col, 2).catch(() => null);
        drawColumnPage(doc, reportData, image, { pageW, pageH, margin });
      }

      setStatus('Adding project summary…');
      doc.addPage();
      drawProjectSummaryPage(doc, columns, { pageW, pageH, margin });

      const safeName = (state.project.name || 'project').replace(/[^a-z0-9\-_]+/gi, '_');
      doc.save(`${safeName}_structural_report.pdf`);

      const blobUrl = doc.output('bloburl');
      const previewWrap = document.getElementById('report-preview-wrap');
      const previewFrame = document.getElementById('report-preview');
      if (previewWrap && previewFrame) {
        previewFrame.src = blobUrl;
        previewWrap.style.display = '';
      }

      setStatus(`Generated — ${columns.length} column page(s) + project summary.`);
      Toast.show('PDF report generated');
    } catch (err) {
      console.error(err);
      setStatus('');
      Toast.show('PDF generation failed — see console for details.', { danger: true });
    } finally {
      btn.disabled = false;
    }
  }

  function drawColumnPage(doc, reportData, image, layout) {
    const { column, theme, summary, bbs, qty, totalWeightForQty, totalConcreteForQty } = reportData;
    const { pageW, margin } = layout;
    const [r, g, b] = hexToRgb(theme.hex);

    // --- Colored header band ------------------------------------------
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(`${column.name}`, margin, 12);
    doc.setFontSize(9);
    doc.text(`${App.ColumnTypes[column.type].label}  ·  Qty ${qty} in building  ·  ${column.designCode}`, margin, 19);
    doc.setTextColor(20, 20, 20);

    let y = 32;

    // --- Cross-section image -------------------------------------------
    if (image) {
      const maxImgW = 85, maxImgH = 70;
      const ratio = Math.min(maxImgW / image.widthPx, maxImgH / image.heightPx);
      const w = image.widthPx * ratio, h = image.heightPx * ratio;
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, y, maxImgW + 4, maxImgH + 4);
      doc.addImage(image.dataUrl, 'PNG', margin + 2, y + 2, w, h);
    }

    // --- Section properties table, alongside the image ------------------
    doc.autoTable({
      startY: y,
      margin: { left: margin + 92 },
      tableWidth: pageW - margin * 2 - 92,
      head: [['Section Property', 'Value']],
      body: [
        ['Gross Area', `${(summary.grossAreaMm2 / 1e6).toFixed(4)} m²`],
        ['Steel Area', `${summary.steelAreaMm2.toFixed(0)} mm²`],
        ['Steel %', `${summary.steelPercent.toFixed(3)}%  (min ${summary.rules.minSteelPercent}% / max ${summary.rules.maxSteelPercent}%)`],
        ['Concrete Volume', `${summary.concreteVolumeM3.toFixed(3)} m³/col  ·  ${totalConcreteForQty.toFixed(2)} m³ total`],
        ['Steel Weight', `${summary.totalSteelWeightKg.toFixed(1)} kg/col  ·  ${totalWeightForQty.toFixed(0)} kg total`],
        ['Status', summary.status.toUpperCase()],
      ],
      theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [r, g, b], textColor: 255 },
    });
    y = Math.max(doc.lastAutoTable.finalY, y + 74) + 6;

    // --- Bar Bending Schedule -------------------------------------------
    doc.setFontSize(10); doc.setTextColor(r, g, b); doc.text('Bar Bending Schedule', margin, y); doc.setTextColor(20, 20, 20);
    doc.autoTable({
      startY: y + 2,
      head: [['Mark', 'Shape', 'Dia', 'Nos', 'Cutting Length', 'Unit Wt', 'Wt/Bar', 'Total']],
      body: bbs.rows.map((row) => [
        row.mark, row.shape, `T${row.diameter}`, row.nos, `${row.cuttingLengthMm} mm`,
        `${row.unitWeightKgPerM.toFixed(3)} kg/m`, `${row.weightPerBarKg.toFixed(2)} kg`, `${row.totalKg.toFixed(2)} kg`,
      ]).concat([['', '', '', '', '', '', 'Total', `${bbs.totalWeightKg.toFixed(2)} kg`]]),
      theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [r, g, b], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 6;

    // --- Development & Lap reference -------------------------------------
    doc.setFontSize(10); doc.setTextColor(r, g, b); doc.text('Development & Lap Length', margin, y); doc.setTextColor(20, 20, 20);
    doc.autoTable({
      startY: y + 2,
      head: [['Dia', 'Ld (Tension)', 'Ld (Compression)', 'Lap (Tension)', 'Lap (Compression)']],
      body: bbs.reference.map((r2) => [`T${r2.diameter}`, `${Math.round(r2.ldTension)} mm`, `${Math.round(r2.ldCompression)} mm`, `${Math.round(r2.lapTension)} mm`, `${Math.round(r2.lapCompression)} mm`]),
      theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [r, g, b], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 6;

    // --- Safety checks ----------------------------------------------------
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setTextColor(r, g, b); doc.text('Safety Checks', margin, y); doc.setTextColor(20, 20, 20);
    y += 6;
    doc.setFontSize(8);
    summary.checks.forEach((c) => {
      const color = c.level === 'danger' ? [200, 40, 60] : c.level === 'warning' ? [190, 120, 20] : [30, 140, 90];
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(`[${c.level.toUpperCase()}] ${c.message}`, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 1;
    });
    doc.setTextColor(20, 20, 20);

    // --- Engineer notes -----------------------------------------------
    if (column.notes) {
      y += 4;
      doc.setFontSize(9); doc.setTextColor(r, g, b); doc.text('Engineer Notes', margin, y); doc.setTextColor(20, 20, 20);
      y += 5;
      doc.setFontSize(8);
      const noteLines = doc.splitTextToSize(column.notes, pageW - margin * 2);
      doc.text(noteLines, margin, y);
    }

    addFooter(doc, layout);
  }

  function drawProjectSummaryPage(doc, columns, layout) {
    const { pageW, pageH, margin } = layout;
    const projReport = ReportData.buildProjectReportData(columns, state.project);
    const { totals, rows } = projReport;

    doc.setFillColor(60, 66, 74);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('Project Summary', margin, 15);
    doc.setTextColor(20, 20, 20);

    let y = 32;
    doc.autoTable({
      startY: y,
      head: [['Column', 'Type', 'Qty', 'Steel %', 'Status', 'Wt/Column', 'Total Weight', 'Total Concrete']],
      body: rows.map((r) => [
        r.name, r.type, r.quantity, `${r.steelPercent.toFixed(2)}%`, r.status.toUpperCase(),
        `${r.weightPerColumnKg.toFixed(1)} kg`, `${r.totalWeightKg.toFixed(0)} kg`, `${r.concreteVolumeM3.toFixed(2)} m³`,
      ]),
      theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [60, 66, 74], textColor: 255 },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(11); doc.text('Project Totals', margin, y); y += 6;
    doc.autoTable({
      startY: y,
      body: [
        ['Total column types', totals.totalColumnTypes],
        ['Total columns in building', totals.totalColumnInstances],
        ['Total concrete volume', `${totals.totalConcreteM3.toFixed(2)} m³`],
        ['Total steel weight', `${totals.totalSteelKg.toFixed(0)} kg  (${(totals.totalSteelKg / 1000).toFixed(2)} tonnes)`],
        ['  — Longitudinal', `${totals.totalLongSteelKg.toFixed(0)} kg`],
        ['  — Ties/Stirrups', `${totals.totalTieSteelKg.toFixed(0)} kg`],
        ['Average steel %', `${totals.averageSteelPercent.toFixed(2)}%`],
        ['Estimated steel cost', `${state.project.currency}${totals.estimatedSteelCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
        ['Estimated concrete cost', `${state.project.currency}${totals.estimatedConcreteCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
        ['Estimated total cost', `${state.project.currency}${totals.estimatedTotalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
      ],
      theme: 'plain', styles: { fontSize: 9, cellPadding: 1.8 },
    });

    addFooter(doc, layout);
  }

  function addFooter(doc, layout) {
    const { pageW, pageH, margin } = layout;
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`${state.project.name}  ·  generated ${new Date().toLocaleDateString()}  ·  page ${pageCount}`, margin, pageH - 6);
    doc.setTextColor(20, 20, 20);
  }

  // ----------------------------------------------------------------- Excel

  function exportExcelWorkbook() {
    if (!librariesReady()) { Toast.show('Export libraries did not load — check your internet connection.', { danger: true }); return; }
    const columns = state.columns;
    if (!columns.length) { Toast.show('Add at least one column first.', { danger: true }); return; }

    try {
      const wb = global.XLSX.utils.book_new();
      const usedNames = new Set();

      columns.forEach((col, i) => {
        const bbs = Calc.bbsSchedule(col);
        const summary = Calc.columnSummary(col);
        const aoa = [
          [`Column: ${col.name}`, App.ColumnTypes[col.type].label, `Qty: ${col.quantity}`, col.designCode],
          [`Concrete: ${col.concreteGrade}`, `Steel: ${col.steelGrade}`, `Steel %: ${summary.steelPercent.toFixed(3)}%`, `Status: ${summary.status.toUpperCase()}`],
          [],
          ['Mark', 'Shape', 'Dia (mm)', 'Nos', 'Cutting Length (mm)', 'Unit Wt (kg/m)', 'Wt/Bar (kg)', 'Total Wt (kg)'],
          ...bbs.rows.map((r) => [r.mark, r.shape, r.diameter, r.nos, r.cuttingLengthMm, r.unitWeightKgPerM, r.weightPerBarKg, r.totalKg]),
          [],
          ['', '', '', '', '', '', 'Total (per column)', bbs.totalWeightKg],
          ['', '', '', '', '', '', `Total × ${col.quantity} in building`, bbs.totalWeightKg * col.quantity],
        ];
        const ws = global.XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 9 }, { wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
        global.XLSX.utils.book_append_sheet(wb, ws, safeSheetName(col.name, i, usedNames));
      });

      const projReport = ReportData.buildProjectReportData(columns, state.project);
      const summaryAoa = [
        ['Project', state.project.name, 'Design Code', state.project.designCode],
        [],
        ['Column', 'Type', 'Qty', 'Steel %', 'Status', 'Wt/Column (kg)', 'Total Weight (kg)', 'Total Concrete (m³)'],
        ...projReport.rows.map((r) => [r.name, r.type, r.quantity, r.steelPercent, r.status.toUpperCase(), r.weightPerColumnKg, r.totalWeightKg, r.concreteVolumeM3]),
        [],
        ['Total columns in building', projReport.totals.totalColumnInstances],
        ['Total concrete (m³)', projReport.totals.totalConcreteM3],
        ['Total steel (kg)', projReport.totals.totalSteelKg],
        ['  Longitudinal (kg)', projReport.totals.totalLongSteelKg],
        ['  Ties (kg)', projReport.totals.totalTieSteelKg],
        ['Average steel %', projReport.totals.averageSteelPercent],
        ['Estimated steel cost', projReport.totals.estimatedSteelCost],
        ['Estimated concrete cost', projReport.totals.estimatedConcreteCost],
        ['Estimated total cost', projReport.totals.estimatedTotalCost],
      ];
      const summarySheet = global.XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
      global.XLSX.utils.book_append_sheet(wb, summarySheet, 'Project Summary');

      const safeName = (state.project.name || 'project').replace(/[^a-z0-9\-_]+/gi, '_');
      global.XLSX.writeFile(wb, `${safeName}_bbs_workbook.xlsx`);
      Toast.show('Excel workbook exported');
    } catch (err) {
      console.error(err);
      Toast.show('Excel export failed — see console for details.', { danger: true });
    }
  }

  /** Excel sheet names: max 31 chars, no \/*?[]:  , and must be unique. */
  function safeSheetName(name, index, usedNames) {
    let clean = String(name).replace(/[\\/*?[\]:]/g, '').slice(0, 28) || `Column${index + 1}`;
    let candidate = clean;
    let n = 2;
    while (usedNames.has(candidate)) { candidate = `${clean}_${n}`; n += 1; }
    usedNames.add(candidate);
    return candidate;
  }

  // -------------------------------------------------------------------- init

  function init() {
    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    render();
  }

  global.App = global.App || {};
  global.App.ReportPanel = { init, render };
})(window);
