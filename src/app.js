/*
 * app.js — Entry point only. Boots the app. Must stay under 20 lines.
 *
 * Boot sequence:
 *   1. loadState()      — hydrate all state from localStorage  (state.js)
 *   2. applyModeClass() — set body.mode-cricket if needed      (ui.js)
 *   3. render()         — initial paint                        (ui.js)
 *
 * Does NOT own: state, logic, rendering beyond the boot call
 */

window.addEventListener('DOMContentLoaded', function() {
  loadState();
  applyModeClass();
  render();
});
