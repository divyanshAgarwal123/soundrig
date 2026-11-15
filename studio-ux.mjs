// Presentation only: project state and validation remain owned by app.mjs.
export function selectEditor(tabs, panels, id, focus = false) {
  const selected = tabs.find(tab => tab.id === id);
  if (!selected) return;
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panels.find(panel => panel.id === tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (focus) selected.focus();
}
if (typeof document !== 'undefined') {
  const tabs = [...document.querySelectorAll('.editor-tabs [role=tab]')];
  const panels = [...document.querySelectorAll('.composer [role=tabpanel]')];
  const choose = (id, focus = false) => selectEditor(tabs, panels, id, focus);
  for (const tab of tabs) {
    tab.addEventListener('click', () => choose(tab.id));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); choose(tabs[next].id, true);
    });
  }
  for (const tab of tabs) tab.disabled=false;
  for (const link of document.querySelectorAll('[data-editor]')) link.addEventListener('click', () => choose('tab-' + link.dataset.editor));
  const revealHash = () => { if (location.hash === '#deliver') choose('tab-delivery'); };
  window.addEventListener('hashchange', revealHash); revealHash();
}
