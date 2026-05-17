export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'ANTHROPIC_API_KEY is not set. Go to Site Configuration → Environment Variables.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const { imageBase64, mediaType, rackLetters } = body;
  if (!imageBase64) return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const rack = (rackLetters || '').toUpperCase().replace(/[^A-Z?_]/g, '');

  const systemPrompt = `You are a world-class Scrabble analyst with encyclopaedic knowledge of SOWPODS/TWL word lists.

BOARD: 15×15 grid. Columns A–O (left→right), Rows 1–15 (top→bottom). Centre: H8.

PREMIUM SQUARES:
TWS (Triple Word): A1,H1,O1,A8,O8,A15,H15,O15
DWS (Double Word): B2,C3,D4,E5,K5,L4,M3,N2,B14,C13,D12,E11,K11,L12,M13,N14,H8
TLS (Triple Letter): B6,B10,F2,F6,F10,F14,J2,J6,J10,J14,N6,N10
DLS (Double Letter): D1,L1,G3,I3,A4,H4,O4,C7,G7,I7,M7,D8,L8,C9,G9,I9,M9,A12,H12,O12,G13,I13,D15,L15

LETTER VALUES: A=1,B=3,C=3,D=2,E=1,F=4,G=2,H=4,I=1,J=8,K=5,L=1,M=3,N=1,O=1,P=3,Q=10,R=1,S=1,T=1,U=1,V=4,W=4,X=8,Y=4,Z=10,blank=0

SCORING: Letter multipliers apply only to new tiles. Word multipliers apply to full word. Multiple TWS/DWS stack multiplicatively. Bingo = +50 if all 7 rack tiles used. Count ALL new words formed.

TASK - follow these steps precisely:
1. CAREFULLY read EVERY tile on the board. Scan row by row A–O, 1–15. Note every letter and its exact column+row.
2. Record the full board state as existingTiles array.
3. With rack [${rack || 'unknown'}], find the TOP 3 highest-scoring legal plays.
4. For each move: verify the word is in SOWPODS, verify it connects to existing tiles (or H8 if opening), verify all cross-words formed are also valid.
5. Calculate exact score.
6. Return the precise column+row of EVERY tile in each move (both new and existing tiles used).`;

  const userPrompt = `Analyse this Scrabble board image.

RACK: [${rack || 'not provided'}]
${rack.length === 7 ? '⚡ All 7 tiles — check for BINGO!' : ''}

Return ONLY raw JSON (no markdown, no backticks, no explanation). Schema:

{
  "boardSummary": "brief description of board state and key words",
  "existingTiles": [
    {"col": "H", "row": 8, "letter": "A"},
    {"col": "I", "row": 8, "letter": "T"}
  ],
  "moves": [
    {
      "rank": 1,
      "word": "EXAMPLE",
      "startCol": "F",
      "startRow": 6,
      "direction": "across",
      "tiles": [
        {"col": "F", "row": 6, "letter": "E", "isNew": true},
        {"col": "G", "row": 6, "letter": "X", "isNew": true},
        {"col": "H", "row": 6, "letter": "A", "isNew": false},
        {"col": "I", "row": 6, "letter": "M", "isNew": true},
        {"col": "J", "row": 6, "letter": "P", "isNew": true},
        {"col": "K", "row": 6, "letter": "L", "isNew": true},
        {"col": "L", "row": 6, "letter": "E", "isNew": true}
      ],
      "estimatedScore": 42,
      "isBingo": false,
      "crossWords": ["AX", "ME"],
      "scoreBreakdown": "E(1)+X(8)×TLS+A(1)+M(3)+P(3)+L(1)+E(1) = 26, no word mult = 26; cross AX=9, ME=4; total=39",
      "reasoning": "High-value X lands on TLS..."
    }
  ]
}

CRITICAL: existingTiles must list EVERY tile currently on the board. tiles in each move must include ALL letters of the word with exact col/row positions.`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: userPrompt }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(JSON.stringify({ error: `Claude API error (${claudeRes.status}): ${errText}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text;
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) return new Response(JSON.stringify({ error: 'Could not parse response', raw: rawText.substring(0, 400) }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    return new Response(jsonMatch[0], { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { timeout: 26 };
