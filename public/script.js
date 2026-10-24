// ═══════════════════════════════════════════════════════════════════════════════
// SENPAI — Discord Bot Hosting Panel
// Client-side JavaScript — Full Implementation
// ═══════════════════════════════════════════════════════════════════════════════

(() => {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let ws = null;
  let currentBotIdForLogs = null;
  let selectedFile = null;
  let uptimeIntervalId = null;
  let dashboardRefreshId = null;
  let botsCache = [];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Safe querySelector shorthand.
   */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /**
   * Format bytes into a human-readable string.
   */
  function formatFileSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '0 B';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 && i > 0 ? val.toFixed(2) : val < 100 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
  }

  /**
   * Format an uptime duration from a start timestamp to now.
   * Returns e.g. "8m 18s", "1h 23m", "2d 5h", or "—" if not applicable.
   */
  function formatUptime(uptimeStart) {
    if (!uptimeStart) return '—';
    const diff = Math.max(0, Math.floor((Date.now() - new Date(uptimeStart).getTime()) / 1000));
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) {
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      return `${m}m ${s}s`;
    }
    if (diff < 86400) {
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    return `${d}d ${h}h`;
  }

  /**
   * Format a timestamp for log display.
   */
  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false });
  }

  /**
   * Status badge colour class.
   */
  function statusClass(status) {
    switch ((status || '').toUpperCase()) {
      case 'RUNNING': return 'status-running';
      case 'PENDING': return 'status-pending';
      case 'STOPPED':
      default: return 'status-stopped';
    }
  }

  /**
   * Status icon character.
   */
  function statusIcon(status) {
    switch ((status || '').toUpperCase()) {
      case 'RUNNING': return '●';
      case 'PENDING': return '◐';
      case 'STOPPED':
      default: return '○';
    }
  }

  /**
   * Escapes HTML entities.
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── API layer ──────────────────────────────────────────────────────────────

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || body.message || `Request failed (${res.status})`);
    }
    return res.json();
  }

  // ─── Toast Notifications ───────────────────────────────────────────────────

  function showToast(message, type = 'success') {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));
    container.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    // Auto-remove after 3s
    setTimeout(() => removeToast(toast), 3000);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Fallback removal
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 500);
  }

  // ─── Confirmation Modal ────────────────────────────────────────────────────

  function showConfirmModal(message) {
    return new Promise((resolve) => {
      const modal = $('#confirm-modal');
      const msgEl = $('#confirm-message');
      const yesBtn = $('#confirm-yes');
      const noBtn = $('#confirm-no');

      if (!modal || !msgEl || !yesBtn || !noBtn) {
        resolve(false);
        return;
      }

      msgEl.textContent = message;
      modal.classList.add('modal-visible');

      function cleanup(result) {
        modal.classList.remove('modal-visible');
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEscape);
        resolve(result);
      }

      function onYes() { cleanup(true); }
      function onNo() { cleanup(false); }
      function onBackdrop(e) { if (e.target === modal) cleanup(false); }
      function onEscape(e) { if (e.key === 'Escape') cleanup(false); }

      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onEscape);
    });
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function initNavigation() {
    // Nav item clicks
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) navigateTo(page);
        // Close mobile sidebar
        closeSidebar();
      });
    });

    // Hamburger toggle
    const hamburger = $('#hamburger-btn');
    if (hamburger) {
      hamburger.addEventListener('click', () => {
        const sidebar = $('.sidebar');
        if (sidebar) sidebar.classList.toggle('active');
        const overlay = $('.sidebar-overlay');
        if (overlay) overlay.classList.toggle('active');
      });
    }

    // Overlay click closes sidebar
    const overlay = $('.sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    // "New Bot" button on dashboard
    const newBotBtn = $('#new-bot-btn');
    if (newBotBtn) {
      newBotBtn.addEventListener('click', () => navigateTo('upload'));
    }

    // Logs back button
    const logsBackBtn = $('#logs-back-btn');
    if (logsBackBtn) {
      logsBackBtn.addEventListener('click', () => navigateTo('dashboard'));
    }

    // Logs download button
    const logsDownloadBtn = $('#logs-download-btn');
    if (logsDownloadBtn) {
      logsDownloadBtn.addEventListener('click', downloadLogs);
    }
  }

  function closeSidebar() {
    const sidebar = $('.sidebar');
    if (sidebar) sidebar.classList.remove('active');
    const overlay = $('.sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  const pageTitles = {
    dashboard: ['Dashboard', 'Overview'],
    upload: ['Upload', 'Bot'],
    files: ['My', 'Files'],
    logs: ['Bot', 'Logs'],
    admin: ['Admin', 'Panel'],
  };

  function navigateTo(page) {
    // Hide all pages
    $$('[id^="page-"]').forEach(el => {
      el.style.display = 'none';
    });

    // Show target page
    const target = $(`#page-${page}`);
    if (target) target.style.display = '';

    // Update active nav item
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update header title
    const headerTitle = $('.header-title');
    if (headerTitle) {
      const titles = pageTitles[page] || ['SENPAI', ''];
      const labelEl = headerTitle.querySelector('.page-label');
      const nameEl = headerTitle.querySelector('.page-name');
      if (labelEl) labelEl.textContent = titles[0];
      if (nameEl) nameEl.textContent = titles[1];
    }

    // Clean up any running uptime interval when leaving dashboard
    if (page !== 'dashboard' && uptimeIntervalId) {
      clearInterval(uptimeIntervalId);
      uptimeIntervalId = null;
    }

    // Clean up logs subscription when leaving logs page
    if (page !== 'logs') {
      currentBotIdForLogs = null;
    }

    // Load page-specific data
    switch (page) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'upload':
        resetUploadForm();
        break;
      case 'files':
        loadFiles();
        break;
      case 'admin':
        loadAdmin();
        break;
    }
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async function loadDashboard() {
    try {
      const [stats, bots] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/bots'),
      ]);

      botsCache = bots;

      // Animate stat counters
      animateCounter($('#stat-total'), stats.totalBots || 0);
      animateCounter($('#stat-running'), stats.running || 0);
      animateCounter($('#stat-pending'), stats.pending || 0);
      animateCounter($('#stat-stopped'), stats.stopped || 0);

      renderBotCards(bots);
      startUptimeTicker();
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      showToast('Failed to load dashboard data', 'error');
    }
  }

  /**
  function updateSystemInfoUI(sys) {
    if (!sys) return;
    const el = (id) => document.getElementById(id);

    if (el('sys-platform')) el('sys-platform').textContent = sys.platform;
    if (el('sys-node-version')) el('sys-node-version').textContent = sys.nodeVersion;
    if (el('sys-python-version')) el('sys-python-version').textContent = sys.pythonVersion;

    if (el('sys-cpu-bar')) el('sys-cpu-bar').style.width = `${sys.cpuUsage}%`;
    if (el('sys-cpu-text')) el('sys-cpu-text').textContent = `${sys.cpuUsage}%`;

    if (el('sys-mem-bar')) el('sys-mem-bar').style.width = `${sys.memory.percentage}%`;
    if (el('sys-mem-text')) el('sys-mem-text').textContent = `${sys.memory.percentage}% (${sys.memory.usedGB} GB / ${sys.memory.totalGB} GB)`;

    if (el('sys-disk-bar') && sys.disk) {
      el('sys-disk-bar').style.width = `${sys.disk.percentage}%`;
      if (el('sys-disk-text')) el('sys-disk-text').textContent = `${sys.disk.percentage}% (${sys.disk.usedGB} GB / ${sys.disk.totalGB} GB)`;
    }

    if (el('admin-uptime')) {
      const days = Math.floor(sys.uptime / 86400);
      const hours = Math.floor((sys.uptime % 86400) / 3600);
      const mins = Math.floor((sys.uptime % 3600) / 60);
      el('admin-uptime').textContent = `${days}d ${hours}h ${mins}m`;
    }
  }

  function updateBotCardsInPlace(bots) {
    const container = $('#bots-container');
    if (!container) return false;

    const existingCards = $$('.bot-card[data-bot-id]', container);
    if (existingCards.length === 0 && bots.length > 0) return false;
    if (existingCards.length !== bots.length) return false;

    const existingIds = existingCards.map(c => c.dataset.botId);
    const newIds = bots.map(b => b.id);
    if (!newIds.every(id => existingIds.includes(id))) return false;

    bots.forEach(bot => {
      const card = container.querySelector(`.bot-card[data-bot-id="${bot.id}"]`);
      if (!card) return;

      const isRunning = (bot.status || '').toUpperCase() === 'RUNNING';
      const isStopped = (bot.status || '').toUpperCase() === 'STOPPED';

      // Status badge
      const statusBadge = card.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.className = `status-badge ${statusClass(bot.status)}`;
        statusBadge.innerHTML = `<span class="status-dot">${statusIcon(bot.status)}</span> ${(bot.status || 'STOPPED').toUpperCase()}`;
      }

      // Uptime
      const uptimeEl = card.querySelector('.bot-uptime');
      if (uptimeEl) {
        uptimeEl.dataset.uptimeStart = bot.uptimeStart || '';
        uptimeEl.textContent = isRunning ? formatUptime(bot.uptimeStart) : '—';
      }

      // Restarts
      const infoValues = card.querySelectorAll('.bot-info-row .info-value');
      if (infoValues.length >= 3) {
        infoValues[2].textContent = bot.restarts || 0;
      }

      // Real RAM & CPU
      const memLimit = bot.memoryLimitMB || 512;
      const memUsed = isRunning ? (bot.memoryMB || 0) : 0;
      const memPercent = isRunning ? Math.min(100, Math.round((memUsed / memLimit) * 100)) : 0;
      const cpuUsed = isRunning ? (bot.cpuPercent || 0) : 0;

      const memText = card.querySelector('.bot-mem-text');
      if (memText) memText.textContent = isRunning ? `${memUsed} MB / ${memLimit} MB` : 'Inactive';

      const cpuText = card.querySelector('.bot-cpu-text');
      if (cpuText) cpuText.textContent = isRunning ? `${cpuUsed}%` : '0%';

      const meterFill = card.querySelector('.bot-meter-fill');
      if (meterFill) meterFill.style.width = `${isRunning ? memPercent : 0}%`;

      // Update start / stop button state smoothly
      const actionsDiv = card.querySelector('.bot-card-actions');
      if (actionsDiv) {
        const startBtn = actionsDiv.querySelector('[data-action="start"]');
        const stopBtn = actionsDiv.querySelector('[data-action="stop"]');
        const restartBtn = actionsDiv.querySelector('[data-action="restart"]');

        if (isStopped && stopBtn) {
          stopBtn.outerHTML = `<button class="btn btn-success btn-sm" data-action="start" data-bot-id="${bot.id}" title="Start Bot"><i class="fas fa-play"></i> Start</button>`;
          if (restartBtn) restartBtn.disabled = true;
        } else if (isRunning && startBtn) {
          startBtn.outerHTML = `<button class="btn btn-warning btn-sm" data-action="stop" data-bot-id="${bot.id}" title="Stop Bot"><i class="fas fa-stop"></i> Stop</button>`;
          if (restartBtn) restartBtn.disabled = false;
        }
      }
    });

    return true;
  }

  /**
   * Real-time 2-second refresh for telemetry, stats, and system info
   */
  async function refreshDashboard() {
    try {
      const [stats, bots, sys] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/bots'),
        apiFetch('/api/system').catch(() => null)
      ]);

      botsCache = bots;

      // Update stat counters
      setCounterValue($('#stat-total'), stats.totalBots || 0);
      setCounterValue($('#stat-running'), stats.running || 0);
      setCounterValue($('#stat-pending'), stats.pending || 0);
      setCounterValue($('#stat-stopped'), stats.stopped || 0);

      // Real-time System Information bar update
      if (sys) {
        updateSystemInfoUI(sys);
      }

      // Real-time Bot Cards update in-place without blinking
      if (!activeLoadingBots || activeLoadingBots.size === 0) {
        const inPlaceUpdated = updateBotCardsInPlace(bots);
        if (!inPlaceUpdated) {
          renderBotCards(bots);
        }
      }
    } catch (err) {
      console.error('Real-time telemetry refresh failed:', err);
    }
  }

  function setCounterValue(el, value) {
    if (el) el.textContent = value;
  }

  function animateCounter(el, target) {
    if (!el) return;
    const duration = 600; // ms
    const start = performance.now();
    const from = parseInt(el.textContent, 10) || 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      el.textContent = Math.round(from + (target - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  let searchFilterQuery = '';
  let statusFilterType = 'all';

  function renderBotCards(bots) {
    const container = $('#bots-container');
    if (!container) return;

    if (!bots || bots.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-robot"></i></div>
          <h3>No bots yet</h3>
          <p>Upload your first bot to get started with SecureX Hosting!</p>
          <button class="btn btn-primary btn-glow-deploy" onclick="document.getElementById('new-bot-btn')?.click()">
            <i class="fas fa-plus"></i> Upload Bot
          </button>
        </div>
      `;
      updateFilterCounts(0, 0, 0);
      return;
    }

    // Calculate status counts
    const total = bots.length;
    const running = bots.filter(b => (b.status || '').toLowerCase() === 'running').length;
    const stopped = total - running;
    updateFilterCounts(total, running, stopped);

    // Apply active filter and search query
    let filtered = bots;
    if (statusFilterType === 'running') {
      filtered = filtered.filter(b => (b.status || '').toLowerCase() === 'running');
    } else if (statusFilterType === 'stopped') {
      filtered = filtered.filter(b => (b.status || '').toLowerCase() !== 'running');
    }

    if (searchFilterQuery) {
      const q = searchFilterQuery.toLowerCase();
      filtered = filtered.filter(b => 
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.id && b.id.toLowerCase().includes(q)) ||
        (b.entryPoint && b.entryPoint.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 20px;">
          <div class="empty-state-icon"><i class="fas fa-magnifying-glass"></i></div>
          <h3>No matching bots found</h3>
          <p>Try searching for a different keyword or change the filter tab.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((bot, i) => renderBotCard(bot, i)).join('');
  }

  function updateFilterCounts(total, running, stopped) {
    const countAll = $('#count-all');
    const countRunning = $('#count-running');
    const countStopped = $('#count-stopped');
    if (countAll) countAll.textContent = total;
    if (countRunning) countRunning.textContent = running;
    if (countStopped) countStopped.textContent = stopped;
  }

  function renderBotCard(bot, index = 0) {
    const sClass = statusClass(bot.status);
    const sIcon = statusIcon(bot.status);
    const uptime = (bot.status || '').toUpperCase() === 'RUNNING' ? formatUptime(bot.uptimeStart) : '—';
    const isRunning = (bot.status || '').toUpperCase() === 'RUNNING';
    const isStopped = (bot.status || '').toUpperCase() === 'STOPPED';
    const delay = index * 0.05;

    // 100% Real OS process telemetry from server
    const memLimit = bot.memoryLimitMB || 512;
    const memUsed = isRunning ? (bot.memoryMB || 0) : 0;
    const memPercent = isRunning ? Math.min(100, Math.round((memUsed / memLimit) * 100)) : 0;
    const cpuUsed = isRunning ? (bot.cpuPercent || 0) : 0;

    return `
      <div class="beam-card-wrapper bot-card-beam" style="animation-delay: ${delay}s">
        <div class="beam-card-inner">
          <div class="bot-card tilt-card" data-bot-id="${bot.id}">
            <div class="card-shine"></div>
            <div class="bot-card-header">
              <div class="bot-card-name">
                <span class="bot-card-icon"><i class="fas fa-robot"></i></span>
                <div>
                  <span class="bot-name-text" title="${escapeHtml(bot.name)}">${escapeHtml(bot.name)}</span>
                  <div class="bot-id-copy-badge" onclick="copyBotId('${bot.id}')" title="Click to copy Bot ID">
                    <i class="fas fa-copy"></i>
                    <span>${escapeHtml(bot.id)}</span>
                  </div>
                </div>
              </div>
              <span class="status-badge ${sClass}">
                <span class="status-dot">${sIcon}</span>
                ${(bot.status || 'STOPPED').toUpperCase()}
              </span>
            </div>
            <div class="bot-card-body">
              <div class="bot-info-row">
                <span class="info-label"><i class="fas fa-file-code" style="color:var(--accent-cyan);margin-right:4px;"></i> Entry Point</span>
                <span class="info-value" style="font-family:var(--font-mono);">${escapeHtml(bot.entryPoint || 'bot.py')}</span>
              </div>
              <div class="bot-info-row">
                <span class="info-label"><i class="fas fa-clock" style="color:var(--accent-purple);margin-right:4px;"></i> Uptime</span>
                <span class="info-value bot-uptime" data-uptime-start="${bot.uptimeStart || ''}">${uptime}</span>
              </div>
              <div class="bot-info-row">
                <span class="info-label"><i class="fas fa-rotate" style="color:var(--accent-orange);margin-right:4px;"></i> Restarts</span>
                <span class="info-value">${bot.restarts || 0}</span>
              </div>

              <!-- Resource Telemetry Meter (100% Real-Time) -->
              <div class="bot-meter-row">
                <div class="bot-meter-header">
                  <span><i class="fas fa-microchip"></i> Memory: <strong class="bot-mem-text">${isRunning ? `${memUsed} MB / ${memLimit} MB` : 'Inactive'}</strong></span>
                  <span><i class="fas fa-bolt" style="color:var(--accent-cyan);margin-left:8px;"></i> CPU: <strong class="bot-cpu-text">${isRunning ? `${cpuUsed}%` : '0%'}</strong></span>
                </div>
                <div class="bot-meter-track">
                  <div class="bot-meter-fill" style="width: ${isRunning ? memPercent : 0}%"></div>
                </div>
              </div>
            </div>

            <div class="bot-console-section" id="console-${bot.id}" style="display:none">
              <div class="bot-console-output" id="console-output-${bot.id}"></div>
            </div>

            <div class="bot-card-actions">
              ${isStopped
                ? `<button class="btn btn-success btn-sm" data-action="start" data-bot-id="${bot.id}" title="Start Bot"><i class="fas fa-play"></i> Start</button>`
                : `<button class="btn btn-warning btn-sm" data-action="stop" data-bot-id="${bot.id}" title="Stop Bot"><i class="fas fa-stop"></i> Stop</button>`
              }
              <button class="btn btn-info btn-sm" data-action="restart" data-bot-id="${bot.id}" title="Restart Bot" ${isStopped ? 'disabled' : ''}><i class="fas fa-rotate"></i> Restart</button>
              <button class="btn btn-outline-cyan btn-sm" data-action="editor" data-bot-id="${bot.id}" title="Edit Files & Save/Deploy"><i class="fas fa-code"></i> Files / Edit</button>
              <button class="btn btn-secondary btn-sm" data-action="console" data-bot-id="${bot.id}" title="Inline Console"><i class="fas fa-terminal"></i> Console</button>
              <button class="btn btn-primary btn-sm" data-action="logs" data-bot-id="${bot.id}" title="Full Logs View"><i class="fas fa-clipboard-list"></i> Logs</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-bot-id="${bot.id}" title="Delete Bot"><i class="fas fa-trash-can"></i> Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Start a 1-second interval that updates all visible uptime counters on the dashboard.
   */
  function startUptimeTicker() {
    if (uptimeIntervalId) clearInterval(uptimeIntervalId);
    uptimeIntervalId = setInterval(() => {
      $$('.bot-uptime').forEach(el => {
        const start = el.dataset.uptimeStart;
        if (start) el.textContent = formatUptime(start);
      });
    }, 1000);
  }

  // ─── Bot Card Event Delegation ─────────────────────────────────────────────

  function initBotCardEvents() {
    // Use event delegation on document for dynamically created cards
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const botId = btn.dataset.botId;
      if (!botId) return;

      switch (action) {
        case 'start':   startBot(botId); break;
        case 'stop':    stopBot(botId); break;
        case 'restart': restartBot(botId); break;
        case 'editor':  openEditor(botId); break;
        case 'delete':  deleteBot(botId); break;
        case 'console': toggleConsole(botId); break;
        case 'logs':    openLogs(botId); break;
      }
    });
  }

  // ─── Bot Controls & 3D Circular Progress Engine ────────────────────────────

  const activeLoadingBots = new Set();
  const statusWaiters = new Map(); // botId -> Array of { targetStatus, resolve, reject, timer }

  function notifyStatusWaiters(botId, status) {
    if (!botId || !status) return;
    const list = statusWaiters.get(botId);
    if (!list || list.length === 0) return;
    const current = status.toLowerCase();
    const remaining = [];
    for (const waiter of list) {
      if (waiter.targetStatus.toLowerCase() === current) {
        clearTimeout(waiter.timer);
        waiter.resolve(current);
      } else {
        remaining.push(waiter);
      }
    }
    if (remaining.length > 0) {
      statusWaiters.set(botId, remaining);
    } else {
      statusWaiters.delete(botId);
    }
  }

  function waitForBotStatus(botId, targetStatus, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const cached = botsCache.find(b => b.id === botId);
      if (cached && (cached.status || '').toLowerCase() === targetStatus.toLowerCase()) {
        return resolve(cached.status);
      }

      let pollInterval = null;
      let waiterObj = null;

      const timer = setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval);
        const list = statusWaiters.get(botId) || [];
        statusWaiters.set(botId, list.filter(w => w !== waiterObj));
        reject(new Error(`Timeout waiting for bot status '${targetStatus}'`));
      }, timeoutMs);

      waiterObj = {
        targetStatus,
        resolve: (val) => {
          if (pollInterval) clearInterval(pollInterval);
          resolve(val);
        },
        reject: (err) => {
          if (pollInterval) clearInterval(pollInterval);
          reject(err);
        },
        timer
      };

      const list = statusWaiters.get(botId) || [];
      list.push(waiterObj);
      statusWaiters.set(botId, list);

      // Actively poll /api/bots in case of delayed WebSocket event
      pollInterval = setInterval(async () => {
        if (!statusWaiters.has(botId)) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const bots = await apiFetch('/api/bots');
          const b = bots.find(x => x.id === botId);
          if (b && (b.status || '').toLowerCase() === targetStatus.toLowerCase()) {
            clearInterval(pollInterval);
            notifyStatusWaiters(botId, b.status);
          }
        } catch (e) {}
      }, 500);
    });
  }

  function runBotProgressAnimation(botId, options = {}) {
    const card = document.querySelector(`.bot-card[data-bot-id="${botId}"]`);
    if (!card) return null;

    activeLoadingBots.add(botId);

    const inner = card.closest('.beam-card-inner') || card.parentElement;

    // Blur card
    card.classList.add('bot-card-blurred');

    // Remove any leftover overlay
    const oldOverlay = inner.querySelector('.bot-loading-overlay');
    if (oldOverlay) oldOverlay.remove();

    const titleText = options.title || 'STARTING BOT';
    const subText = options.initialSub || 'Initializing environment...';
    const iconHtml = options.icon || '<i class="fas fa-play"></i>';
    const targetWait = options.targetWaitPercent || 92;
    const circumference = 301.6; // 2 * PI * 48

    const overlay = document.createElement('div');
    overlay.className = 'bot-loading-overlay';
    overlay.id = `loading-overlay-${botId}`;
    overlay.innerHTML = `
      <div class="circular-progress-box" id="circle-box-${botId}">
        <div class="ring-ambient-glow"></div>
        <svg width="124" height="124" viewBox="0 0 124 124">
          <defs>
            <linearGradient id="purpleRingGrad-${botId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f0abfc" />
              <stop offset="40%" stop-color="#c084fc" />
              <stop offset="80%" stop-color="#8b5cf6" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
            <filter id="purpleGlowFilter-${botId}" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#a855f7" flood-opacity="0.9" />
              <feDropShadow dx="0" dy="0" stdDeviation="9" flood-color="#8b5cf6" flood-opacity="0.6" />
            </filter>
          </defs>
          <circle class="ring-bg" cx="62" cy="62" r="48" />
          <circle class="ring-progress" id="ring-circle-${botId}" cx="62" cy="62" r="48"
                  stroke="url(#purpleRingGrad-${botId})"
                  filter="url(#purpleGlowFilter-${botId})"
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${circumference};" />
        </svg>
        <div class="ring-center-content">
          <div class="ring-icon-wrap" id="ring-icon-${botId}">${iconHtml}</div>
          <div class="ring-percent" id="ring-percent-${botId}">0%</div>
        </div>
      </div>
      <div class="ring-status-title" id="ring-title-${botId}">${titleText}</div>
      <div class="ring-status-sub" id="ring-sub-${botId}">${subText}</div>
    `;

    inner.appendChild(overlay);

    // Trigger entrance transition
    requestAnimationFrame(() => overlay.classList.add('active'));

    const ringCircle = overlay.querySelector(`#ring-circle-${botId}`);
    const percentEl = overlay.querySelector(`#ring-percent-${botId}`);
    const titleEl = overlay.querySelector(`#ring-title-${botId}`);
    const subEl = overlay.querySelector(`#ring-sub-${botId}`);
    const iconWrap = overlay.querySelector(`#ring-icon-${botId}`);
    const circleBox = overlay.querySelector(`#circle-box-${botId}`);

    let currentPercent = 0;
    let isFinished = false;

    // Smooth ease-in progress towards targetWait (holds at 92-94% until verified)
    const interval = setInterval(() => {
      if (isFinished) {
        clearInterval(interval);
        return;
      }

      if (currentPercent < targetWait) {
        const remaining = targetWait - currentPercent;
        const step = Math.max(0.6, remaining * 0.08);
        currentPercent = Math.min(targetWait, currentPercent + step);

        if (percentEl) percentEl.textContent = `${Math.round(currentPercent)}%`;
        if (ringCircle) {
          const offset = circumference * (1 - currentPercent / 100);
          ringCircle.style.strokeDashoffset = offset;
        }

        if (options.action === 'start') {
          if (currentPercent >= 15 && currentPercent < 40) {
            if (subEl) subEl.textContent = 'Verifying runtime & packages...';
          } else if (currentPercent >= 40 && currentPercent < 70) {
            if (subEl) subEl.textContent = 'Spawning bot process...';
          } else if (currentPercent >= 70) {
            if (subEl) subEl.textContent = 'Awaiting online handshake...';
          }
        } else if (options.action === 'stop') {
          if (currentPercent >= 20 && currentPercent < 55) {
            if (subEl) subEl.textContent = 'Sending SIGINT/SIGTERM...';
          } else if (currentPercent >= 55) {
            if (subEl) subEl.textContent = 'Terminating child threads...';
          }
        }
      }
    }, 45);

    return {
      complete: (opts = {}) => {
        return new Promise((resolve) => {
          isFinished = true;
          clearInterval(interval);

          let p = currentPercent;
          const sprintInterval = setInterval(() => {
            p += (100 - p) * 0.35 + 1.5;
            if (p >= 99.5) {
              p = 100;
              clearInterval(sprintInterval);

              if (percentEl) percentEl.textContent = '100%';
              if (ringCircle) ringCircle.style.strokeDashoffset = '0';
              if (iconWrap) {
                iconWrap.innerHTML = opts.icon || '<i class="fas fa-check"></i>';
                iconWrap.style.color = '#34d399';
                iconWrap.style.transform = 'scale(1.25)';
              }
              if (titleEl) {
                titleEl.textContent = opts.title || 'READY';
                titleEl.style.color = '#34d399';
              }
              if (subEl) {
                subEl.textContent = opts.sub || 'Operation complete!';
                subEl.style.color = '#a7f3d0';
              }
              if (circleBox) circleBox.classList.add('ring-success-pulse');

              // Hold on 100% for 650ms so user can enjoy the 100% completion
              setTimeout(() => {
                overlay.classList.add('fade-out');
                card.classList.remove('bot-card-blurred');

                setTimeout(() => {
                  overlay.remove();
                  activeLoadingBots.delete(botId);
                  resolve();
                }, 350);
              }, 650);
            } else {
              if (percentEl) percentEl.textContent = `${Math.round(p)}%`;
              if (ringCircle) {
                ringCircle.style.strokeDashoffset = circumference * (1 - p / 100);
              }
            }
          }, 30);
        });
      },

      fail: (errMsg) => {
        isFinished = true;
        clearInterval(interval);

        if (percentEl) {
          percentEl.textContent = '!';
          percentEl.style.color = '#f87171';
        }
        if (iconWrap) {
          iconWrap.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
          iconWrap.style.color = '#f87171';
        }
        if (titleEl) {
          titleEl.textContent = 'FAILED';
          titleEl.style.color = '#f87171';
        }
        if (subEl) {
          subEl.textContent = errMsg || 'Operation failed';
          subEl.style.color = '#fca5a5';
        }
        if (ringCircle) {
          ringCircle.style.stroke = '#ef4444';
        }

        setTimeout(() => {
          overlay.classList.add('fade-out');
          card.classList.remove('bot-card-blurred');
          setTimeout(() => {
            overlay.remove();
            activeLoadingBots.delete(botId);
          }, 350);
        }, 1600);
      }
    };
  }

  async function startBot(botId) {
    const anim = runBotProgressAnimation(botId, {
      action: 'start',
      title: 'STARTING BOT',
      initialSub: 'Initializing environment...',
      icon: '<i class="fas fa-play"></i>',
      targetWaitPercent: 92
    });

    try {
      await apiFetch(`/api/bots/${botId}/start`, { method: 'POST' });
      await waitForBotStatus(botId, 'running', 15000);

      if (anim) {
        await anim.complete({
          title: 'BOT ONLINE',
          sub: 'Process active & operational',
          icon: '<i class="fas fa-check"></i>'
        });
      }
      showToast('Bot started successfully', 'success');
      await refreshDashboard();
    } catch (err) {
      if (anim) anim.fail(err.message || 'Failed to start bot');
      showToast(err.message || 'Failed to start bot', 'error');
    }
  }

  async function stopBot(botId) {
    const anim = runBotProgressAnimation(botId, {
      action: 'stop',
      title: 'STOPPING BOT',
      initialSub: 'Sending shutdown signal...',
      icon: '<i class="fas fa-stop"></i>',
      targetWaitPercent: 88
    });

    try {
      await apiFetch(`/api/bots/${botId}/stop`, { method: 'POST' });
      await waitForBotStatus(botId, 'stopped', 12000);

      if (anim) {
        await anim.complete({
          title: 'BOT STOPPED',
          sub: 'Process terminated cleanly',
          icon: '<i class="fas fa-check"></i>'
        });
      }
      showToast('Bot stopped', 'info');
      await refreshDashboard();
    } catch (err) {
      if (anim) anim.fail(err.message || 'Failed to stop bot');
      showToast(err.message || 'Failed to stop bot', 'error');
    }
  }

  async function restartBot(botId) {
    const anim = runBotProgressAnimation(botId, {
      action: 'restart',
      title: 'RESTARTING BOT',
      initialSub: 'Rebooting process...',
      icon: '<i class="fas fa-rotate"></i>',
      targetWaitPercent: 90
    });

    try {
      await apiFetch(`/api/bots/${botId}/restart`, { method: 'POST' });
      await waitForBotStatus(botId, 'running', 15000);

      if (anim) {
        await anim.complete({
          title: 'BOT RESTARTED',
          sub: 'System reboot complete',
          icon: '<i class="fas fa-check"></i>'
        });
      }
      showToast('Bot restarted', 'success');
      await refreshDashboard();
    } catch (err) {
      if (anim) anim.fail(err.message || 'Failed to restart bot');
      showToast(err.message || 'Failed to restart bot', 'error');
    }
  }

  async function deleteBot(botId) {
    const bot = botsCache.find(b => b.id === botId);
    const name = bot ? bot.name : botId;
    const confirmed = await showConfirmModal(`Are you sure you want to delete "${name}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/api/bots/${botId}`, { method: 'DELETE' });
      showToast(`${name} deleted`, 'info');
      await refreshDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to delete bot', 'error');
    }
  }

  // ─── Live Console Toggle ──────────────────────────────────────────────────

  async function toggleConsole(botId) {
    const section = $(`#console-${botId}`);
    if (!section) return;

    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';

    if (isHidden) {
      const output = $(`#console-output-${botId}`);
      if (output && !output.dataset.loaded) {
        output.innerHTML = '<div class="console-loading">Loading logs…</div>';
        try {
          const logs = await apiFetch(`/api/bots/${botId}/logs`);
          output.innerHTML = '';
          const recentLogs = logs.slice(-50); // show last 50 lines
          recentLogs.forEach(log => {
            appendLogLine(output, log.timestamp, log.message);
          });
          output.dataset.loaded = 'true';
          output.scrollTop = output.scrollHeight;
        } catch (err) {
          output.innerHTML = '<div class="console-error">Failed to load logs</div>';
        }
      }
      // Subscribe to live updates
      subscribeToBotLogs(botId);
    }
  }

  function appendLogLine(container, timestamp, message) {
    const line = document.createElement('div');
    line.className = 'log-line';
    const ts = formatTimestamp(timestamp);
    line.innerHTML = `<span class="log-timestamp">[${escapeHtml(ts)}]</span> <span class="log-message">${escapeHtml(message)}</span>`;
    container.appendChild(line);
  }

  // ─── Upload ────────────────────────────────────────────────────────────────

  function initUpload() {
    const dropzone = $('#dropzone');
    const fileInput = $('#file-input');
    const uploadBtn = $('#upload-btn');
    const fileNameDisplay = $('#selected-file-name');

    if (!dropzone || !fileInput) return;

    // Click to browse
    dropzone.addEventListener('click', (e) => {
      if (e.target === uploadBtn || e.target.closest('#upload-btn')) return;
      fileInput.click();
    });

    // Drag events
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        selectFile(files[0]);
      }
    });

    // File input change
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        selectFile(fileInput.files[0]);
      }
    });

    // Upload button
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedFile) {
          uploadBot(selectedFile);
        } else {
          showToast('Please select a file first', 'error');
        }
      });
    }
  }

  function selectFile(file) {
    selectedFile = file;
    const fileNameDisplay = $('#selected-file-name');
    if (fileNameDisplay) {
      fileNameDisplay.textContent = file.name;
      fileNameDisplay.classList.add('has-file');
    }
    const uploadBtn = $('#upload-btn');
    if (uploadBtn) uploadBtn.disabled = false;
  }

  function resetUploadForm() {
    selectedFile = null;
    const fileInput = $('#file-input');
    if (fileInput) fileInput.value = '';
    const fileNameDisplay = $('#selected-file-name');
    if (fileNameDisplay) {
      fileNameDisplay.textContent = '';
      fileNameDisplay.classList.remove('has-file');
    }
    const uploadBtn = $('#upload-btn');
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload';
      uploadBtn.classList.remove('btn-loading');
    }
  }

  async function uploadBot(file) {
    const uploadBtn = $('#upload-btn');
    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.classList.add('btn-loading');
        uploadBtn.innerHTML = '<span class="spinner"></span> Uploading…';
      }

      const formData = new FormData();
      formData.append('file', file);

      const result = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      showToast(`Bot "${result.name || file.name}" uploaded successfully!`, 'success');
      navigateTo('dashboard');
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.classList.remove('btn-loading');
        uploadBtn.textContent = 'Upload';
      }
    }
  }

  // ─── My Files ──────────────────────────────────────────────────────────────

  async function loadFiles() {
    const container = $('#files-container');
    const totalSizeEl = $('#total-size');
    const totalFilesEl = $('#total-files');

    if (!container) return;
    container.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading files…</div>';

    try {
      const bots = await apiFetch('/api/bots');

      if (!bots || bots.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <h3>No files yet</h3>
            <p>Upload a bot to see its files here.</p>
          </div>
        `;
        if (totalSizeEl) totalSizeEl.textContent = '0 B';
        if (totalFilesEl) totalFilesEl.textContent = '0';
        return;
      }

      // Fetch files for all bots concurrently
      const fileResults = await Promise.all(
        bots.map(async (bot) => {
          try {
            const files = await apiFetch(`/api/bots/${bot.id}/files`);
            return { bot, files };
          } catch {
            return { bot, files: [] };
          }
        })
      );

      let totalBytes = 0;
      let totalFileCount = 0;

      container.innerHTML = fileResults.map(({ bot, files }, idx) => {
        const botTotalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
        totalBytes += botTotalSize;
        totalFileCount += files.length;

        return `
          <div class="file-group" style="animation-delay: ${idx * 0.06}s">
            <div class="file-group-header" data-toggle="file-list-${bot.id}">
              <div class="file-group-info">
                <span class="file-group-icon">📦</span>
                <span class="file-group-name">${escapeHtml(bot.name)}</span>
                <span class="file-group-meta">${files.length} file${files.length !== 1 ? 's' : ''} · ${formatFileSize(botTotalSize)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="btn btn-xs btn-outline-cyan" onclick="event.stopPropagation(); openEditor('${bot.id}')" title="Edit Bot Files">
                  <i class="fas fa-code"></i> Edit Files
                </button>
                <span class="file-group-chevron">▸</span>
              </div>
            </div>
            <div class="file-list" id="file-list-${bot.id}" style="display:none">
              ${files.length === 0 ? '<div class="file-empty">No files found</div>' : ''}
              ${files.map(f => `
                <div class="file-item ${f.isEntryPoint ? 'file-entry-point' : ''}" data-open-editor="true" data-bot-id="${bot.id}" data-file-name="${escapeHtml(f.name)}" style="cursor:pointer;" title="Click to open and edit file">
                  <span class="file-icon">${f.isEntryPoint ? '⚡' : '📄'}</span>
                  <span class="file-name" title="${escapeHtml(f.path || f.name)}">${escapeHtml(f.name)}</span>
                  <span class="file-size">${formatFileSize(f.size)}</span>
                  <span class="btn-xs btn-outline-cyan" style="padding:2px 6px;font-size:10px;border-radius:4px;"><i class="fas fa-pen-to-square"></i> Edit</span>
                  ${f.isEntryPoint ? '<span class="file-badge">Entry</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');

      if (totalSizeEl) totalSizeEl.textContent = formatFileSize(totalBytes);
      if (totalFilesEl) totalFilesEl.textContent = totalFileCount.toString();
    } catch (err) {
      container.innerHTML = '<div class="error-state">Failed to load files</div>';
      showToast('Failed to load files', 'error');
    }
  }

  function initFileGroupToggle() {
    document.addEventListener('click', (e) => {
      const header = e.target.closest('[data-toggle]');
      if (!header) return;
      const targetId = header.dataset.toggle;
      const list = $(`#${targetId}`);
      if (!list) return;

      const isHidden = list.style.display === 'none';
      list.style.display = isHidden ? 'block' : 'none';

      const chevron = header.querySelector('.file-group-chevron');
      if (chevron) chevron.textContent = isHidden ? '▾' : '▸';

      header.closest('.file-group')?.classList.toggle('expanded', isHidden);
    });
  }

  // ─── Bot Logs ──────────────────────────────────────────────────────────────

  async function openLogs(botId) {
    currentBotIdForLogs = botId;
    navigateToLogsPage(botId);

    const terminal = $('#logs-terminal');
    const botNameEl = $('#logs-bot-name');
    const botIdEl = $('#logs-bot-id');
    const botStatusEl = $('#logs-bot-status');

    // Set bot info
    const bot = botsCache.find(b => b.id === botId);
    if (botNameEl) botNameEl.textContent = bot ? bot.name : botId;
    if (botIdEl) botIdEl.textContent = botId;
    if (botStatusEl && bot) {
      botStatusEl.className = `status-badge ${statusClass(bot.status)}`;
      botStatusEl.innerHTML = `${statusIcon(bot.status)} ${(bot.status || 'STOPPED').toUpperCase()}`;
    }

    if (!terminal) return;
    terminal.innerHTML = '<div class="console-loading">Loading logs…</div>';

    try {
      const logs = await apiFetch(`/api/bots/${botId}/logs`);
      terminal.innerHTML = '';
      logs.forEach(log => {
        appendLog(log.timestamp, log.message);
      });
      terminal.scrollTop = terminal.scrollHeight;
    } catch (err) {
      terminal.innerHTML = '<div class="console-error">Failed to load logs</div>';
      showToast('Failed to load logs', 'error');
    }

    // Subscribe to live updates
    subscribeToBotLogs(botId);
  }

  /**
   * Navigate directly to the logs page without triggering the regular navigateTo
   * data loading (which would call openLogs again recursively).
   */
  function navigateToLogsPage(botId) {
    $$('[id^="page-"]').forEach(el => el.style.display = 'none');
    const logsPage = $('#page-logs');
    if (logsPage) logsPage.style.display = '';

    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === 'logs');
    });

    const headerTitle = $('.header-title');
    if (headerTitle) {
      const labelEl = headerTitle.querySelector('.page-label');
      const nameEl = headerTitle.querySelector('.page-name');
      if (labelEl) labelEl.textContent = 'Bot';
      if (nameEl) nameEl.textContent = 'Logs';
    }

    if (uptimeIntervalId) {
      clearInterval(uptimeIntervalId);
      uptimeIntervalId = null;
    }
  }

  function appendLog(timestamp, message) {
    const terminal = $('#logs-terminal');
    if (!terminal) return;

    const line = document.createElement('div');
    line.className = 'log-line';
    const ts = formatTimestamp(timestamp);
    line.innerHTML = `<span class="log-timestamp">[${escapeHtml(ts)}]</span> <span class="log-message">${escapeHtml(message)}</span>`;
    terminal.appendChild(line);

    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      terminal.scrollTop = terminal.scrollHeight;
    });
  }

  function downloadLogs() {
    const terminal = $('#logs-terminal');
    if (!terminal) return;

    const lines = $$('.log-line', terminal).map(el => el.textContent);
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const bot = botsCache.find(b => b.id === currentBotIdForLogs);
    a.download = `${bot ? bot.name : 'bot'}-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Logs downloaded', 'success');
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────────

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('WebSocket connection failed, will retry…', err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('WebSocket connected');
      // If we were viewing logs, resubscribe
      if (currentBotIdForLogs) {
        subscribeToBotLogs(currentBotIdForLogs);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (err) {
        console.warn('Invalid WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting…');
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
      ws.close();
    };
  }

  function scheduleReconnect() {
    setTimeout(connectWebSocket, 3000);
  }

  function handleWebSocketMessage(data) {
    switch (data.type) {
      case 'log':
        // Append to full logs page if viewing this bot
        if (currentBotIdForLogs === data.botId) {
          appendLog(data.timestamp, data.message);
        }
        // Append to inline console if open
        const consoleOutput = $(`#console-output-${data.botId}`);
        if (consoleOutput && consoleOutput.closest('.bot-console-section')?.style.display !== 'none') {
          appendLogLine(consoleOutput, data.timestamp, data.message);
          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
        break;

      case 'status':
        updateBotStatus(data.botId, data.status);
        break;
    }
  }

  function subscribeToBotLogs(botId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', botId }));
    }
  }

  /**
   * Update a bot's status in the UI without full re-render.
   */
  function updateBotStatus(botId, status) {
    // Notify any pending circular animation waiters immediately
    notifyStatusWaiters(botId, status);

    // Update cached bot data
    const cachedBot = botsCache.find(b => b.id === botId);
    if (cachedBot) cachedBot.status = status;

    // Update bot card badge
    const card = $(`.bot-card[data-bot-id="${botId}"]`);
    if (card) {
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${statusClass(status)}`;
        badge.innerHTML = `<span class="status-dot">${statusIcon(status)}</span> ${(status || 'STOPPED').toUpperCase()}`;
      }

      // Update action buttons
      const isRunning = (status || '').toUpperCase() === 'RUNNING';
      const isStopped = (status || '').toUpperCase() === 'STOPPED';
      const actions = card.querySelector('.bot-card-actions');
      if (actions) {
        // Replace start/stop button
        const startBtn = actions.querySelector('[data-action="start"]');
        const stopBtn = actions.querySelector('[data-action="stop"]');
        if (isStopped && stopBtn) {
          stopBtn.outerHTML = `<button class="btn btn-success btn-sm" data-action="start" data-bot-id="${botId}" title="Start Bot"><i class="fas fa-play"></i> Start</button>`;
        } else if (!isStopped && startBtn) {
          startBtn.outerHTML = `<button class="btn btn-warning btn-sm" data-action="stop" data-bot-id="${botId}" title="Stop Bot"><i class="fas fa-stop"></i> Stop</button>`;
        }
        // Enable/disable restart
        const restartBtn = actions.querySelector('[data-action="restart"]');
        if (restartBtn) restartBtn.disabled = isStopped;
      }
    }

    // Update logs page status badge
    if (currentBotIdForLogs === botId) {
      const botStatusEl = $('#logs-bot-status');
      if (botStatusEl) {
        botStatusEl.className = `status-badge ${statusClass(status)}`;
        botStatusEl.innerHTML = `${statusIcon(status)} ${(status || 'STOPPED').toUpperCase()}`;
      }
    }

    // Refresh stat counters
    refreshStatCounters();
  }

  async function refreshStatCounters() {
    try {
      const stats = await apiFetch('/api/stats');
      setCounterValue($('#stat-total'), stats.totalBots || 0);
      setCounterValue($('#stat-running'), stats.running || 0);
      setCounterValue($('#stat-pending'), stats.pending || 0);
      setCounterValue($('#stat-stopped'), stats.stopped || 0);
    } catch {
      // Silently fail
    }
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async function loadAdmin() {
    try {
      const sys = await apiFetch('/api/system');
      if (sys) updateSystemInfoUI(sys);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }

  // ─── Code & File Editor with Save & Deploy ────────────────────────────────
  let currentEditorBotId = null;
  let currentEditorFile = null;
  let isEditorDirty = false;
  let editorFilesCache = [];

  function openEditor(botId, targetFile = null) {
    currentEditorBotId = botId;
    isEditorDirty = false;
    
    const bot = botsCache.find(b => b.id === botId);
    const modal = $('#editor-modal');
    const botNameEl = $('#editor-bot-name');
    const statusPill = $('#editor-bot-status-pill');
    const dirtyEl = $('#editor-dirty');

    if (!modal) return;

    if (botNameEl) botNameEl.textContent = bot ? bot.name : 'Bot Files';
    if (statusPill && bot) {
      statusPill.textContent = (bot.status || 'STOPPED').toUpperCase();
      statusPill.style.color = bot.status === 'running' ? '#34d399' : '#94a3b8';
      statusPill.style.background = bot.status === 'running' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)';
    }

    if (dirtyEl) dirtyEl.classList.add('hidden');
    modal.classList.remove('hidden');

    loadEditorFileList(botId, targetFile);
  }
  window.openEditor = openEditor;

  function closeEditor() {
    if (isEditorDirty) {
      if (!confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
        return;
      }
    }
    const modal = $('#editor-modal');
    if (modal) modal.classList.add('hidden');
    currentEditorBotId = null;
    currentEditorFile = null;
    isEditorDirty = false;
  }

  async function loadEditorFileList(botId, targetFile = null) {
    const listContainer = $('#editor-file-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div class="editor-loading-files"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      const files = await apiFetch(`/api/bots/${botId}/files`);
      editorFilesCache = files || [];

      if (!files || files.length === 0) {
        listContainer.innerHTML = '<div class="editor-loading-files">No files found.<br><button class="btn btn-xs btn-outline-cyan" style="margin-top:8px;" id="editor-empty-new-file"><i class="fas fa-plus"></i> Create File</button></div>';
        const emptyBtn = $('#editor-empty-new-file');
        if (emptyBtn) emptyBtn.onclick = openNewFileModal;
        $('#editor-textarea').value = '';
        $('#editor-current-path').textContent = 'No file selected';
        updateLineNumbers();
        return;
      }

      listContainer.innerHTML = files.map(f => {
        const isEntry = f.isEntryPoint;
        const icon = f.name.endsWith('.py') ? 'fa-brands fa-python' :
                     f.name.endsWith('.js') ? 'fa-brands fa-node-js' :
                     f.name.endsWith('.json') ? 'fa-solid fa-code' :
                     f.name.endsWith('.txt') ? 'fa-solid fa-file-lines' :
                     f.name.startsWith('.') ? 'fa-solid fa-gear' : 'fa-solid fa-file';
        return `
          <div class="editor-file-item" data-filename="${escapeHtml(f.name)}" title="${escapeHtml(f.name)}">
            <i class="${icon}" style="font-size:12px;color:${isEntry ? 'var(--accent-cyan)' : 'var(--text-muted)'}"></i>
            <span class="file-item-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(f.name)}</span>
            <button class="file-del-btn" data-delete-file="${escapeHtml(f.name)}" title="Delete file">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        `;
      }).join('');

      let fileToOpen = targetFile;
      if (!fileToOpen) {
        const entry = files.find(f => f.isEntryPoint);
        fileToOpen = entry ? entry.name : files[0].name;
      }
      loadEditorFile(botId, fileToOpen);
    } catch (err) {
      listContainer.innerHTML = '<div class="editor-loading-files" style="color:var(--accent-danger)">Failed to load files</div>';
    }
  }

  async function loadEditorFile(botId, filePath) {
    if (isEditorDirty) {
      if (!confirm(`You have unsaved changes in '${currentEditorFile}'. Discard and switch to '${filePath}'?`)) {
        return;
      }
    }

    currentEditorFile = filePath;
    isEditorDirty = false;

    const pathEl = $('#editor-current-path');
    const textarea = $('#editor-textarea');
    const statusText = $('#editor-status-text');
    const dirtyEl = $('#editor-dirty');

    if (pathEl) pathEl.textContent = filePath;
    if (dirtyEl) dirtyEl.classList.add('hidden');
    if (statusText) statusText.textContent = `Loading ${filePath}...`;

    $$('.editor-file-item').forEach(el => {
      if (el.dataset.filename === filePath) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    try {
      const data = await apiFetch(`/api/bots/${botId}/file?file=${encodeURIComponent(filePath)}`);
      if (textarea) {
        textarea.value = data.content != null ? data.content : '';
        updateLineNumbers();
      }
      if (statusText) statusText.textContent = `Loaded ${filePath} (${formatFileSize(data.size || 0)})`;
    } catch (err) {
      if (statusText) statusText.textContent = `Error loading file: ${err.message}`;
      showToast(err.message || 'Failed to load file content', 'error');
    }
  }

  async function saveEditorFile(deploy = false) {
    if (!currentEditorBotId || !currentEditorFile) {
      showToast('No file open to save', 'warning');
      return;
    }

    const textarea = $('#editor-textarea');
    const statusText = $('#editor-status-text');
    const dirtyEl = $('#editor-dirty');
    const deployBtn = $('#editor-deploy-btn');
    const saveBtn = $('#editor-save-btn');

    const content = textarea ? textarea.value : '';

    if (deploy) {
      if (deployBtn) {
        deployBtn.disabled = true;
        deployBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Deploying...</span>';
      }
      if (statusText) statusText.textContent = `Deploying ${currentEditorFile}...`;
    } else {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
      }
      if (statusText) statusText.textContent = `Saving ${currentEditorFile}...`;
    }

    const endpoint = deploy ? `/api/bots/${currentEditorBotId}/file/save-deploy` : `/api/bots/${currentEditorBotId}/file`;

    try {
      await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: currentEditorFile, content })
      });

      isEditorDirty = false;
      if (dirtyEl) dirtyEl.classList.add('hidden');

      if (deploy) {
        showToast('🚀 File saved & Bot redeployed successfully!', 'success');
        if (statusText) statusText.textContent = `✓ Saved & Redeployed ${currentEditorFile} successfully!`;
        await refreshDashboard();
        const statusPill = $('#editor-bot-status-pill');
        if (statusPill) {
          statusPill.textContent = 'RUNNING';
          statusPill.style.color = '#34d399';
          statusPill.style.background = 'rgba(16, 185, 129, 0.2)';
        }
      } else {
        showToast(`💾 Saved ${currentEditorFile}`, 'success');
        if (statusText) statusText.textContent = `✓ Saved ${currentEditorFile}`;
      }
    } catch (err) {
      showToast(err.message || 'Failed to save file', 'error');
      if (statusText) statusText.textContent = `✗ Save failed: ${err.message}`;
    } finally {
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.innerHTML = '<i class="fas fa-rocket"></i> <span>Save & Deploy</span>';
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> <span>Save</span>';
      }
    }
  }

  function updateLineNumbers() {
    const textarea = $('#editor-textarea');
    const lineNumbers = $('#editor-line-numbers');
    const linesCountEl = $('#editor-lines-count');
    if (!textarea || !lineNumbers) return;

    const lines = (textarea.value || '').split('\n').length;
    let numbersHtml = '';
    for (let i = 1; i <= lines; i++) {
      numbersHtml += `<div>${i}</div>`;
    }
    lineNumbers.innerHTML = numbersHtml;
    if (linesCountEl) linesCountEl.textContent = `Lines: ${lines}`;
  }

  function openNewFileModal() {
    const modal = $('#new-file-modal');
    const input = $('#new-filename-input');
    if (!modal) return;
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
    modal.classList.remove('hidden');
  }

  function closeNewFileModal() {
    const modal = $('#new-file-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function createNewFile() {
    if (!currentEditorBotId) return;
    const input = $('#new-filename-input');
    const filename = input ? input.value.trim() : '';

    if (!filename) {
      showToast('Please enter a valid file name', 'warning');
      return;
    }

    try {
      await apiFetch(`/api/bots/${currentEditorBotId}/file/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      showToast(`Created file '${filename}'`, 'success');
      closeNewFileModal();
      await loadEditorFileList(currentEditorBotId, filename);
    } catch (err) {
      showToast(err.message || 'Failed to create file', 'error');
    }
  }

  async function deleteEditorFile(filePath) {
    if (!confirm(`Are you sure you want to delete '${filePath}'? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/api/bots/${currentEditorBotId}/file?file=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      });

      showToast(`Deleted file '${filePath}'`, 'success');
      await loadEditorFileList(currentEditorBotId);
    } catch (err) {
      showToast(err.message || 'Failed to delete file', 'error');
    }
  }

  function initEditor() {
    const textarea = $('#editor-textarea');
    const lineNumbers = $('#editor-line-numbers');
    const saveBtn = $('#editor-save-btn');
    const deployBtn = $('#editor-deploy-btn');
    const closeBtn = $('#editor-close-btn');
    const newFileBtn = $('#editor-new-file-btn');
    const refreshFilesBtn = $('#editor-refresh-files');
    const dirtyEl = $('#editor-dirty');

    if (textarea && lineNumbers) {
      textarea.addEventListener('scroll', () => {
        lineNumbers.scrollTop = textarea.scrollTop;
      });

      textarea.addEventListener('input', () => {
        updateLineNumbers();
        if (!isEditorDirty) {
          isEditorDirty = true;
          if (dirtyEl) dirtyEl.classList.remove('hidden');
        }
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 4;
          updateLineNumbers();
          if (!isEditorDirty) {
            isEditorDirty = true;
            if (dirtyEl) dirtyEl.classList.remove('hidden');
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          saveEditorFile(false);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          saveEditorFile(true);
        }
      });
    }

    if (saveBtn) saveBtn.onclick = () => saveEditorFile(false);
    if (deployBtn) deployBtn.onclick = () => saveEditorFile(true);
    if (closeBtn) closeBtn.onclick = closeEditor;
    if (newFileBtn) newFileBtn.onclick = openNewFileModal;
    if (refreshFilesBtn) refreshFilesBtn.onclick = () => {
      if (currentEditorBotId) loadEditorFileList(currentEditorBotId, currentEditorFile);
    };

    const fileListEl = $('#editor-file-list');
    if (fileListEl) {
      fileListEl.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-delete-file]');
        if (delBtn) {
          e.stopPropagation();
          deleteEditorFile(delBtn.dataset.deleteFile);
          return;
        }

        const item = e.target.closest('.editor-file-item');
        if (item && item.dataset.filename) {
          loadEditorFile(currentEditorBotId, item.dataset.filename);
        }
      });
    }

    const newFileCancel = $('#new-file-cancel');
    const newFileConfirm = $('#new-file-confirm');
    const newFileInput = $('#new-filename-input');
    if (newFileCancel) newFileCancel.onclick = closeNewFileModal;
    if (newFileConfirm) newFileConfirm.onclick = createNewFile;
    if (newFileInput) {
      newFileInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createNewFile();
      });
    }

    const filesContainer = $('#files-container');
    if (filesContainer) {
      filesContainer.addEventListener('click', (e) => {
        const item = e.target.closest('[data-open-editor]');
        if (item && item.dataset.botId) {
          openEditor(item.dataset.botId, item.dataset.fileName);
        }
      });
    }
  }

  // ─── Search & Status Filters ───────────────────────────────────────────────

  function initSearchAndFilter() {
    const searchInput = $('#bot-search-input');
    const clearBtn = $('#search-clear-btn');
    const filterTabs = $$('.filter-tab');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchFilterQuery = e.target.value.trim();
        if (clearBtn) {
          if (searchFilterQuery.length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
        renderBotCards(botsCache);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchFilterQuery = '';
          clearBtn.classList.add('hidden');
          renderBotCards(botsCache);
          searchInput.focus();
        }
      });
    }

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        statusFilterType = tab.dataset.filter || 'all';
        renderBotCards(botsCache);
      });
    });
  }

  // ─── 3D Perspective Tilt with Zero-Lag rAF ─────────────────────────────────

  function init3DTilt() {
    let currentTiltCard = null;
    let cardRect = null;
    let shineEl = null;
    let rafId = null;
    let targetX = 0;
    let targetY = 0;

    function updateTilt() {
      if (!currentTiltCard || !cardRect) return;
      const maxTilt = 7.5; // subtle & premium
      const halfW = cardRect.width / 2;
      const halfH = cardRect.height / 2;

      const cx = targetX - cardRect.left - halfW;
      const cy = targetY - cardRect.top - halfH;

      const rotateY = Math.max(-maxTilt, Math.min(maxTilt, (cx / halfW) * maxTilt));
      const rotateX = Math.max(-maxTilt, Math.min(maxTilt, -(cy / halfH) * maxTilt));

      currentTiltCard.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px) scale3d(1.015, 1.015, 1.015)`;

      if (shineEl) {
        const px = targetX - cardRect.left;
        const py = targetY - cardRect.top;
        shineEl.style.background = `radial-gradient(circle at ${px}px ${py}px, rgba(139, 92, 246, 0.28) 0%, rgba(6, 182, 212, 0.15) 35%, transparent 70%)`;
        shineEl.style.opacity = '1';
      }
      rafId = null;
    }

    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.tilt-card');
      if (!card) {
        if (currentTiltCard) {
          resetTilt(currentTiltCard, shineEl);
          currentTiltCard = null;
          shineEl = null;
          cardRect = null;
        }
        return;
      }

      if (card !== currentTiltCard) {
        if (currentTiltCard) resetTilt(currentTiltCard, shineEl);
        currentTiltCard = card;
        cardRect = card.getBoundingClientRect();
        shineEl = card.querySelector('.card-shine');
      }

      targetX = e.clientX;
      targetY = e.clientY;

      if (!rafId) {
        rafId = requestAnimationFrame(updateTilt);
      }
    });

    document.addEventListener('mouseleave', () => {
      if (currentTiltCard) {
        resetTilt(currentTiltCard, shineEl);
        currentTiltCard = null;
        shineEl = null;
        cardRect = null;
      }
    });

    function resetTilt(card, shine) {
      if (!card) return;
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)';
      if (shine) {
        shine.style.opacity = '0';
      }
    }
  }

  // ─── Utility: Copy Bot ID ──────────────────────────────────────────────────

  window.copyBotId = function(id) {
    if (!id) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(() => {
        showToast(`📋 Copied Bot ID: ${id}`, 'info');
      }).catch(() => {
        fallbackCopyText(id);
      });
    } else {
      fallbackCopyText(id);
    }
  };

  function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(`📋 Copied Bot ID: ${text}`, 'info');
    } catch (e) {
      showToast('Could not copy to clipboard', 'error');
    }
    document.body.removeChild(textArea);
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    initNavigation();
    initUpload();
    initBotCardEvents();
    initFileGroupToggle();
    initEditor();
    initSearchAndFilter();
    init3DTilt();
    loadDashboard();

    // Real-time auto-refresh dashboard and telemetry every 2 seconds
    dashboardRefreshId = setInterval(refreshDashboard, 2000);
  });
})();
