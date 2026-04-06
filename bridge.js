#!/usr/bin/env node

/**
 * Ombra Prime Control Center - Bridge Server
 * 
 * This server acts as a bridge between the Control Center web UI
 * (deployed on GitHub Pages) and the local OpenClaw installation.
 * 
 * It receives HTTP requests and proxies them to OpenClaw CLI commands.
 * 
 * Usage: node bridge.js
 * Runs on http://localhost:3000 by default
 */

const http = require('http');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 3000;
const ASSETS_DIR = '/home/oris/.openclaw/workspace/ombra_output';
const WORLD_BIBLE_DIR = '/home/oris/.openclaw/workspace/ombra_world/world_bible';
const GENERATE_SCRIPT = '/home/oris/.openclaw/workspace/skills/generate-ombra-asset/main.js';

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
};

// Simple router
const routes = {
    'GET /api/status': handleStatus,
    'GET /api/keys': handleKeys,
    'GET /api/assets': handleAssets,
    'GET /api/worldbible/stats': handleWorldBibleStats,
    'POST /api/generate': handleGenerate,
    'POST /api/automation': handleAutomation,
    'GET /api/health': () => ({ ok: true })
};

// ============================================
// HTTP SERVER
// ============================================
const server = http.createServer(async (req, res) => {
    // CORS headers for GitHub Pages
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const method = req.method;
    const pathname = url.pathname;

    console.log(`[${new Date().toISOString()}] ${method} ${pathname}`);

    // Find matching route
    const routeKey = `${method} ${pathname}`;
    const handler = routes[routeKey];

    if (handler) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const result = await handler(body ? JSON.parse(body) : {});
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                console.error('Handler error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     OMBRA PRIME CONTROL CENTER - BRIDGE            ║
╠═══════════════════════════════════════════════════╣
║  Server running on http://0.0.0.0:${PORT}            ║
║  Waiting for requests from Control Center...       ║
║                                                      ║
║  ⚠️  FOR REMOTE ACCESS - RUN NGROOK:                ║
║  ngrok http ${PORT}                                  ║
╚═══════════════════════════════════════════════════╝
    `);
});

// ============================================
// API HANDLERS
// ============================================

async function handleStatus() {
    // Check if OpenClaw is running
    try {
        execSync('openclaw gateway status', { encoding: 'utf-8', stdio: 'pipe' });
        return { 
            bridge: true, 
            openclaw: true,
            automation: {
                morning_asset: await isAutomationEnabled('morning_asset'),
                backup: await isAutomationEnabled('backup')
            }
        };
    } catch (error) {
        return { bridge: true, openclaw: false };
    }
}

async function handleKeys() {
    // Return API key status
    // For now, return mock data - in production, read from config
    const keys = [
        { name: 'ElevenLabs', expiry: '2026-07-05', daysUntilExpiry: 91 },
        { name: 'Gemini', expiry: '2026-06-10', daysUntilExpiry: 66 },
        { name: 'OpenAI', expiry: '2026-08-20', daysUntilExpiry: 137 }
    ];
    return keys;
}

async function handleAssets() {
    // Get recent assets from ombra_output
    try {
        if (!fs.existsSync(ASSETS_DIR)) {
            return [];
        }

        const dirs = fs.readdirSync(ASSETS_DIR)
            .filter(f => {
                const stat = fs.statSync(path.join(ASSETS_DIR, f));
                return stat.isDirectory();
            })
            .map(f => {
                const stat = fs.statSync(path.join(ASSETS_DIR, f));
                return { name: f, time: formatTime(stat.mtime) };
            })
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, 10);

        return dirs;
    } catch (error) {
        console.error('Error reading assets:', error);
        return [];
    }
}

async function handleWorldBibleStats() {
    // Get World Bible statistics
    try {
        if (!fs.existsSync(WORLD_BIBLE_DIR)) {
            return { files: 0, zones: 0, characters: 0 };
        }

        const files = fs.readdirSync(WORLD_BIBLE_DIR)
            .filter(f => fs.statSync(path.join(WORLD_BIBLE_DIR, f)).isFile());

        // Count zones (files containing "zone" or specific zone names)
        const zones = files.filter(f => 
            f.includes('zone') || 
            ['the_pearl', 'the_city', 'industrial', 'research'].some(z => f.includes(z))
        ).length;

        // Count characters (files in characters/ folder or with char names)
        const characters = files.filter(f => 
            f.includes('character') || f.includes('person')
        ).length;

        return {
            files: files.length,
            zones: zones || 7, // Default if can't detect
            characters: characters || 0
        };
    } catch (error) {
        console.error('Error reading world bible:', error);
        return { files: 0, zones: 0, characters: 0 };
    }
}

async function handleGenerate(body) {
    const { hint } = body;
    
    if (!hint) {
        throw new Error('Hint is required');
    }

    console.log(`Generating asset with hint: "${hint}"`);

    // Run the asset generation script
    const command = `cd /home/oris/.openclaw/workspace && node "${GENERATE_SCRIPT}" "${hint}"`;

    return new Promise((resolve, reject) => {
        exec(command, { timeout: 600000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Generation error:', error);
                reject(new Error(`Generation failed: ${error.message}`));
                return;
            }

            console.log('Generation output:', stdout);

            // Parse output to get asset name and URL
            // Expected output format: "Asset: {name}\nOutput: {path}\nLive: {url}"
            const assetMatch = stdout.match(/Asset:\s*(.+)/);
            const liveMatch = stdout.match(/Live:\s*(https?:\/\/[^\s]+)/);

            const assetName = assetMatch ? assetMatch[1].trim() : 'Unknown';
            const liveUrl = liveMatch ? liveMatch[1].trim() : 'https://steffost.github.io/assets/';

            // Trigger deploy to GitHub Pages
            triggerDeploy();

            resolve({
                success: true,
                assetName,
                liveUrl,
                output: stdout
            });
        });
    });
}

async function handleAutomation(body) {
    const { enabled, type } = body;
    
    if (!type) {
        throw new Error('Automation type is required');
    }

    console.log(`Setting ${type} automation to: ${enabled}`);

    const cronName = `omniautomation_${type}`;
    
    if (enabled) {
        // Create cron job
        let schedule, payload;
        
        if (type === 'backup') {
            // Backup every day at 03:00
            schedule = '0 3 * * *';
            payload = {
                kind: 'agentTurn',
                message: 'Kör backup-scriptet: bash /home/oris/assets/backup.sh'
            };
        } else if (type === 'morning_asset') {
            // Morning asset every Monday at 06:00
            schedule = '0 6 * * 1';
            payload = {
                kind: 'agentTurn',
                message: 'Generera en ny Ombra Prime asset med hint "en komponent". Använd generate-ombra-asset pipelinen och deploya resultatet till GitHub Pages.'
            };
        }
        
        // Remove existing cron with same name first
        try {
            execSync(`openclaw cron remove ${cronName} 2>/dev/null`, { encoding: 'utf-8' });
        } catch (e) {}
        
        // Add new cron job using openclaw CLI
        const cronCmd = `openclaw cron add --name "${cronName}" --schedule '${schedule}' --session-target isolated --payload '${JSON.stringify(payload)}'`;
        
        try {
            const result = execSync(cronCmd, { encoding: 'utf-8' });
            console.log(`Cron job created: ${result}`);
        } catch (error) {
            console.error(`Failed to create cron job: ${error.message}`);
            // Try alternative approach via cron tool
            return {
                success: false,
                type,
                enabled,
                message: `Kunde inte skapa cron job: ${error.message}`
            };
        }
    } else {
        // Remove cron job
        try {
            execSync(`openclaw cron remove ${cronName} 2>/dev/null`, { encoding: 'utf-8' });
            console.log(`Cron job removed: ${cronName}`);
        } catch (error) {
            console.error(`Failed to remove cron job: ${error.message}`);
        }
    }

    return {
        success: true,
        type,
        enabled,
        message: `Automation ${type} ${enabled ? 'aktiverad' : 'inaktiverad'}`
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isAutomationEnabled(type) {
    // Check if cron job exists for this automation type
    const cronName = `omniautomation_${type}`;
    try {
        const result = execSync(`openclaw cron list --json 2>/dev/null || echo "[]"`, { encoding: 'utf-8' });
        const jobs = JSON.parse(result);
        return jobs.some(j => j.name && j.name.includes(cronName));
    } catch {
        return false;
    }
}

function triggerDeploy() {
    // Trigger deploy to GitHub Pages
    try {
        exec('cd /home/oris/assets && git add -A && git commit -m "Auto-deploy $(date)" && git push 2>/dev/null &');
    } catch (error) {
        console.error('Deploy trigger failed:', error);
    }
}

function formatTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down bridge server...');
    server.close();
    process.exit(0);
});
