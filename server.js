const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

function readBody(req) {
  return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Serve frontend
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
    return;
  }

  // Proxy Claude API
  if (req.method === 'POST' && req.url === '/api/generate') {
    if (!ANTHROPIC_API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set on server' } }));
      return;
    }
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);

      const data = await new Promise((resolve, reject) => {
        const reqBody = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: payload.system,
          messages: payload.messages
        });
        const apiReq = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(reqBody),
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }, apiRes => {
          let d = '';
          apiRes.on('data', c => d += c);
          apiRes.on('end', () => resolve(JSON.parse(d)));
        });
        apiReq.on('error', reject);
        apiReq.write(reqBody);
        apiReq.end();
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
    return;
  }

  res.writeHead(404); res.end('Not found');

}).listen(PORT, () => {
  console.log(`\n  ✦ ALIAS — AI Username Generator`);
  console.log(`  → http://localhost:${PORT}\n`);
  if (!ANTHROPIC_API_KEY) console.log('  ⚠  Set ANTHROPIC_API_KEY environment variable!\n');
});
