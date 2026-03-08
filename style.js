/* =============================================
   MOODBLOOM — Centralized State & Logic Engine
   style.js (shared across all pages)
   ============================================= */

'use strict';

// ── Mood Definitions ──────────────────────────────────────────────────────────
const MOODS = {
  joyful:   { label: 'Joyful',   emoji: '😄', color: '#f9c74f', score: 9 },
  hopeful:  { label: 'Hopeful',  emoji: '🌱', color: '#43aa8b', score: 8 },
  calm:     { label: 'Calm',     emoji: '😌', color: '#90be6d', score: 7 },
  neutral:  { label: 'Neutral',  emoji: '😐', color: '#adb5bd', score: 5 },
  anxious:  { label: 'Anxious',  emoji: '😰', color: '#f8961e', score: 4 },
  stressed: { label: 'Stressed', emoji: '😤', color: '#e76f51', score: 3 },
  sad:      { label: 'Sad',      emoji: '😢', color: '#577590', score: 2 },
  angry:    { label: 'Angry',    emoji: '😠', color: '#f94144', score: 1 },
};

// ── Storage Keys ──────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  entries:  'moodbloom_entries',
  journals: 'moodbloom_journals',
  settings: 'moodbloom_settings',
};

// ── Stopwords for NLP ─────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'i','me','my','myself','we','our','ours','you','your','he','she','it',
  'they','them','their','what','which','who','this','that','these','those',
  'am','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'a','an','the','and','but','or','nor','so','yet','for','at','by','in',
  'of','on','to','up','as','if','than','then','with','from','into','about',
  'not','no','very','just','can','get','got','got','also','had','its',
  'was','were','im','ive','dont','cant','its','thats','there','their',
  'when','where','how','all','any','more','some','such','while','after',
  'feel','felt','feeling','really','today','day','week','time','like',
]);

// ── Sentiment Lexicon (rule-based) ────────────────────────────────────────────
const SENTIMENT = {
  positive: ['happy','great','good','wonderful','amazing','love','joy','peace',
             'excited','grateful','blessed','beautiful','proud','confident','strong',
             'hopeful','inspired','calm','relax','enjoy','fun','laugh','smile',
             'better','best','fantastic','excellent','positive','bright','success',
             'thankful','content','fulfilled','energetic','motivated','relieved'],
  negative: ['sad','bad','terrible','awful','hate','angry','anxious','stress',
             'worried','fear','scared','nervous','upset','angry','frustrated',
             'tired','exhausted','hopeless','depressed','lonely','lost','pain',
             'hurt','difficult','hard','struggle','fail','fail','worse','worst',
             'disappointed','overwhelmed','cry','scared','dread','regret','guilty'],
};

// ── Central State Manager ─────────────────────────────────────────────────────
const State = (() => {
  let _entries  = [];
  let _journals = {};
  let _listeners = [];

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.entries);
      _entries = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(_entries)) _entries = [];
    } catch { _entries = []; }

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.journals);
      _journals = raw ? JSON.parse(raw) : {};
      if (typeof _journals !== 'object') _journals = {};
    } catch { _journals = {}; }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEYS.entries,  JSON.stringify(_entries));
      localStorage.setItem(STORAGE_KEYS.journals, JSON.stringify(_journals));
    } catch (e) {
      console.warn('MoodBloom: storage write failed', e);
    }
    _listeners.forEach(fn => fn());
  }

  return {
    init() { _load(); },

    // ── Entry CRUD ──────────────────────────────────────────────────────────
    addEntry(entry) {
      const rec = {
        id:         Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        date:       entry.date        || today(),
        mood:       entry.mood        || 'neutral',
        intensity:  entry.intensity   || 5,
        note:       (entry.note       || '').trim().slice(0, 280),
        reflection: (entry.reflection || '').trim(),
        createdAt:  new Date().toISOString(),
      };
      // Replace if same date exists, else push
      const idx = _entries.findIndex(e => e.date === rec.date);
      if (idx >= 0) _entries[idx] = rec;
      else _entries.push(rec);
      _entries.sort((a,b) => b.date.localeCompare(a.date));
      _save();
      return rec;
    },

    deleteEntry(id) {
      _entries = _entries.filter(e => e.id !== id);
      _save();
    },

    getEntry(id)         { return _entries.find(e => e.id === id) || null; },
    getEntryByDate(date) { return _entries.find(e => e.date === date) || null; },
    getAllEntries()       { return [..._entries]; },

    // ── Journal ────────────────────────────────────────────────────────────
    saveJournal(date, text) {
      _journals[date] = { text: text.trim(), updatedAt: new Date().toISOString() };
      _save();
    },
    getJournal(date)  { return (_journals[date] || {}).text || ''; },
    getAllJournals()   { return { ..._journals }; },

    // ── Subscribe ──────────────────────────────────────────────────────────
    subscribe(fn) { _listeners.push(fn); },

    // ── Clear ──────────────────────────────────────────────────────────────
    clearAll() {
      _entries = []; _journals = {};
      try { Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k)); } catch {}
      _listeners.forEach(fn => fn());
    },
  };
})();

// ── Analytics Engine ──────────────────────────────────────────────────────────
const Analytics = {

  // Weekly summary for a given Monday–Sunday window (defaults to current week)
  weeklySummary(entries, weekStart) {
    if (!weekStart) weekStart = getWeekStart(today());
    const weekEnd   = addDays(weekStart, 6);
    const week      = entries.filter(e => e.date >= weekStart && e.date <= weekEnd);

    if (!week.length) return null;

    const moodCounts = {};
    let scoreSum = 0, best = null, bestScore = -1;

    week.forEach(e => {
      const m = MOODS[e.mood] || MOODS.neutral;
      moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      const score = m.score * (e.intensity / 5);
      scoreSum += score;
      if (score > bestScore) { bestScore = score; best = e; }
    });

    const sorted     = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1]);
    const dominant   = sorted[0]?.[0] || 'neutral';
    const avgScore   = +(scoreSum / week.length).toFixed(1);

    return { week, moodCounts, dominant, avgScore, bestDay: best, total: week.length };
  },

  // Monthly summary
  monthlySummary(entries, year, month) {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    const mo     = entries.filter(e => e.date.startsWith(prefix));
    if (!mo.length) return null;
    return this.weeklySummary(mo, mo[mo.length-1].date); // reuse calc
  },

  // Trend: compare last N vs preceding N
  trendAnalysis(entries, n = 5) {
    if (entries.length < 3) return { trend: 'insufficient', label: 'Need more data', direction: 'stable' };

    const recent = entries.slice(0, n);
    const prior  = entries.slice(n, n * 2);

    const avg = arr => arr.reduce((s,e) => {
      const m = MOODS[e.mood] || MOODS.neutral;
      return s + m.score * (e.intensity / 5);
    }, 0) / arr.length;

    const recentAvg = avg(recent);
    const priorAvg  = prior.length ? avg(prior) : recentAvg;
    const delta     = recentAvg - priorAvg;

    if (delta >  0.8) return { trend: 'improving', label: 'Improving',   direction: 'up',     delta };
    if (delta < -0.8) return { trend: 'declining', label: 'Declining',   direction: 'down',   delta };
    return              { trend: 'stable',    label: 'Stable',      direction: 'stable', delta };
  },

  // Volatility index (0–10)
  volatilityIndex(entries, n = 10) {
    const slice = entries.slice(0, n);
    if (slice.length < 2) return 0;
    let sumDiff = 0;
    for (let i = 0; i < slice.length - 1; i++) {
      const a = (MOODS[slice[i].mood]   || MOODS.neutral).score;
      const b = (MOODS[slice[i+1].mood] || MOODS.neutral).score;
      sumDiff += Math.abs(a - b);
    }
    return +Math.min(10, (sumDiff / (slice.length - 1)) * (10/8)).toFixed(1);
  },

  // Dominant emotion pattern over N entries
  dominantPattern(entries, n = 14) {
    const counts = {};
    entries.slice(0, n).forEach(e => {
      counts[e.mood] = (counts[e.mood] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([mood,cnt]) => ({ mood, cnt }));
  },

  // Logging consistency (%) over last 14 days
  consistency(entries, days = 14) {
    const dates = new Set(entries.map(e => e.date));
    let logged = 0;
    for (let i = 0; i < days; i++) {
      if (dates.has(addDays(today(), -i))) logged++;
    }
    return Math.round((logged / days) * 100);
  },

  // Keyword correlation: top words per mood
  keywordCorrelation(entries) {
    const byMood = {};
    entries.forEach(e => {
      if (!e.reflection) return;
      if (!byMood[e.mood]) byMood[e.mood] = [];
      byMood[e.mood].push(...tokenize(e.reflection));
    });
    const result = {};
    Object.entries(byMood).forEach(([mood, words]) => {
      const freq = wordFreq(words);
      result[mood] = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w]) => w);
    });
    return result;
  },

  // Sentiment score for text (-1 to +1)
  sentimentScore(text) {
    if (!text) return 0;
    const words = tokenize(text);
    let pos = 0, neg = 0;
    words.forEach(w => {
      if (SENTIMENT.positive.includes(w)) pos++;
      if (SENTIMENT.negative.includes(w)) neg++;
    });
    const total = pos + neg;
    if (!total) return 0;
    return +((pos - neg) / total).toFixed(2);
  },

  // Predict next-day mood (weighted last 5)
  predictNextMood(entries) {
    if (!entries.length) return null;
    const slice = entries.slice(0, 5);
    const weights = [5, 4, 3, 2, 1];
    const scores  = {};
    slice.forEach((e, i) => {
      const w = weights[i] || 1;
      scores[e.mood] = (scores[e.mood] || 0) + w;
    });
    return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'neutral';
  },

  // Word frequency from all reflections
  allWordFreq(entries) {
    const words = [];
    entries.forEach(e => {
      if (e.reflection) words.push(...tokenize(e.reflection));
      if (e.note)       words.push(...tokenize(e.note));
    });
    return wordFreq(words);
  },

  // Generate insight messages
  generateInsights(entries) {
    const insights = [];
    if (!entries.length) return insights;

    const trend       = this.trendAnalysis(entries);
    const volatility  = this.volatilityIndex(entries);
    const consistency = this.consistency(entries);
    const predicted   = this.predictNextMood(entries);
    const domPatterns = this.dominantPattern(entries);
    const domMood     = domPatterns[0]?.mood || 'neutral';
    const moodDef     = MOODS[domMood] || MOODS.neutral;

    // Trend insight
    if (trend.trend === 'improving') {
      insights.push({ type:'positive', icon:'🌱', title:'You\'re on an upward trend', text:`Your mood has been improving over recent entries. Keep nurturing what's working for you.` });
    } else if (trend.trend === 'declining') {
      insights.push({ type:'warning', icon:'🌧️', title:'Mood seems to be dipping', text:'Your recent entries show a downward trend. This is a good time to be gentle with yourself and reach out if needed.' });
    } else if (trend.trend === 'stable') {
      insights.push({ type:'neutral', icon:'⚖️', title:'Emotionally steady', text:'Your mood has been relatively stable lately. Consistency is a form of strength.' });
    }

    // Consistency insight
    if (consistency >= 80) {
      insights.push({ type:'positive', icon:'🏆', title:'Excellent logging streak', text:`You've logged ${consistency}% of the past 14 days. Consistent reflection is a superpower for emotional awareness.` });
    } else if (consistency < 40) {
      insights.push({ type:'info', icon:'📝', title:'Try logging more regularly', text:'Regular mood logging helps you spot patterns. Even a 30-second entry makes a difference.' });
    }

    // Volatility insight
    if (volatility >= 6) {
      insights.push({ type:'warning', icon:'🌊', title:'High emotional variability', text:`Your emotional volatility index is ${volatility}/10. High swings may indicate stress or big life changes — journaling can help process them.` });
    } else if (volatility <= 2) {
      insights.push({ type:'info', icon:'🪨', title:'Very stable emotional baseline', text:`Your volatility index is ${volatility}/10 — remarkably stable. Make sure to check in with all your emotions.` });
    }

    // Dominant mood
    insights.push({ type:'info', icon: moodDef.emoji, title:`Your dominant mood: ${moodDef.label}`, text:`Over recent entries, "${moodDef.label}" appears most frequently. Notice what circumstances surround this emotion.` });

    // Prediction
    if (predicted) {
      const pm = MOODS[predicted];
      insights.push({ type:'neutral', icon:'🔮', title:'Tomorrow\'s mood forecast', text:`Based on your recent patterns, you may feel ${pm?.label || predicted} tomorrow. This is a gentle heads-up, not a verdict.` });
    }

    return insights;
  },
};

// ── Date Utilities ─────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0,10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0,10);
}

function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: opts.weekday || undefined,
    year:    opts.year    || 'numeric',
    month:   opts.month   || 'long',
    day:     opts.day     || 'numeric',
    ...opts,
  });
}

function formatDateShort(dateStr) {
  return formatDate(dateStr, { month:'short', day:'numeric', year:'numeric' });
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

// ── NLP Utilities ─────────────────────────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^'+|'+$/g,''))
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function wordFreq(words) {
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return freq;
}

// ── UI Utilities ──────────────────────────────────────────────────────────────
function showToast(msg, type = 'success', duration = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  toast.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function setActivePage(page) {
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}

function getMoodStyle(moodKey) {
  const m = MOODS[moodKey] || MOODS.neutral;
  return { bg: m.color + '22', border: m.color + '66', color: m.color };
}

function buildMoodChip(moodKey, intensity) {
  const m = MOODS[moodKey] || MOODS.neutral;
  const chip = document.createElement('span');
  chip.className = 'mood-chip';
  chip.style.cssText = `background:${m.color}22;color:${m.color};border:1px solid ${m.color}44`;
  chip.innerHTML = `${m.emoji} ${m.label}${intensity ? ` · ${intensity}/10` : ''}`;
  return chip;
}

function buildInsightCard(insight) {
  const div = document.createElement('div');
  div.className = `insight-card ${insight.type}`;
  div.innerHTML = `
    <div class="insight-icon">${insight.icon}</div>
    <div>
      <div class="insight-title">${insight.title}</div>
      <div class="insight-text">${insight.text}</div>
    </div>`;
  return div;
}

function buildWordCloud(freqObj, container, maxWords = 40) {
  container.innerHTML = '';
  const sorted = Object.entries(freqObj).sort((a,b)=>b[1]-a[1]).slice(0, maxWords);
  if (!sorted.length) {
    container.innerHTML = '<span class="text-muted text-sm">No words yet — write some reflections!</span>';
    return;
  }
  const max = sorted[0][1];
  sorted.forEach(([word, count]) => {
    const span = document.createElement('span');
    const size = 0.75 + (count / max) * 1.4;
    span.className = 'word-tag';
    span.style.fontSize = size + 'rem';
    span.style.opacity  = 0.5 + (count / max) * 0.5;
    span.textContent    = word;
    span.title          = `"${word}" appears ${count}x`;
    container.appendChild(span);
  });
}

function buildBarChart(container, data) {
  // data: [{label, count, color}]
  container.innerHTML = '';
  const max = Math.max(...data.map(d => d.count), 1);
  data.forEach(({ label, count, color }) => {
    const pct = Math.round((count / max) * 100);
    container.innerHTML += `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${color || 'var(--sage-light)'}"></div>
        </div>
        <span class="bar-count">${count}</span>
      </div>`;
  });
}

// ── Exportable Report ─────────────────────────────────────────────────────────
function exportReport(entries) {
  if (!entries.length) { showToast('No entries to export', 'warning'); return; }
  const summary  = Analytics.weeklySummary(entries);
  const trend    = Analytics.trendAnalysis(entries);
  const vol      = Analytics.volatilityIndex(entries);
  const consist  = Analytics.consistency(entries);
  const patterns = Analytics.dominantPattern(entries);

  let txt = `MOODBLOOM EMOTIONAL WELLNESS REPORT\n`;
  txt += `Generated: ${new Date().toLocaleString()}\n`;
  txt += `${'─'.repeat(50)}\n\n`;
  txt += `OVERVIEW\n`;
  txt += `Total Entries: ${entries.length}\n`;
  txt += `Date Range: ${entries[entries.length-1].date} → ${entries[0].date}\n`;
  txt += `Consistency (last 14 days): ${consist}%\n`;
  txt += `Trend: ${trend.label}\n`;
  txt += `Volatility Index: ${vol}/10\n\n`;
  txt += `MOOD DISTRIBUTION\n`;
  patterns.forEach(({ mood, cnt }) => {
    const m = MOODS[mood] || MOODS.neutral;
    txt += `  ${m.emoji} ${m.label}: ${cnt} entries\n`;
  });
  txt += `\nRECENT ENTRIES\n`;
  entries.slice(0,20).forEach(e => {
    const m = MOODS[e.mood] || MOODS.neutral;
    txt += `\n[${e.date}] ${m.emoji} ${m.label} (intensity: ${e.intensity}/10)\n`;
    if (e.note)       txt += `  Note: ${e.note}\n`;
    if (e.reflection) txt += `  Reflection: ${e.reflection}\n`;
  });

  const blob = new Blob([txt], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `moodbloom-report-${today()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report downloaded!', 'success');
}

// ── Initialise ─────────────────────────────────────────────────────────────────
State.init();
