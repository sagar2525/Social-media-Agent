const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const WEBHOOK1_URL = 'https://n8n.smallgrp.com/webhook/create-post';
const WEBHOOK2_URL = 'https://n8n.smallgrp.com/webhook/confirm-post';

// Max body size: 50MB (for base64 images)
const MAX_BODY_SIZE = 50 * 1024 * 1024;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// ── Shared: parse NDJSON streaming response from n8n ──
function parseN8nResponse(data) {
    if (!data || !data.trim()) {
        return 'Message received but no response from the bot.';
    }

    let botOutput = '';

    try {
        const singleJson = JSON.parse(data);
        botOutput = singleJson.output || singleJson.response || singleJson.text || JSON.stringify(singleJson);
    } catch {
        const lines = data.split('\n').filter((l) => l.trim());
        const contentParts = [];

        for (const line of lines) {
            try {
                const obj = JSON.parse(line);

                if (
                    obj.type === 'item' &&
                    obj.metadata?.nodeName === 'Respond to Webhook' &&
                    obj.content
                ) {
                    try {
                        const inner = JSON.parse(obj.content);
                        if (inner.output) {
                            botOutput = inner.output;
                            break;
                        }
                    } catch {
                        botOutput = obj.content;
                        break;
                    }
                }

                if (
                    obj.type === 'item' &&
                    obj.content &&
                    obj.metadata?.nodeName === 'AI Agent'
                ) {
                    contentParts.push(obj.content);
                }
            } catch {
                // skip
            }
        }

        if (!botOutput && contentParts.length > 0) {
            botOutput = contentParts.join('');
        }

        if (!botOutput) {
            botOutput = data.trim();
        }
    }

    return botOutput;
}

// ── Shared: forward a JSON payload to a webhook URL ──
function forwardToWebhook(webhookUrl, postData, res, timeoutMs = 60000) {
    const url = new URL(webhookUrl);
    const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => (data += chunk));
        proxyRes.on('end', () => {
            console.log(`← Webhook response (${proxyRes.statusCode}): ${data.substring(0, 200) || '(empty)'}`);

            const botOutput = parseN8nResponse(data);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
            console.log(`✓ Extracted output: ${botOutput.substring(0, 100)}...`);
            res.end(JSON.stringify({ output: botOutput }));
        });
    });

    proxyReq.on('error', (err) => {
        console.error('✗ Webhook error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to reach the webhook: ' + err.message }));
    });

    proxyReq.setTimeout(timeoutMs, () => {
        proxyReq.destroy();
        console.error('✗ Webhook timeout');
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook request timed out' }));
    });

    proxyReq.write(postData);
    proxyReq.end();
}

// ── Read request body with size limit ──
function readBody(req, callback) {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
            req.destroy();
            callback(new Error('Request body too large'));
            return;
        }
        body += chunk;
    });

    req.on('end', () => callback(null, body));
    req.on('error', (err) => callback(err));
}

// ── Create Server ──
const requestHandler = (req, res) => {
    // ── Webhook1: Chat / Generate Post ──
    if (req.method === 'POST' && req.url === '/api/chat') {
        readBody(req, (err, body) => {
            if (err) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }

            let parsed;
            try {
                parsed = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }

            const postData = JSON.stringify({
                chatInput: parsed.message || '',
                sessionId: parsed.sessionId || 'default',
                images: parsed.images || [],
                platforms: parsed.platforms || ['linkedin', 'x', 'instagram'],
            });

            console.log(`→ [Chat] Forwarding to webhook1 (message: "${(parsed.message || '').substring(0, 50)}", platforms: ${JSON.stringify(parsed.platforms || [])}, images: ${(parsed.images || []).length})`);
            forwardToWebhook(WEBHOOK1_URL, postData, res, 30000);
        });
        return;
    }

    // ── Webhook2: Confirm Post ──
    if (req.method === 'POST' && req.url === '/api/confirm-post') {
        readBody(req, (err, body) => {
            if (err) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }

            let parsed;
            try {
                parsed = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }

            const postData = JSON.stringify({
                text: parsed.text || '',
                sessionId: parsed.sessionId || 'default',
                images: parsed.images || [],
                platforms: parsed.platforms || ['linkedin', 'x', 'instagram'],
            });

            console.log(`→ [Confirm] Forwarding to webhook2 (text: "${(parsed.text || '').substring(0, 50)}", platforms: ${JSON.stringify(parsed.platforms || [])}, images: ${(parsed.images || []).length})`);
            forwardToWebhook(WEBHOOK2_URL, postData, res, 60000);
        });
        return;
    }

    // ── CORS preflight ──
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    // ── Serve static files (For Local Dev) ──
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
};

if (require.main === module) {
    const server = http.createServer(requestHandler);
    server.listen(PORT, () => {
        console.log(`\n  🤖 Social Post Creator running at http://localhost:${PORT}\n`);
    });
} else {
    module.exports = requestHandler;
}
