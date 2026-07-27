const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const HOST = process.env.IP || '::';
const PORT = process.env.PORT || 8100;

const BASE_PATH = process.env.BASE_PATH || '/upcus';
const WWW_DIR = path.resolve(process.env.WWW_DIR || (fs.existsSync('/home/joker610209/www') ? '/home/joker610209/www' : process.cwd()));
let currentTerminalCwd = WWW_DIR;
const SYSTEM_USER_HOST = `${os.userInfo().username || 'user'}@${os.hostname() || 'server'}`;

// --- Network Stats State ---
let lastNetTime = Date.now();
let lastNetIn = 0;
let lastNetOut = 0;
let currentNetSpeed = { in: '0 KB/s', out: '0 KB/s' };
let isFirstNetRun = true;
let currentNetRaw = { in: 0, out: 0 }; // Raw bytes per second

function updateNetStats() {
    try {
        if (os.platform() !== 'linux') return;
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = data.split('\n');
        let totalIn = 0, totalOut = 0;
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 10 && !parts[0].startsWith('lo')) {
                const recv = parseInt(parts[1]);
                const sent = parseInt(parts[9]);
                if (!isNaN(recv)) totalIn += recv;
                if (parts[9] && !isNaN(parseInt(parts[9]))) {
                    totalOut += parseInt(parts[9]);
                } else if (parts[8] && !isNaN(parseInt(parts[8]))) {
                    totalOut += parseInt(parts[8]);
                }
            }
        });
        const now = Date.now();
        if (isFirstNetRun) {
            lastNetIn = totalIn; lastNetOut = totalOut; lastNetTime = now;
            isFirstNetRun = false; return;
        }
        const deltaT = (now - lastNetTime) / 1000;
        if (deltaT >= 0.5) {
            const speedIn = (totalIn - lastNetIn) / deltaT;
            const speedOut = (totalOut - lastNetOut) / deltaT;
            currentNetRaw = { in: speedIn, out: speedOut };

            function fmt(s) {
                if (s < 1024) return s.toFixed(1) + ' B/s';
                if (s < 1024 * 1024) return (s / 1024).toFixed(1) + ' KB/s';
                return (s / (1024 * 1024)).toFixed(1) + ' MB/s';
            }
            currentNetSpeed = { in: fmt(speedIn), out: fmt(speedOut) };
            lastNetIn = totalIn; lastNetOut = totalOut; lastNetTime = now;
        }
    } catch (e) { }
}
setInterval(updateNetStats, 2000); // Sample every 2s

// 安全路径解析：拒绝跨目录访问
function getSafePath(relativePath) {
    if (!relativePath) return WWW_DIR;
    const target = path.resolve(path.join(WWW_DIR, relativePath));
    const normalizedRoot = path.resolve(WWW_DIR);
    if (!target.startsWith(normalizedRoot)) {
        throw new Error('Access denied: Path outside root directory.');
    }
    return target;
}

// ==========================================
// 📦 配置文件上传引擎 (Multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            const targetDir = getSafePath(req.query.dir);
            cb(null, targetDir);
        } catch (e) {
            cb(e);
        }
    },
    filename: function (req, file, cb) {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// ==========================================
// 🔒 浏览器原生安全认证 (Basic Auth)
const ADMIN_USER = 'joker@610209.xyz';
const ADMIN_PASS = 'joker@610209.XYZ';

app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login === ADMIN_USER && password === ADMIN_PASS) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Secure Area"');
    res.status(401).send('🔴 认证失败：这里是私人领域，请输入正确的账号密码。');
});
// ==========================================

app.use(express.json());

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let day = d.getDate();
    const ending = ["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : (day % 100 - day % 10 != 10) * day % 10];
    let hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${months[d.getMonth()]} ${day}${ending}, ${d.getFullYear()} ${hr}:${min}${ampm}`;
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const route = express.Router();

// ==========================================
// 网页主界面
// ==========================================
route.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>专属导航云端管理中心</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; display: flex; justify-content: center; padding: 20px; margin: 0; color: #cbd5e1; }
            .container { background: #1e293b; padding: 25px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); width: 100%; max-width: 1000px; }
            h2 { text-align: center; color: #38bdf8; margin-top: 0; border-bottom: 1px solid #334155; padding-bottom: 15px; }

            /* Tabs */
            .tabs { display: flex; border-bottom: 2px solid #334155; margin-bottom: 25px; gap: 10px;}
            .tab { padding: 10px 20px; cursor: pointer; color: #94a3b8; font-weight: bold; font-size: 15px; border-radius: 8px 8px 0 0; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
            .tab:hover { color: #f1f5f9; background: #334155; }
            .tab.active { color: #38bdf8; border-bottom: 2px solid #38bdf8; background: #0f172a;}
            .tab-content { display: none; }
            .tab-content.active { display: block; }

            .section { background: #0f172a; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #1e293b;}
            .section-title { margin-top: 0; color: #f8fafc; font-size: 16px; margin-bottom: 15px;}
            
            /* Forms */
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 13px; color:#cbd5e1;}
            input { width: 100%; padding: 12px; background: #1e293b; border: 1px solid #334155; color: white; border-radius: 6px; font-size: 14px; transition: border 0.2s; box-sizing: border-box;}
            input:focus { outline: none; border-color: #38bdf8; }
            
            /* Buttons */
            .btn { border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
            .btn-primary { background: #3b82f6; color: white; } .btn-primary:hover { background: #2563eb; }
            .btn-pink { background: #ec4899; color: white; } .btn-pink:hover { background: #db2777; }
            .btn-gray { background: #475569; color: white; } .btn-gray:hover { background: #334155; }
            .btn-danger { background: #ef4444; color: white; } .btn-danger:hover { background: #dc2828; }

            /* Performance Widgets */
            .perf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
            .perf-card { background: #1e293b; padding: 18px; border-radius: 10px; display: flex; align-items: center; border: 1px solid #334155;}
            .perf-icon { width: 44px; height: 44px; border-radius: 8px; display: flex; justify-content: center; align-items: center; font-size: 22px; margin-right: 15px; }
            .icon-cpu { background: #ef4444; } .icon-mem { background: #475569; } .icon-up { background: #475569;} .icon-net { background: #475569;}
            .perf-info h4 { margin: 0; font-size: 12px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;}
            .perf-info p { margin: 5px 0 0; font-size: 18px; font-weight: bold; color: #f8fafc; }

            /* File Manager Header */
            .fm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .fm-path { font-family: monospace; font-size: 14px; background: #334155; padding: 6px 12px; border-radius: 6px; color: #f1f5f9;}
            .fm-actions { display: flex; gap: 8px; }
            
            /* Table */
            table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 8px; overflow: hidden; background: #1e293b; }
            th { text-align: left; padding: 12px 15px; color: #94a3b8; font-weight: 500; font-size: 13px; background: #334155; border-bottom: 1px solid #475569; }
            td { padding: 12px 15px; border-bottom: 1px solid #334155; color: #e2e8f0; font-size: 14px;}
            tr:last-child td { border-bottom: none; }
            tr:hover td { background: #0f172a; }
            
            /* Dropdown Menu */
            .dropdown { position: relative; display: inline-block; }
            .dropbtn { cursor: pointer; color: #94a3b8; background: none; border: none; font-size: 18px; font-weight: bold; padding: 0 10px; margin-top: -5px;}
            .dropbtn:hover { color: white; }
            .dropdown-content { display: none; position: absolute; right: 0; background-color: #1e293b; border: 1px solid #334155; min-width: 160px; box-shadow: 0 10px 20px rgba(0,0,0,0.5); z-index: 9999; border-radius: 6px; overflow: hidden;}
            .dropdown-content.drop-up { bottom: 100%; top: auto; margin-bottom: 5px; }
            .dropdown-content a { color: #cbd5e1; padding: 12px 15px; text-decoration: none; display: block; font-size: 13px; cursor: pointer; border-bottom: 1px solid #334155;}
            .dropdown-content a:last-child { border-bottom: none; }
            .dropdown-content a:hover { background-color: #334155; color: white;}
            .show { display: block; }
            
            /* Checkbox & Bulk Actions */
            input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #38bdf8; }
            .bulk-action-bar { display: none; background: #334155; padding: 10px 20px; border-radius: 8px; margin-bottom: 15px; align-items: center; gap: 15px; border: 1px solid #475569; position: sticky; top: 0; z-index: 100;}
            .bulk-count { font-weight: bold; color: #38bdf8; font-size: 14px; }
            
            .clickable-file { cursor: pointer; transition: color 0.2s;}
            .clickable-file:hover { color: #38bdf8; text-decoration: underline; }

            /* Terminal Tab - Pterodactyl Style */
            .console-wrapper { display: flex; flex-direction: column; gap: 20px; margin-top: 10px; }
            .console-top { display: flex; gap: 20px; height: 440px; }
            .terminal-container { flex: 1; background: #000; border-radius: 8px; border: 1px solid #334155; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .terminal-output { flex: 1; padding: 15px; overflow-y: auto; font-family: 'Fira Code', monospace; font-size: 13px; line-height: 1.5; color: #f8fafc; white-space: pre-wrap; word-break: break-all; }
            .terminal-input-wrapper { background: #111827; padding: 10px 15px; border-top: 1px solid #334155; display: flex; align-items: center; gap: 10px; }
            .terminal-prompt { font-family: monospace; font-weight: bold; font-size: 14px; }
            .terminal-prompt .path { color: #38bdf8; }
            .terminal-input { flex: 1; background: transparent; border: none; color: #f8fafc; font-family: 'Fira Code', monospace; font-size: 14px; outline: none; }
            
            .console-sidebar { width: 280px; display: flex; flex-direction: column; gap: 10px; }
            .side-stat-card { background: #1e293b; padding: 12px 15px; border-radius: 8px; border: 1px solid #334155; display: flex; align-items: center; gap: 12px; transition: all 0.2s; position: relative; overflow: hidden; }
            .side-stat-card:hover { transform: translateX(4px); border-color: #38bdf8; background: #222f46; }
            .side-stat-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
            .side-stat-info { flex: 1; z-index: 1; }
            .side-stat-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
            .side-stat-value { font-size: 14px; color: #f8fafc; font-weight: 600; font-family: 'Fira Code', monospace; }

            .charts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .chart-card { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 15px; height: 160px; display: flex; flex-direction: column; }
            .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .chart-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .chart-value { font-size: 13px; color: #38bdf8; font-family: monospace; }
            .chart-body { flex: 1; position: relative; overflow: hidden; }
            .chart-svg { width: 100%; height: 100%; overflow: visible; display: block; }
            .chart-path { fill: none; stroke-width: 0.2; transition: d 0.2s ease; }
            .chart-area { opacity: 0.6; transition: d 0.2s ease; }
            .chart-label { font-size: 2.5px; fill: #94a3b8; font-family: sans-serif; pointer-events: none; opacity: 0.9; }
            .chart-grid { stroke: #334155; stroke-width: 0.25; stroke-dasharray: 1.5,1.5; }

            /* Modal */
            .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); align-items: center; justify-content: center;}
            .modal-content { background-color: #1e293b; margin: auto; border-radius: 10px; width: 90%; max-width: 800px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #334155;}
            .modal-header { padding: 15px 20px; background: #0f172a; border-bottom: 1px solid #334155; font-weight: bold; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;}
            .modal-body { padding: 20px; flex-grow: 1; }
            .modal-footer { padding: 15px 20px; background: #0f172a; border-top: 1px solid #334155; text-align: right; }
            #editorArea { width: 100%; height: 450px; background: #0f172a; color: #f1f5f9; border: 1px solid #334155; padding: 15px; font-family: monospace; resize: vertical; border-radius: 6px; outline: none; box-sizing: border-box;}
            #editorArea:focus { border-color: #38bdf8; }
            .close-modal { cursor: pointer; font-size: 20px; color: #94a3b8; }
            .close-modal:hover { color: white; }
            .flex-row { display: flex; gap: 15px;  } .flex-row > div { flex: 1; }

            /* Drag & Drop */
            .drag-handle { cursor: grab; color: #475569; font-size: 18px; padding: 0 8px; user-select: none; }
            .drag-handle:active { cursor: grabbing; }
            tr.dragging td { background: #334155 !important; opacity: 0.6; }
            tr.drag-over td { border-top: 2px solid #38bdf8; }
            .action-grid { display: grid; grid-template-columns: repeat(2, auto); gap: 4px; justify-content: center; width: fit-content; margin: 0 auto; }
            .btn-sort { background: #334155; color: #94a3b8; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 14px; width: 100%; box-sizing: border-box; }
            .btn-sort:hover { background: #475569; color: white; }
            .nav-link { color: #f8fafc; text-decoration: none; transition: color 0.2s; }
            .nav-link:hover { color: #38bdf8; text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🚀 云端管理中心</h2>

            <div class="tabs">
                <div class="tab active" onclick="switchTab('file-tab')">📁 服务器文件管家</div>
                <div class="tab" id="tab-btn-console" onclick="switchTab('console-tab')">💻 终端控制台</div>
            </div>

            <!-- Tab: 文件管家 -->
            <div id="file-tab" class="tab-content active">
                <!-- 性能监控面板 -->
                <div class="perf-grid">
                    <div class="perf-card">
                        <div class="perf-icon icon-up">⏱️</div>
                        <div class="perf-info"><h4>Uptime</h4><p id="perf-uptime">Loading...</p></div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-icon icon-cpu">🎛️</div>
                        <div class="perf-info"><h4>CPU Load</h4><p id="perf-cpu">Loading...</p></div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-icon icon-mem">💾</div>
                        <div class="perf-info"><h4>Memory Usage</h4><p id="perf-mem">Loading...</p></div>
                    </div>
                    <div class="perf-card">
                        <div class="perf-icon icon-net">🌐</div>
                        <div class="perf-info"><h4>Host Address</h4><p id="perf-host">Loading...</p></div>
                    </div>
                </div>

                <div class="section" style="background: transparent; padding: 0; border:none;">
                    <div id="bulk-bar" class="bulk-action-bar">
                        <span class="bulk-count" id="selected-count">0 items selected</span>
                        <button class="btn btn-primary" onclick="bulkCopyPrompt()">Copy</button>
                        <button class="btn btn-gray" onclick="bulkMovePrompt()">Move</button>
                        <button class="btn btn-primary" onclick="bulkDownload()">Download</button>
                        <button class="btn btn-primary" onclick="bulkDownloadZip()">Download as ZIP</button>
                        <button class="btn btn-danger" onclick="bulkDelete()">Delete</button>
                    </div>
                    <div class="fm-header">
                        <div class="fm-path" id="fm-path-display">${WWW_DIR.replace(/\\/g, '/')}</div>
                        <div class="fm-actions">
                            <button class="btn btn-gray" onclick="createDirPrompt()">Create Directory</button>
                            <button class="btn btn-primary" onclick="document.getElementById('fileUploadInput').click()">Upload</button>
                            <button class="btn btn-primary" onclick="createFilePrompt()">New File</button>
                            <input type="file" id="fileUploadInput" multiple style="display:none;" onchange="uploadFiles(this)">
                        </div>
                    </div>
                    <table>
                        <thead><tr><th width="30"><input type="checkbox" id="select-all" onclick="toggleAll(this)"></th><th width="30"></th><th>Name</th><th width="120">Size</th><th width="200">Date Modified</th><th width="40"></th></tr></thead>
                        <tbody id="serverFileList"></tbody>
                    </table>
                </div>
            </div>

            <!-- Terminal Console Tab -->
            <div id="console-tab" class="tab-content">
                <div class="console-wrapper">
                    <div class="console-top">
                        <div class="terminal-container">
                            <div id="terminal-output" class="terminal-output">${SYSTEM_USER_HOST}~ Server marked as running...
[SYS] Welcome to Web Console. Type "help" for a list of available commands.
</div>
                            <div class="terminal-input-wrapper">
                                <span class="terminal-prompt">&raquo;</span>
                                <input type="text" id="terminal-input" class="terminal-input" placeholder="Type a command..." autocomplete="off" spellcheck="false">
                            </div>
                        </div>
                        <div class="console-sidebar">
                            <div class="side-stat-card">
                                <div class="side-stat-icon">🌐</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Address</div>
                                    <div class="side-stat-value" id="side-address">Loading...</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">⏱️</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Uptime</div>
                                    <div class="side-stat-value" id="side-uptime">0d 0h 0m</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">🧠</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">CPU Load</div>
                                    <div class="side-stat-value" id="side-cpu">0.00%</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(161, 161, 170, 0.1); color: #a1a1aa;">💾</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Memory</div>
                                    <div class="side-stat-value" id="side-mem">0 MiB / 0 MiB</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">💽</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Disk</div>
                                    <div class="side-stat-value" id="side-disk">Loading...</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(20, 184, 166, 0.1); color: #14b8a6;">⇣</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Inbound</div>
                                    <div class="side-stat-value" id="side-net-in">0 KB/s</div>
                                </div>
                            </div>
                            <div class="side-stat-card">
                                <div class="side-stat-icon" style="background: rgba(236, 72, 153, 0.1); color: #ec4899;">⇡</div>
                                <div class="side-stat-info">
                                    <div class="side-stat-label">Outbound</div>
                                    <div class="side-stat-value" id="side-net-out">0 KB/s</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="charts-grid">
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">CPU Load</span>
                                <span class="chart-value" id="chart-cpu-val">0%</span>
                            </div>
                            <div class="chart-body" id="chart-cpu-body">
                                <svg class="chart-svg" id="svg-cpu" viewBox="0 0 100 40" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="grad-cpu" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="#38bdf8" />
                                            <stop offset="100%" stop-color="transparent" />
                                        </linearGradient>
                                    </defs>
                                    <line x1="0" y1="0" x2="100" y2="0" class="chart-grid" />
                                    <line x1="0" y1="10" x2="100" y2="10" class="chart-grid" />
                                    <line x1="0" y1="20" x2="100" y2="20" class="chart-grid" />
                                    <line x1="0" y1="30" x2="100" y2="30" class="chart-grid" />
                                    <text x="0.2" y="3" class="chart-label">100%</text>
                                    <text x="0.2" y="9.8" class="chart-label">75%</text>
                                    <text x="0.2" y="19.8" class="chart-label">50%</text>
                                    <text x="0.2" y="29.8" class="chart-label">25%</text>
                                    <path class="chart-area" id="path-area-cpu" fill="url(#grad-cpu)" d="M0,40 L100,40 L100,40 L0,40 Z" />
                                    <path class="chart-path" id="path-line-cpu" stroke="#38bdf8" d="M0,40 L100,40" />
                                </svg>
                            </div>
                        </div>
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">Memory Usage</span>
                                <span class="chart-value" id="chart-mem-val">0%</span>
                            </div>
                            <div class="chart-body" id="chart-mem-body">
                                <svg class="chart-svg" id="svg-mem" viewBox="0 0 100 40" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="grad-mem" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="#8b5cf6" />
                                            <stop offset="100%" stop-color="transparent" />
                                        </linearGradient>
                                    </defs>
                                    <line x1="0" y1="0" x2="100" y2="0" class="chart-grid" />
                                    <line x1="0" y1="10" x2="100" y2="10" class="chart-grid" />
                                    <line x1="0" y1="20" x2="100" y2="20" class="chart-grid" />
                                    <line x1="0" y1="30" x2="100" y2="30" class="chart-grid" />
                                    <text x="0.2" y="3" class="chart-label" id="label-mem-top">100%</text>
                                    <text x="0.2" y="9.8" class="chart-label" id="label-mem-75"></text>
                                    <text x="0.2" y="19.8" class="chart-label" id="label-mem-50"></text>
                                    <text x="0.2" y="29.8" class="chart-label" id="label-mem-25"></text>
                                    <path class="chart-area" id="path-area-mem" fill="url(#grad-mem)" d="M0,40 L100,40 L100,40 L0,40 Z" />
                                    <path class="chart-path" id="path-line-mem" stroke="#8b5cf6" d="M0,40 L100,40" />
                                </svg>
                            </div>
                        </div>
                        <div class="chart-card">
                            <div class="chart-header">
                                <span class="chart-title">Network Activity</span>
                                <span class="chart-value" id="chart-net-val">0 B/s</span>
                            </div>
                            <div class="chart-body" id="chart-net-body">
                                <svg class="chart-svg" id="svg-net" viewBox="0 0 100 40" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="grad-net" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="#ec4899" />
                                            <stop offset="100%" stop-color="transparent" />
                                        </linearGradient>
                                        <linearGradient id="grad-net-out" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="#10b981" />
                                            <stop offset="100%" stop-color="transparent" />
                                        </linearGradient>
                                    </defs>
                                    <line x1="0" y1="0" x2="100" y2="0" class="chart-grid" />
                                    <line x1="0" y1="10" x2="100" y2="10" class="chart-grid" />
                                    <line x1="0" y1="20" x2="100" y2="20" class="chart-grid" />
                                    <line x1="0" y1="30" x2="100" y2="30" class="chart-grid" />
                                    <text x="0.2" y="3" class="chart-label" id="label-net-top">500KB/s</text>
                                    <text x="0.2" y="9.8" class="chart-label" id="label-net-75"></text>
                                    <text x="0.2" y="19.8" class="chart-label" id="label-net-50"></text>
                                    <text x="0.2" y="29.8" class="chart-label" id="label-net-25"></text>
                                    <path class="chart-area" id="path-area-net" fill="url(#grad-net)" d="M0,40 L100,40 L100,40 L0,40 Z" />
                                    <path class="chart-path" id="path-line-net" stroke="#ec4899" d="M0,40 L100,40" />
                                    <path class="chart-area" id="path-area-net-out" fill="url(#grad-net-out)" d="M0,40 L100,40 L100,40 L0,40 Z" />
                                    <path class="chart-path" id="path-line-net-out" stroke="#10b981" d="M0,40 L100,40" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- File Editor Modal -->
        <div id="editorModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <span id="editorFileName">editing_file.txt</span>
                    <span class="close-modal" onclick="closeEditor()">&times;</span>
                </div>
                <div class="modal-body">
                    <textarea id="editorArea" spellcheck="false"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-gray" onclick="closeEditor()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveFileContent()">Save Content</button>
                </div>
            </div>
        </div>

        <!-- Conflict Resolution Modal -->
        <div id="conflictModal" class="modal">
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <span>⚠️ File Conflict Detected</span>
                    <span class="close-modal" onclick="closeConflictModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <p class="conflict-info">A file named "<span id="conflict-filename" class="conflict-filename"></span>" already exists in this directory. How would you like to proceed?</p>
                </div>
                <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn btn-primary" onclick="resolveConflict('overwrite')">Overwrite</button>
                    <button class="btn btn-primary" onclick="resolveConflict('rename')">Rename</button>
                    <button class="btn btn-gray" onclick="resolveConflict('skip')">Skip</button>
                </div>
            </div>
        </div>

        <script>
            let currentDir = ''; 
            const API_BASE = '${BASE_PATH}';
            let currentEditingFile = '';

            // --- UI 交互 ---
            function switchTab(tabId) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                event.target.classList.add('active');
                document.getElementById(tabId).classList.add('active');
                if(tabId === 'file-tab') {
                    loadStats();
                    loadServerFiles();
                } else if(tabId === 'console-tab') {
                    loadStats();
                    document.getElementById('terminal-input').focus();
                }
            }

            window.onclick = function(event) {
                if (!event.target.matches('.dropbtn')) {
                    document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
                }
            }

            function toggleDropdown(id) {
                const menu = document.getElementById("dropdown-" + id);
                const isShowing = menu.classList.contains('show');
                
                // Close all others
                document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
                
                if (!isShowing) {
                    menu.classList.add('show');
                    
                    // Drop-up logic: if bottom of menu would go past window height
                    const rect = menu.parentElement.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    if (spaceBelow < 250) { // Approx height of menu
                        menu.classList.add('drop-up');
                    } else {
                        menu.classList.remove('drop-up');
                    }
                }
            }

            // --- 文件/性能管家功能 ---
            const history = { cpu: [], mem: [], net: [], net_out: [] };
            const MAX_HISTORY = 60; // More history for faster updates

            function formatUnits(val, suffix = 'B', decimals = 1) {
                if (suffix === '%') return (val || 0).toFixed(decimals) + '%';
                let bytes = suffix === 'KB' ? val * 1024 : (suffix === 'MB' ? val * 1024 * 1024 : val);
                if (!bytes || bytes === 0) return '0 B';
                const k = 1024;
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i] + (suffix === 'B/s' ? '/s' : '');
            }

            function updateChart(id, value, isNetworkOut = false) {
                const hid = isNetworkOut ? 'net_out' : id;
                history[hid].push(value);
                if (history[hid].length > MAX_HISTORY) history[hid].shift();

                const lineId = isNetworkOut ? 'path-line-net-out' : 'path-line-' + id;
                const areaId = isNetworkOut ? 'path-area-net-out' : 'path-area-' + id;
                const line = document.getElementById(lineId);
                const area = document.getElementById(areaId);
                if (!line) return;

                const step = 100 / (MAX_HISTORY - 1);
                // Calculate scale based on max value for Network
                let scale = 100;
                if (id === 'net') {
                    const maxVal = Math.max(...history.net, ...history.net_out, 500000);
                    scale = maxVal;
                    document.getElementById('label-net-top').innerText = formatUnits(maxVal, 'B/s');
                    document.getElementById('label-net-75').innerText = formatUnits(maxVal * 0.75, 'B/s');
                    document.getElementById('label-net-50').innerText = formatUnits(maxVal * 0.5, 'B/s');
                    document.getElementById('label-net-25').innerText = formatUnits(maxVal * 0.25, 'B/s');
                } else if (id === 'mem') {
                    // We assume memTop stays constant or we can update it from stats
                }

                const points = history[hid].map((val, i) => {
                    const x = i * step;
                    const h = Math.max(0, Math.min(100, val / scale * 100));
                    const y = 40 - (h / 100 * 40);
                    return x + ',' + y;
                }).join(' ');

                line.setAttribute('d', 'M' + points);
                if (area) {
                    area.setAttribute('d', 'M' + points + ' L' + (history[hid].length - 1) * step + ',40 L0,40 Z');
                }
                
                if (!isNetworkOut) {
                    let displayVal = id === 'net' ? formatUnits(value, 'B/s') : value.toFixed(1) + '%';
                    document.getElementById('chart-' + id + '-val').innerText = displayVal;
                }
            }

            async function loadStats() {
                try {
                    const res = await fetch(API_BASE + '/api/stats');
                    const stats = await res.json();
                    if (stats.cpu !== undefined) {
                        document.getElementById('perf-uptime').innerText = stats.uptime;
                        document.getElementById('perf-cpu').innerText = stats.cpu + '%';
                        document.getElementById('perf-mem').innerText = formatUnits(stats.memUsed) + ' / ' + formatUnits(stats.memTotal);
                        document.getElementById('perf-host').innerText = stats.host;

                        document.getElementById('side-address').innerText = stats.host;
                        document.getElementById('side-uptime').innerText = stats.uptime;
                        document.getElementById('side-cpu').innerText = stats.cpu + '%';
                        document.getElementById('side-mem').innerText = formatUnits(stats.memUsed) + ' / ' + formatUnits(stats.memTotal);
                        document.getElementById('side-disk').innerText = stats.disk || 'N/A';
                        document.getElementById('side-net-in').innerText = formatUnits(stats.netInRaw, 'B/s');
                        document.getElementById('side-net-out').innerText = formatUnits(stats.netOutRaw, 'B/s');

                        // Update Charts
                        const memPct = (stats.memUsed / stats.memTotal * 100) || 0;
                        document.getElementById('label-mem-top').innerText = formatUnits(stats.memTotal);
                        document.getElementById('label-mem-75').innerText = formatUnits(stats.memTotal * 0.75);
                        document.getElementById('label-mem-50').innerText = formatUnits(stats.memTotal * 0.5);
                        document.getElementById('label-mem-25').innerText = formatUnits(stats.memTotal * 0.25);

                        updateChart('cpu', stats.cpu);
                        updateChart('mem', memPct);
                        updateChart('net', stats.netInRaw);
                        updateChart('net', stats.netOutRaw, true);
                        
                        const netTotal = stats.netInRaw + stats.netOutRaw;
                        document.getElementById('chart-net-val').innerText = formatUnits(netTotal, 'B/s');
                    }
                } catch(e) { console.error('加载性能数据失败'); }
            }
            setInterval(loadStats, 1000); // Faster updates
            loadStats();

            // --- Terminal Console Logic ---
            function appendTerminal(text, type = 'log') {
                const output = document.getElementById('terminal-output');
                if (!output) return;
                const line = document.createElement('div');
                line.style.marginBottom = '4px';
                if (type === 'cmd') {
                    line.innerHTML = '<span style="color:#10b981; font-weight:bold;">${SYSTEM_USER_HOST}:</span><span style="color:#38bdf8; font-weight:bold;">' + currentTerminalPath + '</span><span style="color:#f8fafc;">$ ' + text + '</span>';
                } else if (type === 'error') {
                    line.style.color = '#ef4444';
                    line.innerHTML = ansiToHtml(text);
                } else {
                    line.style.color = '#f8fafc';
                    line.innerHTML = ansiToHtml(text);
                }
                
                output.appendChild(line);
                output.scrollTop = output.scrollHeight;
            }

            function ansiToHtml(text) {
                const colors = {
                    '30': '#1e293b', '31': '#ef4444', '32': '#10b981', '33': '#f59e0b',
                    '34': '#3b82f6', '35': '#8b5cf6', '36': '#06b6d4', '37': '#f1f5f9',
                    '1': 'font-weight:bold;', '4': 'text-decoration:underline;'
                };
                return text
                    .replace(/\\x1b\\[0m/g, '</span>')
                    .replace(/\\x1b\\[([\\d;]+)m/g, (match, code) => {
                        let style = '';
                        const parts = code.split(';');
                        parts.forEach(p => {
                            if (colors[p]) {
                                if (p === '1' || p === '4') style += colors[p];
                                else style += 'color:' + colors[p] + ';';
                            }
                        });
                        return '<span style="' + style + '">';
                    });
            }

            let currentTerminalPath = '~';
            function updatePrompt() {
                const promptEl = document.querySelector('.terminal-prompt');
                if (promptEl) {
                    promptEl.innerHTML = '<span style="color:#10b981;">${SYSTEM_USER_HOST}:</span><span class="path">' + currentTerminalPath + '</span><span style="color:#f8fafc;">$</span>';
                }
            }

            document.addEventListener('DOMContentLoaded', () => {
                const input = document.getElementById('terminal-input');
                if (input) {
                    input.addEventListener('keydown', async (e) => {
                        if (e.key === 'Enter') {
                            const cmd = input.value.trim();
                            if (!cmd) return;
                            
                            input.value = '';
                            appendTerminal(cmd, 'cmd');
                            
                            if (cmd === 'clear') {
                                document.getElementById('terminal-output').innerHTML = '';
                                return;
                            }
                            if (cmd === 'help') {
                                appendTerminal('Available commands: clear, help, ls, pwd, node -v ... (any shell command)');
                                return;
                            }

                            try {
                                const res = await fetch(API_BASE + '/api/exec', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ command: cmd })
                                });
                                const result = await res.json();
                                if (result.cwd) {
                                    currentTerminalPath = result.cwd;
                                    updatePrompt();
                                }
                                if (result.output) appendTerminal(result.output);
                                if (result.error) appendTerminal(result.error, 'error');
                            } catch (err) {
                                appendTerminal('Execution failed: ' + err.message, 'error');
                            }
                        }
                    });
                    updatePrompt(); // Initial prompt set
                }
            });

            setInterval(loadStats, 10000);

            function openDir(path) {
                currentDir = path;
                loadServerFiles();
            }

            async function loadServerFiles() {
                try {
                    const res = await fetch(API_BASE + '/api/files?dir=' + encodeURIComponent(currentDir));
                    const data = await res.json();
                    const tbody = document.getElementById('serverFileList');
                    
                    if (data.error) throw new Error(data.error);

                    // Update breadcrumb
                    let breadcrumbHtml = \`<span class="clickable-file" onclick="openDir('')">${WWW_DIR.replace(/\\/g, '/')}</span>\`;
                    if (currentDir) {
                        let parts = currentDir.split('/');
                        let builtPath = '';
                        parts.forEach((part) => {
                            if(!part) return;
                            builtPath += (builtPath ? '/' + part : part);
                            breadcrumbHtml += \` / <span class="clickable-file" onclick="openDir('\${builtPath}')">\${part}</span>\`;
                        });
                    }
                    document.getElementById('fm-path-display').innerHTML = breadcrumbHtml;

                    let rows = '';
                    if (currentDir !== '') {
                        const parentDir = currentDir.split('/').slice(0, -1).join('/');
                        rows += \`
                            <tr>
                                <td style="text-align:center;">⤴️</td>
                                <td colspan="4"><span class="clickable-file" onclick="openDir('\${parentDir}')"><strong>..</strong> (Go up)</span></td>
                            </tr>
                        \`;
                    }

                    rows += data.files.map((f, i) => \`
                        <tr>
                            <td style="text-align:center;"><input type="checkbox" class="file-checkbox" data-name="\${f.name}" onclick="updateBulkBar()"></td>
                            <td style="text-align:center;">\${f.isDir ? '📁' : '📄'}</td>
                            <td>
                                \${f.isDir 
                                    ? \`<span class="clickable-file" onclick="openDir('\${currentDir ? currentDir + '/' + f.name : f.name}')"><strong>\${f.name}</strong></span>\`
                                    : \`<span class="clickable-file" onclick="openFileEditor('\${f.name}')"><strong>\${f.name}</strong></span>\`
                                }
                            </td>
                            <td style="color:#94a3b8;">\${f.isDir ? '-' : f.sizeStr}</td>
                            <td style="color:#94a3b8;">\${f.mtime}</td>
                            <td style="position:relative;">
                                <div class="dropdown">
                                    <button onclick="toggleDropdown(\${i})" class="dropbtn">•••</button>
                                    <div id="dropdown-\${i}" class="dropdown-content">
                                        <a onclick="renameServerFile('\${f.name}')">✎ Rename</a>
                                        <a onclick="moveServerFile('\${f.name}')">➹ Move</a>
                                        <a onclick="copyServerFile('\${f.name}')">⎘ Copy</a>
                                        \${f.isDir 
                                            ? \`<a href="\${API_BASE}/api/download-zip?names=\${encodeURIComponent(f.name)}&dir=\${encodeURIComponent(currentDir)}" target="_blank">⬇ Download as ZIP</a>\`
                                            : \`<a href="\${API_BASE}/api/download-file?name=\${encodeURIComponent(f.name)}&dir=\${encodeURIComponent(currentDir)}" target="_blank">⬇ Download</a>\`
                                        }
                                        <a onclick="deleteServerFile('\${f.name}')" style="color:#ef4444;">🗑 Delete</a>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    \`).join('');
                    
                    tbody.innerHTML = rows;
                    document.getElementById('select-all').checked = false;
                    updateBulkBar();
                } catch(e) { 
                    alert('Error loading directory: ' + e.message); 
                    if(currentDir !== '') openDir('');
                }
            }

            // --- Bulk Selection ---
            function toggleAll(master) {
                document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = master.checked);
                updateBulkBar();
            }

            function updateBulkBar() {
                const selected = document.querySelectorAll('.file-checkbox:checked');
                const bar = document.getElementById('bulk-bar');
                const countText = document.getElementById('selected-count');
                if (selected.length > 0) {
                    bar.style.display = 'flex';
                    countText.innerText = \`\${selected.length} items selected\`;
                } else {
                    bar.style.display = 'none';
                }
            }

            function getSelectedNames() {
                return Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.name);
            }

            let conflictPromiseResolver = null;

            function closeConflictModal() {
                document.getElementById('conflictModal').style.display = 'none';
            }

            function resolveConflict(choice) {
                if (conflictPromiseResolver) {
                    conflictPromiseResolver(choice);
                    conflictPromiseResolver = null;
                }
                closeConflictModal();
            }

            async function uploadFiles(input) {
                const files = Array.from(input.files);
                if (files.length === 0) return;
                
                for (const file of files) {
                    try {
                        const checkRes = await fetch(\`\${API_BASE}/api/check-exists?name=\${encodeURIComponent(file.name)}&dir=\${encodeURIComponent(currentDir)}\`);
                        const { exists } = await checkRes.json();
                        
                        let finalName = file.name;
                        if (exists) {
                            document.getElementById('conflict-filename').innerText = file.name;
                            document.getElementById('conflictModal').style.display = 'flex';
                            
                            const choice = await new Promise(resolve => {
                                conflictPromiseResolver = resolve;
                            });

                            if (choice === 'skip') continue;
                            if (choice === 'rename') {
                                const newName = prompt("Enter new name:", "copy_" + file.name);
                                if (!newName) continue;
                                finalName = newName;
                            }
                        }

                        const formData = new FormData();
                        formData.append('files', file, finalName);
                        await fetch(\`\${API_BASE}/api/upload?dir=\${encodeURIComponent(currentDir)}\`, { method: 'POST', body: formData });
                    } catch(e) { console.error('Upload failed', e); }
                }
                
                input.value = '';
                loadServerFiles();
            }

            async function moveServerFile(name) {
                const targetDir = prompt(\`Move "\${name}" to (relative path): \`, currentDir);
                if (targetDir === null) return;
                const res = await fetch(API_BASE + '/api/move-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, fromDir: currentDir, toDir: targetDir })
                });
                const result = await res.json();
                if(!result.success) alert(result.error);
                loadServerFiles();
            }

            async function copyServerFile(name) {
                const newName = prompt(\`Copy "\${name}" as: \`, "copy_" + name);
                if (!newName) return;
                const res = await fetch(API_BASE + '/api/copy-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, dir: currentDir, newName })
                });
                const result = await res.json();
                if(!result.success) alert(result.error);
                loadServerFiles();
            }

            async function deleteServerFile(name) {
                if(!confirm(\`🚨 确定要永久删除 [\${name}] 吗？不可恢复！\`)) return;
                const res = await fetch(API_BASE + '/api/delete-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, dir: currentDir })
                });
                const result = await res.json();
                if(!result.success) alert(result.error);
                loadServerFiles(); 
            }

            async function renameServerFile(oldName) {
                const newName = prompt('Enter new local name for this file/directory:', oldName);
                if(!newName || newName === oldName) return;
                const res = await fetch(API_BASE + '/api/rename-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldName, newName, dir: currentDir })
                });
                const result = await res.json();
                if(!result.success) alert(result.error || 'Rename failed');
                loadServerFiles();
            }

            async function createDirPrompt() {
                const name = prompt('Directory name:');
                if(!name) return;
                const res = await fetch(API_BASE + '/api/create-dir', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dir: currentDir })
                });
                const result = await res.json();
                if(!result.success) alert(result.error || 'Create dir failed');
                loadServerFiles();
            }

            async function createFilePrompt() {
                const name = prompt('File name:');
                if(!name) return;
                const res = await fetch(API_BASE + '/api/create-file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dir: currentDir })
                });
                const result = await res.json();
                if(!result.success) alert(result.error || 'Create file failed');
                loadServerFiles();
            }

            // --- Bulk Actions ---
            async function bulkDelete() {
                const names = getSelectedNames();
                if (!names.length || !confirm(\`Delete \${names.length} items?\`)) return;
                await fetch(API_BASE + '/api/bulk-delete', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ names, dir: currentDir })
                });
                loadServerFiles();
            }

            async function bulkMovePrompt() {
                const names = getSelectedNames();
                const targetDir = prompt(\`Move \${names.length} items to: \`, currentDir);
                if (targetDir === null) return;
                await fetch(API_BASE + '/api/bulk-move', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ names, fromDir: currentDir, toDir: targetDir })
                });
                loadServerFiles();
            }

            async function bulkCopyPrompt() {
                const names = getSelectedNames();
                const targetDir = prompt(\`Copy \${names.length} items to: \`, currentDir);
                if (targetDir === null) return;
                await fetch(API_BASE + '/api/bulk-copy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ names, fromDir: currentDir, toDir: targetDir })
                });
                loadServerFiles();
            }

            async function bulkDownload() {
                const names = getSelectedNames();
                names.forEach(name => {
                    const link = document.createElement('a');
                    link.href = \`\${API_BASE}/api/download-file?name=\${encodeURIComponent(name)}&dir=\${encodeURIComponent(currentDir)}\`;
                    link.download = name;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            }

            async function bulkDownloadZip() {
                const names = getSelectedNames();
                if (!names.length) return;
                const link = document.createElement('a');
                link.href = \`\${API_BASE}/api/download-zip?names=\${encodeURIComponent(names.join(','))}&dir=\${encodeURIComponent(currentDir)}\`;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // --- 文件内容编辑 ---
            async function openFileEditor(name) {
                currentEditingFile = name;
                document.getElementById('editorFileName').innerText = (currentDir ? '/' + currentDir : '') + '/' + name;
                document.getElementById('editorArea').value = 'Loading...';
                document.getElementById('editorModal').style.display = 'flex';
                
                try {
                    const res = await fetch(API_BASE + \`/api/read-file?name=\${encodeURIComponent(name)}&dir=\${encodeURIComponent(currentDir)}\`);
                    const data = await res.text();
                    if(res.status === 200){
                        document.getElementById('editorArea').value = data;
                    } else {
                        document.getElementById('editorArea').value = 'Error:\\n' + data;
                    }
                } catch(e) {
                    document.getElementById('editorArea').value = 'Error loading file content.';
                }
            }

            function closeEditor() {
                document.getElementById('editorModal').style.display = 'none';
                currentEditingFile = '';
            }

            async function saveFileContent() {
                if(!currentEditingFile) return;
                const content = document.getElementById('editorArea').value;
                document.getElementById('editorFileName').innerText = 'Saving...';
                try {
                    const res = await fetch(API_BASE + '/api/save-file', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: currentEditingFile, content, dir: currentDir })
                    });
                    const result = await res.json();
                    if(result.success) {
                        closeEditor();
                        loadServerFiles();
                    } else {
                        alert(result.error);
                        document.getElementById('editorFileName').innerText = currentEditingFile;
                    }
                } catch(e) {
                    alert('保存异常');
                    document.getElementById('editorFileName').innerText = currentEditingFile;
                }
            }

            loadStats();
            loadServerFiles();
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// 高级文件管家 & 性能指标 API
// ==========================================

let lastDiskUsage = 'N/A';
function updateDiskUsage() {
    if (os.platform() !== 'linux') {
        lastDiskUsage = 'N/A';
        return;
    }
    exec('df -h "' + WWW_DIR + '"', (err, stdout) => {
        if (!err && stdout) {
            const lines = stdout.split('\n');
            if (lines[1]) {
                const parts = lines[1].trim().split(/\s+/);
                const pct = parts.find(p => p.includes('%'));
                if (pct) lastDiskUsage = pct;
            }
        }
    });
}
setInterval(updateDiskUsage, 60000); // Update disk every minute
updateDiskUsage();

function getDiskUsage() {
    return lastDiskUsage;
}

route.get('/api/stats', (req, res) => {
    const uptimeSecs = os.uptime();
    const d = Math.floor(uptimeSecs / 86400);
    const h = Math.floor((uptimeSecs % 86400) / 3600);
    const m = Math.floor((uptimeSecs % 3600) / 60);
    const uptimeStr = `${d}d ${h}h ${m}m`;

    const cpuLoad = os.loadavg()[0];
    const cpuPctNum = parseFloat((Math.min(100, Math.max(0, cpuLoad * 10))).toFixed(2));

    const freeMem = os.freemem();
    const totalMem = os.totalmem();

    res.json({
        uptime: uptimeStr,
        cpu: cpuPctNum,
        memUsed: totalMem - freeMem,
        memTotal: totalMem,
        host: HOST === '::' ? 'localhost' : HOST,
        disk: getDiskUsage(),
        netInRaw: currentNetRaw.in,
        netOutRaw: currentNetRaw.out
    });
});

route.get('/api/files', (req, res) => {
    try {
        const targetDir = getSafePath(req.query.dir);
        if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            return res.status(404).json({ error: 'Directory not found' });
        }
        const items = fs.readdirSync(targetDir).filter(item => !item.startsWith('.'));
        const files = items.map(item => {
            const stat = fs.statSync(path.join(targetDir, item));
            return {
                name: item,
                isDir: stat.isDirectory(),
                size: stat.size,
                sizeStr: formatSize(stat.size),
                mtime: formatDate(stat.mtime)
            };
        }).sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
        res.json({ files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

route.post('/api/upload', upload.array('files'), (req, res) => {
    res.json({ success: true });
});

route.get('/api/check-exists', (req, res) => {
    const { name, dir } = req.query;
    try {
        const targetPath = path.join(getSafePath(dir), name);
        res.json({ exists: fs.existsSync(targetPath) });
    } catch (e) { res.status(500).json({ exists: false }); }
});

route.post('/api/move-file', (req, res) => {
    const { name, fromDir, toDir } = req.body;
    try {
        const oldPath = path.join(getSafePath(fromDir), name);
        const newPath = path.join(getSafePath(toDir), name);
        fs.renameSync(oldPath, newPath);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/copy-file', (req, res) => {
    const { name, dir, newName } = req.body;
    try {
        const src = path.join(getSafePath(dir), name);
        const dest = path.join(getSafePath(dir), newName);
        fs.copyFileSync(src, dest);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/bulk-delete', (req, res) => {
    const { names, dir } = req.body;
    const baseDir = getSafePath(dir);
    try {
        names.forEach(name => {
            const target = path.join(baseDir, name);
            if (fs.existsSync(target)) {
                if (fs.statSync(target).isDirectory()) fs.rmSync(target, { recursive: true, force: true });
                else fs.unlinkSync(target);
            }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/bulk-move', (req, res) => {
    const { names, fromDir, toDir } = req.body;
    const srcBase = getSafePath(fromDir);
    const destBase = getSafePath(toDir);
    try {
        names.forEach(name => {
            fs.renameSync(path.join(srcBase, name), path.join(destBase, name));
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/bulk-copy', (req, res) => {
    const { names, fromDir, toDir } = req.body;
    const srcBase = getSafePath(fromDir);
    const destBase = getSafePath(toDir);
    try {
        names.forEach(name => {
            const src = path.join(srcBase, name);
            const dest = path.join(destBase, name);
            if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true });
            else fs.copyFileSync(src, dest);
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/delete-file', (req, res) => {
    const { name, dir } = req.body;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).json({ success: false, error: 'Illegal argument' });

    try {
        const targetPath = path.join(getSafePath(dir), name);
        if (!targetPath.startsWith(WWW_DIR)) return res.status(403).json({ success: false, error: 'Path escape detected' });

        const protectedFiles = [path.join(WWW_DIR, 'app.js')];
        if (protectedFiles.includes(targetPath)) return res.status(403).json({ success: false, error: 'Protected system core file!' });

        if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isDirectory()) {
                fs.rmSync(targetPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(targetPath);
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

route.post('/api/rename-file', (req, res) => {
    const { oldName, newName, dir } = req.body;
    if (!oldName || !newName || oldName.includes('..') || newName.includes('..') || oldName.includes('/') || newName.includes('/')) {
        return res.status(403).json({ error: 'Illegal name' });
    }
    try {
        const baseDir = getSafePath(dir);
        const oldFile = path.join(baseDir, oldName);
        const newFile = path.join(baseDir, newName);

        const protectedFiles = [path.join(WWW_DIR, 'app.js')];
        if (protectedFiles.includes(oldFile)) return res.status(403).json({ error: 'Core files cannot be renamed' });

        fs.renameSync(oldFile, newFile);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/create-dir', (req, res) => {
    const { name, dir } = req.body;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).json({ error: 'Illegal name' });
    try {
        fs.mkdirSync(path.join(getSafePath(dir), name));
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.post('/api/create-file', (req, res) => {
    const { name, dir } = req.body;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).json({ error: 'Illegal name' });
    try {
        fs.writeFileSync(path.join(getSafePath(dir), name), '');
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.get('/api/read-file', (req, res) => {
    const { name, dir } = req.query;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).send('Illegal argument');
    try {
        const targetPath = path.join(getSafePath(dir), name);
        const stats = fs.statSync(targetPath);
        if (stats.size > 2 * 1024 * 1024) return res.status(400).send('File is too large to edit directly (> 2MB).');
        res.send(fs.readFileSync(targetPath, 'utf8'));
    } catch (e) { res.status(500).send(e.message); }
});

route.post('/api/exec', (req, res) => {
    let { command } = req.body;
    if (!command) return res.json({ error: 'No command provided' });

    // Handle 'cd' locally
    const trimmedCmd = command.trim();
    if (trimmedCmd === 'cd' || trimmedCmd.startsWith('cd ')) {
        let arg = trimmedCmd.slice(3).trim();
        let targetDir;

        if (!arg || arg === '~') {
            targetDir = WWW_DIR;
        } else if (arg.startsWith('~')) {
            targetDir = path.join(WWW_DIR, arg.slice(1));
        } else {
            targetDir = path.resolve(currentTerminalCwd, arg);
        }

        // Ensure the path exists and is a directory
        try {
            if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
                currentTerminalCwd = targetDir;
                // Don't restrict cd to WWW_DIR, but return relative path for UI if it is
                const relCwd = path.relative(WWW_DIR, currentTerminalCwd);
                const displayCwd = (relCwd.startsWith('..') || path.isAbsolute(relCwd))
                    ? currentTerminalCwd.replace(/\\/g, '/')
                    : '~' + (relCwd ? '/' + relCwd.replace(/\\/g, '/') : '');

                return res.json({ output: '', cwd: displayCwd });
            } else {
                return res.json({ error: `cd: ${arg}: No such directory` });
            }
        } catch (e) {
            return res.json({ error: `cd error: ${e.message}` });
        }
    }

    // Force color for ls
    if (trimmedCmd === 'ls' || trimmedCmd.startsWith('ls ')) {
        if (!command.includes('--color')) {
            command = command.replace('ls', 'ls --color=always');
        }
    }

    exec(command, {
        cwd: currentTerminalCwd,
        env: { ...process.env, TERM: 'xterm-256color' }
    }, (error, stdout, stderr) => {
        const relCwd = path.relative(WWW_DIR, currentTerminalCwd) || '~';
        res.json({
            output: stdout || null,
            error: stderr || (error ? error.message : null),
            cwd: relCwd.replace(/\\/g, '/')
        });
    });
});

route.post('/api/save-file', (req, res) => {
    const { name, content, dir } = req.body;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).json({ error: 'Illegal argument' });
    try {
        fs.writeFileSync(path.join(getSafePath(dir), name), content, 'utf8');
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

route.get('/api/download-file', (req, res) => {
    const { name, dir } = req.query;
    if (!name || name.includes('..') || name.includes('/')) return res.status(403).send('Illegal argument');
    try {
        res.download(path.join(getSafePath(dir), name));
    } catch (e) { res.status(404).send('Not found'); }
});

route.get('/api/download-zip', (req, res) => {
    const { names: namesStr, dir } = req.query;
    if (!namesStr) {
        return res.status(400).send('No files specified');
    }
    const names = namesStr.split(',');
    
    try {
        const baseDir = getSafePath(dir);
        
        // Generate a unique temp zip file name in system temp directory
        const tempZipName = `download_${Date.now()}_${Math.floor(Math.random() * 1000)}.zip`;
        const tempZipPath = path.join(os.tmpdir(), tempZipName);
        
        // Sanitize names to prevent shell injection and path escape
        const safeNames = [];
        for (const name of names) {
            if (name.includes('..') || name.includes('/') || name.includes('\\')) {
                return res.status(403).send('Illegal file name detected');
            }
            const fullPath = path.join(baseDir, name);
            if (!fullPath.startsWith(WWW_DIR)) {
                return res.status(403).send('Path escape detected');
            }
            safeNames.push(name);
        }
        
        const { execFile } = require('child_process');
        const args = ['-r', tempZipPath, ...safeNames];
        
        execFile('zip', args, { cwd: baseDir }, (error, stdout, stderr) => {
            if (error) {
                console.error('Zip error:', error, stderr);
                return res.status(500).send('Failed to create zip archive: ' + (stderr || error.message));
            }
            
            res.download(tempZipPath, 'archive.zip', (err) => {
                // Delete temp file after download completion
                try {
                    if (fs.existsSync(tempZipPath)) {
                        fs.unlinkSync(tempZipPath);
                    }
                } catch (e) {
                    console.error('Failed to delete temp zip:', e);
                }
            });
        });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.use(BASE_PATH, route);

app.listen(PORT, HOST, () => {
    console.log(`✅ 专属导航云端管理中心已启动！`);
    console.log(`📡 监听地址: http://${HOST === '::' ? 'localhost' : HOST}:${PORT}${BASE_PATH}`);
});