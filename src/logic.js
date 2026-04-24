/*
 * logic.js — ALL business logic, audio, and data transformation
 *
 * Owns (exposed on window where called from HTML or ui.js):
 *   Audio:      initAudio, beep, playSound, playCricketSound, playRewardSound, haptic
 *   Bull:       getTotalBulls, getBPR, getHitPercent, getCount, tapBull
 *   Cricket:    getTotalMarks, getCricketMPR, tapCricket, selectCricketTarget
 *   Session:    endSession, restartSession, undoLast, getSessionDuration
 *   Stats:      getAllTimeBPR, getAllTimeMPR, getTotalSessionTime
 *   Trendline:  logRegression, makeTrendDataset
 *   Backup:     exportBackup, importBackup
 *
 * Rule: no querySelector, no classList, no innerHTML anywhere in this file.
 * Exception: exportBackup uses document.createElement solely to trigger a download.
 */

// ─── Audio ────────────────────────────────────────────────────────────────────

window.audioCtx = null;

window.initAudio = function() {
  if (!window.audioCtx) {
    try {
      window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (window.audioCtx && window.audioCtx.state === 'suspended') {
    window.audioCtx.resume();
  }
};

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    if (window.audioCtx && window.audioCtx.state === 'suspended') {
      window.audioCtx.resume();
    }
  }
});

window.beep = function(freq, dur, vol) {
  if (!window.settings.audio) return;
  if (!window.audioCtx) { initAudio(); }
  if (!window.audioCtx) return;
  try {
    var osc  = window.audioCtx.createOscillator();
    var gain = window.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(window.audioCtx.destination);
    osc.frequency.value = freq || 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol || 0.25, window.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, window.audioCtx.currentTime + (dur || 0.15));
    osc.start(window.audioCtx.currentTime);
    osc.stop(window.audioCtx.currentTime  + (dur || 0.15));
  } catch (e) {}
};

window.playSound = function(val) {
  // Bull tap audio map: 0=miss 200Hz, 1=single 300Hz, 2=double 400Hz×2, 3=triple 500Hz×3
  if (val === 0) {
    beep(200, 0.18, 0.2);
  } else if (val === 1) {
    beep(300, 0.12);
  } else if (val === 2) {
    beep(400, 0.09);
    setTimeout(function() { beep(400, 0.10); }, 90);
  } else {
    beep(500, 0.07);
    setTimeout(function() { beep(500, 0.07); }, 75);
    setTimeout(function() { beep(500, 0.16); }, 155);
  }
};

window.playCricketSound = function(marks) {
  // 0=miss 200Hz, 1-3=single scaled 350-450Hz, 4-6=double, 7-9=triple
  if (marks === 0) {
    beep(200, 0.18, 0.2);
  } else if (marks <= 3) {
    beep(350 + (marks - 1) * 50, 0.12);
  } else if (marks <= 6) {
    beep(520, 0.09);
    setTimeout(function() { beep(620, 0.10); }, 90);
  } else {
    beep(520, 0.07);
    setTimeout(function() { beep(620, 0.07); }, 75);
    setTimeout(function() { beep(780, 0.16); }, 155);
  }
};

window.playRewardSound = function() {
  // 4-note ascending fanfare: 440→554→659→880 Hz
  beep(440, 0.10);
  setTimeout(function() { beep(554, 0.10); }, 120);
  setTimeout(function() { beep(659, 0.10); }, 240);
  setTimeout(function() { beep(880, 0.25); }, 360);
};

window.haptic = function(pattern) {
  if (!window.settings.haptics) return;
  if (navigator.vibrate) { navigator.vibrate(pattern); }
};

// ─── Bull engine ──────────────────────────────────────────────────────────────

window.getTotalBulls = function() {
  var total = 0;
  for (var i = 0; i < window.rounds.length; i++) {
    total += window.rounds[i];
  }
  return total;
};

window.getBPR = function() {
  if (window.rounds.length === 0) return 0;
  return getTotalBulls() / window.rounds.length;
};

window.getHitPercent = function() {
  if (window.rounds.length === 0) return 0;
  var hits = 0;
  for (var i = 0; i < window.rounds.length; i++) {
    if (window.rounds[i] > 0) { hits++; }
  }
  return (hits / window.rounds.length) * 100;
};

window.getCount = function(val) {
  var count = 0;
  for (var i = 0; i < window.rounds.length; i++) {
    if (window.rounds[i] === val) { count++; }
  }
  return count;
};

window.tapBull = function(val) {
  var now = Date.now();
  if (now - window.lastTapTime < 50) return;
  window.lastTapTime = now;
  if (getTotalBulls() >= window.settings.defaultTarget) return;
  if (window.sessionStartTime === null) { window.sessionStartTime = now; }
  window.rounds.push(val);
  playSound(val);
  haptic(val > 0 ? [30] : [10, 10, 10]);
  if (window.updateStats) { window.updateStats(); }
  if (getTotalBulls() >= window.settings.defaultTarget) {
    endSession();
    return;
  }
};

// ─── Cricket engine ───────────────────────────────────────────────────────────

window.getTotalMarks = function() {
  var total = 0;
  for (var i = 0; i < window.cricketRounds.length; i++) {
    total += window.cricketRounds[i];
  }
  return total;
};

window.getCricketMPR = function() {
  if (window.cricketRounds.length === 0) return 0;
  return getTotalMarks() / window.cricketRounds.length;
};

window.tapCricket = function(marks) {
  var now = Date.now();
  if (now - window.lastTapTime < 50) return;
  window.lastTapTime = now;
  if (window.cricketRounds.length >= window.settings.cricketRounds) return;
  if (window.sessionStartTime === null) { window.sessionStartTime = now; }
  window.cricketRounds.push(marks);
  playCricketSound(marks);
  haptic(marks > 0 ? [30] : [10, 10, 10]);
  if (window.updateStats) { window.updateStats(); }
  if (window.cricketRounds.length >= window.settings.cricketRounds) {
    endSession();
    return;
  }
};

window.selectCricketTarget = function(target) {
  window.cricketTarget    = target;
  window.cricketRounds    = [];
  window.sessionStartTime = null;
  window.saveCricketTarget();
};

// ─── Session ──────────────────────────────────────────────────────────────────

window.getSessionDuration = function() {
  if (window.sessionStartTime === null) return '0m 0s';
  var secs = Math.round((Date.now() - window.sessionStartTime) / 1000);
  return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
};

window.endSession = function() {
  var now       = new Date();
  var secs      = window.sessionStartTime ? Math.round((Date.now() - window.sessionStartTime) / 1000) : 0;
  var dur       = Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  var dd        = now.getDate();
  var mo        = now.getMonth() + 1;
  var yyyy      = now.getFullYear();
  var hh        = now.getHours();
  var mm        = now.getMinutes();
  var dateStr   = (dd < 10 ? '0' + dd : dd) + '/' + (mo < 10 ? '0' + mo : mo) + '/' + yyyy;
  var timeStr   = (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);

  if (window.appMode === 'bull') {
    if (window.rounds.length === 0) return;
    window.ocheHistory.push({
      date:         dateStr,
      time:         timeStr,
      duration:     dur,
      durationSecs: secs,
      target:       window.settings.defaultTarget,
      bulls:        getTotalBulls(),
      rounds:       window.rounds.length,
      bpr:          parseFloat(getBPR().toFixed(2)),
      miss:         getCount(0),
      single:       getCount(1),
      tons:         getCount(2),
      hats:         getCount(3),
      rawRounds:    window.rounds.slice()
    });
    window.saveHistory();
  } else {
    if (window.cricketRounds.length === 0) return;
    window.cricketHistory.push({
      date:         dateStr,
      time:         timeStr,
      duration:     dur,
      durationSecs: secs,
      target:       window.cricketTarget,
      marks:        getTotalMarks(),
      rounds:       window.cricketRounds.length,
      mpr:          parseFloat(getCricketMPR().toFixed(2)),
      rawRounds:    window.cricketRounds.slice()
    });
    window.saveCricketHistory();
  }

  playRewardSound();
  setTimeout(function() {
    window.currentView = 'summary';
    if (window.render) { window.render(); }
  }, 750);
};

window.restartSession = function() {
  if (window.appMode === 'bull') {
    window.rounds = [];
  } else {
    window.cricketRounds = [];
  }
  window.sessionStartTime = null;
  window.currentView = 'practice';
  if (window.render) { window.render(); }
};

window.undoLast = function() {
  if (window.appMode === 'bull') {
    if (window.rounds.length > 0) { window.rounds.pop(); }
  } else {
    if (window.cricketRounds.length > 0) { window.cricketRounds.pop(); }
  }
  beep(150, 0.18, 0.2);
  if (window.render) { window.render(); }
};

// ─── Profile stats ────────────────────────────────────────────────────────────

window.getAllTimeBPR = function() {
  if (!window.ocheHistory || window.ocheHistory.length === 0) return 0;
  var totalBulls = 0, totalRounds = 0;
  for (var i = 0; i < window.ocheHistory.length; i++) {
    totalBulls  += window.ocheHistory[i].bulls;
    totalRounds += window.ocheHistory[i].rounds;
  }
  return totalRounds === 0 ? 0 : totalBulls / totalRounds;
};

window.getAllTimeMPR = function() {
  if (!window.cricketHistory || window.cricketHistory.length === 0) return 0;
  var totalMarks = 0, totalRounds = 0;
  for (var i = 0; i < window.cricketHistory.length; i++) {
    totalMarks  += window.cricketHistory[i].marks;
    totalRounds += window.cricketHistory[i].rounds;
  }
  return totalRounds === 0 ? 0 : totalMarks / totalRounds;
};

window.getTotalSessionTime = function() {
  var total = 0;
  var i;
  for (i = 0; i < window.ocheHistory.length; i++) {
    total += window.ocheHistory[i].durationSecs || 0;
  }
  for (i = 0; i < window.cricketHistory.length; i++) {
    total += window.cricketHistory[i].durationSecs || 0;
  }
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  return h + 'h ' + m + 'm';
};

// ─── Trendline ────────────────────────────────────────────────────────────────

window.movingAverage = function(data) {
  if (!data || data.length < 2) return null;
  var n    = 10;
  var half = Math.floor(n / 2);
  var out  = [];
  for (var i = 0; i < data.length; i++) {
    var start = Math.max(0, i - half);
    var end   = Math.min(data.length - 1, i + half);
    var sum   = 0;
    for (var j = start; j <= end; j++) { sum += data[j]; }
    out.push(sum / (end - start + 1));
  }
  return out;
};

// Fits y = a + b·ln(x) to an indexed series. Returns {a, b} or null.
window.logRegression = function(data) {
  var n = data.length;
  if (n < 3) return null;
  var sumLx = 0, sumY = 0, sumLxY = 0, sumLxLx = 0;
  for (var i = 0; i < n; i++) {
    var lx    = Math.log(i + 1);
    sumLx    += lx;
    sumY     += data[i];
    sumLxY   += lx * data[i];
    sumLxLx  += lx * lx;
  }
  var denom = n * sumLxLx - sumLx * sumLx;
  if (denom === 0) return null;
  var b = (n * sumLxY - sumLx * sumY) / denom;
  var a = (sumY - b * sumLx) / n;
  return { a: a, b: b };
};

// Returns a Chart.js dataset for a log trendline, or null if dataArray.length < 3.
// dataArray is a plain array of numbers; accentColor is the rgba border color string.
window.makeTrendDataset = function(dataArray, accentColor) {
  if (!dataArray || dataArray.length < 3) return null;
  var reg = logRegression(dataArray);
  if (!reg) return null;
  var trendData = [];
  for (var j = 0; j < dataArray.length; j++) {
    trendData.push(reg.a + reg.b * Math.log(j + 1));
  }
  return {
    label:       'Trend',
    data:        trendData,
    borderColor: accentColor,
    borderWidth: 1.5,
    pointRadius: 0,
    borderDash:  [5, 5],
    tension:     0.4,
    fill:        false
  };
};

// ─── Backup ───────────────────────────────────────────────────────────────────

// exportBackup is the sole function in this file permitted to touch the DOM
// (document.createElement) — it does so only to trigger a file download.
window.exportBackup = function() {
  var json = JSON.stringify({
    version:        1,
    exportDate:     new Date().toISOString(),
    history:        window.ocheHistory,
    cricketHistory: window.cricketHistory,
    nickname:       window.settings.nickname
  }, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'oche-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// jsonString is the raw file contents; file reading is handled by ui.js via file input.
window.importBackup = function(jsonString) {
  var data;
  try { data = JSON.parse(jsonString); } catch (e) { return false; }
  if (!Array.isArray(data.ocheHistory) || !Array.isArray(data.cricketHistory)) { return false; }
  window.ocheHistory    = data.ocheHistory;
  window.cricketHistory = data.cricketHistory;
  if (data.nickname) {
    window.settings.nickname = data.nickname;
    window.saveSettings();
  }
  window.saveHistory();
  window.saveCricketHistory();
  window.location.reload();
  return true;
};
