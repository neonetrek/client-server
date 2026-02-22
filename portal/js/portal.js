/**
 * NeoNetrek Server Portal
 *
 * Handles: starfield, config loading, leaderboard display, live server status.
 */

(function () {
  'use strict';

  // ---------- Starfield ----------
  var canvas = document.getElementById('starfield');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var stars = [];
    var STAR_COUNT = 150;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function initStars() {
      stars = [];
      for (var i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.3 + 0.05,
          brightness: Math.random(),
          twinkleSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    }

    function drawStars() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var time = Date.now() * 0.001;

      for (var s = 0; s < stars.length; s++) {
        var star = stars[s];
        var flicker = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed * 60 + star.brightness * 10);
        var alpha = 0.3 + 0.7 * flicker;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,210,240,' + alpha + ')';
        ctx.fill();

        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
      }
      requestAnimationFrame(drawStars);
    }

    window.addEventListener('resize', function () { resizeCanvas(); initStars(); });
    resizeCanvas();
    initStars();
    drawStars();
  }

  // ---------- Helpers ----------
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Config ----------
  function applyConfig() {
    var cfg = window.NEONETREK_PORTAL;
    if (!cfg) return;

    if (cfg.serverName) {
      setText('server-name', cfg.serverName);
      document.title = cfg.serverName + ' - NeoNetrek';
    }
    if (cfg.serverTagline) setText('server-tagline', cfg.serverTagline);
    if (cfg.serverHost) setText('cfg-host', cfg.serverHost);
    if (cfg.wsProxy) setText('cfg-ws', cfg.wsProxy);
    if (cfg.serverLocation) setText('cfg-location', cfg.serverLocation);
    if (cfg.adminName) setText('cfg-admin', cfg.adminName);
    if (cfg.adminContact) setText('cfg-contact', cfg.adminContact);

    if (cfg.motd) {
      var el = document.getElementById('server-motd');
      if (el) el.innerHTML = cfg.motd;
    }

    if (cfg.rules && cfg.rules.length > 0) {
      var el = document.getElementById('server-rules');
      if (el) {
        el.innerHTML = cfg.rules.map(function (r) {
          return '<li>' + escapeHtml(r) + '</li>';
        }).join('');
      }
    }
  }

  // ---------- Server Status ----------
  function fetchStatus() {
    fetch('/health')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setText('hero-players', String(data.connections || 0));
        setText('hero-status', 'Online');
        var statusEl = document.getElementById('hero-status');
        if (statusEl) statusEl.className = 'stat-value status-online';

        if (data.uptime) {
          var h = Math.floor(data.uptime / 3600);
          var m = Math.floor((data.uptime % 3600) / 60);
          setText('hero-uptime', h + 'h ' + m + 'm');
        }
      })
      .catch(function () {
        setText('hero-status', 'Offline');
        var statusEl = document.getElementById('hero-status');
        if (statusEl) statusEl.className = 'stat-value status-offline';
      });
  }

  // ---------- Leaderboard ----------
  var RANK_NAMES = [
    'Ensign', 'Lieutenant', 'Lt. Cmdr.', 'Commander', 'Captain',
    'Flt. Capt.', 'Commodore', 'Rear Adm.', 'Admiral'
  ];

  var leaderboardData = null;

  function fetchLeaderboard() {
    fetch('/api/leaderboard')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (Array.isArray(data) && data.length > 0) {
          leaderboardData = data;
          renderLeaderboard(data, 'overall');
        }
      })
      .catch(function () {
        // No leaderboard API available yet
      });
  }

  function renderLeaderboard(data, sortBy) {
    var sorted = data.slice().sort(function (a, b) {
      if (sortBy === 'offense') return b.offense - a.offense;
      if (sortBy === 'bombing') return b.bombing - a.bombing;
      if (sortBy === 'planets') return b.planets - a.planets;
      return b.total - a.total;
    });

    var tbody = document.getElementById('lb-body');
    if (!tbody) return;

    tbody.innerHTML = sorted.map(function (p, i) {
      var rankClass = i < 3 ? ' class="lb-rank-' + (i + 1) + '"' : '';
      return '<tr' + rankClass + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + (RANK_NAMES[p.rank] || 'Unknown') + '</td>' +
        '<td>' + p.hours.toFixed(1) + '</td>' +
        '<td>' + p.offense.toFixed(2) + '</td>' +
        '<td>' + p.bombing.toFixed(2) + '</td>' +
        '<td>' + p.planets.toFixed(2) + '</td>' +
        '<td>' + p.total.toFixed(2) + '</td>' +
        '</tr>';
    }).join('');

    var empty = document.getElementById('lb-empty');
    if (empty) empty.style.display = sorted.length > 0 ? 'none' : 'block';
  }

  window.showLeaderboard = function (category) {
    document.querySelectorAll('.lb-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.textContent.toLowerCase() === category);
    });
    if (leaderboardData) {
      renderLeaderboard(leaderboardData, category);
    }
  };

  // ---------- Nav ----------
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      document.getElementById('navbar').classList.remove('open');
    });
  });

  // ---------- Init ----------
  function init() {
    applyConfig();
    fetchStatus();
    fetchLeaderboard();
    // Refresh status every 30 seconds
    setInterval(fetchStatus, 30000);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
