/**
 * NeoNetrek Academy - Interactive training guide scripts
 */

(function () {
  'use strict';

  // ---------- Skill Path: highlight active section on scroll ----------
  const pathNodes = document.querySelectorAll('.path-node[data-section]');

  pathNodes.forEach(node => {
    node.addEventListener('click', () => {
      const sectionId = node.getAttribute('data-section');
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  function updateSkillPath() {
    const scrollY = window.scrollY + 150;
    let activeSection = '';

    ['basics', 'combat', 'roles', 'scenarios', 'glossary'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) {
        activeSection = id;
      }
    });

    pathNodes.forEach(node => {
      const isActive = node.getAttribute('data-section') === activeSection;
      node.classList.toggle('path-active', isActive);
    });
  }

  window.addEventListener('scroll', updateSkillPath);

  // ---------- Keyboard shortcut hints ----------
  // Add visual pulse to kbd elements when they're scrolled into view
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'none';
          // Trigger reflow
          void entry.target.offsetWidth;
          entry.target.style.animation = 'kbd-pulse 1s ease-out';
        }
      });
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll('.keybind-grid kbd, .combo-step kbd').forEach(kbd => {
    observer.observe(kbd);
  });

  // ---------- Init ----------
  updateSkillPath();
})();
