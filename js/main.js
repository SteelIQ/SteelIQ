/**
 * main.js
 * -----------------------------------------------------------------------
 * Boot sequence. Order matters only in that state must load before UI
 * modules render against it. Every module below is independent and
 * listens to App.bus — this file's only job is "load, then wire".
 */
(function () {
  'use strict';

  function wireWorkspaceTabs() {
    const stages = {
      'cross-section': document.getElementById('canvas-stage'),
      'calculations': document.getElementById('calc-stage'),
      'loads': document.getElementById('loads-stage'),
      'bbs': document.getElementById('bbs-stage'),
      'report': document.getElementById('report-stage'),
    };
    document.querySelectorAll('.ws-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.locked) {
          App.Toast.show(`${tab.textContent.trim()} arrives in ${tab.dataset.locked}`);
          return;
        }
        document.querySelectorAll('.ws-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        Object.keys(stages).forEach((key) => {
          if (stages[key]) stages[key].style.display = (key === tab.dataset.tab) ? '' : 'none';
        });
        if (tab.dataset.tab === 'calculations') App.CalcPanel.render();
        if (tab.dataset.tab === 'loads') App.LoadsPanel.render();
        if (tab.dataset.tab === 'bbs') App.BbsPanel.render();
        if (tab.dataset.tab === 'report') App.ReportPanel.render();
      });
    });
  }

  function renderRoadmap() {
    const phases = [
      { title: 'Architecture & folder structure', desc: 'core/, models/, ui/ — modular, dependency-free, offline.', state: 'done' },
      { title: 'Modern UI & layout', desc: 'Toolbar, nav rail, resizable panels, status bar, dark/light.', state: 'done' },
      { title: 'Project / column management', desc: 'CRUD, quantity, search, duplicate, undo/redo, autosave, JSON import/export.', state: 'done' },
      { title: 'SVG cross-section visualization engine', desc: 'Real bar placement geometry, mark leaders, spacing/dimension callouts, hover/selection, SVG/PNG export.', state: 'done' },
      { title: 'Reinforcement placement system', desc: 'Drag/drop, snap-to-ring, grid snap, symmetric drag, mirror/rotate/reset — overriding Phase 4\'s automatic placement.', state: 'done' },
      { title: 'Structural calculation engine', desc: 'Gross/steel area, steel %, spacing checks, concrete/steel volumes and weights, safety checks, project totals — per selected design code.', state: 'done' },
      { title: 'Development length, lap length, anchorage, BBS', desc: 'Ld/lap per IS 456 bond-stress method, hook length, bend deduction, real BBS cutting length, IS 13920 no-lap zone.', state: 'done' },
      { title: 'PDF & Excel export', desc: 'Themed per-column PDF pages (drawing, tables, checks) + full project summary; one Excel sheet per column + a summary sheet.', state: 'done' },
      { title: 'Final polish, testing, optimization', desc: 'Docs, keyboard shortcuts audit, performance pass.', state: 'next' },
    ];
    const el = document.getElementById('roadmap-list');
    el.innerHTML = phases.map((p, i) => `
      <div class="roadmap-item ${p.state === 'done' ? 'done' : p.state === 'next' ? 'current' : ''}">
        <div class="roadmap-check">${p.state === 'done' ? checkIcon() : (i + 1)}</div>
        <div class="roadmap-text"><strong>Phase ${i + 1}: ${p.title}</strong><span>${p.desc}</span></div>
      </div>
    `).join('');
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.Theme.init();
    App.state.load();

    App.Panels.init();
    App.ColumnList.init();
    App.PropertiesPanel.init();
    App.Toolbar.init();
    App.StatusBar.init();
    App.Canvas.init();
    App.CalcPanel.init();
    App.LoadsPanel.init();
    App.BbsPanel.init();
    App.ReportPanel.init();

    wireWorkspaceTabs();
    renderRoadmap();

    App.Toast.show('Project loaded — autosaving to this browser');
  });
})();
