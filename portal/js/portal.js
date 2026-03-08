/**
 * NeoNetrek Server Portal
 *
 * Handles: starfield, config loading, instance picker, leaderboard display, live server status.
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
  function applyConfig(cfg) {
    if (!cfg) return;

    if (cfg.name) {
      setText('server-name', cfg.name);
      document.title = cfg.name + ' - NeoNetrek';
    }
    if (cfg.tagline) setText('server-tagline', cfg.tagline);
    if (cfg.location) setText('cfg-location', cfg.location);
    if (cfg.admin) setText('cfg-admin', cfg.admin);
    if (cfg.contact) setText('cfg-contact', cfg.contact);

    if (cfg.motd) {
      var el = document.getElementById('server-motd');
      if (el) el.innerHTML = '<p>' + escapeHtml(cfg.motd) + '</p>';
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

  function fetchConfig() {
    fetch('/config.json')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        applyConfig(cfg.server);
      })
      .catch(function () {});
  }

  // ---------- Instance Picker ----------
  var instancesData = null;

  function fetchInstances() {
    fetch('/api/instances')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) return;
        instancesData = data;
        buildInstanceMap(data);

        // Update hero stats with total player count
        var totalPlayers = data.reduce(function (sum, inst) {
          return sum + (inst.connections || 0);
        }, 0);
        setText('hero-players', String(totalPlayers));
        setText('hero-status', 'Online');
        var statusEl = document.getElementById('hero-status');
        if (statusEl) statusEl.className = 'stat-value status-online';

        // Also fetch health for uptime
        fetch('/health').then(function (r) { return r.json(); }).then(function (h) {
          if (h.uptime) {
            var hrs = Math.floor(h.uptime / 3600);
            var min = Math.floor((h.uptime % 3600) / 60);
            setText('hero-uptime', hrs + 'h ' + min + 'm');
          }
        }).catch(function () {});

        // Auto-populate WebSocket URL
        var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        setText('cfg-ws', proto + '//' + window.location.host + '/ws');

        // Show instance picker only if >1 instance
        var section = document.getElementById('instances');
        if (section && data.length > 1) {
          section.style.display = '';
          renderInstances(data);
          renderLeaderboardInstanceTabs(data);

          // Update hero "Play Now" to link to first instance
          var heroBtn = document.querySelector('.hero-buttons .btn-primary');
          if (heroBtn) {
            heroBtn.href = '/play/?server=' + data[0].id;
          }
        } else if (data.length === 1) {
          // Single instance — hero "Play Now" links to it
          var heroBtn = document.querySelector('.hero-buttons .btn-primary');
          if (heroBtn) {
            heroBtn.href = '/play/?server=' + data[0].id;
          }
        }
      })
      .catch(function () {
        // Fall back to basic health check
        fetchStatus();
      });
  }

  function renderInstances(data) {
    var grid = document.getElementById('instances-grid');
    if (!grid) return;

    grid.innerHTML = data.map(function (inst) {
      var features = (inst.features || []).map(function (f) {
        return '<span class="instance-tag">' + escapeHtml(f) + '</span>';
      }).join('');

      var playerCount = inst.connections || 0;
      var playerText = playerCount === 1 ? '1 player' : playerCount + ' players';

      return '<div class="instance-card">' +
        '<div class="instance-name">' + escapeHtml(inst.name) + '</div>' +
        '<div class="instance-desc">' + escapeHtml(inst.description) + '</div>' +
        '<div class="instance-players">' + playerText + ' online</div>' +
        '<div class="instance-features">' + features + '</div>' +
        '<div class="instance-actions">' +
        '<a href="/play/?server=' + encodeURIComponent(inst.id) + '" class="btn btn-primary btn-small">Play Now</a>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ---------- Server Status (fallback for single-instance) ----------
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

        // Auto-populate WebSocket URL
        var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        setText('cfg-ws', proto + '//' + window.location.host + '/ws');
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
  var leaderboardInstance = null; // current instance for leaderboard

  function fetchLeaderboard(instanceId) {
    var url;
    if (instanceId === 'global') {
      url = '/api/global-leaderboard';
    } else {
      url = '/api/leaderboard';
      if (instanceId) url += '?instance=' + encodeURIComponent(instanceId);
    }
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Global returns { updated, players }, per-instance returns array directly
        var players = Array.isArray(data) ? data : (data && data.players) || [];
        if (players.length > 0) {
          leaderboardData = players;
          renderLeaderboard(players, 'overall');
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

  // ---------- Leaderboard Instance Tabs ----------
  function renderLeaderboardInstanceTabs(data) {
    var container = document.getElementById('lb-instance-tabs');
    if (!container || data.length <= 1) return;

    container.style.display = '';

    // Prepend "Global" tab, default active
    var html = '<button class="lb-instance-tab active" onclick="switchLeaderboardInstance(\'global\')">Global</button>';
    html += data.map(function (inst) {
      return '<button class="lb-instance-tab" onclick="switchLeaderboardInstance(\'' +
        escapeHtml(inst.id) + '\')">' + escapeHtml(inst.name) + '</button>';
    }).join('');
    container.innerHTML = html;

    // Default to global leaderboard
    leaderboardInstance = 'global';
    fetchLeaderboard('global');
  }

  window.switchLeaderboardInstance = function (instanceId) {
    leaderboardInstance = instanceId;
    var matchName = instanceId === 'global' ? 'Global' : (instanceMap[instanceId] || instanceId);
    document.querySelectorAll('.lb-instance-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.textContent === matchName);
    });
    fetchLeaderboard(instanceId);
  };

  // Build a name lookup for instances
  var instanceMap = {};
  function buildInstanceMap(data) {
    data.forEach(function (inst) {
      instanceMap[inst.id] = inst.name;
    });
  }

  // ---------- Nav ----------
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      document.getElementById('navbar').classList.remove('open');
    });
  });

  // ---------- Init ----------
  function init() {
    fetchConfig();
    fetchInstances();
    fetchLeaderboard(null);
    // Refresh instances every 30 seconds (includes player counts)
    setInterval(fetchInstances, 30000);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
