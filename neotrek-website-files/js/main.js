/**
 * NeoNetrek Global Website - Main JavaScript
 *
 * Handles: starfield animation, server list rendering,
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

  // ---------- Utility ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Server List ----------
  const SAMPLE_SERVERS = [
    {
      name: 'Example Server 1',
      url: '',
      location: 'New York, US',
      description: 'A sample entry -- add your own server to servers.js to replace these.',
    },
    {
      name: 'Example Server 2',
      url: '',
      location: 'Frankfurt, DE',
      description: 'Another sample entry showing how the server list looks when populated.',
    },
    {
      name: 'Example Server 3',
      url: '',
      location: 'Tokyo, JP',
      description: 'Servers with a URL will be polled for live status and player count.',
    },
  ];

  function getServers() {
    if (
      Array.isArray(window.NEONETREK_SERVERS) &&
      window.NEONETREK_SERVERS.length > 0
    ) {
      return window.NEONETREK_SERVERS;
    }
    return SAMPLE_SERVERS;
  }

  function renderServerCard(server) {
    const name = escapeHtml(server.name || 'Unnamed Server');
    const location = escapeHtml(server.location || 'Unknown');
    const description = escapeHtml(server.description || '');
    const id = 'server-' + name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    const joinBtn = server.url
      ? `<a class="server-join-btn" href="${escapeHtml(server.url)}" target="_blank" rel="noopener noreferrer">Join Server</a>`
      : `<span class="server-join-btn server-join-disabled">No URL</span>`;

    return `<div class="server-card" id="${id}">
      <div class="server-name">${name}</div>
      <div class="server-location">&gt; ${location}</div>
      <div class="server-desc">${description}</div>
      <div class="server-status">
        <span class="status-dot status-unknown"></span>
        <span class="status-text">Checking...</span>
        <span class="player-count"></span>
      </div>
      <div class="server-actions">
        ${joinBtn}
      </div>
    </div>`;
  }

  function renderServers() {
    const grid = document.getElementById('servers-grid');
    if (!grid) return;

    const servers = getServers();
    grid.innerHTML = servers.map(renderServerCard).join('');

    // Probe each server with a URL for health status
    servers.forEach((server) => {
      if (!server.url) return;

      const id = 'server-' + escapeHtml(server.name || 'Unnamed Server')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase();
      const card = document.getElementById(id);
      if (!card) return;

      const dot = card.querySelector('.status-dot');
      const text = card.querySelector('.status-text');
      const count = card.querySelector('.player-count');

      fetch(server.url.replace(/\/+$/, '') + '/health', { mode: 'cors' })
        .then((r) => {
          if (!r.ok) throw new Error('not ok');
          return r.json();
        })
        .then((data) => {
          dot.classList.remove('status-unknown');
          dot.classList.add('status-online');
          text.textContent = 'Online';

          var n = data.connections ?? data.players ?? data.playerCount;
          if (typeof n === 'number') {
            count.textContent = n + (n === 1 ? ' player' : ' players');
          }
        })
        .catch(() => {
          dot.classList.remove('status-unknown');
          dot.classList.add('status-offline');
          text.textContent = 'Offline';
        });
    });
  }

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
    renderServers();
    updateActiveNav();
  });

  // If DOM already loaded (script order), render immediately
  if (document.readyState !== 'loading') {
    renderServers();
  }
})();
