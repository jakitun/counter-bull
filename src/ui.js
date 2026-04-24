/*
 * ui.js — ALL rendering, DOM updates, and chart drawing
 *
 * Owns (exposed on window where called from HTML or other files):
 *   Mode:       applyModeClass()
 *   Flash:      flashBtn(), getBullFlashClass(), handleBullTap(), handleCricketTap()
 *   Fast update: updateStats(), punchScore(), cycleMetric()
 *   Settings:   openSettings(), closeSettings(), toggleSetting(), buildToggleRow()
 *   Charts:     renderSessionChart(), renderMacroChart(), renderMicroChart(), toggleMicroChart()
 *   Helpers:    headerBarHTML(), buildBullGrid(), buildCricketNumpad(), buildTargetStrip()
 *   Render:     render()
 *
 * Rule: if it touches the DOM or builds HTML strings — it lives here.
 * Does NOT own: localStorage, business logic, data transformation
 */

window.smoothArray = function(data) {
  if (!data || data.length < 3) return data;
  var out = [data[0]];
  for (var i = 1; i < data.length - 1; i++) {
    out.push(0.25 * data[i - 1] + 0.5 * data[i] + 0.25 * data[i + 1]);
  }
  out.push(data[data.length - 1]);
  return out;
};

// ─── Module-level variables ───────────────────────────────────────────────────

var metricMode          = 0;      // 0=BPR/MPR, 1=Hit%(bull only), 2=blank
var insightHistoryTab   = 'bull'; // active tab on insights history list
var growthChartExpanded = false;  // growth chart section collapsed by default
var sessionChartInst    = null;   // Chart.js instance for summary chart
var macroChartInst      = null;   // Chart.js instance for macro growth chart
var microChartInst      = null;   // Chart.js instance for micro history card chart
var openMicroIndex      = -1;     // which history card has its chart expanded
window.heatmapMode = window.heatmapMode || 'alltime';

// ─── applyModeClass ───────────────────────────────────────────────────────────

window.applyModeClass = function() {
  if (window.appMode === 'cricket') {
    document.body.classList.add('mode-cricket');
  } else {
    document.body.classList.remove('mode-cricket');
  }
};

// ─── Flash helpers ────────────────────────────────────────────────────────────

window.flashBtn = function(btn, cssClass) {
  if (!btn) return;
  btn.classList.add(cssClass);
  setTimeout(function() { btn.classList.remove(cssClass); }, 140);
};

window.getBullFlashClass = function(val) {
  if (val === 0) return 'flash-0';
  if (val === 1) return 'flash-1';
  if (val === 2) return 'flash-2';
  return 'flash-3';
};

// Called by bull button handlers — flash lives here, not in logic.js
window.handleBullTap = function(val, btn) {
  tapBull(val);
  flashBtn(btn, getBullFlashClass(val));
};

// Called by cricket button handlers
window.handleCricketTap = function(marks, btn) {
  tapCricket(marks);
  flashBtn(btn, marks === 0 ? 'flash-c-miss' : 'flash-c-hit');
};

// ─── updateStats ─────────────────────────────────────────────────────────────

window.updateStats = function() {
  var isBull = window.appMode === 'bull';
  var score  = isBull ? getTotalBulls()      : getTotalMarks();
  var rounds = isBull ? window.rounds.length : window.cricketRounds.length;

  // Score display — punch only when value actually changes
  var scoreEl = document.getElementById('score-display');
  if (scoreEl) {
    var prev = parseInt(scoreEl.textContent, 10);
    if (isNaN(prev) || prev !== score) {
      scoreEl.textContent = score;
      punchScore();
    }
  }

  // Rounds zone
  var rd = getRoundDisplay();
  var roundLabel = document.getElementById('round-label');
  var roundValue = document.getElementById('round-value');
  if (roundLabel) roundLabel.innerText = rd.label;
  if (roundValue) roundValue.innerText = rd.value;

  // Undo button state
  var undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    var hasData = isBull ? window.rounds.length > 0 : window.cricketRounds.length > 0;
    if (hasData) {
      undoBtn.classList.remove('action-btn-dim');
    } else {
      undoBtn.classList.add('action-btn-dim');
    }
  }

  // Metric band visibility
  var leftEl  = document.getElementById('metric-left');
  var rightEl = document.getElementById('metric-right');
  if (leftEl)  { leftEl.style.visibility  = window.settings.zenMode ? 'hidden' : ''; }
  if (rightEl) { rightEl.style.visibility = window.settings.zenMode ? 'hidden' : ''; }
  if (window.settings.zenMode) { return; }

  // Metric label + value
  var metricLabelEl = document.getElementById('metric-label');
  var metricValueEl = document.getElementById('metric-value');
  if (!metricLabelEl || !metricValueEl) { return; }

  if (metricMode === 2) {
    metricLabelEl.textContent = '';
    metricValueEl.textContent = '—';
  } else if (metricMode === 1 && isBull) {
    metricLabelEl.textContent = 'HIT%';
    metricValueEl.textContent = rounds === 0 ? '—' : Math.round(getHitPercent()) + '%';
  } else {
    metricLabelEl.textContent = isBull ? 'BPR' : 'MPR';
    var rate = isBull ? getBPR() : getCricketMPR();
    metricValueEl.textContent = rounds === 0 ? '—' : rate.toFixed(2);
  }
};

// ─── punchScore ───────────────────────────────────────────────────────────────

window.punchScore = function() {
  var el = document.getElementById('score-display');
  if (!el) return;
  el.classList.remove('score-punch');
  void el.offsetWidth; // force reflow so animation restarts
  el.classList.add('score-punch');
};

// ─── cycleMetric ──────────────────────────────────────────────────────────────

window.cycleMetric = function() {
  if (window.appMode === 'bull') {
    metricMode = (metricMode + 1) % 3; // 0→1→2→0
  } else {
    metricMode = metricMode === 0 ? 2 : 0; // cricket: 0→2→0 (no Hit%)
  }
  updateStats();
};

window.cycleRoundMode = function() {
  window.settings.roundMode = (window.settings.roundMode + 1) % 3;
  window.saveSettings();
  updateStats();
};

// ─── Settings modal ───────────────────────────────────────────────────────────

window.buildToggleRow = function(label, sublabel, key) {
  var isOn = window.settings[key];
  return '<div class="settings-row">'
    + '<div class="settings-row-text">'
    + '<div class="settings-label font-label">' + label + '</div>'
    + (sublabel ? '<div class="settings-sublabel">' + sublabel + '</div>' : '')
    + '</div>'
    + '<button class="toggle-btn' + (isOn ? ' toggle-on' : '') + '"'
    + ' ontouchstart="toggleSetting(\'' + key + '\');event.preventDefault()"'
    + ' onclick="toggleSetting(\'' + key + '\')">'
    + '<span class="toggle-thumb"></span>'
    + '</button>'
    + '</div>';
};

window.buildSettingsModal = function() {
  return '<div class="settings-backdrop"'
    + ' ontouchstart="closeSettings();event.preventDefault()" onclick="closeSettings()"></div>'
    + '<div class="settings-sheet">'
    + '<div class="settings-handle"></div>'
    + '<div class="settings-header">'
    + '<span class="settings-title font-label">SETTINGS</span>'
    + '<button class="settings-close" onclick="closeSettings()">✕</button>'
    + '</div>'
    + '<div class="settings-body">'
    + '<div class="settings-section-title font-label">PREFERENCES</div>'
    + '<div class="settings-row">'
    + '<div class="settings-row-text"><div class="settings-label font-label">NICKNAME</div></div>'
    + '<input type="text" class="settings-text-input" value="' + window.settings.nickname + '"'
    + ' onchange="window.settings.nickname=this.value.trim()||\'Player 1\';saveSettings()"'
    + ' onblur="window.settings.nickname=this.value.trim()||\'Player 1\';saveSettings()"'
    + ' onkeydown="if(event.key===\'Enter\'){window.settings.nickname=this.value.trim()||\'Player 1\';saveSettings();this.blur()}"'
    + ' />'
    + '</div>'
    + buildToggleRow('AUDIO', '', 'audio')
    + buildToggleRow('HAPTICS', '', 'haptics')
    + buildToggleRow('ZEN MODE', 'Hides BPR/MPR and rounds counter', 'zenMode')
    + '<div class="settings-section-title font-label">SESSION DEFAULTS</div>'
    + '<div class="settings-row">'
    + '<div class="settings-row-text">'
    + '<div class="settings-label font-label">BULL TARGET</div>'
    + '<div class="settings-sublabel">Session ends when bulls hit this number</div>'
    + '</div>'
    + '<input type="number" class="settings-num-input" min="1" max="999"'
    + ' value="' + window.settings.defaultTarget + '"'
    + ' onchange="window.settings.defaultTarget=Math.min(999,Math.max(1,parseInt(this.value,10)||50));saveSettings()"'
    + ' />'
    + '</div>'
    + '<div class="settings-row">'
    + '<div class="settings-row-text">'
    + '<div class="settings-label font-label">ROUNDS PER TARGET</div>'
    + '<div class="settings-sublabel">How many visits per target drill</div>'
    + '</div>'
    + '<input type="number" class="settings-num-input" min="1" max="999"'
    + ' value="' + window.settings.cricketRounds + '"'
    + ' onchange="window.settings.cricketRounds=Math.min(999,Math.max(1,parseInt(this.value,10)||10));saveSettings()"'
    + ' />'
    + '</div>'
    + '</div>'
    + '</div>';
};

window.openSettings = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.innerHTML = buildSettingsModal();
  el.classList.add('open');
};

window.closeSettings = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.classList.remove('open');
  updateStats();
};

window.toggleSetting = function(key) {
  window.settings[key] = !window.settings[key];
  saveSettings();
  openSettings();
};

// ─── Chart renderers ──────────────────────────────────────────────────────────

window.renderSessionChart = function(canvasId, rawRounds, isBullTarget) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (sessionChartInst) { sessionChartInst.destroy(); sessionChartInst = null; }
  var yMax       = isBullTarget ? 3 : (window.cricketTarget === 'B' ? 6 : 9);
  var lineColor  = isBullTarget ? 'rgba(249,115,22,0.85)' : 'rgba(168,85,247,0.85)';
  var trendBorder = isBullTarget ? 'rgba(251,191,36,0.75)' : 'rgba(216,180,254,0.75)';
  var glowColor   = isBullTarget ? 'rgba(251,191,36,0.45)' : 'rgba(216,180,254,0.45)';
  var grad = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
  grad.addColorStop(0, isBullTarget ? 'rgba(251,191,36,0.10)' : 'rgba(216,180,254,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  var labels = [];
  for (var i = 0; i < rawRounds.length; i++) { labels.push(i + 1); }
  var datasets = [{
    data:                 rawRounds,
    borderColor:          lineColor,
    borderWidth:          2,
    pointRadius:          3,
    pointBackgroundColor: lineColor,
    tension:              0.3,
    fill:                 false,
    order:                1
  }];
  var maRaw      = movingAverage(rawRounds);
  var maSmoothed = maRaw ? smoothArray(maRaw) : null;
  if (maSmoothed) {
    datasets.push({
      data:            maSmoothed,
      borderColor:     trendBorder,
      borderWidth:     1.5,
      pointRadius:     0,
      fill:            true,
      backgroundColor: grad,
      tension:         0.5,
      borderCapStyle:  'round',
      borderJoinStyle: 'round',
      order:           2
    });
  }
  var glowPlugin = {
    id: 'trendGlow',
    beforeDatasetDraw: function(chart, args) {
      if (args.index !== 1) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor   = glowColor;
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw: function(chart, args) {
      if (args.index !== 1) return;
      chart.ctx.restore();
    }
  };
  sessionChartInst = new Chart(canvas, {
    type:    'line',
    plugins: [glowPlugin],
    data:    { labels: labels, datasets: datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          min:    0,
          max:    yMax,
          ticks:  { color: '#6b6b6b', stepSize: 1 },
          grid:   { color: 'rgba(255,255,255,0.05)' },
          border: { color: 'transparent' }
        }
      }
    }
  });
};

window.renderMacroChart = function(canvasId, historyArr, isCricket) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (macroChartInst) { macroChartInst.destroy(); macroChartInst = null; }
  if (!historyArr || historyArr.length === 0) return;
  var lineColor  = isCricket ? 'rgba(168,85,247,0.85)' : 'rgba(249,115,22,0.85)';
  var trendColor = isCricket ? 'rgba(168,85,247,0.4)'  : 'rgba(249,115,22,0.4)';
  var vals       = [];
  var labels     = [];
  for (var i = 0; i < historyArr.length; i++) {
    vals.push(isCricket ? historyArr[i].mpr : historyArr[i].bpr);
    labels.push(i + 1);
  }
  var datasets = [{
    data:                 vals,
    borderColor:          lineColor,
    borderWidth:          2,
    pointRadius:          3,
    pointBackgroundColor: lineColor,
    tension:              0.3,
    fill:                 false
  }];
  var trendDs = makeTrendDataset(vals, trendColor);
  if (trendDs) { datasets.push(trendDs); }
  macroChartInst = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          ticks:  { color: '#6b6b6b' },
          grid:   { color: 'rgba(255,255,255,0.05)' },
          border: { color: 'transparent' }
        }
      }
    }
  });
};

window.renderMicroChart = function(canvasId, rawRounds, isBullTarget, yMaxOverride) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
  var yMax        = yMaxOverride !== undefined ? yMaxOverride : (isBullTarget ? 3 : 9);
  var lineColor   = isBullTarget ? 'rgba(249,115,22,0.85)' : 'rgba(168,85,247,0.85)';
  var trendBorder = isBullTarget ? 'rgba(251,191,36,0.75)'  : 'rgba(216,180,254,0.75)';
  var glowColor   = isBullTarget ? 'rgba(251,191,36,0.45)'  : 'rgba(216,180,254,0.45)';
  var grad = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
  grad.addColorStop(0, isBullTarget ? 'rgba(251,191,36,0.10)' : 'rgba(216,180,254,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  var labels = [];
  for (var i = 0; i < rawRounds.length; i++) { labels.push(i + 1); }
  var datasets = [{
    data:                 rawRounds,
    borderColor:          lineColor,
    borderWidth:          2,
    pointRadius:          2,
    pointBackgroundColor: lineColor,
    tension:              0.3,
    fill:                 false,
    order:                1
  }];
  var maRaw      = movingAverage(rawRounds);
  var maSmoothed = maRaw ? smoothArray(maRaw) : null;
  if (maSmoothed) {
    datasets.push({
      data:            maSmoothed,
      borderColor:     trendBorder,
      borderWidth:     1.5,
      pointRadius:     0,
      fill:            true,
      backgroundColor: grad,
      tension:         0.5,
      borderCapStyle:  'round',
      borderJoinStyle: 'round',
      order:           2
    });
  }
  var glowPlugin = {
    id: 'trendGlow',
    beforeDatasetDraw: function(chart, args) {
      if (args.index !== 1) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor   = glowColor;
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw: function(chart, args) {
      if (args.index !== 1) return;
      chart.ctx.restore();
    }
  };
  microChartInst = new Chart(canvas, {
    type:    'line',
    plugins: [glowPlugin],
    data:    { labels: labels, datasets: datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 200 },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          min:    0,
          max:    yMax,
          ticks:  { color: '#6b6b6b', stepSize: 1 },
          grid:   { color: 'rgba(255,255,255,0.05)' },
          border: { color: 'transparent' }
        }
      }
    }
  });
};

window.toggleMicroChart = function(index) {
  if (openMicroIndex === index) {
    openMicroIndex = -1;
    var el = document.getElementById('micro-chart-' + index);
    if (el) { el.style.display = 'none'; }
    if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
    return;
  }
  if (openMicroIndex !== -1) {
    var prev = document.getElementById('micro-chart-' + openMicroIndex);
    if (prev) { prev.style.display = 'none'; }
    if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
  }
  openMicroIndex = index;
  var container = document.getElementById('micro-chart-' + index);
  if (!container) return;
  container.style.display = 'block';
  var isBull  = insightHistoryTab === 'bull';
  var arr     = isBull ? window.ocheHistory : window.cricketHistory;
  if (!arr || !arr[index]) return;
  var record  = arr[index];
  var yMax    = isBull ? 3 : (record.target === 'B' ? 6 : 9);
  renderMicroChart('micro-canvas-' + index, record.rawRounds, isBull, yMax);
};

// ─── Heatmap ─────────────────────────────────────────────────────────────────

window.calcHeatmap = function(recentOnly) {
  var targets = ['20', '19', '18', '17', '16', '15'];
  var heat = {};

  for (var t = 0; t < targets.length; t++) {
    var tgt = targets[t];
    var sessions = [];
    for (var i = 0; i < window.cricketHistory.length; i++) {
      if (window.cricketHistory[i].target === tgt) {
        sessions.push(window.cricketHistory[i]);
      }
    }
    if (recentOnly) { sessions = sessions.slice(-5); }
    if (sessions.length === 0) { heat[tgt] = null; continue; }
    var totalMarks = 0, totalRounds = 0;
    for (var j = 0; j < sessions.length; j++) {
      totalMarks  += sessions[j].marks  || 0;
      totalRounds += sessions[j].rounds || 0;
    }
    heat[tgt] = totalRounds > 0 ? totalMarks / totalRounds : null;
  }

  var bullSessions = recentOnly ? window.ocheHistory.slice(-5) : window.ocheHistory;
  if (bullSessions.length > 0) {
    var bTotalBulls = 0, bTotalRounds = 0;
    for (var k = 0; k < bullSessions.length; k++) {
      bTotalBulls  += bullSessions[k].bulls  || 0;
      bTotalRounds += bullSessions[k].rounds || 0;
    }
    heat['bull'] = bTotalRounds > 0 ? bTotalBulls / bTotalRounds : null;
  } else {
    heat['bull'] = null;
  }

  return heat;
};

window.heatColor = function(val, maxVal) {
  if (val === null || val === undefined) return '#1a1a1a';
  var ratio = Math.min(val / maxVal, 1);
  var stops = [
    [26,  42,  74],
    [26,  74,  138],
    [74,  144, 217],
    [249, 115, 22],
    [255, 241, 118]
  ];
  var scaled = ratio * (stops.length - 1);
  var lo = Math.floor(scaled);
  var hi = Math.min(lo + 1, stops.length - 1);
  var t  = scaled - lo;
  var r  = Math.round(stops[lo][0] + t * (stops[hi][0] - stops[lo][0]));
  var g  = Math.round(stops[lo][1] + t * (stops[hi][1] - stops[lo][1]));
  var b  = Math.round(stops[lo][2] + t * (stops[hi][2] - stops[lo][2]));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
};

window.buildHeatmapSVG = function(heat) {
  var cx = 140, cy = 140;
  var cricketSet = { '20': true, '19': true, '18': true, '17': true, '16': true, '15': true };
  var numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  var centers  = [0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 252, 270, 288, 306, 324, 342];

  function ptc(r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function segPath(r1, r2, startDeg, endDeg) {
    var s1 = ptc(r1, startDeg), e1 = ptc(r1, endDeg);
    var s2 = ptc(r2, startDeg), e2 = ptc(r2, endDeg);
    return 'M ' + s1.x + ' ' + s1.y
      + ' A ' + r1 + ' ' + r1 + ' 0 0 1 ' + e1.x + ' ' + e1.y
      + ' L ' + e2.x + ' ' + e2.y
      + ' A ' + r2 + ' ' + r2 + ' 0 0 0 ' + s2.x + ' ' + s2.y
      + ' Z';
  }

  var svg = '<svg width="280" height="280" viewBox="0 0 280 280" style="overflow:visible">'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="140" fill="#0a0a0a"/>';

  for (var s = 0; s < 20; s++) {
    var num = numbers[s];
    var ca  = centers[s];
    var sa  = ca - 9, ea = ca + 9;
    var key = String(num);

    if (cricketSet[key]) {
      var col       = heatColor(heat[key], 9);
      var colTreble = heatColor(heat[key] !== null ? heat[key] * 0.55 : null, 9);
      svg += '<path d="' + segPath(24, 95,  sa, ea) + '" fill="#111"/>';
      svg += '<path d="' + segPath(95, 107, sa, ea) + '" fill="' + colTreble + '"/>';
      svg += '<path d="' + segPath(107, 128, sa, ea) + '" fill="' + col + '"/>';
      svg += '<path d="' + segPath(128, 140, sa, ea) + '" fill="' + col + '"/>';
    } else {
      svg += '<path d="' + segPath(24, 140, sa, ea) + '" fill="#111"/>';
    }
  }

  for (var d = 0; d < 20; d++) {
    var la = centers[d] - 9;
    var p1 = ptc(24, la), p2 = ptc(140, la);
    svg += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y
      + '" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
  }

  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="95"  fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="107" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="128" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="140" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>';

  var bullOuterCol = heatColor(heat['bull'] !== null ? heat['bull'] * 0.7 : null, 3);
  var bullInnerCol = heatColor(heat['bull'], 3);
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + bullOuterCol + '"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="' + bullInnerCol + '"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';

  for (var li = 0; li < 20; li++) {
    var lnum = numbers[li];
    var lkey = String(lnum);
    if (!cricketSet[lkey]) continue;
    var lp = ptc(148, centers[li]);
    svg += '<text x="' + lp.x + '" y="' + lp.y + '"'
      + ' text-anchor="middle" dominant-baseline="central"'
      + ' font-family="Rajdhani,sans-serif" font-weight="700" font-size="10"'
      + ' fill="rgba(255,255,255,0.5)">' + lnum + '</text>';
  }

  svg += '<text x="' + cx + '" y="' + cy + '"'
    + ' text-anchor="middle" dominant-baseline="central"'
    + ' font-family="Rajdhani,sans-serif" font-weight="700" font-size="7"'
    + ' fill="rgba(255,255,255,0.5)">B</text>';

  svg += '</svg>';
  return svg;
};

window.buildHeatmapCard = function() {
  var isRecent = window.heatmapMode === 'recent';
  var heat     = calcHeatmap(isRecent);
  return '<div class="heatmap-card">'
    + '<div class="heatmap-header">'
    +   '<span class="stat-label">SKILL MAP</span>'
    +   '<div class="heatmap-toggle">'
    +     '<button class="heatmap-tab' + (!isRecent ? ' heatmap-tab-active' : '') + '"'
    +     ' ontouchstart="setHeatmapMode(\'alltime\');event.preventDefault()"'
    +     ' onclick="setHeatmapMode(\'alltime\')">ALL-TIME</button>'
    +     '<button class="heatmap-tab' + (isRecent ? ' heatmap-tab-active' : '') + '"'
    +     ' ontouchstart="setHeatmapMode(\'recent\');event.preventDefault()"'
    +     ' onclick="setHeatmapMode(\'recent\')">RECENT</button>'
    +   '</div>'
    + '</div>'
    + '<div class="heatmap-board">'
    +   buildHeatmapSVG(heat)
    + '</div>'
    + '<div class="heatmap-legend">'
    +   '<span class="legend-cold">COLD</span>'
    +   '<div class="legend-bar"></div>'
    +   '<span class="legend-hot">HOT</span>'
    + '</div>'
    + '</div>';
};

window.setHeatmapMode = function(mode) {
  window.heatmapMode = mode;
  var card = document.getElementById('heatmap-card-wrap');
  if (card) card.innerHTML = buildHeatmapCard();
};

// ─── Render helpers & action handlers ────────────────────────────────────────

window.setMode = function(mode) {
  if (mode === window.appMode) return;
  if (window.currentView === 'summary') {
    window.rounds           = [];
    window.cricketRounds    = [];
    window.sessionStartTime = null;
    window.currentView      = 'practice';
    window.appMode          = mode;
    saveMode();
    applyModeClass();
    render();
    return;
  }
  var isBull  = window.appMode === 'bull';
  var hasData = isBull ? window.rounds.length > 0 : window.cricketRounds.length > 0;
  if (hasData && !confirm('Switch mode? Current session will be lost.')) return;
  window.rounds        = [];
  window.cricketRounds = [];
  window.sessionStartTime = null;
  window.appMode = mode;
  saveMode();
  applyModeClass();
  render();
};

window.confirmEndSession = function() {
  var isBull  = window.appMode === 'bull';
  var hasData = isBull ? window.rounds.length > 0 : window.cricketRounds.length > 0;
  if (!hasData) { restartSession(); return; }
  if (confirm('End session?')) { endSession(); }
};

window.confirmCricketTarget = function(target) {
  if (target === window.cricketTarget) return;
  if (window.cricketRounds.length > 0) {
    if (!confirm('Change target? Current session will be lost.')) return;
  }
  selectCricketTarget(target);
  render();
};

window.switchInsightTab = function(tab) {
  insightHistoryTab = tab;
  if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
  openMicroIndex = -1;
  render();
};

window.toggleGrowthChart = function() {
  growthChartExpanded = !growthChartExpanded;
  render();
};

window.startEditNickname = function() {
  window.editingNickname = true;
  render();
};

window.saveNickname = function(val) {
  window.settings.nickname = val ? val.trim() || 'Player 1' : 'Player 1';
  window.editingNickname   = false;
  saveSettings();
  render();
};

window.deleteSession = function(index) {
  var isBull = insightHistoryTab === 'bull';
  if (isBull) {
    window.ocheHistory.splice(index, 1);
    saveHistory();
  } else {
    window.cricketHistory.splice(index, 1);
    saveCricketHistory();
  }
  if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
  openMicroIndex = -1;
  render();
};

window.clearHistory = function() {
  var isBull = insightHistoryTab === 'bull';
  if (!confirm('Clear all ' + (isBull ? 'bull' : 'cricket') + ' history?')) return;
  if (isBull) {
    window.ocheHistory = [];
    saveHistory();
  } else {
    window.cricketHistory = [];
    saveCricketHistory();
  }
  if (microChartInst) { microChartInst.destroy(); microChartInst = null; }
  openMicroIndex = -1;
  render();
};

window.openBackupMenu = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.innerHTML = '<div class="settings-backdrop"'
    + ' ontouchstart="closeBackupMenu();event.preventDefault()"'
    + ' onclick="closeBackupMenu()"></div>'
    + '<div class="settings-sheet">'
    + '<div class="settings-handle"></div>'
    + '<div class="settings-header">'
    + '<span class="settings-title font-label">BACKUP</span>'
    + '<button class="settings-close"'
    + ' ontouchstart="closeBackupMenu();event.preventDefault()"'
    + ' onclick="closeBackupMenu()">✕</button>'
    + '</div>'
    + '<div class="settings-body">'
    + '<button class="backup-action-btn font-label"'
    + ' ontouchstart="exportBackup();closeBackupMenu();event.preventDefault()"'
    + ' onclick="exportBackup();closeBackupMenu()">⬇ Export Backup</button>'
    + '<button class="backup-action-btn font-label"'
    + ' ontouchstart="triggerImport();event.preventDefault()"'
    + ' onclick="triggerImport()">⬆ Import Backup</button>'
    + '<input type="file" id="import-input" accept=".json"'
    + ' style="display:none" onchange="handleImport(this)">'
    + '</div>'
    + '</div>';
  el.classList.add('open');
};

window.closeBackupMenu = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.classList.remove('open');
  el.innerHTML = '';
};

window.triggerImport = function() {
  var input = document.getElementById('import-input');
  if (input) { input.click(); }
};

window.handleImport = function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if (!importBackup(e.target.result)) { alert('Invalid backup file.'); }
  };
  reader.readAsText(inputEl.files[0]);
};

window.openModeDropdown = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.innerHTML = '<div class="mode-popover-backdrop"></div>'
    + '<div class="mode-popover">'
    + '<div class="mode-popover-item'
    + (window.appMode === 'bull' ? ' mode-popover-active' : '') + '"'
    + ' ontouchstart="setMode(\'bull\');closeModeDropdown();event.preventDefault()"'
    + ' onclick="setMode(\'bull\');closeModeDropdown()">🎯 BULL RACE</div>'
    + '<div class="mode-popover-item'
    + (window.appMode === 'cricket' ? ' mode-popover-active' : '') + '"'
    + ' ontouchstart="setMode(\'cricket\');closeModeDropdown();event.preventDefault()"'
    + ' onclick="setMode(\'cricket\');closeModeDropdown()">⦻ CRICKET NUMBER</div>'
    + '</div>';
  el.classList.add('open');
  setTimeout(function() {
    document.addEventListener('click', function handler() {
      closeModeDropdown();
      document.removeEventListener('click', handler);
    }, { once: true });
  }, 50);
};

window.closeModeDropdown = function() {
  var el = document.getElementById('settings-modal');
  if (!el) return;
  el.classList.remove('open');
  el.innerHTML = '';
};

window.headerBarHTML = function() {
  if (window.currentView === 'insights') {
    return '<div class="top-bar">'
      + '<button class="btn-back font-label"'
      + ' ontouchstart="window.currentView=\'practice\';render();event.preventDefault()"'
      + ' onclick="window.currentView=\'practice\';render()">BACK</button>'
      + '<span class="top-bar-title font-label">STATISTIC</span>'
      + '<button class="btn-icon"'
      + ' ontouchstart="openBackupMenu();event.preventDefault()"'
      + ' onclick="openBackupMenu()"><img src="src/vectors/export.svg" width="20" height="20" style="display:block;filter:brightness(0) invert(1);opacity:0.6"></button>'
      + '</div>';
  }
  var isBull      = window.appMode === 'bull';
  var modeName    = isBull ? 'BULL RACE' : 'CRICKET NUMBER';
  var targetLabel = isBull
    ? String(window.settings.defaultTarget)
    : (window.settings.cricketRounds + ' RDS');
  return '<div class="top-bar">'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<button class="mode-dropdown-pill"'
    + ' ontouchstart="openModeDropdown();event.preventDefault()"'
    + ' onclick="openModeDropdown()">'
    + modeName + ' ▾'
    + '</button>'
    + '<button class="target-pill"'
    + ' ontouchstart="openSettings();event.preventDefault()"'
    + ' onclick="openSettings()">'
    + targetLabel
    + '</button>'
    + '</div>'
    + '<div class="top-bar-icons">'
    + '<button class="btn-icon"'
    + ' ontouchstart="window.currentView=\'insights\';render();event.preventDefault()"'
    + ' onclick="window.currentView=\'insights\';render()"><img src="src/vectors/chart.svg" width="20" height="20" style="display:block;filter:brightness(0) invert(1);opacity:0.6"></button>'
    + '<button class="btn-icon"'
    + ' ontouchstart="openSettings();event.preventDefault()"'
    + ' onclick="openSettings()"><img src="src/vectors/setting.svg" width="20" height="20" style="display:block;filter:brightness(0) invert(1);opacity:0.6"></button>'
    + '</div>'
    + '</div>';
};

window.buildBullGrid = function() {
  var html = '<div class="bull-grid">';
  for (var v = 0; v <= 3; v++) {
    html += '<button class="btn-tap"'
      + ' ontouchstart="handleBullTap(' + v + ',this);event.preventDefault()"'
      + ' onclick="handleBullTap(' + v + ',this)">'
      + v
      + '</button>';
  }
  html += '</div>';
  return html;
};

window.buildCricketNumpad = function() {
  var rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  var html = '<div class="cricket-numpad">';
  for (var r = 0; r < rows.length; r++) {
    html += '<div class="numpad-row">';
    for (var c = 0; c < rows[r].length; c++) {
      var m = rows[r][c];
      html += '<button class="btn-cricket"'
        + ' ontouchstart="handleCricketTap(' + m + ',this);event.preventDefault()"'
        + ' onclick="handleCricketTap(' + m + ',this)">'
        + m
        + '</button>';
    }
    html += '</div>';
  }
  html += '<div class="numpad-row numpad-row-zero">'
    + '<button class="btn-cricket btn-cricket-zero"'
    + ' ontouchstart="handleCricketTap(0,this);event.preventDefault()"'
    + ' onclick="handleCricketTap(0,this)">0</button>'
    + '</div>';
  html += '</div>';
  return html;
};

window.buildTargetStrip = function() {
  var html = '<div class="target-strip">';
  for (var i = 0; i < window.CRICKET_TARGETS.length; i++) {
    var t      = window.CRICKET_TARGETS[i];
    var active = t === window.cricketTarget;
    html += '<button class="target-item' + (active ? ' target-active' : '') + '"'
      + ' ontouchstart="confirmCricketTarget(\'' + t + '\');event.preventDefault()"'
      + ' onclick="confirmCricketTarget(\'' + t + '\')">'
      + t
      + '</button>';
  }
  html += '</div>';
  return html;
};

// ─── Render ───────────────────────────────────────────────────────────────────

function renderPractice() {
  var isBull       = window.appMode === 'bull';
  var score        = isBull ? getTotalBulls()      : getTotalMarks();
  var rounds       = isBull ? window.rounds.length : window.cricketRounds.length;
  var undoDisabled = rounds === 0;

  var metricLabel = '', metricValue = '—';
  if (metricMode === 2) {
    metricLabel = '';
    metricValue = '—';
  } else if (metricMode === 1 && isBull) {
    metricLabel = 'HIT%';
    metricValue = rounds === 0 ? '—' : Math.round(getHitPercent()) + '%';
  } else {
    metricLabel = isBull ? 'BPR' : 'MPR';
    var rate    = isBull ? getBPR() : getCricketMPR();
    metricValue = rounds === 0 ? '—' : rate.toFixed(2);
  }

  var rd = getRoundDisplay();

  var metricBand = '<div id="metric-band" class="metric-band">'
    + '<div id="metric-left" class="metric-left"'
    + (window.settings.zenMode ? ' style="visibility:hidden"' : '')
    + ' ontouchstart="cycleMetric();event.preventDefault()" onclick="cycleMetric()">'
    + '<div id="metric-label" class="metric-label font-label">' + metricLabel + '</div>'
    + '<div id="metric-value" class="metric-value score-display">' + metricValue + '</div>'
    + '</div>'
    + '<div id="score-display" class="score-hero">' + score + '</div>'
    + '<div id="metric-right" onclick="cycleRoundMode()"'
    + ' ontouchstart="cycleRoundMode();event.preventDefault()"'
    + ' class="metric-right" style="cursor:pointer'
    + (window.settings.zenMode ? ';visibility:hidden' : '') + '">'
    + '<span id="round-label" class="metric-label">' + rd.label + '</span>'
    + '<span id="round-value" class="metric-value score-display">' + rd.value + '</span>'
    + '</div>'
    + '</div>';

  var inputArea = isBull
    ? buildBullGrid()
    : (buildTargetStrip() + buildCricketNumpad());

  var actionStrip = '<div class="action-strip">'
    + '<button ontouchstart="confirmEndSession();event.preventDefault()" onclick="confirmEndSession()" class="action-btn">'
    + '<img src="src/vectors/end.svg" width="14" height="14" style="display:block;filter:brightness(0) invert(1);opacity:0.5">'
    + ' END'
    + '</button>'
    + '<button ontouchstart="undoLast();event.preventDefault()" onclick="undoLast()" id="undo-btn" class="action-btn action-btn-right' + (undoDisabled ? ' action-btn-dim' : '') + '">'
    + 'UNDO '
    + '<img src="src/vectors/undo.svg" width="14" height="14" style="display:block;filter:brightness(0) invert(1);opacity:0.5">'
    + '</button>'
    + '</div>';

  return headerBarHTML()
    + metricBand
    + actionStrip
    + inputArea;
}

function renderSummary() {
  var isBull  = window.appMode === 'bull';
  var heroVal = isBull
    ? (window.rounds.length === 0 ? '0.00' : getBPR().toFixed(2))
    : (window.cricketRounds.length === 0 ? '0.00' : getCricketMPR().toFixed(2));
  var heroLabel = isBull ? 'BPR' : 'MPR';

  var s1l, s1v, s2l, s2v, s3l, s3v;
  if (isBull) {
    s1l = 'BULLS';  s1v = String(getTotalBulls());
    s2l = 'TIME';   s2v = getSessionDuration();
    s3l = 'ROUNDS'; s3v = String(window.rounds.length);
  } else {
    s1l = 'MARKS';  s1v = String(getTotalMarks());
    s2l = 'ROUNDS'; s2v = String(window.cricketRounds.length);
    s3l = 'TARGET'; s3v = String(window.cricketTarget);
  }

  return headerBarHTML()
    + '<div class="summary-hero">'
    + '<div class="summary-hero-label">' + heroLabel + '</div>'
    + '<div id="score-display" class="summary-hero-val">' + heroVal + '</div>'
    + '</div>'
    + '<div class="summary-stat-row">'
    + '<div class="summary-stat-col">'
    + '<span class="summary-stat-label">' + s1l + '</span>'
    + '<span class="summary-stat-val">' + s1v + '</span>'
    + '</div>'
    + '<div class="summary-stat-col">'
    + '<span class="summary-stat-label">' + s2l + '</span>'
    + '<span class="summary-stat-val">' + s2v + '</span>'
    + '</div>'
    + '<div class="summary-stat-col">'
    + '<span class="summary-stat-label">' + s3l + '</span>'
    + '<span class="summary-stat-val">' + s3v + '</span>'
    + '</div>'
    + '</div>'
    + '<div class="summary-chart-wrap">'
    + '<canvas id="session-chart"></canvas>'
    + '</div>'
    + '<div class="summary-bottom">'
    + '<button class="btn-secondary font-label" style="border-radius:9999px"'
    + ' ontouchstart="restartSession();event.preventDefault()"'
    + ' onclick="restartSession()">RESTART</button>'
    + '<button class="btn-primary font-label" style="border-radius:9999px"'
    + ' ontouchstart="window.currentView=\'insights\';render();event.preventDefault()"'
    + ' onclick="window.currentView=\'insights\';render()">STATS</button>'
    + '</div>';
}

function buildHistoryCard(record, index, isBull, typeForAll) {
  var rateVal   = isBull ? record.bpr.toFixed(2) : record.mpr.toFixed(2);
  var rateLabel = isBull ? 'BPR' : 'MPR';
  var summaryLine = isBull
    ? (record.bulls + '/' + record.target + ' BULLS · ' + record.rounds + ' ROUNDS')
    : (record.marks + ' MARKS · ' + record.rounds + ' ROUNDS · TARGET ' + record.target);

  var breakdownHtml = '';
  if (isBull) {
    breakdownHtml = '<div class="breakdown-row">'
      + '<span class="bd-miss">'   + record.miss   + ' MISS</span>'
      + '<span class="bd-single">' + record.single + ' SINGLE</span>'
      + '<span class="bd-tons">'   + record.tons   + ' TONS</span>'
      + '<span class="bd-hats">'   + record.hats   + ' HATS</span>'
      + '</div>';
  }

  var microHtml = '';
  var microBtnHtml = '';
  if (!typeForAll) {
    var microOpen = openMicroIndex === index;
    microHtml = '<div id="micro-chart-' + index + '" class="micro-chart-wrap"'
      + ' style="display:' + (microOpen ? 'block' : 'none') + '">'
      + '<canvas id="micro-canvas-' + index + '" height="80"></canvas>'
      + '</div>';
    microBtnHtml = '<button class="btn-micro" onclick="toggleMicroChart(' + index + ')">'
      + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
      + '<polyline points="1,12 5,7 8,9 11,4 15,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>'
      + '</button>';
  }

  var delOnclick = typeForAll
    ? 'switchInsightTab(\'' + typeForAll + '\');deleteSession(' + index + ')'
    : 'deleteSession(' + index + ')';

  var watermarkHtml = '';
  if (!isBull && record.target) {
    watermarkHtml = '<div style="position:absolute;bottom:4px;right:12px;font-family:\'Bebas Neue\',cursive;font-size:6rem;line-height:1;color:rgba(168,85,247,0.07);pointer-events:none;-webkit-user-select:none;user-select:none">'
      + record.target
      + '</div>';
  }

  return '<div class="history-card" style="position:relative;overflow:hidden">'
    + '<div class="card-header">'
    + '<span class="card-meta">' + record.date + ' ' + record.time + ' · ' + record.duration + '</span>'
    + '<div class="card-actions">'
    + microBtnHtml
    + '<button class="btn-del" onclick="' + delOnclick + '">✕</button>'
    + '</div>'
    + '</div>'
    + '<div class="card-rate">'
    + '<span class="card-rate-val score-display" style="color:' + (isBull ? '#f97316' : '#a855f7') + '">' + rateVal + '</span>'
    + '<span class="card-rate-label font-label"> ' + rateLabel + '</span>'
    + '</div>'
    + '<div class="card-summary font-label">' + summaryLine + '</div>'
    + breakdownHtml
    + microHtml
    + watermarkHtml
    + '</div>';
}

function renderInsights() {
  var isAll    = insightHistoryTab === 'all';
  var isBull   = insightHistoryTab === 'bull';
  var allBPR   = getAllTimeBPR();
  var allMPR   = getAllTimeMPR();
  var sesTime  = getTotalSessionTime();

  var totalDarts = 0;
  for (var tdi = 0; tdi < window.ocheHistory.length; tdi++) {
    totalDarts += (window.ocheHistory[tdi].rounds || 0) * 3;
  }
  for (var tdj = 0; tdj < window.cricketHistory.length; tdj++) {
    totalDarts += (window.cricketHistory[tdj].rounds || 0) * 3;
  }

  // Trend arrows — compare avg of last 3 sessions vs previous 3
  var bprArrow = '', bprArrowColor = '';
  if (window.ocheHistory.length >= 4) {
    var bHist    = window.ocheHistory;
    var bLast3   = bHist.slice(-3);
    var bPrev    = bHist.slice(0, bHist.length - 3).slice(-3);
    var bLastAvg = (bLast3[0].bpr + bLast3[1].bpr + bLast3[2].bpr) / 3;
    var bPrevSum = 0;
    for (var bi = 0; bi < bPrev.length; bi++) { bPrevSum += bPrev[bi].bpr; }
    var bPrevAvg = bPrevSum / bPrev.length;
    if (bLastAvg > bPrevAvg)      { bprArrow = '▲'; bprArrowColor = '#4ade80'; }
    else if (bLastAvg < bPrevAvg) { bprArrow = '▼'; bprArrowColor = '#f87171'; }
  }
  var mprArrow = '', mprArrowColor = '';
  if (window.cricketHistory.length >= 4) {
    var cHist    = window.cricketHistory;
    var cLast3   = cHist.slice(-3);
    var cPrev    = cHist.slice(0, cHist.length - 3).slice(-3);
    var cLastAvg = (cLast3[0].mpr + cLast3[1].mpr + cLast3[2].mpr) / 3;
    var cPrevSum = 0;
    for (var ci = 0; ci < cPrev.length; ci++) { cPrevSum += cPrev[ci].mpr; }
    var cPrevAvg = cPrevSum / cPrev.length;
    if (cLastAvg > cPrevAvg)      { mprArrow = '▲'; mprArrowColor = '#4ade80'; }
    else if (cLastAvg < cPrevAvg) { mprArrow = '▼'; mprArrowColor = '#f87171'; }
  }

  var nicknameHtml = window.editingNickname
    ? ('<input type="text" id="nickname-input" class="nickname-input"'
      + ' value="' + window.settings.nickname + '"'
      + ' onblur="saveNickname(this.value)"'
      + ' onkeydown="if(event.key===\'Enter\'){saveNickname(this.value)}"'
      + ' autofocus />')
    : ('<div class="nickname-display font-label" onclick="startEditNickname()">'
      + window.settings.nickname
      + '</div>');

  var bprValHtml = (bprArrow ? '<span style="color:' + bprArrowColor + ';font-size:0.75em;margin-right:2px">' + bprArrow + '</span>' : '')
    + '<span style="color:#f97316">' + allBPR.toFixed(2) + '</span>';
  var mprValHtml = (mprArrow ? '<span style="color:' + mprArrowColor + ';font-size:0.75em;margin-right:2px">' + mprArrow + '</span>' : '')
    + '<span style="color:#a855f7">' + allMPR.toFixed(2) + '</span>';

  var profileCard = '<div class="profile-card">'
    + nicknameHtml
    + '<div class="profile-stats">'
    + '<div class="profile-stat">'
    + '<div class="profile-stat-val score-display">' + bprValHtml + '</div>'
    + '<div class="profile-stat-label font-label">ALL-TIME BPR</div>'
    + '</div>'
    + '<div class="profile-stat">'
    + '<div class="profile-stat-val score-display">' + mprValHtml + '</div>'
    + '<div class="profile-stat-label font-label">ALL-TIME MPR</div>'
    + '</div>'
    + '<div class="profile-stat">'
    + '<div class="profile-stat-val score-display">' + sesTime + '</div>'
    + '<div class="profile-stat-label font-label">SESSION TIME</div>'
    + '</div>'
    + '<div class="profile-stat">'
    + '<div class="profile-stat-val score-display">' + totalDarts + '</div>'
    + '<div class="profile-stat-label font-label">TOTAL DARTS</div>'
    + '</div>'
    + '</div>'
    + '<div class="growth-toggle font-label"'
    + ' ontouchstart="toggleGrowthChart();event.preventDefault()"'
    + ' onclick="toggleGrowthChart()">'
    + (growthChartExpanded ? '▲' : '▼') + ' GROWTH CHART'
    + '</div>'
    + (growthChartExpanded
      ? '<div class="growth-chart-wrap"><canvas id="macro-chart" height="140"></canvas></div>'
      : '')
    + '</div>';

  var tabsHtml = '<div class="history-tabs" style="max-width:none">'
    + '<button class="tab-btn' + (isAll ? ' tab-active' : '') + '"'
    + ' onclick="switchInsightTab(\'all\')">ALL</button>'
    + '<button class="tab-btn' + (isBull ? ' tab-active' : '') + '"'
    + ' onclick="switchInsightTab(\'bull\')">BULL</button>'
    + '<button class="tab-btn' + (insightHistoryTab === 'cricket' ? ' tab-active' : '') + '"'
    + ' onclick="switchInsightTab(\'cricket\')">CRICKET</button>'
    + '</div>';

  var cardsHtml = '';
  if (isAll) {
    var allMerged = [];
    for (var ai = 0; ai < window.ocheHistory.length; ai++) {
      allMerged.push({ record: window.ocheHistory[ai], isBull: true, origIndex: ai });
    }
    for (var ci2 = 0; ci2 < window.cricketHistory.length; ci2++) {
      allMerged.push({ record: window.cricketHistory[ci2], isBull: false, origIndex: ci2 });
    }
    allMerged.sort(function(a, b) {
      var ap = a.record.date.split('/'), at2 = a.record.time.split(':');
      var bp = b.record.date.split('/'), bt2 = b.record.time.split(':');
      var aMs = new Date(parseInt(ap[2],10), parseInt(ap[1],10)-1, parseInt(ap[0],10), parseInt(at2[0],10), parseInt(at2[1],10)).getTime();
      var bMs = new Date(parseInt(bp[2],10), parseInt(bp[1],10)-1, parseInt(bp[0],10), parseInt(bt2[0],10), parseInt(bt2[1],10)).getTime();
      return bMs - aMs;
    });
    if (allMerged.length === 0) {
      cardsHtml = '<div class="no-history font-label">No sessions recorded yet</div>';
    } else {
      for (var mi = 0; mi < allMerged.length; mi++) {
        var item = allMerged[mi];
        cardsHtml += buildHistoryCard(item.record, item.origIndex, item.isBull, item.isBull ? 'bull' : 'cricket');
      }
    }
  } else {
    var arr = isBull ? window.ocheHistory : window.cricketHistory;
    if (arr.length === 0) {
      cardsHtml = '<div class="no-history font-label">No sessions recorded yet</div>';
    } else {
      for (var i = arr.length - 1; i >= 0; i--) {
        cardsHtml += buildHistoryCard(arr[i], i, isBull);
      }
    }
  }

  return headerBarHTML()
    + '<div class="insights-scroll">'
    + profileCard
    + '<div id="heatmap-card-wrap">' + buildHeatmapCard() + '</div>'
    + tabsHtml
    + '<div class="history-list">' + cardsHtml + '</div>'
    + (!isAll ? '<button class="btn-clear-history font-label" onclick="clearHistory()">CLEAR HISTORY</button>' : '')
    + '</div>';
}

window.render = function() {
  applyModeClass();
  var app = document.getElementById('app');
  if (!app) return;

  var modalEl = document.getElementById('settings-modal');
  if (modalEl) { modalEl.classList.remove('open'); modalEl.innerHTML = ''; }

  if (window.currentView === 'practice') {
    var bullDone    = window.appMode === 'bull'    && getTotalBulls()              >= window.settings.defaultTarget;
    var cricketDone = window.appMode === 'cricket' && window.cricketRounds.length >= window.settings.cricketRounds;
    if (bullDone || cricketDone) {
      window.rounds           = [];
      window.cricketRounds    = [];
      window.sessionStartTime = null;
    }
  }

  if (sessionChartInst) { sessionChartInst.destroy(); sessionChartInst = null; }
  if (macroChartInst)   { macroChartInst.destroy();   macroChartInst   = null; }
  if (microChartInst)   { microChartInst.destroy();   microChartInst   = null; }
  openMicroIndex = -1;

  if (window.currentView === 'practice') {
    app.innerHTML = renderPractice();
  } else if (window.currentView === 'summary') {
    app.innerHTML = renderSummary();
  } else {
    app.innerHTML = renderInsights();
  }

  app.classList.remove('view-enter');
  void app.offsetWidth;
  app.classList.add('view-enter');

  if (window.currentView === 'summary') {
    var isBull    = window.appMode === 'bull';
    var rawRounds = isBull ? window.rounds : window.cricketRounds;
    if (rawRounds.length > 0) {
      renderSessionChart('session-chart', rawRounds, isBull);
    }
    setTimeout(function() { punchScore(); }, 50);
  }

  if (window.currentView === 'insights' && growthChartExpanded) {
    var isCricket = insightHistoryTab === 'cricket';
    renderMacroChart('macro-chart', isCricket ? window.cricketHistory : window.ocheHistory, isCricket);
  }

  if (window.currentView === 'insights' && window.editingNickname) {
    var ni = document.getElementById('nickname-input');
    if (ni) { ni.focus(); ni.select(); }
  }
};
