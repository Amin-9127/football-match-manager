'use strict';
/* Football Match Manager - game logic */
(function () {
  var KEY = 'fmm_save_v1';
  var FORMATIONS = {
    '4-4-2': { DEF: 4, MID: 4, FWD: 2 },
    '4-3-3': { DEF: 4, MID: 3, FWD: 3 },
    '3-5-2': { DEF: 3, MID: 5, FWD: 2 },
    '4-5-1': { DEF: 4, MID: 5, FWD: 1 },
    '5-3-2': { DEF: 5, MID: 3, FWD: 2 }
  };
  var CLUBS = ['My FC', 'Riverside United', 'Northgate City', 'Harbour Town', 'Eastvale Rovers', 'Kingsway Athletic', 'Oakfield Wanderers', 'Stonebridge FC'];
  var FIRST = ['Ali', 'Omar', 'Sam', 'Leo', 'Marco', 'Jon', 'Kai', 'Ben', 'Diego', 'Yusuf', 'Luca', 'Tom', 'Nico', 'Hugo', 'Ivan', 'Rami', 'Zane', 'Felix', 'Jude', 'Karim'];
  var LAST = ['Silva', 'Khan', 'Hughes', 'Rossi', 'Novak', 'Meyer', 'Costa', 'Ward', 'Haddad', 'Berg', 'Moreno', 'Fox', 'Duran', 'Stone', 'Okafor', 'Petrov', 'Lang', 'Reyes', 'Hale', 'Vega'];
  var SQUAD_SHAPE = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'FWD'];
  var ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

  var state = null;
  var tab = 'squad';
  var live = null; // current live match {events, idx, minute, hg, ag, timer, fixture}

  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- setup ---------- */
  function makeSquad(teamId, base) {
    var used = {};
    return SQUAD_SHAPE.map(function (pos, i) {
      var name;
      do { name = pick(FIRST) + ' ' + pick(LAST); } while (used[name]);
      used[name] = 1;
      return { id: teamId * 100 + i, name: name, pos: pos, rating: clamp(base + rnd(-10, 10) - (i > 10 ? 4 : 0), 40, 95) };
    });
  }

  function bestXI(players, formation) {
    var f = FORMATIONS[formation] || FORMATIONS['4-4-2'];
    var need = { GK: 1, DEF: f.DEF, MID: f.MID, FWD: f.FWD };
    var ids = [];
    Object.keys(need).forEach(function (pos) {
      players.filter(function (p) { return p.pos === pos; })
        .sort(function (a, b) { return b.rating - a.rating; })
        .slice(0, need[pos])
        .forEach(function (p) { ids.push(p.id); });
    });
    return ids;
  }

  function roundRobin(n) {
    var ids = []; for (var i = 0; i < n; i++) ids.push(i);
    var rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var games = [];
      for (var k = 0; k < n / 2; k++) {
        var a = ids[k], b = ids[n - 1 - k];
        games.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(games);
      ids.splice(1, 0, ids.pop());
    }
    var second = rounds.map(function (g) { return g.map(function (m) { return [m[1], m[0]]; }); });
    return rounds.concat(second);
  }

  function newSeason(keepClub) {
    var oldName = keepClub && state ? state.teams[0].name : CLUBS[0];
    var oldForm = keepClub && state ? state.formation : '4-4-2';
    var teams = CLUBS.map(function (n, i) {
      var base = i === 0 ? 68 : rnd(58, 76);
      var t = { id: i, name: i === 0 ? oldName : n, players: makeSquad(i, base) };
      t.xi = bestXI(t.players, i === 0 ? oldForm : '4-4-2');
      return t;
    });
    state = {
      season: state ? state.season + 1 : 1,
      round: 0,
      formation: oldForm,
      teams: teams,
      fixtures: roundRobin(CLUBS.length),
      results: []
    };
    save();
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } }
  function load() {
    try { var s = localStorage.getItem(KEY); if (s) state = JSON.parse(s); } catch (e) { state = null; }
  }

  /* ---------- team strength ---------- */
  function xiPlayers(team) {
    return team.xi.map(function (id) { return team.players.find(function (p) { return p.id === id; }); }).filter(Boolean);
  }
  function xiValid(team) {
    var xi = xiPlayers(team);
    return xi.length === 11 && xi.filter(function (p) { return p.pos === 'GK'; }).length === 1;
  }
  function avg(list) {
    if (!list.length) return 30;
    return list.reduce(function (s, p) { return s + p.rating; }, 0) / list.length;
  }
  function strength(team) {
    var xi = xiPlayers(team);
    var by = function (pos) { return xi.filter(function (p) { return p.pos === pos; }); };
    var gk = by('GK');
    return {
      gk: gk.length ? gk[0].rating : 30,
      def: avg(by('DEF')),
      mid: avg(by('MID')),
      fwd: avg(by('FWD')),
      overall: avg(xi)
    };
  }

  /* ---------- match engine ---------- */
  function simulate(home, away) {
    var H = strength(home), A = strength(away);
    var events = [], hg = 0, ag = 0;
    var hx = xiPlayers(home), ax = xiPlayers(away);
    var hMid = H.mid * 1.05 + 2; // small home edge
    var possH = hMid / (hMid + A.mid);
    for (var m = 1; m <= 90; m++) {
      if (Math.random() > 0.14) continue;
      var homeAttacks = Math.random() < possH;
      var att = homeAttacks ? H : A, dfn = homeAttacks ? A : H;
      var atkTeam = homeAttacks ? home : away;
      var atkXI = homeAttacks ? hx : ax;
      var q = (att.fwd * 0.6 + att.mid * 0.4) / (dfn.def * 0.55 + dfn.gk * 0.45);
      var pGoal = clamp(0.30 * Math.pow(q, 3), 0.06, 0.6);
      var shooter = weightedShooter(atkXI);
      if (!shooter) continue;
      var r = Math.random();
      if (r < pGoal) {
        if (homeAttacks) hg++; else ag++;
        events.push({ min: m, type: 'goal', home: homeAttacks, text: 'GOAL! ' + shooter.name + ' scores for ' + atkTeam.name + '!', hg: hg, ag: ag });
      } else if (r < pGoal + 0.35) {
        events.push({ min: m, type: 'save', home: homeAttacks, text: shooter.name + ' forces a save.' });
      } else {
        events.push({ min: m, type: 'miss', home: homeAttacks, text: shooter.name + ' shoots wide.' });
      }
    }
    return { events: events, hg: hg, ag: ag };
  }
  function weightedShooter(xi) {
    var w = { GK: 0, DEF: 0.6, MID: 2, FWD: 4 };
    var pool = [];
    xi.forEach(function (p) {
      var n = Math.round(w[p.pos] * 2);
      for (var i = 0; i < n; i++) pool.push(p);
    });
    return pool.length ? pick(pool) : null;
  }

  /* ---------- table ---------- */
  function computeTable() {
    var rows = state.teams.map(function (t) {
      return { id: t.id, name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });
    state.results.forEach(function (round) {
      round.forEach(function (g) {
        var h = rows[g.h], a = rows[g.a];
        h.p++; a.p++;
        h.gf += g.hg; h.ga += g.ag; a.gf += g.ag; a.ga += g.hg;
        if (g.hg > g.ag) { h.w++; a.l++; h.pts += 3; }
        else if (g.hg < g.ag) { a.w++; h.l++; a.pts += 3; }
        else { h.d++; a.d++; h.pts++; a.pts++; }
      });
    });
    rows.sort(function (x, y) {
      return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name);
    });
    return rows;
  }

  /* ---------- rendering ---------- */
  function render() {
    renderHeader();
    if (tab === 'squad') renderSquad();
    if (tab === 'match') renderMatch();
    if (tab === 'table') renderTable();
    if (tab === 'fixtures') renderFixtures();
  }

  function seasonOver() { return state.round >= state.fixtures.length; }

  function renderHeader() {
    var pos = computeTable().findIndex(function (r) { return r.id === 0; }) + 1;
    $('seasonInfo').textContent = 'Season ' + state.season + ' · Round ' + Math.min(state.round + 1, state.fixtures.length) + '/' + state.fixtures.length + ' · Position ' + pos;
  }

  function renderSquad() {
    var me = state.teams[0];
    $('clubName').value = me.name;
    var sel = $('formation');
    if (!sel.options.length) {
      Object.keys(FORMATIONS).forEach(function (f) {
        var o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o);
      });
    }
    sel.value = state.formation;
    var ok = xiValid(me);
    var xiCount = me.xi.length;
    var st = $('xiStatus');
    st.textContent = ok ? 'XI ready (' + xiCount + '/11)' : 'XI invalid (' + xiCount + '/11)';
    st.className = 'badge ' + (ok ? 'ok' : 'bad');
    var s = strength(me);
    $('strengthInfo').textContent = 'GK ' + Math.round(s.gk) + ' · DEF ' + Math.round(s.def) + ' · MID ' + Math.round(s.mid) + ' · FWD ' + Math.round(s.fwd) + ' · Overall ' + Math.round(s.overall);
    var list = me.players.slice().sort(function (a, b) {
      var sa = me.xi.indexOf(a.id) >= 0 ? 0 : 1, sb = me.xi.indexOf(b.id) >= 0 ? 0 : 1;
      return sa - sb || ORDER[a.pos] - ORDER[b.pos] || b.rating - a.rating;
    });
    $('squadList').innerHTML = list.map(function (p) {
      var starter = me.xi.indexOf(p.id) >= 0;
      return '<div class="player' + (starter ? ' starter' : '') + '" data-id="' + p.id + '">' +
        '<span class="pos ' + p.pos + '">' + p.pos + '</span>' +
        '<span class="pname">' + esc(p.name) + '</span>' +
        '<span class="rating">' + p.rating + '</span></div>';
    }).join('');
  }

  function currentFixture() {
    if (seasonOver()) return null;
    return state.fixtures[state.round].find(function (g) { return g[0] === 0 || g[1] === 0; });
  }

  function renderMatch() {
    var fx = currentFixture();
    var kick = $('kickoff'), skip = $('skip');
    if (!fx) {
      $('roundLabel').textContent = 'Season complete';
      var t = computeTable();
      $('homeName').textContent = state.teams[0].name;
      $('awayName').textContent = '';
      $('score').textContent = '#' + (t.findIndex(function (r) { return r.id === 0; }) + 1);
      $('clock').textContent = 'Final position';
      kick.disabled = true; skip.disabled = true;
      return;
    }
    var home = state.teams[fx[0]], away = state.teams[fx[1]];
    $('roundLabel').textContent = 'Round ' + (state.round + 1);
    $('homeName').textContent = home.name;
    $('awayName').textContent = away.name;
    if (!live) {
      $('score').textContent = '0 - 0';
      $('clock').textContent = "0'";
      kick.disabled = false; skip.disabled = true;
      kick.textContent = xiValid(state.teams[0]) ? 'Kick off' : 'Fix your XI first';
    }
  }

  function renderTable() {
    var rows = computeTable();
    var html = '<tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>';
    rows.forEach(function (r, i) {
      html += '<tr class="' + (r.id === 0 ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.gf - r.ga) + '</td><td>' + r.pts + '</td></tr>';
    });
    $('leagueTable').innerHTML = html;
  }

  function renderFixtures() {
    var html = '';
    state.fixtures.forEach(function (games, r) {
      html += '<div class="fx-round">Round ' + (r + 1) + (r === state.round ? ' (next)' : '') + '</div>';
      games.forEach(function (g) {
        var res = state.results[r] && state.results[r].find(function (x) { return x.h === g[0] && x.a === g[1]; });
        var mid = res ? res.hg + ' - ' + res.ag : 'v';
        html += '<div class="fx' + (g[0] === 0 || g[1] === 0 ? ' me' : '') + '"><span>' + esc(state.teams[g[0]].name) + '</span><b>' + mid + '</b><span>' + esc(state.teams[g[1]].name) + '</span></div>';
      });
    });
    $('fixtureList').innerHTML = html;
  }

  /* ---------- live match ---------- */
  function addLog(ev) {
    var d = document.createElement('div');
    if (ev.type === 'goal') d.className = 'goal';
    d.innerHTML = '<span class="min">' + ev.min + "'</span>" + esc(ev.text);
    var log = $('log');
    log.insertBefore(d, log.firstChild);
  }

  function startMatch() {
    if (live || seasonOver()) return;
    if (!xiValid(state.teams[0])) { setTab('squad'); return; }
    var fx = currentFixture();
    var sim = simulate(state.teams[fx[0]], state.teams[fx[1]]);
    live = { fx: fx, sim: sim, idx: 0, minute: 0, hg: 0, ag: 0, timer: null };
    $('log').innerHTML = '';
    $('kickoff').disabled = true;
    $('skip').disabled = false;
    addLog({ min: 0, type: 'info', text: 'Kick off!' });
    live.timer = setInterval(tick, 180);
  }

  function tick() {
    live.minute++;
    while (live.idx < live.sim.events.length && live.sim.events[live.idx].min <= live.minute) {
      applyEvent(live.sim.events[live.idx++]);
    }
    $('clock').textContent = live.minute + "'";
    if (live.minute >= 90) finishMatch();
  }

  function applyEvent(ev) {
    if (ev.type === 'goal') { live.hg = ev.hg; live.ag = ev.ag; $('score').textContent = ev.hg + ' - ' + ev.ag; }
    addLog(ev);
  }

  function skipMatch() {
    if (!live) return;
    clearInterval(live.timer);
    while (live.idx < live.sim.events.length) applyEvent(live.sim.events[live.idx++]);
    live.minute = 90;
    $('clock').textContent = "90'";
    finishMatch();
  }

  function finishMatch() {
    clearInterval(live.timer);
    var fx = live.fx, sim = live.sim;
    addLog({ min: 90, type: 'info', text: 'Full time: ' + state.teams[fx[0]].name + ' ' + sim.hg + ' - ' + sim.ag + ' ' + state.teams[fx[1]].name });
    $('score').textContent = sim.hg + ' - ' + sim.ag;
    var results = [{ h: fx[0], a: fx[1], hg: sim.hg, ag: sim.ag }];
    state.fixtures[state.round].forEach(function (g) {
      if (g === fx) return;
      var s = simulate(state.teams[g[0]], state.teams[g[1]]);
      results.push({ h: g[0], a: g[1], hg: s.hg, ag: s.ag });
    });
    state.results[state.round] = results;
    state.round++;
    live = null;
    save();
    renderHeader();
    var k = $('kickoff');
    if (seasonOver()) {
      k.textContent = 'Season over';
      k.disabled = true;
    } else {
      k.textContent = 'Next match';
      k.disabled = false;
      k.onclick = function () { k.onclick = null; $('log').innerHTML = ''; renderMatch(); startMatch(); };
    }
    $('skip').disabled = true;
  }

  /* ---------- events ---------- */
  function setTab(name) {
    if (live && name !== 'match') { /* keep match running in background */ }
    tab = name;
    ['squad', 'match', 'table', 'fixtures'].forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    render();
  }

  function init() {
    load();
    if (!state || !state.teams) newSeason(false);

    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });

    $('squadList').addEventListener('click', function (e) {
      var el = e.target.closest('.player');
      if (!el || live) return;
      var id = Number(el.getAttribute('data-id'));
      var me = state.teams[0];
      var i = me.xi.indexOf(id);
      if (i >= 0) me.xi.splice(i, 1);
      else if (me.xi.length < 11) me.xi.push(id);
      else return;
      save(); renderSquad();
    });

    $('clubName').addEventListener('input', function (e) {
      state.teams[0].name = e.target.value.trim() || 'My FC';
      save();
    });

    $('formation').addEventListener('change', function (e) {
      state.formation = e.target.value;
      state.teams[0].xi = bestXI(state.teams[0].players, state.formation);
      save(); renderSquad();
    });

    $('autoPick').addEventListener('click', function () {
      if (live) return;
      state.teams[0].xi = bestXI(state.teams[0].players, state.formation);
      save(); renderSquad();
    });

    $('kickoff').addEventListener('click', function () { if (!$('kickoff').onclick) startMatch(); });
    $('skip').addEventListener('click', skipMatch);

    $('newSeason').addEventListener('click', function () {
      if (!confirm('Start a new season? Current progress will be lost.')) return;
      if (live) { clearInterval(live.timer); live = null; }
      $('log').innerHTML = '';
      newSeason(true);
      $('kickoff').textContent = 'Kick off';
      setTab('squad');
    });

    setTab('squad');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
