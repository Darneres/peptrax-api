const https = require('https');
const http = require('http');

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
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `You are a peptide price comparison tool. Search for current prices of the requested peptide from these vendors: ${VENDOR_LIST.join(", ")}. Return ONLY valid JSON with no markdown:
{"peptide":"name","summary":"1-2 sentence overview","administration_routes":["SubQ"],"research_only":true,"results":[{"vendor":"name","price_usd":45.00,"amount_mg":5,"price_per_mg":9.00,"in_stock":true,"sale":false,"sale_pct":0,"original_price":null,"url":"url","note":"note","routes_available":["SubQ"],"region":"USA","ships_in":"3-5 days"}]}
Sort by price_per_mg ascending. Return ONLY JSON.`,
      messages: [{ role: "user", content: `Find current prices for: ${peptide}` }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 55000,
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
          // Handle all content block types including tool_use and tool_result
          const text = parsed.content
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('');
          
          if (!text) {
            reject(new Error('No text in response'));
            return;
          }
          
          const clean = text.replace(/```json|```/g, '').trim();
          const start = clean.indexOf('{');
          const end = clean.lastIndexOf('}');
          
          if (start === -1 || end === -1) {
            reject(new Error('No JSON found in response'));
            return;
          }
          
          resolve(JSON.parse(clean.substring(start, end + 1)));
        } catch (e) {
          reject(new Error('Parse failed: ' + e.message + ' Raw: ' + data.substring(0, 200)));
        }
      });
    });

    req.setTimeout(55000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/search') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { peptide } = JSON.parse(body);
        if (!peptide) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing peptide' }));
          return;
        }
        const result = await callAnthropic(peptide);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'PepTrax API running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.timeout = 60000;
server.keepAliveTimeout = 61000;

server.listen(PORT, () => console.log(`PepTrax API running on port ${PORT}`));