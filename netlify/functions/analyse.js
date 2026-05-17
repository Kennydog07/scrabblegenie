const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args)).catch(() => globalThis.fetch(...args));

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Add it in Netlify → Site configuration → Environment variables, then redeploy.' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { imageBase64, mediaType, rackLetters } = body;
  if (!imageBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image provided' }) };

  const rack = (rackLetters || '').toUpperCase().replace(/[^A-Z?_]/g, '');

  const systemPrompt = `You are a world-class Scrabble analyst. Your job is to read a Scrabble board image precisely and suggest valid moves.

BOARD: 15×15 grid. Columns A–O (left to right). Rows 1–15 (top to bottom). Centre square: H8.

PREMIUM SQUARES:
Triple Word (3W): A1, H1, O1, A8, O8, A15, H15, O15
Double Word (2W): B2, C3, D4, E5, K5, L4, M3, N2, B14, C13, D12, E11, K11, L12, M13, N14, H8
Triple Letter (3L): B6, B10, F2, F6, F10, F14, J2, J6, J10, J14, N6, N10
Double Letter (2L): D1, L1, G3, I3, A4, H4, O4, C7, G7, I7, M7, D8, L8, C9, G9, I9, M9, A12, H12, O12, G13, I13, D15, L15

LETTER VALUES: A=1 B=3 C=3 D=2 E=1 F=4 G=2 H=4 I=1 J=8 K=5 L=1 M=3 N=1 O=1 P=3 Q=10 R=1 S=1 T=1 U=1 V=4 W=4 X=8 Y=4 Z=10 blank=0

SCORING: Letter multipliers only apply to NEW tiles. Word multipliers apply after. Stack multiple word multipliers multiplicatively. +50 bingo bonus if all 7 rack tiles used.`;

  const userPrompt = `RACK: [${rack || 'not provided'}]
${rack.length === 7 ? '⚡ All 7 tiles — check for BINGO!' : ''}

INSTRUCTIONS:
1. Read EVERY tile on the board carefully. Scan row by row, noting the exact column (A-O) and row (1-15) of each letter.
2. Find the top 3 highest-scoring legal plays using rack [${rack}].
3. Each move MUST: (a) use only letters from the rack plus existing board tiles, (b) physically connect to or pass through an existing tile, (c) be a valid SOWPODS word, (d) stay within the 15x15 grid, (e) not create invalid cross-words.
4. For each move, list EVERY letter of the word with its exact col+row position and whether it is new (from rack) or existing (already on board).

Return ONLY raw JSON — no markdown, no backticks, no explanation outside the JSON:

{
  "boardSummary": "Brief board description",
  "existingTiles": [{"col":"H","row":8,"letter":"A"}],
  "moves": [
    {
      "rank": 1,
      "word": "BITER",
      "startCol": "G",
      "startRow": 5,
      "direction": "across",
      "connectsTo": "Uses existing I at I5",
      "tiles": [
        {"col":"G","row":5,"letter":"B","isNew":true},
        {"col":"H","row":5,"letter":"I","isNew":false},
        {"col":"I","row":5,"letter":"T","isNew":true},
        {"col":"J","row":5,"letter":"E","isNew":true},
        {"col":"K","row":5,"letter":"R","isNew":true}
      ],
      "estimatedScore": 18,
      "isBingo": false,
      "crossWords": [],
      "scoreBreakdown": "B(3)+I(1,existing)+T(1)+E(1)+R(1)=7, no multiplier=7",
      "reasoning": "Hooks onto existing I, covers 2L at G3 area..."
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Claude API error (${response.status}): ${errText}` }) };
    }

    const data = await response.json();
    const rawText = data.content[0].text;
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not parse Claude response', raw: rawText.substring(0, 400) }) };

    return { statusCode: 200, headers, body: jsonMatch[0] };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
