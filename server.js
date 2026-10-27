// ═══════════════════════════════════════════════════════════════════════════════
//  SENPAI — Discord Bot Hosting Panel  ·  Backend Server
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const os = require('os');
const cookieParser = require('cookie-parser');

// ─── Paths & Constants ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BOTS_JSON = path.join(DATA_DIR, 'bots.json');
const KNOWN_STDLIB = new Set([
    'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio',
    'asyncore', 'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex',
    'bisect', 'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath',
    'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys', 'compileall',
    'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy',
    'copyreg', 'cProfile', 'crypt', 'csv', 'ctypes', 'curses', 'dataclasses',
    'datetime', 'dbm', 'decimal', 'difflib', 'dis', 'distutils', 'doctest',
    'email', 'encodings', 'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp',
    'fileinput', 'fnmatch', 'formatter', 'fractions', 'ftplib', 'functools',
    'gc', 'getopt', 'getpass', 'gettext', 'glob', 'grp', 'gzip', 'hashlib',
    'heapq', 'hmac', 'html', 'http', 'idlelib', 'imaplib', 'imghdr', 'imp',
    'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json',
    'keyword', 'lib2to3', 'linecache', 'locale', 'logging', 'lzma',
    'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap',
    'modulefinder', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers',
    'operator', 'optparse', 'os', 'ossaudiodev', 'parser', 'pathlib',
    'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform',
    'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile',
    'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue',
    'quopri', 'random', 're', 'readline', 'reprlib', 'resource', 'rlcompleter',
    'runpy', 'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex',
    'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket',
    'socketserver', 'spwd', 'sqlite3', 'ssl', 'stat', 'statistics', 'string',
    'stringprep', 'struct', 'subprocess', 'sunau', 'symtable', 'sys',
    'sysconfig', 'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile',
    'termios', 'test', 'textwrap', 'threading', 'time', 'timeit', 'tkinter',
    'token', 'tokenize', 'trace', 'traceback', 'tracemalloc', 'tty',
    'turtle', 'turtledemo', 'types', 'typing', 'unicodedata', 'unittest',
    'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref',
    'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml',
    'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib', '_thread'
]);

// Common import-name → pip-package mappings
const IMPORT_TO_PACKAGE = {
    'discord': 'discord.py',
    'nextcord': 'nextcord',
    'disnake': 'disnake',
    'pycord': 'py-cord',
    'hikari': 'hikari',
    'interactions': 'discord-py-interactions',
    'aiohttp': 'aiohttp',
    'requests': 'requests',
    'dotenv': 'python-dotenv',
    'nacl': 'PyNaCl',
    'PIL': 'Pillow',
    'cv2': 'opencv-python',
    'sklearn': 'scikit-learn',
    'bs4': 'beautifulsoup4',
    'yaml': 'pyyaml',
    'lxml': 'lxml',
    'motor': 'motor',
    'pymongo': 'pymongo',
    'psutil': 'psutil',
    'colorama': 'colorama',
    'flask': 'flask',
    'fastapi': 'fastapi',
    'uvicorn': 'uvicorn',
    'wavelink': 'wavelink',
    'jishaku': 'jishaku',
    'yt_dlp': 'yt-dlp',
    'spotipy': 'spotipy',
    'openai': 'openai',
    'anthropic': 'anthropic',
    'numpy': 'numpy',
    'pandas': 'pandas',
    'matplotlib': 'matplotlib',
    'httpx': 'httpx',
    'pydantic': 'pydantic',
    'redis': 'redis',
    'celery': 'celery',
    'sqlalchemy': 'sqlalchemy',
    'alembic': 'alembic',
    'tortoise': 'tortoise-orm',
    'aiosqlite': 'aiosqlite',
    'asyncpg': 'asyncpg',
    'aiomysql': 'aiomysql',
    'topgg': 'topggpy',
    'dbl': 'dblpy',
    'easy_pil': 'easy-pil',
    'pomice': 'pomice',
};

// ─── Ensure directories exist ────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Bot data persistence ────────────────────────────────────────────────────
function loadBots() {
    try {
        if (fs.existsSync(BOTS_JSON)) {
            let raw = fs.readFileSync(BOTS_JSON, 'utf-8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            return JSON.parse(raw);
        }
    } catch { /* corrupted file — start fresh */ }
    return [];
}

function saveBots() {
    fs.writeFileSync(BOTS_JSON, JSON.stringify(bots, null, 2), 'utf-8');
}

let bots = loadBots();

// ─── Runtime state ───────────────────────────────────────────────────────────
const processes = new Map();   // botId -> ChildProcess
const botLogs = new Map();     // botId -> [{timestamp, message}]
const wsClients = new Map();   // botId -> Set<ws>

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateBotId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const year = new Date().getFullYear();
    return `HOST-${seg(5)}-${year}-${seg(4)}`;
}

function formatUptime(ms) {
    if (!ms || ms <= 0) return '0s';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (sec || parts.length === 0) parts.push(`${sec}s`);
    return parts.join(' ');
}

function addLog(botId, message) {
    if (!botLogs.has(botId)) botLogs.set(botId, []);
    const entry = { timestamp: new Date().toISOString(), message };
    botLogs.get(botId).push(entry);
    // Keep a rolling window of 2000 entries
    const logs = botLogs.get(botId);
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    // Broadcast via WebSocket
    broadcastLog(botId, entry);
}

function broadcastLog(botId, entry) {
    const subs = wsClients.get(botId);
    if (!subs) return;
    const payload = JSON.stringify({ type: 'log', botId, timestamp: entry.timestamp, message: entry.message });
    for (const ws of subs) {
        if (ws.readyState === 1) ws.send(payload);
    }
}

// Global WebSocket server instance
let wss = null;

function broadcastStatus(botId, status) {
    const payload = JSON.stringify({ type: 'status', botId, status });
    if (wss && wss.clients) {
        for (const ws of wss.clients) {
            if (ws.readyState === 1) {
                try { ws.send(payload); } catch(e) {}
            }
        }
    }
}

function broadcastBotDeleted(botId) {
    const payload = JSON.stringify({ type: 'bot_deleted', botId });
    if (wss && wss.clients) {
        for (const ws of wss.clients) {
            if (ws.readyState === 1) {
                try { ws.send(payload); } catch(e) {}
            }
        }
    }
}

function findBot(id) {
    return bots.find(b => b.id === id) || null;
}

function countFiles(dir) {
    let count = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isFile()) count++;
            else if (e.isDirectory()) count += countFiles(path.join(dir, e.name));
        }
    } catch { /* ignore */ }
    return count;
}

function dirSize(dir) {
    let size = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isFile()) size += fs.statSync(full).size;
            else if (e.isDirectory()) size += dirSize(full);
        }
    } catch { /* ignore */ }
    return size;
}

// Detect a suitable Python command
let PYTHON_CMD = 'python';
try {
    execSync('python --version', { stdio: 'ignore' });
} catch {
    try {
        execSync('python3 --version', { stdio: 'ignore' });
        PYTHON_CMD = 'python3';
    } catch {
        console.warn('[SENPAI] ⚠  Neither python nor python3 found on PATH. Bot execution will fail.');
    }
}

// Detect pip command
let PIP_CMD = 'pip';
try {
    execSync('pip --version', { stdio: 'ignore' });
} catch {
    try {
        execSync('pip3 --version', { stdio: 'ignore' });
        PIP_CMD = 'pip3';
    } catch {
        console.warn('[SENPAI] ⚠  Neither pip nor pip3 found on PATH. Auto-install will fail.');
    }
}

// ─── Detect entry point in a directory ───────────────────────────────────────
function detectEntryPoint(dir) {
    const priority = ['bot.js', 'index.js', 'main.js', 'bot.py', 'main.py', 'app.py', 'index.py', 'run.py'];
    for (const name of priority) {
        if (fs.existsSync(path.join(dir, name))) return name;
    }
    // Fallback: first .js or .py file
    try {
        const files = fs.readdirSync(dir);
        const jsFile = files.find(f => f.endsWith('.js'));
        if (jsFile) return jsFile;
        const pyFile = files.find(f => f.endsWith('.py'));
        if (pyFile) return pyFile;
    } catch { /* ignore */ }
    return null;
}

// ─── Parse imports from a Python file ────────────────────────────────────────
function parseImports(filePath) {
    const imports = new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // import x, import x.y, import x as z
            let match = trimmed.match(/^import\s+([\w.]+)/);
            if (match) { imports.add(match[1].split('.')[0]); continue; }
            // from x import y, from x.y import z
            match = trimmed.match(/^from\s+([\w.]+)\s+import/);
            if (match) { imports.add(match[1].split('.')[0]); }
        }
    } catch { /* ignore */ }
    return [...imports];
}

// ─── Install missing packages ────────────────────────────────────────────────
async function autoInstallDeps(botId, botDir, entryPoint) {
    const reqPath = path.join(botDir, 'requirements.txt');
    const hasReqs = fs.existsSync(reqPath);

    if (hasReqs) {
        addLog(botId, '[AUTO-INSTALL] Found requirements.txt — installing dependencies ...');
        await new Promise((resolve) => {
            const proc = spawn(PIP_CMD, ['install', '-r', 'requirements.txt', '--quiet', '--disable-pip-version-check', '--break-system-packages'], {
                cwd: botDir,
                shell: true
            });
            proc.stdout.on('data', d => addLog(botId, d.toString().trimEnd()));
            proc.stderr.on('data', d => addLog(botId, d.toString().trimEnd()));
            proc.on('close', (code) => {
                if (code === 0) addLog(botId, '[AUTO-INSTALL] ✓ requirements.txt installed successfully!');
                else addLog(botId, `[AUTO-INSTALL] ⚠ pip exited with code ${code}`);
                resolve();
            });
            proc.on('error', (err) => {
                addLog(botId, `[AUTO-INSTALL] ✗ Error: ${err.message}`);
                resolve();
            });
        });
        return;
    }

    // Scan imports
    const entryPath = path.join(botDir, entryPoint);
    const imports = parseImports(entryPath);
    const missing = imports.filter(i => !KNOWN_STDLIB.has(i));
    if (missing.length === 0) {
        addLog(botId, '[AUTO-INSTALL] No third-party dependencies detected.');
        return;
    }

    addLog(botId, `[AUTO-INSTALL] Scanning imports — found ${missing.length} potential third-party package(s)`);

    for (const mod of missing) {
        const pkg = IMPORT_TO_PACKAGE[mod] || mod;
        addLog(botId, `[AUTO-INSTALL] Missing '${mod}' — installing '${pkg}' ...`);
        await new Promise((resolve) => {
            const proc = spawn(PIP_CMD, ['install', pkg, '--quiet', '--disable-pip-version-check', '--break-system-packages'], {
                cwd: botDir,
                shell: true
            });
            proc.stdout.on('data', d => addLog(botId, d.toString().trimEnd()));
            proc.stderr.on('data', d => addLog(botId, d.toString().trimEnd()));
            proc.on('close', (code) => {
                if (code === 0) addLog(botId, `[AUTO-INSTALL] ✓ ${pkg} installed!`);
                else addLog(botId, `[AUTO-INSTALL] ⚠ Failed to install ${pkg} (exit ${code})`);
                resolve();
            });
            proc.on('error', (err) => {
                addLog(botId, `[AUTO-INSTALL] ✗ Error installing ${pkg}: ${err.message}`);
                resolve();
            });
        });
    }
}

// ─── Start a bot process ─────────────────────────────────────────────────────
async function startBot(bot) {
    if (processes.has(bot.id)) return; // already running

    const botDir = bot.dir;
    const entryPath = path.join(botDir, bot.entryPoint);

    if (!fs.existsSync(entryPath)) {
        throw new Error(`Entry point not found: ${bot.entryPoint}`);
    }

    const isNodeBot = bot.entryPoint.endsWith('.js');

    // Startup banner
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    addLog(bot.id, '════════════════════════════════════════════════════');
    addLog(bot.id, `START  ${ts}`);
    addLog(bot.id, `FILE   ${entryPath}`);
    addLog(bot.id, `TYPE   ${isNodeBot ? 'Node.js Bot' : 'Python Bot'}`);
    addLog(bot.id, '[AUTO-INSTALL enabled]');
    addLog(bot.id, '════════════════════════════════════════════════════');

    // Set status to pending during install
    bot.status = 'pending';
    saveBots();
    broadcastStatus(bot.id, 'pending');

    // Auto-install dependencies (optimized so bots start instantly without re-installing)
    if (isNodeBot) {
        const hasPackage = fs.existsSync(path.join(botDir, 'package.json'));
        const hasNodeModules = fs.existsSync(path.join(botDir, 'node_modules'));
        if (hasPackage && !hasNodeModules) {
            addLog(bot.id, `[AUTO-INSTALL] Running initial npm install ...`);
            await new Promise((resolve) => {
                const proc = spawn('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
                    cwd: botDir,
                    shell: true
                });
                proc.stdout.on('data', d => addLog(bot.id, d.toString().trimEnd()));
                proc.stderr.on('data', d => addLog(bot.id, d.toString().trimEnd()));
                proc.on('close', (code) => {
                    if (code === 0) addLog(bot.id, `[AUTO-INSTALL] ✓ Node.js packages installed!`);
                    else addLog(bot.id, `[AUTO-INSTALL] ⚠ npm install failed (exit ${code})`);
                    resolve();
                });
                proc.on('error', (err) => {
                    addLog(bot.id, `[AUTO-INSTALL] ✗ Error running npm: ${err.message}`);
                    resolve();
                });
            });
        }
    } else {
        if (!bot.depsInstalled) {
            await autoInstallDeps(bot.id, botDir, bot.entryPoint);
            bot.depsInstalled = true;
            saveBots();
        }
    }

    // Load .env file if present in bot directory
    let botEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
    delete botEnv.PORT; // Prevent child bot from conflicting with panel HTTP port
    const envFilePath = path.join(botDir, '.env');
    if (fs.existsSync(envFilePath)) {
        try {
            const envContent = fs.readFileSync(envFilePath, 'utf-8');
            const envLines = envContent.split('\n');
            for (const line of envLines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex === -1) continue;
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();
                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                botEnv[key] = value;
            }
            addLog(bot.id, `[SENPAI] Loaded .env file (${Object.keys(botEnv).length - Object.keys(process.env).length - 1} variables)`);
        } catch (envErr) {
            addLog(bot.id, `[SENPAI] ⚠ Failed to parse .env: ${envErr.message}`);
        }
    }

    // Spawn the bot process
    const isWin = process.platform === 'win32';
    const spawnCmd = isNodeBot ? 'node' : PYTHON_CMD;
    const spawnArgs = isNodeBot ? [bot.entryPoint] : ['-u', bot.entryPoint];
    
    addLog(bot.id, `[SENPAI] Starting ${bot.entryPoint} using ${spawnCmd} ...`);
    const child = spawn(spawnCmd, spawnArgs, {
        cwd: botDir,
        shell: true,
        env: botEnv,
        detached: !isWin  // Linux: create process group for clean kill
    });

    processes.set(bot.id, child);
    bot.status = 'running';
    bot.autoRestart = true;
    bot.uptimeStart = new Date().toISOString();
    saveBots();
    broadcastStatus(bot.id, 'running');

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.length > 0);
        for (const line of lines) addLog(bot.id, line);
    });

    child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.length > 0);
        for (const line of lines) addLog(bot.id, `[stderr] ${line}`);
    });

    child.on('error', (err) => {
        addLog(bot.id, `[SENPAI] Process error: ${err.message}`);
        bot.status = 'stopped';
        bot.uptimeStart = null;
        saveBots();
        broadcastStatus(bot.id, 'stopped');
        processes.delete(bot.id);
    });

    child.on('close', (code, signal) => {
        addLog(bot.id, `[SENPAI] Process exited (code=${code}, signal=${signal})`);
        bot.status = 'stopped';
        if (bot.uptimeStart) {
            bot.uptime += Date.now() - new Date(bot.uptimeStart).getTime();
        }
        bot.uptimeStart = null;
        saveBots();
        broadcastStatus(bot.id, 'stopped');
        processes.delete(bot.id);

        // Auto-recover if crashed or closed unexpectedly (not user-stopped)
        if (bot.autoRestart && !stoppingBots.has(bot.id)) {
            addLog(bot.id, `[SENPAI] 🔄 Process exited unexpectedly. Auto-restarting in 5s ...`);
            setTimeout(() => {
                if (bot.autoRestart && !processes.has(bot.id)) {
                    startBot(bot).catch(err => addLog(bot.id, `[SENPAI] Auto-restart error: ${err.message}`));
                }
            }, 5000);
        }
    });
}

// ─── Stop a bot process ──────────────────────────────────────────────────────
const stoppingBots = new Set();

function stopBot(bot, manual = false) {
    return new Promise((resolve) => {
        if (manual) {
            bot.autoRestart = false;
        }
        // Prevent duplicate stop calls
        if (stoppingBots.has(bot.id)) return resolve();
        stoppingBots.add(bot.id);

        const child = processes.get(bot.id);
        if (!child) {
            bot.status = 'stopped';
            saveBots();
            broadcastStatus(bot.id, 'stopped');
            stoppingBots.delete(bot.id);
            return resolve();
        }

        addLog(bot.id, '[SENPAI] Stopping bot ...');

        const cleanup = () => {
            processes.delete(bot.id);
            bot.status = 'stopped';
            if (bot.uptimeStart) {
                bot.uptime += Date.now() - new Date(bot.uptimeStart).getTime();
            }
            bot.uptimeStart = null;
            saveBots();
            broadcastStatus(bot.id, 'stopped');
            stoppingBots.delete(bot.id);
            resolve();
        };

        // Kill the entire process tree
        try {
            const pid = child.pid;
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { shell: true });
            } else {
                // Kill process group on Linux
                try { process.kill(-pid, 'SIGKILL'); } catch {
                    try { child.kill('SIGKILL'); } catch { /* ignore */ }
                    // Also try pkill to kill any orphan python processes
                    spawn('pkill', ['-P', pid.toString()], { shell: true });
                }
            }
        } catch { /* ignore */ }

        // Wait for close event or force cleanup after timeout
        const forceCleanup = setTimeout(() => {
            addLog(bot.id, '[SENPAI] Force cleanup');
            cleanup();
        }, 3000);

        child.once('close', () => {
            clearTimeout(forceCleanup);
            addLog(bot.id, '[SENPAI] Bot stopped.');
            cleanup();
        });
    });
}

// ─── Delete bot directory recursively ────────────────────────────────────────
function deleteBotDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* best effort */ }
}

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'senpai123';
const AUTH_COOKIE_NAME = 'senpai_auth';
const AUTH_COOKIE_VALUE = 'authenticated';

// Auth Login Route (unprotected)
app.post('/api/login', (req, res) => {
    if (req.body.password === PANEL_PASSWORD) {
        res.cookie(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Incorrect password' });
    }
});

// Auth Logout Route (unprotected)
app.post('/api/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME);
    res.json({ success: true });
});

// Auth Middleware for static files and API
app.use((req, res, next) => {
    if (req.path === '/login.html' || req.path === '/api/login') {
        return next();
    }
    
    if (req.cookies[AUTH_COOKIE_NAME] === AUTH_COOKIE_VALUE) {
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    } else {
        return res.redirect('/login.html');
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Multer config
const upload = multer({
    dest: path.join(DATA_DIR, 'tmp'),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.py' || ext === '.zip') cb(null, true);
        else cb(new Error('Only .py and .zip files are allowed'));
    }
});

// ─── Real-time System & Process Telemetry ─────────────────────────────────────
let currentCpuUsage = 0;
let lastCpuSample = null;

function sampleCpu() {
    try {
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) totalTick += cpu.times[type];
            totalIdle += cpu.times.idle;
        }
        if (lastCpuSample) {
            const idleDiff = totalIdle - lastCpuSample.totalIdle;
            const totalDiff = totalTick - lastCpuSample.totalTick;
            if (totalDiff > 0) {
                currentCpuUsage = Math.max(0, Math.min(100, Math.round((1 - (idleDiff / totalDiff)) * 100)));
            }
        }
        lastCpuSample = { totalIdle, totalTick };
    } catch(e) {}
}
sampleCpu();
setInterval(sampleCpu, 1500);

function getBotTelemetry(botId) {
    const child = processes.get(botId);
    if (!child || !child.pid) return { memoryMB: 0, cpuPercent: 0 };
    
    let memoryMB = 0;
    let cpuPercent = 0;
    const pid = child.pid;
    
    if (process.platform === 'linux') {
        try {
            const pids = [pid];
            try {
                const childPids = execSync(`pgrep -P ${pid}`, { encoding: 'utf8' }).trim().split('\n');
                for (const cp of childPids) {
                    const cpid = parseInt(cp.trim(), 10);
                    if (cpid && !isNaN(cpid)) pids.push(cpid);
                }
            } catch(e) {}

            let totalKb = 0;
            for (const p of pids) {
                try {
                    const status = fs.readFileSync(`/proc/${p}/status`, 'utf8');
                    const match = status.match(/VmRSS:\s+(\d+)\s+kB/i);
                    if (match) totalKb += parseInt(match[1], 10);
                } catch(e) {}
            }
            memoryMB = Math.round(totalKb / 1024);
        } catch(e) {}

        try {
            const ps = execSync(`ps -o %cpu= -p ${pid}`, { encoding: 'utf8' }).trim();
            cpuPercent = Math.round((parseFloat(ps) || 0) * 10) / 10;
        } catch(e) {}
    } else if (process.platform === 'win32') {
        try {
            const out = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, { encoding: 'utf8' });
            const match = out.match(/"[\d,]+\s*K"/i);
            if (match) {
                const kb = parseInt(match[0].replace(/[^\d]/g, ''), 10);
                memoryMB = Math.round(kb / 1024);
            }
        } catch(e) {}
    }

    return { memoryMB, cpuPercent };
}

// ─── GET /api/system ─────────────────────────────────────────────────────────
app.get('/api/system', (_req, res) => {
    try {
        let totalMem = os.totalmem();
        let freeMem = os.freemem();
        let usedMem = totalMem - freeMem;
        
        // Attempt to get accurate Docker container memory from cgroups (Linux only)
        if (process.platform === 'linux') {
            try {
                if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
                    // cgroup v2
                    const max = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
                    if (max !== 'max') {
                        totalMem = parseInt(max, 10);
                        const current = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
                        usedMem = parseInt(current, 10);
                    }
                } else if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
                    // cgroup v1
                    const limit = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
                    if (parseInt(limit, 10) < 9000000000000000000) { // Check if it's not the unlimited default
                        totalMem = parseInt(limit, 10);
                        const current = fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim();
                        usedMem = parseInt(current, 10);
                    }
                }
            } catch(e) {}
        }

        
        // Python version
        let pythonVersion = 'Unknown';
        try {
            const pyOutput = execSync(`${PIP_CMD.replace('pip', 'python')} --version`, { encoding: 'utf8' });
            pythonVersion = pyOutput.replace('Python', '').trim();
        } catch(e) {}
        
        // Disk usage estimation (root volume)
        let diskUsage = { percentage: 0, usedGB: 0, totalGB: 0 };
        try {
            if (fs.statfsSync) {
                const stats = fs.statfsSync(process.cwd());
                const total = Number(stats.bsize) * Number(stats.blocks);
                const free = Number(stats.bsize) * Number(stats.bfree);
                if (total > 0) {
                    diskUsage.totalGB = (total / (1024 ** 3)).toFixed(1);
                    diskUsage.usedGB = ((total - free) / (1024 ** 3)).toFixed(1);
                    diskUsage.percentage = Math.round(((total - free) / total) * 100);
                }
            } else if (process.platform === 'win32') {
                const output = execSync('wmic logicaldisk get size,freespace /format:csv', { encoding: 'utf8' });
                const lines = output.split('\n').filter(l => l.includes(','));
                if (lines.length > 1) {
                    const parts = lines[1].split(',');
                    const free = parseInt(parts[1]);
                    const total = parseInt(parts[2]);
                    diskUsage.totalGB = (total / (1024 ** 3)).toFixed(1);
                    diskUsage.usedGB = ((total - free) / (1024 ** 3)).toFixed(1);
                    diskUsage.percentage = Math.round(((total - free) / total) * 100);
                }
            } else {
                let total = 0, used = 0;
                const output = execSync('df -B1 / | tail -1', { encoding: 'utf8' }).trim().split(/\s+/);
                if (output.length > 3) {
                    total = parseInt(output[1]);
                    used = parseInt(output[2]);
                }
                
                // If running on a massive shared host (like HF Spaces), use container limits
                if (process.env.SPACE_ID || total > (200 * 1024 * 1024 * 1024)) {
                    total = 50 * 1024 * 1024 * 1024; // 50 GB free tier space limit
                    try {
                        const du = execSync('du -sb /app 2>/dev/null', { encoding: 'utf8' }).trim().split(/\s+/)[0];
                        if (du) used = parseInt(du);
                    } catch(e) {}
                }
                
                diskUsage.totalGB = (total / (1024 ** 3)).toFixed(1);
                diskUsage.usedGB = (used / (1024 ** 3)).toFixed(1);
                diskUsage.percentage = Math.round((used / total) * 100);
            }
        } catch(e) {}
        
        // Real sampled CPU usage
        const cpuUsage = currentCpuUsage;
        
        res.json({
            platform: `${os.type()} ${os.arch()}`,
            nodeVersion: process.version,
            pythonVersion: pythonVersion,
            cpuUsage: cpuUsage,
            memory: {
                totalGB: (totalMem / (1024 ** 3)).toFixed(1),
                usedGB: (usedMem / (1024 ** 3)).toFixed(1),
                percentage: Math.round((usedMem / totalMem) * 100)
            },
            disk: diskUsage,
            uptime: process.uptime()
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/bots ───────────────────────────────────────────────────────────
app.get('/api/bots', (_req, res) => {
    const result = bots.map(b => {
        let uptime = b.uptime || 0;
        if (b.status === 'running' && b.uptimeStart) {
            uptime += Date.now() - new Date(b.uptimeStart).getTime();
        }

        let telemetry = { memoryMB: 0, cpuPercent: 0 };
        if (b.status === 'running') {
            telemetry = getBotTelemetry(b.id);
        }

        return {
            ...b,
            uptimeFormatted: formatUptime(uptime),
            memoryMB: telemetry.memoryMB,
            cpuPercent: telemetry.cpuPercent,
            memoryLimitMB: 512
        };
    });
    res.json(result);
});

// ─── GET /api/stats ──────────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
    res.json({
        totalBots: bots.length,
        running: bots.filter(b => b.status === 'running').length,
        pending: bots.filter(b => b.status === 'pending').length,
        stopped: bots.filter(b => b.status === 'stopped').length
    });
});

// ─── POST /api/upload ────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const ext = path.extname(req.file.originalname).toLowerCase();
        const botId = generateBotId();
        const botDir = path.join(UPLOADS_DIR, botId);
        fs.mkdirSync(botDir, { recursive: true });

        let entryPoint = null;
        let fileCount = 0;
        let fileSize = 0;

        if (ext === '.py') {
            // Single Python file
            const dest = path.join(botDir, req.file.originalname);
            fs.copyFileSync(req.file.path, dest);
            entryPoint = req.file.originalname;
            fileCount = 1;
            fileSize = req.file.size;
        } else if (ext === '.zip') {
            // Extract ZIP
            const zip = new AdmZip(req.file.path);
            zip.extractAllTo(botDir, true);

            // Unwrap single wrapper directories (handles multiple nesting levels)
            let unwrapped = true;
            while (unwrapped) {
                unwrapped = false;
                const entries = fs.readdirSync(botDir);
                if (entries.length === 1) {
                    const singleDir = path.join(botDir, entries[0]);
                    if (fs.existsSync(singleDir) && fs.statSync(singleDir).isDirectory()) {
                        // Move wrapper to temp sibling, then move contents back
                        const tempDir = botDir + '_unwrap_temp_' + Date.now();
                        fs.renameSync(singleDir, tempDir);
                        const innerContents = fs.readdirSync(tempDir);
                        for (const item of innerContents) {
                            fs.renameSync(path.join(tempDir, item), path.join(botDir, item));
                        }
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        unwrapped = true; // Check again for another wrapper level
                    }
                }
            }

            entryPoint = detectEntryPoint(botDir);
            fileCount = countFiles(botDir);
            fileSize = dirSize(botDir);
        }

        // Clean up temp file
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

        if (!entryPoint) {
            deleteBotDir(botDir);
            return res.status(400).json({ error: 'No Python entry point found in uploaded file(s)' });
        }

        const hasRequirements = fs.existsSync(path.join(botDir, 'requirements.txt'));

        const bot = {
            id: botId,
            name: req.file.originalname,
            fileName: req.file.originalname,
            entryPoint,
            status: 'stopped',
            security: 'safe',
            uptime: 0,
            uptimeStart: null,
            restarts: 0,
            createdAt: new Date().toISOString(),
            fileSize,
            fileCount,
            dir: botDir,
            hasRequirements
        };

        bots.push(bot);
        saveBots();

        res.status(201).json(bot);
    } catch (err) {
        console.error('[SENPAI] Upload error:', err);
        // Clean up temp file on error
        if (req.file) try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

// ─── POST /api/bots/:id/start ────────────────────────────────────────────────
app.post('/api/bots/:id/start', async (req, res) => {
    try {
        const bot = findBot(req.params.id);
        if (!bot) return res.status(404).json({ error: 'Bot not found' });
        if (bot.status === 'running' && processes.has(bot.id)) return res.status(400).json({ error: 'Bot is already running' });

        // Start asynchronously — respond immediately
        res.json({ success: true, message: 'Bot is starting ...' });

        await startBot(bot);
    } catch (err) {
        console.error('[SENPAI] Start error:', err);
        // If headers not sent yet
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start bot: ' + err.message });
        }
    }
});

// ─── POST /api/bots/:id/stop ─────────────────────────────────────────────────
app.post('/api/bots/:id/stop', async (req, res) => {
    try {
        const bot = findBot(req.params.id);
        if (!bot) return res.status(404).json({ error: 'Bot not found' });
        if (bot.status === 'stopped' && !processes.has(bot.id)) return res.status(400).json({ error: 'Bot is already stopped' });

        await stopBot(bot, true);
        res.json({ success: true, message: 'Bot stopped' });
    } catch (err) {
        console.error('[SENPAI] Stop error:', err);
        res.status(500).json({ error: 'Failed to stop bot: ' + err.message });
    }
});

// ─── POST /api/bots/:id/restart ──────────────────────────────────────────────
app.post('/api/bots/:id/restart', async (req, res) => {
    try {
        const bot = findBot(req.params.id);
        if (!bot) return res.status(404).json({ error: 'Bot not found' });

        // Respond immediately
        res.json({ success: true, message: 'Bot is restarting ...' });

        if (bot.status === 'running' || processes.has(bot.id)) {
            await stopBot(bot);
        }

        bot.restarts++;
        saveBots();

        await startBot(bot);
    } catch (err) {
        console.error('[SENPAI] Restart error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to restart bot: ' + err.message });
        }
    }
});

// ─── DELETE /api/bots/:id ────────────────────────────────────────────────────
app.delete('/api/bots/:id', async (req, res) => {
    try {
        const bot = findBot(req.params.id);
        if (!bot) return res.status(404).json({ error: 'Bot not found' });

        // Stop if running
        if (bot.status === 'running' || processes.has(bot.id)) {
            await stopBot(bot, true);
        }

        // Delete directory
        deleteBotDir(bot.dir);

        // Remove from array
        bots = bots.filter(b => b.id !== bot.id);
        saveBots();

        // Clean up logs
        botLogs.delete(bot.id);

        broadcastBotDeleted(bot.id);

        res.json({ success: true, message: 'Bot deleted' });
    } catch (err) {
        console.error('[SENPAI] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete bot: ' + err.message });
    }
});

// ─── GET /api/bots/:id/logs ──────────────────────────────────────────────────
app.get('/api/bots/:id/logs', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const logs = botLogs.get(bot.id) || [];
    res.json(logs);
});

// ─── GET /api/bots/:id/files ─────────────────────────────────────────────────
app.get('/api/bots/:id/files', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    try {
        const files = listFilesRecursive(bot.dir, bot.dir, bot.entryPoint);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list files: ' + err.message });
    }
});

function listFilesRecursive(baseDir, currentDir, entryPoint) {
    const results = [];
    try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            if (entry.isFile()) {
                const stat = fs.statSync(fullPath);
                results.push({
                    name: relativePath,
                    size: stat.size,
                    isEntryPoint: relativePath === entryPoint
                });
            } else if (entry.isDirectory() && entry.name !== '__pycache__' && entry.name !== '.git') {
                results.push(...listFilesRecursive(baseDir, fullPath, entryPoint));
            }
        }
    } catch { /* ignore */ }
    return results;
}

function safeFilePath(baseDir, reqPath) {
    if (!reqPath || typeof reqPath !== 'string') {
        throw new Error('Invalid file path');
    }
    const safeBase = path.resolve(baseDir);
    const resolved = path.resolve(safeBase, reqPath);
    if (!resolved.startsWith(safeBase)) {
        throw new Error('Access denied: Path outside bot directory');
    }
    return resolved;
}

// ─── GET /api/bots/:id/file — Read file content ──────────────────────────────
app.get('/api/bots/:id/file', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const relPath = req.query.file;
    if (!relPath) return res.status(400).json({ error: 'File path required' });

    try {
        const filePath = safeFilePath(bot.dir, relPath);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return res.status(404).json({ error: 'File not found' });
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({
            filename: relPath,
            content,
            size: fs.statSync(filePath).size
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── POST /api/bots/:id/file — Save file content ─────────────────────────────
app.post('/api/bots/:id/file', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const { file: relPath, content } = req.body;
    if (!relPath || typeof content !== 'string') {
        return res.status(400).json({ error: 'File path and content are required' });
    }

    try {
        const filePath = safeFilePath(bot.dir, relPath);
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        bot.fileSize = dirSize(bot.dir);
        bot.fileCount = countFiles(bot.dir);
        saveBots();
        addLog(bot.id, `[SecureX] 💾 File '${relPath}' updated successfully.`);
        res.json({ success: true, message: `File '${relPath}' saved successfully.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save file: ' + err.message });
    }
});

// ─── POST /api/bots/:id/file/save-deploy — Save file & Deploy/Restart ────────
app.post('/api/bots/:id/file/save-deploy', async (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const { file: relPath, content } = req.body;
    if (!relPath || typeof content !== 'string') {
        return res.status(400).json({ error: 'File path and content are required' });
    }

    try {
        const filePath = safeFilePath(bot.dir, relPath);
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        bot.fileSize = dirSize(bot.dir);
        bot.fileCount = countFiles(bot.dir);

        if (!bot.entryPoint || !fs.existsSync(path.join(bot.dir, bot.entryPoint))) {
            bot.entryPoint = detectEntryPoint(bot.dir) || relPath;
        }

        addLog(bot.id, `[SecureX] 🚀 Saved '${relPath}' — Initiating redeployment ...`);

        res.json({ success: true, message: 'File saved! Bot is redeploying ...' });

        if (bot.status === 'running' || processes.has(bot.id)) {
            await stopBot(bot);
        }
        bot.restarts++;
        saveBots();
        await startBot(bot);
    } catch (err) {
        console.error('[SecureX] Save & Deploy error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to deploy: ' + err.message });
        }
    }
});

// ─── POST /api/bots/:id/file/create — Create new file ────────────────────────
app.post('/api/bots/:id/file/create', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });

    try {
        const filePath = safeFilePath(bot.dir, filename);
        if (fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'File already exists' });
        }
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        fs.writeFileSync(filePath, '', 'utf-8');
        bot.fileSize = dirSize(bot.dir);
        bot.fileCount = countFiles(bot.dir);
        saveBots();
        addLog(bot.id, `[SecureX] 📄 Created file '${filename}'.`);
        res.json({ success: true, message: `File '${filename}' created.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create file: ' + err.message });
    }
});

// ─── DELETE /api/bots/:id/file — Delete file ─────────────────────────────────
app.delete('/api/bots/:id/file', (req, res) => {
    const bot = findBot(req.params.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const relPath = req.query.file;
    if (!relPath) return res.status(400).json({ error: 'Filename is required' });

    try {
        const filePath = safeFilePath(bot.dir, relPath);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        fs.unlinkSync(filePath);
        bot.fileSize = dirSize(bot.dir);
        bot.fileCount = countFiles(bot.dir);
        saveBots();
        addLog(bot.id, `[SecureX] 🗑️ Deleted file '${relPath}'.`);
        res.json({ success: true, message: `File '${relPath}' deleted.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete file: ' + err.message });
    }
});

// ─── Error handling middleware ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large (max 50MB)' });
        }
        return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes('Only .py and .zip')) {
        return res.status(400).json({ error: err.message });
    }
    console.error('[SENPAI] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── HTTP + WebSocket Server ─────────────────────────────────────────────────
const server = http.createServer(app);
wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    let subscribedBotId = null;

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());

            if (msg.type === 'subscribe' && msg.botId) {
                // Unsubscribe from previous
                if (subscribedBotId) {
                    const prev = wsClients.get(subscribedBotId);
                    if (prev) prev.delete(ws);
                }

                subscribedBotId = msg.botId;
                if (!wsClients.has(subscribedBotId)) wsClients.set(subscribedBotId, new Set());
                wsClients.get(subscribedBotId).add(ws);

                // Send current status
                const bot = findBot(subscribedBotId);
                if (bot) {
                    ws.send(JSON.stringify({ type: 'status', botId: bot.id, status: bot.status }));
                }
            }
        } catch { /* ignore malformed messages */ }
    });

    ws.on('close', () => {
        if (subscribedBotId) {
            const subs = wsClients.get(subscribedBotId);
            if (subs) {
                subs.delete(ws);
                if (subs.size === 0) wsClients.delete(subscribedBotId);
            }
        }
    });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
async function gracefulShutdown() {
    console.log('\n[SENPAI] Shutting down — stopping all bots ...');
    const stopPromises = [];
    for (const bot of bots) {
        if (processes.has(bot.id)) {
            stopPromises.push(stopBot(bot));
        }
    }
    await Promise.all(stopPromises);
    saveBots();
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║          SecureX  ·  Hosting Panel            ║');
    console.log('  ╠═══════════════════════════════════════════════╣');
    console.log(`  ║  🌐  http://localhost:${PORT}                    ║`);
    console.log(`  ║  🐍  Python: ${PYTHON_CMD.padEnd(32)}║`);
    console.log(`  ║  📦  Bots loaded: ${String(bots.length).padEnd(27)}║`);
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');

    // Auto-resume bots that were running before server reboot
    for (const b of bots) {
        if (b.autoRestart === true || b.status === 'running') {
            console.log(`[SecureX] Auto-resuming bot: ${b.name} (${b.id})`);
            startBot(b).catch(err => console.error(`[SecureX] Auto-resume error for ${b.name}:`, err.message));
        }
    }
});

module.exports = { app, server };
