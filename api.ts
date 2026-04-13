// ============================================================
// PEPTRAX BACKEND - Deploy as a Supabase Edge Function
// OR run as a standalone Node.js server on Railway / Render
// ============================================================
// 
// OPTION A: Supabase Edge Function
//   1. npx supabase init
//   2. npx supabase functions new search
//   3. Paste this code into supabase/functions/search/index.ts
//   4. npx supabase secrets set ANTHROPIC_API_KEY=your_key
//   5. npx supabase functions deploy search
//   6. Your URL: https://YOUR_PROJECT.supabase.co/functions/v1/search
//
// OPTION B: Standalone Express server (Railway / Render - free tier)
//   1. npm install express cors @anthropic-ai/sdk
//   2. Deploy to Railway.app (free) or Render.com (free)
//   3. Set env var ANTHROPIC_API_KEY
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VENDOR_LIST = [
  "Limitless Biotech", "Core Peptides", "Polaris Peptides", "Skye Peptides",
  "Nexaph", "Disguised Research", "PeptidesATX", "Felix Chemical Supply",
  "Peptidology", "BioLongevity Labs", "AminoVault", "Amino Asylum",
  "Biotech Peptides", "Paradigm Peptides", "Loti Labs", "Swiss Chems",
  "Pure Rawz", "Aavant Research", "Orbitrex Peptides", "Paramount Peptides",
  "Ascension Peptides", "LVLUP Health", "Healthgevity", "Sports Technology Labs",
  "Chemyo", "Science Bio", "Maxim Peptide", "Peptide Partners", "Nextechlabs",
  "Blue Sky Peptide", "Nootropic Source", "RCD.bio", "Geo Peptides",
  "Bulk Peptide Wholesale", "Peptide Warehouse", "Amino Amigos", "AASraw",
  "IRC.bio", "Niche Compounds", "Peptide Sciences EU", "Umbrella Labs",
];

async function handleSearch(peptide: string) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305" as any, name: "web_search" }],
    system: `You are a peptide price comparison tool. Search for current prices of the requested peptide from as many of these vendors as possible: ${VENDOR_LIST.join(", ")}.

Return ONLY valid JSON with this exact structure, no markdown, no preamble:
{
  "peptide": "exact name",
  "summary": "1-2 sentence market overview",
  "administration_routes": ["SubQ", "IM", "Oral", "Topical", "Nasal"],
  "research_only": true,
  "results": [
    {
      "vendor": "vendor name",
      "price_usd": 45.00,
      "amount_mg": 5,
      "price_per_mg": 9.00,
      "in_stock": true,
      "sale": false,
      "sale_pct": 0,
      "original_price": null,
      "grade": "Research grade",
      "url": "product url",
      "note": "brief note",
      "routes_available": ["SubQ"],
      "region": "USA",
      "ships_in": "2-4 business days"
    }
  ]
}

Sort results by price_per_mg ascending. Set sale:true if a discount is active. Return ONLY JSON.`,
    messages: [{ role: "user", content: `Find current prices for: ${peptide}` }],
  });

  const text = response.content
    .map((b: any) => (b.type === "text" ? b.text : ""))
    .join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(clean.substring(start, end + 1));
}

// ---- Supabase Edge Function handler ----
export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  try {
    const { peptide } = await req.json();
    if (!peptide) return new Response(JSON.stringify({ error: "Missing peptide" }), { status: 400 });
    const result = await handleSearch(peptide);
    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}

// ---- Express server (OPTION B) ----
// Uncomment below if deploying as standalone Node server:
/*
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/search', async (req, res) => {
  try {
    const { peptide } = req.body;
    const result = await handleSearch(peptide);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('PepTrax API running'));
*/
