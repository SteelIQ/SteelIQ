/**
 * ColumnList
 * -----------------------------------------------------------------------
 * Renders the left panel: search/filter box, "+" to add a column, and a
 * list of column items supporting select, inline rename (double-click),
 * duplicate and delete. Pure render-on-event — never mutates state
 * directly except by calling App.state methods.
 */
(function (global) {
  'use strict';

  const state = global.App.state;
  const bus = global.App.bus;
  const Toast = global.App.Toast;

  const listEl = () => document.getElementById('column-list');
  const searchInput = () => document.getElementById('column-search');
  const emptyEl = () => document.getElementById('column-list-empty');

  function iconSvg(name) {
    // Minimal inline icon set (kept local so the app has zero external
    // icon-font dependency beyond the optional Lucide CDN used for chrome).
    const icons = {
      copy: '<path d="M8 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M4 9H3a1 1 0 0 0-1 1v9a2 2 0 0 0 2 2h9a1 1 0 0 0 1-1v-1"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
  }

  function render() {
    const columns = state.getFilteredColumns();
    const ul = listEl();
    ul.innerHTML = '';
    emptyEl().style.display = columns.length ? 'none' : 'block';

    columns.forEach((col) => {
      const li = document.createElement('li');
      li.className = 'column-item' + (col.id === state.selectedId ? ' selected' : '');
      li.dataset.id = col.id;

      li.innerHTML = `
        <span class="swatch" style="background:${col.swatch}"></span>
        <div class="ci-main">
          <input class="ci-name" value="${escapeHtml(col.name)}" readonly spellcheck="false" />
          <div class="ci-meta">${App.ColumnTypes[col.type].label} · ${col.story || 'No story set'}</div>
        </div>
        <span class="ci-qty" title="Quantity in building">×${col.quantity}</span>
        <div class="ci-actions">
          <button class="ci-action-btn" data-action="duplicate" title="Duplicate">${iconSvg('copy')}</button>
          <button class="ci-action-btn danger" data-action="delete" title="Delete">${iconSvg('trash')}</button>
        </div>
      `;
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function handleListClick(e) {
    const item = e.target.closest('.column-item');
    if (!item) return;
    const id = item.dataset.id;
    const actionBtn = e.target.closest('[data-action]');

    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === 'duplicate') {
        const copy = state.duplicateColumn(id);
        if (copy) Toast.show(`Duplicated as ${copy.name}`);
      } else if (action === 'delete') {
        const col = state.getColumn(id);
        if (col && confirm(`Delete column "${col.name}"? This cannot be undone via the UI, but Ctrl+Z will restore it.`)) {
          state.deleteColumn(id);
          Toast.show(`Deleted ${col.name}`, { danger: true });
        }
      }
      return;
    }
    state.selectColumn(id);
  }

  function handleDoubleClick(e) {
    const nameInput = e.target.closest('.ci-name');
    if (!nameInput) return;
    nameInput.removeAttribute('readonly');
    nameInput.focus();
    nameInput.select();
  }

  function commitRename(e) {
    const input = e.target.closest('.ci-name');
    if (!input) return;
    const item = input.closest('.column-item');
    const id = item.dataset.id;
    const value = input.value.trim();
    input.setAttribute('readonly', 'true');
    if (!value) { render(); return; }
    state.updateColumn(id, { name: value });
  }

  function init() {
    listEl().addEventListener('click', handleListClick);
    listEl().addEventListener('dblclick', handleDoubleClick);
    listEl().addEventListener('focusout', (e) => { if (e.target.classList.contains('ci-name')) commitRename(e); });
    listEl().addEventListener('keydown', (e) => {
      if (e.target.classList.contains('ci-name') && e.key === 'Enter') e.target.blur();
    });

    searchInput().addEventListener('input', (e) => state.setSearch(e.target.value));

    document.getElementById('btn-add-column').addEventListener('click', () => {
      const col = state.addColumn();
      Toast.show(`Added ${col.name}`);
    });

    bus.on('state:changed', render);
    bus.on('state:loaded', render);
    bus.on('state:selected', render);
    bus.on('state:search', render);

    render();
  }

  global.App = global.App || {};
  global.App.ColumnList = { init, render };
})(window);
