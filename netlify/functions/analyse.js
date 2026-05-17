export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'ANTHROPIC_API_KEY is not set in Netlify environment variables. Go to Site Configuration → Environment Variables to add it.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { imageBase64, mediaType, rackLetters } = body;

  if (!imageBase64) {
    return new Response(JSON.stringify({ error: 'No image data provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const rack = (rackLetters || '').toUpperCase().replace(/[^A-Z?_]/g, '');

  const systemPrompt = `You are an elite Scrabble strategist and analyst with complete knowledge of SOWPODS and TWL word lists, scoring rules, and advanced Scrabble tactics.

BOARD LAYOUT (15x15 grid):
- Rows: 1–15 (top to bottom), Columns: A–O (left to right)
- Center star: H8

PREMIUM SQUARES:
Triple Word Score (TWS): A1, H1, O1, A8, O8, A15, H15, O15
Double Word Score (DWS): B2, C3, D4, E5, K5, L4, M3, N2, B14, C13, D12, E11, K11, L12, M13, N14, H8(center★)
Triple Letter Score (TLS): B6, B10, F2, F6, F10, F14, J2, J6, J10, J14, N6, N10
Double Letter Score (DLS): D1, L1, G3, I3, A4, H4, O4, C7, G7, I7, M7, D8, L8, C9, G9, I9, M9, A12, H12, O12, G13, I13, D15, L15

LETTER VALUES: A=1, B=3, C=3, D=2, E=1, F=4, G=2, H=4, I=1, J=8, K=5, L=1, M=3, N=1, O=1, P=3, Q=10, R=1, S=1, T=1, U=1, V=4, W=4, X=8, Y=4, Z=10, blank(?_)=0

SCORING RULES:
- Apply DLS/TLS only to newly placed tiles
- Apply DWS/TWS to the entire word score (after letter multipliers)
- Multiple word multipliers stack multiplicatively
- Bingo bonus: +50 points when all 7 rack tiles are used in one play
- Count ALL words formed (main word + any cross-words)

STRATEGY PRIORITIES:
1. Highest score first (bingos, TWS/TLS combos)
2. Blocking opponent premium squares
3. Flexible board position for future plays
4. Avoid opening TWS for opponent

Only suggest valid SOWPODS/TWL Scrabble words. Be precise with board reading.`;

  const userPrompt = `Analyse this Scrabble board image carefully.

RACK LETTERS: [${rack || 'not specified — suggest best general plays'}]
${rack.length === 7 ? '(All 7 tiles — check for bingo opportunities!)' : ''}

Steps:
1. Carefully read ALL tiles already on the board — note each word and position
2. Identify the rack letters provided
3. Find the top 3 highest-scoring legal plays using those rack tiles
4. For each play, verify the word is valid Scrabble-legal
5. Calculate the exact score including all cross-words formed

Return ONLY valid JSON (no markdown fences, no preamble, no explanation outside the JSON):

{
  "boardSummary": "Describe key words on the board and overall game state",
  "rack": "${rack}",
  "moves": [
    {
      "rank": 1,
      "word": "BLAZING",
      "position": "F6",
      "direction": "across",
      "rackTilesUsed": ["B","L","A","Z","I","N","G"],
      "existingTilesUsed": [],
      "estimatedScore": 86,
      "isBingo": false,
      "crossWords": [],
      "scoreBreakdown": "B(3)×TLS + L(1) + A(1) + Z(10)×TLS + I(1) + N(1) + G(2) = 32 × no word mult = 32, plus cross-word BEAD = 8",
      "reasoning": "Why this is ranked #1: high-value Z lands on TLS, word connects to existing tile at F8..."
    },
    {
      "rank": 2,
      "word": "WORD2",
      "position": "A1",
      "direction": "down",
      "rackTilesUsed": ["W","O","D"],
      "existingTilesUsed": ["R"],
      "estimatedScore": 24,
      "isBingo": false,
      "crossWords": ["XY"],
      "scoreBreakdown": "W(4)×TWS + O(1) + R(1,existing) + D(2) = 8 × 3(TWS) = 24",
      "reasoning": "Second best: hits TWS with W..."
    },
    {
      "rank": 3,
      "word": "WORD3",
      "position": "H8",
      "direction": "across",
      "rackTilesUsed": ["W","O","R","D"],
      "existingTilesUsed": [],
      "estimatedScore": 16,
      "isBingo": false,
      "crossWords": [],
      "scoreBreakdown": "W(4) + O(1) + R(1) + D(2)×DWS = 8 × 2 = 16",
      "reasoning": "Solid safe play..."
    }
  ]
}`;

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64
              }
            },
            { type: 'text', text: userPrompt }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(JSON.stringify({ error: `Claude API error (${claudeRes.status}): ${errText}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text;

    // Strip any markdown fences and extract JSON
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return new Response(JSON.stringify({
        error: 'Could not extract JSON from Claude response',
        raw: rawText.substring(0, 500)
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const result = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/api/analyse'
};
