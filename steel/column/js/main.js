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
    document.querySelectorAll('.ws-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.locked) {
          App.Toast.show(`${tab.textContent.trim()} arrives in ${tab.dataset.locked}`);
          return;
        }
        document.querySelectorAll('.ws-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
  }

  function renderRoadmap() {
    const phases = [
      { title: 'Architecture & folder structure', desc: 'core/, models/, ui/ — modular, dependency-free, offline.', state: 'done' },
      { title: 'Modern UI & layout', desc: 'Toolbar, nav rail, resizable panels, status bar, dark/light.', state: 'done' },
      { title: 'Project / column management', desc: 'CRUD, quantity, search, duplicate, undo/redo, autosave, JSON import/export.', state: 'done' },
      { title: 'SVG cross-section visualization engine', desc: 'AutoCAD-grade detailing, bar callouts, leader lines, hover/selection.', state: 'next' },
      { title: 'Reinforcement placement system', desc: 'Drag/drop, mirror, rotate, snap, auto-symmetry.', state: 'planned' },
      { title: 'Structural calculation engine', desc: 'Steel %, spacing, volumes, weights — per selected design code.', state: 'planned' },
      { title: 'Development length, lap length, anchorage, BBS', desc: 'Ld, laps, hooks, bend deduction, cutting length.', state: 'planned' },
      { title: 'PDF & Excel export', desc: 'Themed per-column report pages + full workbook export.', state: 'planned' },
      { title: 'Final polish, testing, optimization', desc: 'Docs, keyboard shortcuts audit, performance pass.', state: 'planned' },
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

    wireWorkspaceTabs();
    renderRoadmap();

    App.Toast.show('Project loaded — autosaving to this browser');
  });
})();
