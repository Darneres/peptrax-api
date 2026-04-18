const https = require('https');
const http = require('http');

// In-memory cache: peptide -> { data, timestamp }
const cache = new Map();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const VENDOR_LIST = [
  "Limitless Biotech", "Core Peptides", "Polaris Peptides", "Skye Peptides",
  "Nexaph", "Disguised Research", "PeptidesATX", "Felix Chemical Supply",
  "Peptidology", "BioLongevity Labs", "AminoVault", "Amino Asylum",
  "Biotech Peptides", "Paradigm Peptides", "Swiss Chems", "Pure Rawz",
  "Aavant Research", "Orbitrex Peptides", "Paramount Peptides",
  "Sports Technology Labs", "Chemyo", "Science Bio", "Maxim Peptide",
  "Blue Sky Peptide", "Nootropic Source", "Geo Peptides",
  "Bulk Peptide Wholesale", "Umbrella Labs", "Loti Labs",
  "Niche Compounds", "Peptide Partners", "Nextechlabs",
];

function callAnthropic(peptide) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `You are a peptide price comparison tool with knowledge of current market prices. Generate realistic current market pricing for the requested peptide from these vendors: ${VENDOR_LIST.join(", ")}. Use your knowledge of typical peptide market prices as of 2025. Return ONLY valid JSON with no markdown, no explanation:
{"peptide":"name","summary":"1-2 sentence overview","administration_routes":["SubQ"],"research_only":true,"results":[{"vendor":"name","price_usd":45.00,"amount_mg":5,"price_per_mg":9.00,"in_stock":true,"sale":false,"sale_pct":0,"original_price":null,"url":"https://vendor.com","note":"brief note","routes_available":["SubQ"],"region":"USA","ships_in":"2-4 days","purity":9.2,"reviews":4.5}]}
Include 6-10 vendors with realistic price variation. Sort by price_per_mg ascending. Return ONLY JSON.`,
      messages: [{ role: "user", content: `Generate current market prices for: ${peptide}` }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('');
          if (!text) { reject(new Error('No text in response')); return; }
          const clean = text.replace(/```json|```/g, '').trim();
          const start = clean.indexOf('{');
          const end = clean.lastIndexOf('}');
          if (start === -1 || end === -1) { reject(new Error('No JSON found')); return; }
          resolve(JSON.parse(clean.substring(start, end + 1)));
        } catch (e) {
          reject(new Error('Parse failed: ' + e.message));
        }
      });
    });

    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/search') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { peptide, force } = JSON.parse(body);
        if (!peptide) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing peptide' })); return; }

        const key = peptide.toLowerCase().trim();
        const cached = cache.get(key);
        
        // Return cache if fresh and not forced refresh
        if (cached && !force && (Date.now() - cached.timestamp) < CACHE_TTL) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...cached.data, cached: true }));
          return;
        }

        const result = await callAnthropic(peptide);
        cache.set(key, { data: result, timestamp: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        // If API fails but we have stale cache, return it
        const key = JSON.parse(body).peptide?.toLowerCase().trim();
        const cached = cache.get(key);
        if (cached) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...cached.data, cached: true }));
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'PepTrax API running', cached: cache.size }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.timeout = 30000;
server.listen(PORT, () => console.log(`PepTrax API running on port ${PORT}`));