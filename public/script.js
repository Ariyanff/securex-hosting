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
   * Lightweight refresh – only updates stats and bot statuses without
   * re-rendering the entire card grid (avoids flashing).
   */
  async function refreshDashboard() {
    // Only refresh if we are on the dashboard page
    const dashboardPage = $('#page-dashboard');
    if (!dashboardPage || dashboardPage.style.display === 'none') return;

    try {
      const [stats, bots] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/bots'),
      ]);

      botsCache = bots;

      // Update stat numbers directly (no animation on refresh)
      setCounterValue($('#stat-total'), stats.totalBots || 0);
      setCounterValue($('#stat-running'), stats.running || 0);
      setCounterValue($('#stat-pending'), stats.pending || 0);
      setCounterValue($('#stat-stopped'), stats.stopped || 0);

      // Re-render cards to pick up any new/removed bots
      renderBotCards(bots);
    } catch (err) {
      console.error('Dashboard refresh failed:', err);
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

  function renderBotCards(bots) {
    const container = $('#bots-container');
    if (!container) return;

    if (!bots || bots.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🤖</div>
          <h3>No bots yet</h3>
          <p>Upload your first bot to get started!</p>
          <button class="btn btn-primary" onclick="document.getElementById('new-bot-btn')?.click()">
            Upload Bot
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = bots.map((bot, i) => renderBotCard(bot, i)).join('');
  }

  function renderBotCard(bot, index = 0) {
    const sClass = statusClass(bot.status);
    const sIcon = statusIcon(bot.status);
    const uptime = bot.status === 'RUNNING' ? formatUptime(bot.uptimeStart) : '—';
    const isRunning = (bot.status || '').toUpperCase() === 'RUNNING';
    const isStopped = (bot.status || '').toUpperCase() === 'STOPPED';
    const delay = index * 0.06;

    return `
      <div class="bot-card" data-bot-id="${bot.id}" style="animation-delay: ${delay}s">
        <div class="bot-card-header">
          <div class="bot-card-name">
            <span class="bot-card-icon">🤖</span>
            <span class="bot-name-text" title="${escapeHtml(bot.name)}">${escapeHtml(bot.name)}</span>
          </div>
          <span class="status-badge ${sClass}">
            <span class="status-dot">${sIcon}</span>
            ${(bot.status || 'STOPPED').toUpperCase()}
          </span>
        </div>
        <div class="bot-card-body">
          <div class="bot-info-row">
            <span class="info-label">Entry Point</span>
            <span class="info-value">${escapeHtml(bot.entryPoint || 'index.js')}</span>
          </div>
          <div class="bot-info-row">
            <span class="info-label">Security</span>
            <span class="info-value">${escapeHtml(bot.security || 'Standard')}</span>
          </div>
          <div class="bot-info-row">
            <span class="info-label">Uptime</span>
            <span class="info-value bot-uptime" data-uptime-start="${bot.uptimeStart || ''}">${uptime}</span>
          </div>
          <div class="bot-info-row">
            <span class="info-label">Restarts</span>
            <span class="info-value">${bot.restarts || 0}</span>
          </div>
        </div>
        <div class="bot-console-section" id="console-${bot.id}" style="display:none">
          <div class="bot-console-output" id="console-output-${bot.id}"></div>
        </div>
        <div class="bot-card-actions">
          ${isStopped
            ? `<button class="btn btn-success btn-sm" data-action="start" data-bot-id="${bot.id}" title="Start">▶ Start</button>`
            : `<button class="btn btn-warning btn-sm" data-action="stop" data-bot-id="${bot.id}" title="Stop">⏹ Stop</button>`
          }
          <button class="btn btn-info btn-sm" data-action="restart" data-bot-id="${bot.id}" title="Restart" ${isStopped ? 'disabled' : ''}>↻ Restart</button>
          <button class="btn btn-secondary btn-sm" data-action="console" data-bot-id="${bot.id}" title="Console">⌨ Console</button>
          <button class="btn btn-primary btn-sm" data-action="logs" data-bot-id="${bot.id}" title="Full Logs">📋 Logs</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-bot-id="${bot.id}" title="Delete">🗑 Delete</button>
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
        case 'delete':  deleteBot(botId); break;
        case 'console': toggleConsole(botId); break;
        case 'logs':    openLogs(botId); break;
      }
    });
  }

  // ─── Bot Controls ──────────────────────────────────────────────────────────

  async function startBot(botId) {
    try {
      await apiFetch(`/api/bots/${botId}/start`, { method: 'POST' });
      showToast('Bot started successfully', 'success');
      await refreshDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to start bot', 'error');
    }
  }

  async function stopBot(botId) {
    try {
      await apiFetch(`/api/bots/${botId}/stop`, { method: 'POST' });
      showToast('Bot stopped', 'info');
      await refreshDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to stop bot', 'error');
    }
  }

  async function restartBot(botId) {
    try {
      await apiFetch(`/api/bots/${botId}/restart`, { method: 'POST' });
      showToast('Bot restarted', 'success');
      await refreshDashboard();
    } catch (err) {
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
              <span class="file-group-chevron">▸</span>
            </div>
            <div class="file-list" id="file-list-${bot.id}" style="display:none">
              ${files.length === 0 ? '<div class="file-empty">No files found</div>' : ''}
              ${files.map(f => `
                <div class="file-item ${f.isEntryPoint ? 'file-entry-point' : ''}">
                  <span class="file-icon">${f.isEntryPoint ? '⚡' : '📄'}</span>
                  <span class="file-name" title="${escapeHtml(f.path || f.name)}">${escapeHtml(f.name)}</span>
                  <span class="file-size">${formatFileSize(f.size)}</span>
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
          stopBtn.outerHTML = `<button class="btn btn-success btn-sm" data-action="start" data-bot-id="${botId}" title="Start">▶ Start</button>`;
        } else if (!isStopped && startBtn) {
          startBtn.outerHTML = `<button class="btn btn-warning btn-sm" data-action="stop" data-bot-id="${botId}" title="Stop">⏹ Stop</button>`;
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
    // Placeholder – extend as needed for admin features
    try {
      const stats = await apiFetch('/api/stats');
      const sys = await apiFetch('/api/system');
      
      const el = (id) => document.getElementById(id);
      
      if(sys) {
          if(el('sys-platform')) el('sys-platform').textContent = sys.platform;
          if(el('sys-node-version')) el('sys-node-version').textContent = sys.nodeVersion;
          if(el('sys-python-version')) el('sys-python-version').textContent = sys.pythonVersion;
          
          if(el('sys-cpu-bar')) el('sys-cpu-bar').style.width = `${sys.cpuUsage}%`;
          if(el('sys-cpu-text')) el('sys-cpu-text').textContent = `${sys.cpuUsage}%`;
          
          if(el('sys-mem-bar')) el('sys-mem-bar').style.width = `${sys.memory.percentage}%`;
          if(el('sys-mem-text')) el('sys-mem-text').textContent = `${sys.memory.percentage}% (${sys.memory.usedGB} GB / ${sys.memory.totalGB} GB)`;
          
          if(el('sys-disk-bar') && sys.disk) {
              el('sys-disk-bar').style.width = `${sys.disk.percentage}%`;
              if(el('sys-disk-text')) el('sys-disk-text').textContent = `${sys.disk.percentage}% (${sys.disk.usedGB} GB / ${sys.disk.totalGB} GB)`;
          }
          
          if(el('admin-uptime')) {
              const days = Math.floor(sys.uptime / 86400);
              const hours = Math.floor((sys.uptime % 86400) / 3600);
              const mins = Math.floor((sys.uptime % 3600) / 60);
              el('admin-uptime').textContent = `${days}d ${hours}h ${mins}m`;
          }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    initNavigation();
    initUpload();
    initBotCardEvents();
    initFileGroupToggle();
    loadDashboard();

    // Auto-refresh dashboard every 10 seconds
    dashboardRefreshId = setInterval(refreshDashboard, 10000);
  });
})();
