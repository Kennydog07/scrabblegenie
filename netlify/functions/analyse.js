export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const { imageBase64, mediaType, rackLetters } = body;
  if (!imageBase64) return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const rack = (rackLetters || '').toUpperCase().replace(/[^A-Z?_]/g, '');

  const systemPrompt = `You are a world-class Scrabble analyst. Your job is to read a Scrabble board image precisely and suggest valid moves.

BOARD: 15×15 grid. Columns A–O (left to right). Rows 1–15 (top to bottom). Centre square: H8.

PREMIUM SQUARES:
Triple Word (3W): A1, H1, O1, A8, O8, A15, H15, O15
Double Word (2W): B2, C3, D4, E5, K5, L4, M3, N2, B14, C13, D12, E11, K11, L12, M13, N14, H8
Triple Letter (3L): B6, B10, F2, F6, F10, F14, J2, J6, J10, J14, N6, N10
Double Letter (2L): D1, L1, G3, I3, A4, H4, O4, C7, G7, I7, M7, D8, L8, C9, G9, I9, M9, A12, H12, O12, G13, I13, D15, L15

LETTER VALUES: A=1 B=3 C=3 D=2 E=1 F=4 G=2 H=4 I=1 J=8 K=5 L=1 M=3 N=1 O=1 P=3 Q=10 R=1 S=1 T=1 U=1 V=4 W=4 X=8 Y=4 Z=10 blank=0

SCORING RULES:
- Letter multipliers (2L/3L) only apply to NEWLY placed tiles, not tiles already on board
- Word multipliers (2W/3W) apply to the full word score after letter multipliers
- Multiple word multipliers multiply together (e.g. two 3W = ×9)
- +50 bonus if all 7 rack tiles are used (bingo)
- Count ALL words formed including cross-words`;

  const userPrompt = `RACK LETTERS: [${rack || 'not provided — suggest best general plays'}]
${rack.length === 7 ? '⚡ All 7 tiles available — check for BINGO opportunities!' : ''}

STEP 1 — READ THE BOARD CAREFULLY:
Scan every row 1–15 left to right. Record EVERY tile currently on the board. Be very precise about which column (A–O) and row (1–15) each letter is in.

STEP 2 — FIND VALID MOVES:
A valid move MUST:
a) Use only letters from the rack [${rack}] (you can also use tiles already on the board as part of the word)
b) Connect to at least one tile already on the board (the word must physically touch an existing tile, or pass through one)
c) Be a real SOWPODS/TWL Scrabble word
d) Fit within the 15×15 grid without going off the edge
e) Not create any invalid cross-words (every new word formed must also be valid)

STEP 3 — VERIFY each candidate move by checking:
- "Does this word connect to an existing tile? Which tile?"
- "Do I actually have these letters in my rack?"
- "Does the word stay within columns A–O and rows 1–15?"
- "Are all cross-words formed also valid Scrabble words?"

STEP 4 — RANK by score and return the top 3.

Return ONLY raw JSON with no markdown fences. Use this exact schema:

{
  "boardSummary": "Brief description of board state — key words visible and approximate game stage",
  "existingTiles": [
    {"col": "H", "row": 8, "letter": "A"}
  ],
  "moves": [
    {
      "rank": 1,
      "word": "TRIBE",
      "startCol": "F",
      "startRow": 8,
      "direction": "across",
      "connectsTo": "Explain which existing tile(s) this word connects to e.g. 'Uses existing R at H8'",
      "tiles": [
        {"col": "F", "row": 8, "letter": "T", "isNew": true},
        {"col": "G", "row": 8, "letter": "R", "isNew": true},
        {"col": "H", "row": 8, "letter": "I", "isNew": false},
        {"col": "I", "row": 8, "letter": "B", "isNew": true},
        {"col": "J", "row": 8, "letter": "E", "isNew": true}
      ],
      "estimatedScore": 14,
      "isBingo": false,
      "crossWords": [],
      "scoreBreakdown": "T(1)+R(1)+I(1,existing)+B(3)+E(1) = 7, no multiplier = 7",
      "reasoning": "Connects to existing I at H8. Safe mid-board play."
    }
  ]
}

CRITICAL RULES:
1. existingTiles MUST list every single tile currently visible on the board
2. Every move's tiles array MUST include ALL letters of the word with exact col and row for each letter
3. isNew must be true for tiles from rack, false for tiles already on board
4. A word CANNOT float in empty space — it must touch an existing tile
5. Double-check that rack letters used across all new tiles in a move are actually available in [${rack}]`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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

    if (!jsonMatch) return new Response(JSON.stringify({ error: 'Could not parse response', raw: rawText.substring(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    return new Response(jsonMatch[0], { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { timeout: 26 };
