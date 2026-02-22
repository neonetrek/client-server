/**
 * NeoNetrek Companion Website - Main JavaScript
 *
 * Handles: starfield animation, config loading, leaderboard display,
 * nav behavior, and smooth scrolling.
 */

(function () {
  'use strict';

  // ---------- Starfield ----------
  const canvas = document.getElementById('starfield');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let stars = [];
    const STAR_COUNT = 200;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function initStars() {
      stars = [];
      for (let i = 0; i < STAR_COUNT; i++) {
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
      const time = Date.now() * 0.001;

      for (const star of stars) {
        const flicker = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed * 60 + star.brightness * 10);
        const alpha = 0.3 + 0.7 * flicker;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,210,240,${alpha})`;
        ctx.fill();

        // Slow drift
        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
      }
      requestAnimationFrame(drawStars);
    }

    window.addEventListener('resize', () => { resizeCanvas(); initStars(); });
    resizeCanvas();
    initStars();
    drawStars();
  }

  // ---------- Config Loading ----------
  function applyConfig() {
    const cfg = window.NEONETREK_CONFIG;
    if (!cfg) return;

    if (cfg.serverHost) {
      setText('cfg-host', cfg.serverHost);
    }
    if (cfg.wsProxy) {
      setText('cfg-ws', cfg.wsProxy);
    }
    if (cfg.adminName) {
      setText('cfg-admin', cfg.adminName);
    }
    if (cfg.adminContact) {
      setText('cfg-contact', cfg.adminContact);
    }
    if (cfg.serverLocation) {
      setText('cfg-location', cfg.serverLocation);
    }
    if (cfg.motd) {
      const el = document.getElementById('host-message');
      if (el) el.innerHTML = cfg.motd;
    }
    if (cfg.rules && cfg.rules.length > 0) {
      const el = document.getElementById('server-rules');
      if (el) {
        el.innerHTML = cfg.rules.map(r => `<li>${escapeHtml(r)}</li>`).join('');
      }
    }
    if (cfg.webClientUrl) {
      const link = document.getElementById('play-link');
      if (link) link.href = cfg.webClientUrl;
    }

    // Load leaderboard
    if (cfg.leaderboardUrl) {
      fetchLeaderboard(cfg.leaderboardUrl);
    } else {
      loadSampleLeaderboard();
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Leaderboard ----------
  const RANK_NAMES = [
    'Ensign', 'Lieutenant', 'Lt. Cmdr.', 'Commander', 'Captain',
    'Flt. Capt.', 'Commodore', 'Rear Adm.', 'Admiral'
  ];

  const SAMPLE_DATA = [
    { name: 'Starblazer', rank: 8, hours: 142.5, offense: 3.21, bombing: 2.85, planets: 2.44, total: 8.50 },
    { name: 'TorpedoJoe', rank: 7, hours: 98.3, offense: 2.89, bombing: 2.12, planets: 2.78, total: 7.79 },
    { name: 'PlanetTaker', rank: 7, hours: 87.6, offense: 1.95, bombing: 1.88, planets: 3.45, total: 7.28 },
    { name: 'CloakNDagger', rank: 6, hours: 72.1, offense: 2.67, bombing: 2.34, planets: 1.56, total: 6.57 },
    { name: 'OggMaster', rank: 6, hours: 65.4, offense: 3.44, bombing: 1.45, planets: 1.23, total: 6.12 },
    { name: 'BaseGuard', rank: 5, hours: 55.2, offense: 1.78, bombing: 1.92, planets: 1.67, total: 5.37 },
    { name: 'BomberAce', rank: 5, hours: 48.7, offense: 1.23, bombing: 3.12, planets: 0.89, total: 5.24 },
    { name: 'FleetCmd', rank: 4, hours: 42.1, offense: 1.88, bombing: 1.45, planets: 1.12, total: 4.45 },
    { name: 'ScoutPilot', rank: 4, hours: 38.9, offense: 1.56, bombing: 1.23, planets: 1.34, total: 4.13 },
    { name: 'NewCadet', rank: 2, hours: 12.3, offense: 0.92, bombing: 0.67, planets: 0.78, total: 2.37 },
  ];

  function loadSampleLeaderboard() {
    renderLeaderboard(SAMPLE_DATA, 'overall');
  }

  function fetchLeaderboard(url) {
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          renderLeaderboard(data, 'overall');
          document.getElementById('lb-empty').style.display = 'none';
        }
      })
      .catch(() => {
        loadSampleLeaderboard();
      });
  }

  function renderLeaderboard(data, sortBy) {
    const sorted = [...data].sort((a, b) => {
      if (sortBy === 'offense') return b.offense - a.offense;
      if (sortBy === 'bombing') return b.bombing - a.bombing;
      if (sortBy === 'planets') return b.planets - a.planets;
      return b.total - a.total;
    });

    const tbody = document.getElementById('lb-body');
    if (!tbody) return;

    tbody.innerHTML = sorted.map((p, i) => {
      const rankClass = i < 3 ? ` class="lb-rank-${i + 1}"` : '';
      return `<tr${rankClass}>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${RANK_NAMES[p.rank] || 'Unknown'}</td>
        <td>${p.hours.toFixed(1)}</td>
        <td>${p.offense.toFixed(2)}</td>
        <td>${p.bombing.toFixed(2)}</td>
        <td>${p.planets.toFixed(2)}</td>
        <td>${p.total.toFixed(2)}</td>
      </tr>`;
    }).join('');

    const empty = document.getElementById('lb-empty');
    if (empty) empty.style.display = sorted.length > 0 ? 'none' : 'block';

    // Store for re-sorting
    window._leaderboardData = data;
  }

  // Tab switching
  window.showLeaderboard = function (category) {
    // Update active tab
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.classList.toggle('active', tab.textContent.toLowerCase() === category);
    });

    const data = window._leaderboardData || SAMPLE_DATA;
    renderLeaderboard(data, category);
  };

  // ---------- Nav: close mobile menu on link click ----------
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navbar').classList.remove('open');
    });
  });

  // ---------- Nav: highlight active section on scroll ----------
  const sections = document.querySelectorAll('.section, .hero');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  function updateActiveNav() {
    const scrollY = window.scrollY + 100;
    let currentId = '';

    sections.forEach(section => {
      if (section.offsetTop <= scrollY) {
        currentId = section.id;
      }
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === '#' + currentId) {
        link.style.color = 'var(--accent-gold)';
      } else {
        link.style.color = '';
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav);

  // ---------- Init ----------
  window.addEventListener('DOMContentLoaded', () => {
    applyConfig();
    updateActiveNav();
  });

  // If config already loaded (script order), apply immediately
  if (document.readyState !== 'loading') {
    applyConfig();
  }
})();
