/* ==========================================================================
   Emotion 26 — schedule app
   No framework, no build step. Runs from any static host or a file:// copy.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Model: flatten FESTIVAL.schedule into a sorted list of set objects.
     A set runs until the next entry on the same stage/day. Entries with a
     null artist are "stage closed" markers and only serve as end times.
     Any start time before 06:00 belongs to the following calendar morning.
     ------------------------------------------------------------------- */

  function parseDate(iso, hhmm) {
    var d = iso.split('-').map(Number);
    var t = hhmm.split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
  }

  /* Entries are listed in running order, so any time that isn't later than the
     one before it belongs to the next calendar day. That's how 11pm → 12am →
     2:30am on "Friday" lands on Saturday morning without anyone having to
     write dates into the schedule. */
  function resolveDay(dateIso, rows) {
    var prev = null;
    return rows.map(function (r) {
      var at = parseDate(dateIso, r[0]);
      while (prev && at <= prev) at.setDate(at.getDate() + 1);
      prev = at;
      return { at: at, time: r[0], artist: r[1], note: r[2] || '' };
    });
  }

  function buildSets() {
    var out = [];
    FESTIVAL.stages.forEach(function (stage) {
      var byDay = FESTIVAL.schedule[stage.id] || {};
      FESTIVAL.days.forEach(function (day) {
        var resolved = resolveDay(day.date, byDay[day.id] || []);

        resolved.forEach(function (row, i) {
          if (!row.artist) return;                       // closed marker
          var next = resolved[i + 1];
          var end = next ? next.at : new Date(row.at.getTime() + 60 * 60 * 1000);
          out.push({
            id: stage.id + '|' + day.id + '|' + row.time,
            stageId: stage.id,
            stage: stage,
            dayId: day.id,
            day: day,
            artist: row.artist,
            note: row.note,
            start: row.at,
            end: end
          });
        });
      });
    });
    out.sort(function (a, b) { return a.start - b.start || a.stage.name.localeCompare(b.stage.name); });
    return out;
  }

  var SETS = buildSets();
  var SETS_BY_ID = {};
  SETS.forEach(function (s) { SETS_BY_ID[s.id] = s; });

  var STAGE_BY_ID = {};
  FESTIVAL.stages.forEach(function (s) { STAGE_BY_ID[s.id] = s; });

  /* ---------------------------------------------------------------------
     Persisted state
     ------------------------------------------------------------------- */

  var STORE_KEY = 'emotion26.v1';

  /* The stages that existed when filters were stored as a shown-list. Only used
     to migrate those old saves; don't add to it. */
  var STAGES_V1 = ['main', 'tree', 'ocul', 'noto', 'oil'];

  var state = {
    day: FESTIVAL.days[0].id,
    view: 'stages',
    stages: FESTIVAL.stages.map(function (s) { return s.id; }), // visible
    picks: {},            // setId -> true
    notify: false,
    lead: 10,
    theme: 'dark',
    clock: '12',
    hidePast: false,
    installDismissed: false,
    query: ''
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      ['day', 'view', 'notify', 'lead', 'theme', 'clock', 'hidePast', 'installDismissed'].forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
      /* Stage filters are stored as what's HIDDEN, not what's shown, so a stage
         added after someone last opened the app is visible to them instead of
         silently filtered out. `saved.stages` is the old shown-list format:
         migrate it by hiding only the stages that existed back then and were
         switched off. */
      var hidden = null;
      if (Array.isArray(saved.hidden)) {
        hidden = saved.hidden;
      } else if (Array.isArray(saved.stages) && saved.stages.length) {
        hidden = STAGES_V1.filter(function (id) { return saved.stages.indexOf(id) === -1; });
      }
      if (hidden) {
        var shown = FESTIVAL.stages
          .map(function (s) { return s.id; })
          .filter(function (id) { return hidden.indexOf(id) === -1; });
        if (shown.length) state.stages = shown;
      }
      if (saved.picks) {
        // drop picks whose set no longer exists (schedule edited)
        Object.keys(saved.picks).forEach(function (id) {
          if (SETS_BY_ID[id]) state.picks[id] = true;
        });
      }
    } catch (e) { /* storage blocked or corrupt — carry on with defaults */ }
  }

  function save() {
    try {
      var hidden = FESTIVAL.stages
        .map(function (s) { return s.id; })
        .filter(function (id) { return state.stages.indexOf(id) === -1; });

      localStorage.setItem(STORE_KEY, JSON.stringify({
        day: state.day, view: state.view, hidden: hidden, picks: state.picks,
        notify: state.notify, lead: state.lead, theme: state.theme,
        clock: state.clock, hidePast: state.hidePast,
        installDismissed: state.installDismissed
      }));
    } catch (e) { /* private mode — picks just won't survive a reload */ }
  }

  /* ---------------------------------------------------------------------
     Share links: picks encoded in the URL hash, no server involved.
     ------------------------------------------------------------------- */

  /* Picks travel as their own ids (stage.day.time), not as positions in the
     set list — adding a stage or fixing a time would otherwise silently point
     an already-shared link at the wrong sets. */
  function encodePicks() {
    return SETS.filter(function (s) { return state.picks[s.id]; })
      .map(function (s) { return s.stageId + '.' + s.dayId + '.' + s.start.getHours() +
                                 '-' + s.start.getMinutes(); })
      .join('_');
  }

  function applyPicksFromHash() {
    var hash = location.hash || '';

    // Links made before picks were id-encoded carried list positions, which no
    // longer mean anything. Better to say so than to restore the wrong sets.
    if (/(?:^|[#&])p=/.test(hash)) {
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(function () {
        toast('That share link is from an older version — ask for a fresh one');
      }, 600);
      return false;
    }

    var m = /(?:^|[#&])s=([^&]*)/.exec(hash);
    if (!m) return false;

    var byKey = {};
    SETS.forEach(function (s) {
      byKey[s.stageId + '.' + s.dayId + '.' + s.start.getHours() + '-' + s.start.getMinutes()] = s;
    });

    var incoming = {};
    decodeURIComponent(m[1]).split('_').forEach(function (k) {
      var s = byKey[k];
      if (s) incoming[s.id] = true;
    });
    var count = Object.keys(incoming).length;
    if (!count) return false;
    var mine = Object.keys(state.picks).length;
    var merge = !mine || confirm(
      'This link has ' + count + ' picked set' + (count === 1 ? '' : 's') +
      '.\n\nOK = add them to your ' + mine + ' picks.\nCancel = replace your picks with theirs.'
    );
    if (!merge) state.picks = {};
    Object.keys(incoming).forEach(function (id) { state.picks[id] = true; });
    history.replaceState(null, '', location.pathname + location.search);
    save();
    return true;
  }

  /* ---------------------------------------------------------------------
     Formatting
     ------------------------------------------------------------------- */

  function fmtTime(d) {
    var h = d.getHours(), m = d.getMinutes();
    if (state.clock === '24') return pad(h) + ':' + pad(m);
    var ap = h < 12 ? 'am' : 'pm';
    var h12 = h % 12 || 12;
    return h12 + (m ? ':' + pad(m) : '') + ap;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDateShort(iso) {
    var d = iso.split('-').map(Number);
    var dt = new Date(d[0], d[1] - 1, d[2]);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function fmtRange(s) {
    return fmtTime(s.start) + ' – ' + fmtTime(s.end);
  }

  function durationMin(s) { return Math.round((s.end - s.start) / 60000); }

  /* ---------------------------------------------------------------------
     Live status
     ------------------------------------------------------------------- */

  var now = new Date();
  function refreshNow() { now = new Date(); }

  function isLive(s) { return s.start <= now && now < s.end; }
  function isPast(s) { return s.end <= now; }

  /* Which festival day is "today"? Nights roll over, so a set that started
     Friday at 11pm still counts as Friday until 6am. */
  function currentDayId() {
    for (var i = 0; i < FESTIVAL.days.length; i++) {
      var d = FESTIVAL.days[i];
      var from = parseDate(d.date, '06:00');
      var to = new Date(from.getTime() + 24 * 3600 * 1000);
      if (now >= from && now < to) return d.id;
    }
    return null;
  }

  /* ---------------------------------------------------------------------
     Selectors
     ------------------------------------------------------------------- */

  function stageVisible(id) { return state.stages.indexOf(id) !== -1; }

  function matchesQuery(s) {
    if (!state.query) return true;
    return s.artist.toLowerCase().indexOf(state.query) !== -1 ||
           s.stage.name.toLowerCase().indexOf(state.query) !== -1 ||
           (s.note && s.note.toLowerCase().indexOf(state.query) !== -1);
  }

  var hiddenCount = 0;      // how many finished sets the last query dropped

  function setsForDay(dayId) {
    var all = SETS.filter(function (s) {
      return s.dayId === dayId && stageVisible(s.stageId) && matchesQuery(s);
    });
    hiddenCount = 0;
    if (!state.hidePast) return all;

    var live = all.filter(function (s) { return !isPast(s); });

    // On a day that's entirely over, hiding finished sets would leave a blank
    // screen. Show the day instead — nobody opens Friday on Sunday by accident.
    if (!live.length) return all;

    hiddenCount = all.length - live.length;
    return live;
  }

  function pickedSets() {
    return SETS.filter(function (s) { return state.picks[s.id]; });
  }

  /* Two picks on different stages that overlap in time = a clash. */
  function clashIds() {
    var picks = pickedSets(), bad = {};
    for (var i = 0; i < picks.length; i++) {
      for (var j = i + 1; j < picks.length; j++) {
        if (picks[i].stageId === picks[j].stageId) continue;
        if (picks[i].start < picks[j].end && picks[j].start < picks[i].end) {
          bad[picks[i].id] = true; bad[picks[j].id] = true;
        }
      }
    }
    return bad;
  }

  /* ---------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------- */

  var $ = function (sel) { return document.querySelector(sel); };
  var viewEl = $('#view');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderDays() {
    var wrap = $('#days');
    wrap.innerHTML = '';
    var today = currentDayId();
    FESTIVAL.days.forEach(function (d) {
      var b = el('button', 'day-tab' + (d.id === today ? ' is-today' : ''));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(d.id === state.day));
      b.appendChild(el('div', 'd-name', d.short));
      b.appendChild(el('div', 'd-date', fmtDateShort(d.date)));
      b.addEventListener('click', function () {
        state.day = d.id; save(); render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      wrap.appendChild(b);
    });
  }

  function renderStageFilters() {
    var wrap = $('#stageFilters');
    wrap.innerHTML = '';

    /* Hiding finished sets is the single most-wanted filter once a day is
       under way, so it sits on the main screen rather than in Settings. */
    var past = el('button', 'chip chip-time');
    past.setAttribute('aria-pressed', String(state.hidePast));
    past.appendChild(document.createTextNode(state.hidePast ? '⏳ Upcoming only' : '⏳ Hide finished'));
    past.addEventListener('click', function () {
      state.hidePast = !state.hidePast;
      save(); render();
      toast(state.hidePast ? 'Finished sets hidden' : 'Showing the whole day');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    wrap.appendChild(past);

    var all = el('button', 'chip', FESTIVAL.stages.length === state.stages.length ? 'All stages' : 'Show all');
    all.setAttribute('aria-pressed', String(FESTIVAL.stages.length === state.stages.length));
    all.addEventListener('click', function () {
      state.stages = FESTIVAL.stages.map(function (s) { return s.id; });
      save(); render();
    });
    wrap.appendChild(all);

    FESTIVAL.stages.forEach(function (s) {
      var on = stageVisible(s.id);
      var b = el('button', 'chip');
      b.style.color = on ? s.color : '';
      b.setAttribute('aria-pressed', String(on));
      var dot = el('span', 'dot');
      dot.style.background = s.color;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(s.short));
      b.addEventListener('click', function () {
        if (on) {
          if (state.stages.length === 1) { toast('At least one stage has to stay on'); return; }
          state.stages = state.stages.filter(function (x) { return x !== s.id; });
        } else {
          state.stages = state.stages.concat([s.id]);
        }
        save(); render();
      });
      wrap.appendChild(b);
    });
  }

  function setRow(s, opts) {
    opts = opts || {};
    var live = isLive(s), past = isPast(s), picked = !!state.picks[s.id];

    var row = el('div', 'set' +
      (live ? ' is-live' : '') + (past ? ' is-past' : '') + (picked ? ' is-picked' : ''));
    row.style.setProperty('--sc', s.stage.color);

    var t = el('div', 's-time', fmtTime(s.start));
    t.appendChild(el('span', 's-end', fmtTime(s.end)));
    row.appendChild(t);

    var body = el('div', 's-body');
    body.appendChild(el('div', 's-artist', s.artist));
    if (s.note) body.appendChild(el('div', 's-note', s.note));

    var meta = el('div', 's-meta');
    if (opts.showStage) {
      var st = el('span', 'badge stage', s.stage.short);
      st.style.setProperty('--sc', s.stage.color);
      meta.appendChild(st);
    }
    if (opts.showDay) meta.appendChild(el('span', null, s.day.short));
    if (live) meta.appendChild(el('span', 'badge live', 'On now'));
    else if (!past && s.start - now < 45 * 60000) meta.appendChild(el('span', 'badge next', 'Up next'));
    if (opts.clash) meta.appendChild(el('span', 'badge clash', 'Clash'));
    meta.appendChild(el('span', null, durationMin(s) + ' min'));
    body.appendChild(meta);
    row.appendChild(body);

    var star = el('button', 'star-btn', picked ? '★' : '☆');
    star.setAttribute('aria-pressed', String(picked));
    star.setAttribute('aria-label', (picked ? 'Remove ' : 'Add ') + s.artist + ' ' +
      (picked ? 'from' : 'to') + ' my picks');
    star.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePick(s);
    });
    row.appendChild(star);

    row.addEventListener('click', function () { togglePick(s); });
    return row;
  }

  function togglePick(s) {
    if (state.picks[s.id]) {
      delete state.picks[s.id];
      toast('Removed ' + s.artist);
    } else {
      state.picks[s.id] = true;
      toast('★ ' + s.artist + ' · ' + s.stage.short + ' · ' + fmtTime(s.start));
    }
    save();
    scheduleReminders();
    render();
  }

  function emptyState(icon, title, body) {
    var e = el('div', 'empty');
    e.appendChild(el('div', 'big', icon));
    e.appendChild(el('p', null, title));
    if (body) {
      var p = el('p', null, body);
      p.style.fontSize = '14px';
      e.appendChild(p);
    }
    return e;
  }

  function renderStagesView() {
    var sets = setsForDay(state.day);
    if (!sets.length) return viewEl.appendChild(noResults());

    var grid = el('div', 'grid-stages');
    FESTIVAL.stages.forEach(function (stage) {
      if (!stageVisible(stage.id)) return;
      var mine = sets.filter(function (s) { return s.stageId === stage.id; });
      if (!mine.length) return;

      var group = el('section', 'stage-group');
      group.style.setProperty('--sc', stage.color);   // head + note both read this
      var head = el('div', 'stage-head');
      head.appendChild(el('span', 'bar'));
      var name = el('span', null, stage.name);
      if (stage.venue) name.appendChild(el('span', 'venue', stage.venue));
      head.appendChild(name);
      head.appendChild(el('span', 'count', mine.length + ' ' + (stage.unit || 'sets')));
      group.appendChild(head);
      if (stage.note) group.appendChild(el('p', 'stage-note', stage.note));

      mine.forEach(function (s) { group.appendChild(setRow(s, {})); });
      grid.appendChild(group);
    });
    viewEl.appendChild(grid);
  }

  function renderTimelineView() {
    var sets = setsForDay(state.day);
    if (!sets.length) return viewEl.appendChild(noResults());

    var lastLabel = null;
    sets.forEach(function (s) {
      var label = hourLabel(s.start);
      if (label !== lastLabel) {
        viewEl.appendChild(el('div', 'timegroup-head', label));
        lastLabel = label;
      }
      viewEl.appendChild(setRow(s, { showStage: true }));
    });
  }

  function hourLabel(d) {
    var h = d.getHours();
    if (h < 6) return 'Late night';
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    if (h < 21) return 'Evening';
    return 'Night';
  }

  function renderMineView() {
    var picks = pickedSets();
    if (!picks.length) {
      return viewEl.appendChild(emptyState('⭐', 'No picks yet',
        'Tap any set — or its star — to add it here. Your picks stay on this phone.'));
    }
    var clashes = clashIds();
    var lastDay = null;
    picks.forEach(function (s) {
      if (s.dayId !== lastDay) {
        viewEl.appendChild(el('div', 'timegroup-head', s.day.label + ' · ' + fmtDateShort(s.day.date)));
        lastDay = s.dayId;
      }
      viewEl.appendChild(setRow(s, { showStage: true, clash: !!clashes[s.id] }));
    });

    var n = Object.keys(clashes).length;
    if (n) {
      var p = el('p', 'note', '⚠️ ' + n + ' of your picks overlap with each other. ' +
        'They are marked "Clash" — you cannot be in two places at once.');
      p.style.padding = '0 4px 8px';
      viewEl.appendChild(p);
    }
  }

  /* Search deliberately ignores the selected day: if you look up an artist you
     want every slot they play all weekend, not just today's. */
  function renderSearchView() {
    var hits = SETS.filter(function (s) {
      return stageVisible(s.stageId) && matchesQuery(s);
    });
    if (!hits.length) return viewEl.appendChild(noResults());

    var head = el('div', 'timegroup-head',
      hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' across the weekend');
    viewEl.appendChild(head);

    var lastDay = null;
    hits.forEach(function (s) {
      if (s.dayId !== lastDay) {
        viewEl.appendChild(el('div', 'timegroup-head', s.day.label + ' · ' + fmtDateShort(s.day.date)));
        lastDay = s.dayId;
      }
      viewEl.appendChild(setRow(s, { showStage: true }));
    });
  }

  function noResults() {
    if (state.query) {
      return emptyState('🔍', 'Nothing matches “' + state.query + '”',
        'Try a shorter search, or check another day.');
    }
    if (state.hidePast) {
      return emptyState('🌙', 'Nothing left today',
        'Past sets are hidden — turn that off in Settings to see the whole day.');
    }
    return emptyState('🎪', 'Nothing scheduled', 'No sets on the stages you have showing.');
  }

  function renderNowBar() {
    var bar = $('#nowbar'), scroll = $('#nowScroll');
    scroll.innerHTML = '';

    var live = SETS.filter(function (s) { return isLive(s) && stageVisible(s.stageId); });
    var title = 'On now';

    if (!live.length) {
      // Nothing playing — show what starts next, if the festival hasn't ended.
      var upcoming = SETS.filter(function (s) { return s.start > now && stageVisible(s.stageId); });
      if (!upcoming.length) { bar.hidden = true; return; }
      var firstStart = upcoming[0].start.getTime();
      live = upcoming.filter(function (s) { return s.start.getTime() === firstStart; });
      title = 'Up next · ' + fmtTime(live[0].start);
    }

    $('#nowTitle').textContent = title;
    live.forEach(function (s) {
      var c = el('button', 'now-card');
      c.style.setProperty('--sc', s.stage.color);
      c.appendChild(el('div', 'n-stage', s.stage.short));
      c.appendChild(el('div', 'n-artist', s.artist));
      c.appendChild(el('div', 'n-time', fmtRange(s) + (state.picks[s.id] ? '  ★' : '')));
      c.addEventListener('click', function () {
        state.day = s.dayId;
        if (state.view !== 'stages') state.view = 'timeline';
        jumpPending = true;
        save(); render();
      });
      scroll.appendChild(c);
    });
    bar.hidden = false;
  }

  function render() {
    refreshNow();
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#brand').textContent = FESTIVAL.name;

    renderDays();
    renderStageFilters();
    renderNowBar();

    var count = Object.keys(state.picks).length;
    var pill = $('#pickCount');
    pill.textContent = count;
    pill.hidden = !count;

    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.view === state.view));
    });

    var searching = !!state.query && state.view !== 'mine';
    var showsDay = (state.view === 'stages' || state.view === 'timeline') && !searching;
    $('#days').style.display = showsDay ? '' : 'none';
    $('#stageFilters').style.display = (showsDay || searching) ? '' : 'none';

    viewEl.innerHTML = '';
    if (searching) renderSearchView();
    else if (state.view === 'stages') renderStagesView();
    else if (state.view === 'timeline') renderTimelineView();
    else if (state.view === 'mine') renderMineView();

    // Never let sets vanish without saying so, or without a way back.
    if (showsDay && hiddenCount) {
      var bar = el('button', 'hidden-bar');
      bar.appendChild(el('span', null,
        hiddenCount + ' finished set' + (hiddenCount === 1 ? '' : 's') + ' hidden'));
      bar.appendChild(el('span', 'act', 'Show'));
      bar.addEventListener('click', function () {
        state.hidePast = false; save(); render();
      });
      viewEl.insertBefore(bar, viewEl.firstChild);
    }

    if (jumpPending) { jumpPending = false; jumpToNow(); }
  }

  /* On first load during the festival, drop the user at what's playing right
     now rather than at noon. */
  var jumpPending = false;

  function jumpToNow() {
    var live = viewEl.querySelector('.set.is-live');
    if (!live) return;
    var top = live.getBoundingClientRect().top + window.pageYOffset
            - document.querySelector('header.app-head').offsetHeight - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------------
     Reminders. Timers live in the page: we re-check every 20 seconds and
     fire anything that has come due, so a phone that suspends JS and wakes
     later still gets the notification (late, but it gets it).
     ------------------------------------------------------------------- */

  var fired = {};   // setId -> true, so we never double-notify

  function notifyReady() {
    return ('Notification' in window) && Notification.permission === 'granted';
  }

  function scheduleReminders() {
    // Anything already past its reminder moment when the user picks it
    // is marked as fired so we don't spam on load.
    var cutoff = new Date(now.getTime() - 2 * 60000);
    pickedSets().forEach(function (s) {
      var at = new Date(s.start.getTime() - state.lead * 60000);
      if (at < cutoff) fired[s.id] = true;
    });
  }

  function tickReminders() {
    if (!state.notify || !notifyReady()) return;
    pickedSets().forEach(function (s) {
      if (fired[s.id]) return;
      var at = s.start.getTime() - state.lead * 60000;
      if (now.getTime() >= at && now < s.start) {
        fired[s.id] = true;
        var mins = Math.max(1, Math.round((s.start - now) / 60000));
        show(s.artist + ' in ' + mins + ' min', s.stage.name + ' · ' + fmtRange(s));
      } else if (now >= s.start) {
        fired[s.id] = true;
      }
    });
  }

  function show(title, body) {
    try {
      var n = new Notification(title, {
        body: body,
        icon: 'assets/icon-180.png',
        badge: 'assets/icon-180.png',
        tag: 'emotion26',
        renotify: true
      });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) {
      // Some browsers only allow notifications through the service worker.
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title, { body: body, icon: 'assets/icon-180.png', tag: 'emotion26' });
        }).catch(function () {});
      }
    }
  }

  function requestNotify(cb) {
    if (!('Notification' in window)) { toast('This browser has no notifications'); return cb(false); }
    if (Notification.permission === 'granted') return cb(true);
    if (Notification.permission === 'denied') {
      toast('Notifications are blocked in your browser settings');
      return cb(false);
    }
    Notification.requestPermission().then(function (p) { cb(p === 'granted'); });
  }

  /* ---------------------------------------------------------------------
     Install to home screen.

     Android/Chrome hands us a beforeinstallprompt event we can replay on a
     tap. Safari gives us nothing, so iOS gets written instructions instead —
     and it matters more there, since iOS only delivers notifications to a
     home-screen install.
     ------------------------------------------------------------------- */

  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           // iPadOS 13+ reports itself as a Mac, but a touchscreen gives it away
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function canOfferInstall() { return !isStandalone() && (deferredPrompt || isIOS()); }

  function iosHint() {
    return 'Tap the Share button' + (isIOS() ? ' ↑' : '') +
           ' at the bottom of Safari, then "Add to Home Screen".';
  }

  function updateInstallUI() {
    var bar = $('#installBar');
    var show = canOfferInstall() && !state.installDismissed;

    if (show) {
      $('#installGo').hidden = !deferredPrompt;
      $('#installBody').textContent = deferredPrompt
        ? "Works with no signal, and it's the only way to get set reminders."
        : iosHint();
    }
    bar.hidden = !show;
    document.body.classList.toggle('has-installbar', show);

    // Mirror the offer in Settings, so dismissing the banner doesn't bury it.
    var btn = $('#installFromSettings');
    if (btn) btn.hidden = !deferredPrompt || isStandalone();
    var note = $('#installState');
    if (note) {
      note.textContent = isStandalone()
        ? 'Installed. You are running the home-screen version.'
        : deferredPrompt
          ? 'Opens full-screen and works offline.'
          : isIOS()
            ? iosHint() + ' Reminders only fire from the installed version.'
            : 'Open this page on your phone to install it.';
    }
  }

  function doInstall() {
    if (!deferredPrompt) { toast(iosHint()); return; }
    var p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    p.userChoice.then(function (res) {
      if (res && res.outcome === 'accepted') toast('Installed — open it from your home screen');
      updateInstallUI();
      syncSheet();
    }).catch(function () { updateInstallUI(); });
  }

  /* ---------------------------------------------------------------------
     Settings sheet
     ------------------------------------------------------------------- */

  function openSheet() {
    syncSheet();
    $('#sheetBack').hidden = false;
    $('#sheetBack').classList.add('open');
  }
  function closeSheet() {
    $('#sheetBack').classList.remove('open');
    $('#sheetBack').hidden = true;
    if (state.view === 'settings') { state.view = 'stages'; save(); render(); }
  }

  function syncSheet() {
    var granted = notifyReady();
    $('#notifyToggle').setAttribute('aria-pressed', String(state.notify && granted));
    $('#notifyState').textContent = !('Notification' in window)
      ? 'Not supported in this browser'
      : Notification.permission === 'denied'
        ? 'Blocked — allow notifications for this site in your browser settings'
        : (state.notify && granted)
          ? 'On · ' + state.lead + ' minutes before each pick'
          : 'Off';

    setSeg('#leadSeg', 'lead', String(state.lead));
    setSeg('#themeSeg', 'theme', state.theme);
    setSeg('#clockSeg', 'clock', state.clock);
    $('#hidePastToggle').setAttribute('aria-pressed', String(state.hidePast));

    updateInstallUI();
    syncQR();

    var n = Object.keys(state.picks).length;
    $('#storeNote').textContent = n
      ? n + ' set' + (n === 1 ? '' : 's') + ' picked. Saved on this device only.'
      : 'Nothing picked yet.';
  }

  function setSeg(sel, key, value) {
    document.querySelectorAll(sel + ' button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset[key] === value));
    });
  }

  /* ---------------------------------------------------------------------
     Share / export
     ------------------------------------------------------------------- */

  function appUrl() {
    return location.origin + location.pathname;
  }

  function shareUrl() {
    return appUrl() + '#s=' + encodePicks();
  }

  /* ---------------------------------------------------------------------
     QR code. Drawn locally rather than fetched from an image service, so it
     still appears in a field with no signal — which is exactly when someone
     leans over and asks how to get the schedule.
     ------------------------------------------------------------------- */

  var qrMode = 'app';        // 'app' = the schedule, 'mine' = my picks
  var qrCache = {};          // text -> matrix, so re-rendering is instant

  function qrText() {
    return qrMode === 'mine' && Object.keys(state.picks).length ? shareUrl() : appUrl();
  }

  function qrMatrix(text) {
    if (!qrCache[text]) qrCache[text] = (window.QR ? QR.encode(text) : null);
    return qrCache[text];
  }

  function paintQR(canvas, text) {
    var m = qrMatrix(text);
    var ctx = canvas.getContext('2d');
    if (!m) {
      canvas.width = canvas.height = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1, 1);
      return false;
    }

    // One canvas pixel per module plus a 4-module quiet zone; CSS scales it up
    // with pixelated rendering, which keeps the edges hard at any size.
    var quiet = 4, n = m.size + quiet * 2;
    canvas.width = canvas.height = n;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#000000';
    for (var y = 0; y < m.size; y++) {
      for (var x = 0; x < m.size; x++) {
        if (m.modules[y][x]) ctx.fillRect(x + quiet, y + quiet, 1, 1);
      }
    }
    return true;
  }

  function syncQR() {
    var text = qrText();
    var ok = paintQR($('#qrCanvas'), text);
    var picks = Object.keys(state.picks).length;

    $('#qrUrl').textContent = ok ? text : '';
    $('#qrCap').textContent = !ok
      ? 'That is too much to fit in a code — share the link instead.'
      : qrMode === 'mine'
        ? (picks
            ? 'Scan to load a copy of your ' + picks + ' picked set' + (picks === 1 ? '' : 's') + '.'
            : 'Nothing picked yet, so this opens the schedule. Star some sets first.')
        : 'Point a phone camera at this to open the schedule.';

    document.querySelectorAll('#qrSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.qr === qrMode));
    });
    $('#qrCanvas').setAttribute('aria-label',
      'QR code linking to ' + (qrMode === 'mine' && picks ? 'a shared schedule' : 'the festival schedule'));
  }

  function openQRFull() {
    var text = qrText();
    if (!paintQR($('#qrFullCanvas'), text)) return toast('Too long to show as a code');
    $('#qrFullCap').textContent = qrMode === 'mine' && Object.keys(state.picks).length
      ? 'Scan to load this schedule' : 'Scan to open the Emotion 26 schedule';
    $('#qrFull').hidden = false;
  }

  function closeQRFull() { $('#qrFull').hidden = true; }

  function asText() {
    var picks = pickedSets();
    if (!picks.length) return 'No sets picked yet.';
    var lines = [FESTIVAL.name + ' — my schedule', ''];
    var lastDay = null;
    picks.forEach(function (s) {
      if (s.dayId !== lastDay) {
        lines.push(s.day.label.toUpperCase() + ' ' + fmtDateShort(s.day.date));
        lastDay = s.dayId;
      }
      lines.push('  ' + fmtRange(s) + '  ' + s.artist + '  (' + s.stage.name + ')');
    });
    return lines.join('\n');
  }

  function copy(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); },
        function () { fallbackCopy(text, okMsg); });
    } else fallbackCopy(text, okMsg);
  }

  function fallbackCopy(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg); }
    catch (e) { prompt('Copy this:', text); }
    document.body.removeChild(ta);
  }

  /* ---------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------- */

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------- */

  function wire() {
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.view === 'settings') { state.view = 'settings'; openSheet(); render(); return; }
        state.view = b.dataset.view;
        state.query = '';
        $('#search').value = '';
        $('#searchWrap').classList.remove('open');
        $('#searchToggle').setAttribute('aria-pressed', 'false');
        save(); render();
        window.scrollTo({ top: 0 });
      });
    });

    // Tapping the clock jumps back to whatever is on right now.
    $('#clock').addEventListener('click', function () {
      var today = currentDayId();
      if (!today) return toast('The festival has not started yet');
      state.day = today;
      if (state.view === 'mine') state.view = 'timeline';
      jumpPending = true;
      save(); render();
    });

    $('#searchToggle').addEventListener('click', function () {
      var wrap = $('#searchWrap');
      var open = wrap.classList.toggle('open');
      this.setAttribute('aria-pressed', String(open));
      if (open) $('#search').focus();
      else { state.query = ''; $('#search').value = ''; render(); }
    });

    $('#search').addEventListener('input', function () {
      state.query = this.value.trim().toLowerCase();
      render();
    });

    $('#sheetBack').addEventListener('click', function (e) {
      if (e.target === this) closeSheet();
    });
    $('#closeSheet').addEventListener('click', closeSheet);

    $('#notifyToggle').addEventListener('click', function () {
      if (state.notify) { state.notify = false; save(); syncSheet(); toast('Reminders off'); return; }
      requestNotify(function (ok) {
        state.notify = ok;
        if (ok) { fired = {}; scheduleReminders(); toast('Reminders on'); }
        save(); syncSheet();
      });
    });

    document.querySelectorAll('#leadSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.lead = Number(b.dataset.lead);
        fired = {}; scheduleReminders();
        save(); syncSheet();
      });
    });

    document.querySelectorAll('#themeSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.theme = b.dataset.theme;
        document.querySelector('meta[name=theme-color]')
          .setAttribute('content', state.theme === 'dark' ? '#0e0b16' : '#fdf9ff');
        save(); syncSheet(); render();
      });
    });

    document.querySelectorAll('#clockSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.clock = b.dataset.clock; save(); syncSheet(); render();
      });
    });

    $('#hidePastToggle').addEventListener('click', function () {
      state.hidePast = !state.hidePast; save(); syncSheet(); render();
    });

    $('#testNotify').addEventListener('click', function () {
      requestNotify(function (ok) {
        if (!ok) return;
        state.notify = true; save(); syncSheet();
        show('Reminder test', 'This is what a heads-up looks like. Nice.');
        toast('Sent — check your notification shade');
      });
    });

    document.querySelectorAll('#qrSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        qrMode = b.dataset.qr;
        if (qrMode === 'mine' && !Object.keys(state.picks).length) toast('Star some sets first');
        syncQR();
      });
    });

    $('#qrHolder').addEventListener('click', openQRFull);
    $('#qrFullClose').addEventListener('click', closeQRFull);
    $('#qrFull').addEventListener('click', function (e) {
      if (e.target === this || e.target.closest('.qr-full-inner')) closeQRFull();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#qrFull').hidden) closeQRFull();
    });

    $('#copyLinkBtn').addEventListener('click', function () {
      copy(qrText(), 'Link copied');
    });

    $('#shareBtn').addEventListener('click', function () {
      if (!Object.keys(state.picks).length) return toast('Pick some sets first');
      var url = shareUrl();
      if (navigator.share) {
        navigator.share({ title: FESTIVAL.name + ' — my schedule', text: asText(), url: url })
          .catch(function () {});
      } else {
        copy(url, 'Link copied');
      }
    });

    $('#copyTextBtn').addEventListener('click', function () {
      copy(asText(), 'Schedule copied');
    });

    $('#clearBtn').addEventListener('click', function () {
      if (!confirm('Clear all your picked sets? This cannot be undone.')) return;
      state.picks = {}; fired = {};
      save(); syncSheet(); render();
      toast('Picks cleared');
    });

    $('#installGo').addEventListener('click', doInstall);
    $('#installFromSettings').addEventListener('click', doInstall);
    $('#installClose').addEventListener('click', function () {
      state.installDismissed = true;
      save();
      updateInstallUI();
      toast('You can still install it from Settings');
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();          // keep Chrome's own mini-infobar out of the way
      deferredPrompt = e;
      updateInstallUI();
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      state.installDismissed = true;
      save();
      updateInstallUI();
    });

    // Swipe left/right between days on the two day-based views.
    var x0 = null, y0 = null;
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
      if (state.view !== 'stages' && state.view !== 'timeline') return;
      var ids = FESTIVAL.days.map(function (d) { return d.id; });
      var i = ids.indexOf(state.day) + (dx < 0 ? 1 : -1);
      if (i < 0 || i >= ids.length) return;
      state.day = ids[i]; save(); render();
      window.scrollTo({ top: 0 });
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refreshNow(); tickReminders(); render(); }
    });
  }

  /* ---------------------------------------------------------------------
     Clock + periodic refresh
     ------------------------------------------------------------------- */

  function tick() {
    refreshNow();
    $('#clock').textContent = fmtTime(now);
    tickReminders();
  }

  var lastRenderMin = -1;
  function slowTick() {
    var m = now.getMinutes();
    if (m !== lastRenderMin) { lastRenderMin = m; render(); }
  }

  /* ---------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------- */

  load();
  refreshNow();

  // Land on today, at what's playing right now, if the festival is running.
  var today = currentDayId();
  if (today) { state.day = today; jumpPending = true; }

  if (applyPicksFromHash()) {
    setTimeout(function () { toast('Picks loaded from link'); }, 400);
    state.view = 'mine';
  }

  document.documentElement.setAttribute('data-theme', state.theme);
  if (state.view === 'settings') state.view = 'stages';

  wire();
  scheduleReminders();
  render();
  tick();

  // Let people look at the schedule for a moment before asking them to install.
  setTimeout(updateInstallUI, 2500);

  setInterval(function () { tick(); slowTick(); }, 20000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });

    /* A new worker taking over means the cached app itself changed, so reload
       once rather than let an old build read a new schedule.

       Only when a worker was ALREADY in charge. On a first-ever visit the
       worker takes control mid-page, and reloading there would throw away
       whatever the page had just done — including picks imported from a
       scanned link, which land before the worker is ready. */
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
})();
