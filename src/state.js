/*
 * state.js — ALL mutable state and persistence
 *
 * Owns (exposed on window):
 *   Constants:   CRICKET_TARGETS
 *   Runtime:     appMode, currentView, lastTapTime, sessionStartTime
 *                editingNickname
 *                rounds, history
 *                cricketTarget, cricketRounds, cricketHistory
 *   Settings:    settings { audio, haptics, zenMode, defaultTarget, cricketRounds, nickname }
 *   Persistence: saveSettings(), saveHistory(), saveCricketHistory(),
 *                saveMode(), saveCricketTarget(), loadState()
 *
 * Rule: if it touches localStorage, it lives here. Nowhere else.
 * Does NOT own: DOM access, business logic, data transformation
 */

// ─── Constants ────────────────────────────────────────────────────────────────

window.CRICKET_TARGETS = ['20', '19', '18', '17', '16', '15'];

// ─── Runtime state (defaults — overwritten by loadState) ─────────────────────

window.appMode          = 'bull';      // 'bull' | 'cricket'
window.currentView      = 'practice'; // 'practice' | 'summary' | 'insights'
window.lastTapTime      = 0;
window.sessionStartTime = null;        // null until first tap starts the session

window.editingNickname = false;

// Bull session state
window.rounds      = [];   // array of integers [0–3]: bull hits per visit
window.ocheHistory = [];   // array of bull session records

// Cricket session state
window.cricketTarget  = '20';    // '20'|'19'|'18'|'17'|'16'|'15'|'B'
window.cricketRounds  = [];      // array of integers [0–9]: marks per visit
window.cricketHistory = [];      // array of cricket session records

// Settings
window.settings = {
  audio:         true,       // Web Audio API beeps
  haptics:       true,       // navigator.vibrate()
  zenMode:       false,      // hides entire metric band on practice screen
  defaultTarget: 50,         // bull session auto-ends when bulls hit this number (max 999)
  cricketRounds: 10,         // rounds per cricket target drill (max 999)
  nickname:      'Player 1', // display name, saved as s_nickname
  roundMode:     0           // 0=R, 1=D, 2=blank
};

// ─── Persistence helpers ──────────────────────────────────────────────────────

window.saveSettings = function() {
  localStorage.setItem('s_audio',        window.settings.audio         ? '1' : '0');
  localStorage.setItem('s_haptics',      window.settings.haptics       ? '1' : '0');
  localStorage.setItem('s_zen',          window.settings.zenMode       ? '1' : '0');
  localStorage.setItem('s_target',       String(window.settings.defaultTarget));
  localStorage.setItem('s_cricketRounds', String(window.settings.cricketRounds));
  localStorage.setItem('s_nickname',     window.settings.nickname);
  localStorage.setItem('s_roundmode',    String(window.settings.roundMode));
};

window.saveHistory = function() {
  localStorage.setItem('ocheHistory', JSON.stringify(window.ocheHistory));
};

window.saveCricketHistory = function() {
  localStorage.setItem('ocheCricketHistory', JSON.stringify(window.cricketHistory));
};

window.saveMode = function() {
  localStorage.setItem('ocheMode', window.appMode);
};

window.saveCricketTarget = function() {
  localStorage.setItem('ocheCricketTarget', window.cricketTarget);
};

// ─── Boot hydration ───────────────────────────────────────────────────────────

window.loadState = function() {
  // Settings
  var audio   = localStorage.getItem('s_audio');
  var haptics = localStorage.getItem('s_haptics');
  var zen     = localStorage.getItem('s_zen');
  var target  = localStorage.getItem('s_target');
  var cRnds   = localStorage.getItem('s_cricketRounds');
  var nick    = localStorage.getItem('s_nickname');

  if (audio   !== null) { window.settings.audio         = audio   === '1'; }
  if (haptics !== null) { window.settings.haptics       = haptics === '1'; }
  if (zen     !== null) { window.settings.zenMode       = zen     === '1'; }
  if (target  !== null) { window.settings.defaultTarget = parseInt(target, 10) || 50; }
  if (cRnds   !== null) { window.settings.cricketRounds = parseInt(cRnds, 10)  || 10; }
  if (nick    !== null) { window.settings.nickname      = nick; }
  var rm = localStorage.getItem('s_roundmode');
  if (rm !== null) { window.settings.roundMode = parseInt(rm, 10) || 0; }

  // Mode
  var mode = localStorage.getItem('ocheMode');
  if (mode === 'bull' || mode === 'cricket') { window.appMode = mode; }

  // Cricket drill target preference
  var savedCricketTarget = localStorage.getItem('ocheCricketTarget');
  if (savedCricketTarget !== null) { window.cricketTarget = savedCricketTarget; }
  if (window.cricketTarget === 'B') { window.cricketTarget = '20'; }

  // Session arrays always reset on every page load
  window.rounds        = [];
  window.cricketRounds = [];

  // History
  try {
    var bull = localStorage.getItem('ocheHistory');
    if (bull) { window.ocheHistory = JSON.parse(bull); }
  } catch (e) { window.ocheHistory = []; }

  try {
    var cricket = localStorage.getItem('ocheCricketHistory');
    if (cricket) { window.cricketHistory = JSON.parse(cricket); }
  } catch (e) { window.cricketHistory = []; }

  // Session clock starts on first tap, not on page load
  window.sessionStartTime = null;
};
