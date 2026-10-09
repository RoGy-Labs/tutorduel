/* Essay page: compact leaderboard. site.js renders the full table (and re-renders it on every sort);
   here we tag the rows to hide in compact mode: every method below the three best others by the sorted column. */
(() => {
  'use strict';
  const lb = document.querySelector('[data-leaderboard]');
  const table = lb && lb.querySelector('[data-table]');
  const toggle = lb && lb.querySelector('[data-lb-toggle]');
  const extraLabel = lb && lb.querySelector('[data-extra-cols]')?.closest('label');
  if (!table || !toggle) return;
  const SHOWN_OTHERS = 3;
  const tag = () => {
    let others = 0;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      if (tr.classList.contains('ref') || tr.classList.contains('ours') || tr.classList.contains('ablation')) return;
      tr.classList.toggle('e-extra', ++others > SHOWN_OTHERS);
    });
  };
  const setCompact = (on) => {
    lb.classList.toggle('compact', on);
    toggle.textContent = on ? 'Show all methods and details' : 'Show fewer methods';
    if (extraLabel) extraLabel.hidden = on;
  };
  new MutationObserver(tag).observe(table, { childList: true });
  tag();
  setCompact(true);
  toggle.addEventListener('click', () => setCompact(!lb.classList.contains('compact')));
})();
