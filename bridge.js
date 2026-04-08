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
    'POST /api/world-builder': handleWorldBuilder,
    'GET /api/world-builder/status': handleWorldBuilderStatus,
    'GET /api/worldbuilder/image': handleWorldBuilderImage,
    'GET /api/heygen/clips': handleHeygenClips,
    'POST /api/heygen/generate': handleHeygenGenerate,
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
                let params = {};
                if (body) {
                    params = JSON.parse(body);
                } else if (method === 'GET') {
                    // Parse query parameters for GET requests
                    const url = new URL(req.url, `http://localhost:${PORT}`);
                    url.searchParams.forEach((value, key) => {
                        params[key] = value;
                    });
                }
                const result = await handler(params);
                
                // Special handling for image responses
                if (result && result.contentType && result.data) {
                    res.writeHead(200, { 'Content-Type': result.contentType });
                    res.end(Buffer.from(result.data, 'base64'));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                }
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

async function getCronIdByName(name) {
    try {
        const result = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf-8' });
        const data = JSON.parse(result);
        const jobs = data.jobs || [];
        const job = jobs.find(j => j.name === name);
        return job ? job.id : null;
    } catch (e) {
        console.error('Error getting cron ID:', e.message);
        return null;
    }
}

async function handleAutomation(body) {
    const { enabled, type } = body;
    
    if (!type) {
        throw new Error('Automation type is required');
    }

    console.log(`Setting ${type} automation to: ${enabled}`);

    const cronName = `omniautomation_${type}`;
    
    if (enabled) {
        // Remove existing cron with same name first
        const existingId = await getCronIdByName(cronName);
        if (existingId) {
            try {
                execSync(`openclaw cron rm ${existingId} 2>/dev/null`, { encoding: 'utf-8' });
            } catch (e) {}
        }
        
        // Add new cron job using openclaw CLI
        let cronCmd;
        
        if (type === 'backup') {
            cronCmd = `openclaw cron add --name "${cronName}" --cron "0 3 * * *" --session isolated --message "bash /home/oris/assets/backup.sh" --timeout 300000`;
        } else if (type === 'morning_asset') {
            const morningPrompt = 'Läs World Bible filerna i /home/oris/.openclaw/workspace/ombra_world/world_bible/. Bläddra igenom och låt dig inspireras av något slumpmässigt - det kan vara en plats, en varelse, en artefakt, en ritual, ett koncept. När du hittar något intressant, skapa en kreativ hint baserat på det och kör sedan generate-ombra-asset pipelinen med din hint. Deploya resultatet till GitHub Pages. Ha kul och var kreativ!';
            cronCmd = `openclaw cron add --name "${cronName}" --cron "0 6 * * 1" --session isolated --message "${morningPrompt}" --timeout 900000`;
        }
        
        try {
            const result = execSync(cronCmd, { encoding: 'utf-8' });
            console.log(`Cron job created: ${result}`);
        } catch (error) {
            console.error(`Failed to create cron job: ${error.message}`);
            return {
                success: false,
                type,
                enabled,
                message: `Kunde inte skapa cron job: ${error.message}`
            };
        }
    } else {
        // Remove cron job by name
        const existingId = await getCronIdByName(cronName);
        if (existingId) {
            try {
                execSync(`openclaw cron rm ${existingId} 2>/dev/null`, { encoding: 'utf-8' });
                console.log(`Cron job removed: ${cronName} (${existingId})`);
            } catch (error) {
                console.error(`Failed to remove cron job: ${error.message}`);
            }
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

async function handleWorldBuilder(req) {
    // req is actually the parsed body object directly (JSON.parse(body))
    const { action, zone } = req || {};
    
    if (action === 'status') {
        return handleWorldBuilderStatus();
    }
    
    if (!zone) {
        return {
            success: false,
            message: 'Zon krävs! Använd: {"zone": "the_pearl"}'
        };
    }
    
    // Run world-builder-agent with zone
    console.log(`Starting World Builder Agent for zone: ${zone}...`);
    
    try {
        const result = execSync(
            `node /home/oris/.openclaw/workspace/skills/world-builder-agent/main.js ${zone} 2>&1`,
            {
                encoding: 'utf-8',
                timeout: 120000,
                cwd: '/home/oris/.openclaw/workspace/skills/world-builder-agent'
            }
        );
        
        console.log('World Builder result:', result);
        
        // Parse output to find what was created
        const match = result.match(/Sparad: (.+)/);
        const created = match ? match[1] : 'unknown';
        
        return {
            success: true,
            message: `World Builder: ${created}`,
            output: result
        };
    } catch (error) {
        console.error('World Builder error:', error.message);
        return {
            success: false,
            message: `Fel: ${error.message}`
        };
    }
}

async function handleWorldBuilderStatus() {
    const STATE_FILE = '/home/oris/.openclaw/workspace/ombra_world/staging/state.json';
    const STAGING_DIR = '/home/oris/.openclaw/workspace/ombra_world/staging';
    
    const ZONES = [
        { id: 'the_pearl', name: 'The Pearl' },
        { id: 'the_city', name: 'The City' },
        { id: 'industrial_domain', name: 'Industrial Domain' },
        { id: 'research_spires', name: 'Research Spires' },
        { id: 'the_chamber', name: 'The Chamber' },
        { id: 'hangar', name: 'Hangaren' },
        { id: 'ez_aqua_core', name: 'EZ Aqua Core' }
    ];
    
    try {
        let state = { created: {}, cycles: 0, lastBuild: null };
        if (fs.existsSync(STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
        
        // List zones and their files
        const zones = ZONES.map(zone => {
            const zonePath = path.join(STAGING_DIR, zone.id);
            let files = [];
            if (fs.existsSync(zonePath)) {
                files = fs.readdirSync(zonePath)
                    .filter(f => f.endsWith('.txt'))
                    .map(f => {
                        const stat = fs.statSync(path.join(zonePath, f));
                        return { name: f, time: formatTime(stat.mtime) };
                    });
            }
            return {
                id: zone.id,
                name: zone.name,
                files,
                count: files.length
            };
        });
        
        return {
            state,
            zones,
            totalCycles: state.cycles,
            lastBuild: state.lastBuild
        };
    } catch (error) {
        return { error: error.message };
    }
}

async function handleHeygenClips() {
    // Check both mara_rox_news (news scripts) and mara_rox_simple (videos)
    const HEYGEN_DIR = '/home/oris/.openclaw/workspace/heygen_output/mara_rox_simple';
    const NEWS_DIR = '/home/oris/.openclaw/workspace/heygen_output/mara_rox_news';
    
    try {
        let clips = [];
        
        // Get videos from mara_rox_simple
        if (fs.existsSync(HEYGEN_DIR)) {
            const files = fs.readdirSync(HEYGEN_DIR)
                .filter(f => f.endsWith('.mp4'))
                .sort()
                .reverse();
            
            clips = files.map(f => {
                const stats = fs.statSync(path.join(HEYGEN_DIR, f));
                return {
                    filename: f,
                    type: 'video',
                    size: stats.size,
                    created: stats.mtime
                };
            });
        }
        
        // Get news scripts from mara_rox_news
        if (fs.existsSync(NEWS_DIR)) {
            const newsFiles = fs.readdirSync(NEWS_DIR)
                .filter(f => f.startsWith('news_') && f.endsWith('.txt'))
                .sort()
                .reverse();
            
            const newsClips = newsFiles.map(f => {
                const stats = fs.statSync(path.join(NEWS_DIR, f));
                return {
                    filename: f,
                    type: 'news',
                    size: stats.size,
                    created: stats.mtime
                };
            });
            
            clips = [...clips, ...newsClips];
        }
        
        // Sort by created date
        clips.sort((a, b) => new Date(b.created) - new Date(a.created));
        
        return { clips };
    } catch (error) {
        console.error('HeyGen clips error:', error);
        return { error: error.message, clips: [] };
    }
}

async function handleHeygenGenerate(req) {
    // Handler receives parsed JSON directly (not req object)
    const prompt = req?.prompt;
    const dimension = req?.dimension || 'landscape'; // portrait, landscape, hd
    const mode = req?.mode || 'avatar'; // avatar or agent
    
    if (!prompt) {
        return { error: 'prompt is required' };
    }
    
    // Valid dimensions
    const validDimensions = ['portrait', 'landscape', 'hd'];
    const dim = validDimensions.includes(dimension) ? dimension : 'landscape';
    
    // Choose script based on mode
    let HEYGEN_SCRIPT;
    let command;
    
    if (mode === 'agent') {
        // heygen-video (Agent mode) - doesn't support --dimension
        HEYGEN_SCRIPT = '/home/oris/.openclaw/workspace/skills/heygen-video/main.js';
        command = `node ${HEYGEN_SCRIPT} "${prompt.replace(/"/g, '\\"')}" --json > /tmp/heygen_generate.log 2>&1 &`;
    } else {
        // heygen-simple-video (Avatar mode) - supports --dimension
        HEYGEN_SCRIPT = '/home/oris/.openclaw/workspace/skills/heygen-simple-video/main.js';
        command = `node ${HEYGEN_SCRIPT} --dimension ${dim} "${prompt.replace(/"/g, '\\"')}" --json > /tmp/heygen_generate.log 2>&1 &`;
    }
    
    try {
        // Run HeyGen script in background and return immediately
        exec(command);
        
        return { 
            ok: true, 
            message: `Video generation started (${mode}, ${dim}). Poll /api/heygen/clips for status.`,
            prompt: prompt,
            dimension: dim,
            mode: mode
        };
    } catch (error) {
        console.error('HeyGen generate error:', error);
        return { error: error.message };
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

// Serve static image files from ombra_world staging
async function handleWorldBuilderImage(req) {
    const { zone, filename } = req || {};
    
    if (!zone || !filename) {
        return { error: 'Missing zone or filename parameter' };
    }
    
    const filePath = path.join('/home/oris/.openclaw/workspace/ombra_world/staging', zone, filename);
    
    if (!fs.existsSync(filePath)) {
        return { error: 'File not found' };
    }
    
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.txt': 'text/plain'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    
    return {
        contentType,
        data: data.toString('base64'),
        size: data.length
    };
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down bridge server...');
    server.close();
    process.exit(0);
});
